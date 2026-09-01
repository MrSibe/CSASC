import { escapeCsvCell } from "../../shared/registration.mjs";
import type { D1Database, D1PreparedStatement } from "../../functions/_shared/cloudflare.js";

interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  ADMIN_EMAILS?: string;
}

interface AccessPayload {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
}

interface RegistrationRow {
  id: string;
  registration_no: string;
  campaign_code: string;
  registration_type: "individual" | "team";
  team_name: string | null;
  created_at: string;
  member_count: number;
  captain_name: string;
  captain_email: string;
  captain_qq: string;
}

interface MemberRow {
  id: string;
  position: number;
  is_captain: number;
  real_name: string;
  email: string;
  qq: string;
  organization: string | null;
}

interface JsonWebKeySet {
  keys: (JsonWebKey & { kid?: string })[];
}

let cachedKeys: { url: string; expiresAt: number; value: JsonWebKeySet } | null = null;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function decodeJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function normalizeTeamDomain(value: string): string {
  return value.trim().replace(/\/$/, "");
}

async function getJwks(teamDomain: string): Promise<JsonWebKeySet> {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  if (cachedKeys && cachedKeys.url === url && cachedKeys.expiresAt > Date.now()) return cachedKeys.value;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Unable to load Access signing keys");
  const value = (await response.json()) as JsonWebKeySet;
  cachedKeys = { url, expiresAt: Date.now() + 5 * 60 * 1000, value };
  return value;
}

async function authenticate(request: Request, env: Env): Promise<AccessPayload> {
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) throw new Error("Access validation is not configured");
  const teamDomain = normalizeTeamDomain(env.TEAM_DOMAIN);
  if (!teamDomain.startsWith("https://") || !teamDomain.endsWith(".cloudflareaccess.com")) {
    throw new Error("Invalid Access team domain");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new Error("Missing Access token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Access token");
  const header = decodeJsonPart<{ alg?: string; kid?: string }>(parts[0]);
  const payload = decodeJsonPart<AccessPayload>(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Access token");

  const jwks = await getJwks(teamDomain);
  const signingKey = jwks.keys.find((key) => key.kid === header.kid);
  if (!signingKey) {
    cachedKeys = null;
    throw new Error("Unknown Access signing key");
  }
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    signingKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!validSignature) throw new Error("Invalid Access signature");

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (payload.iss !== teamDomain || !audiences.includes(env.POLICY_AUD)) throw new Error("Access claims do not match");
  if (!payload.exp || payload.exp <= now || (payload.nbf && payload.nbf > now + 30)) throw new Error("Access token expired");
  if (!payload.email) throw new Error("Access identity has no email");

  const allowedEmails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (allowedEmails.length && !allowedEmails.includes(payload.email.toLowerCase())) {
    throw new Error("Access identity is not an administrator");
  }
  return payload;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function parseFilters(url: URL) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));
  const campaign = (url.searchParams.get("campaign") || "").trim().slice(0, 40);
  const type = url.searchParams.get("type") === "team" ? "team" : url.searchParams.get("type") === "individual" ? "individual" : "";
  const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
  return { page, pageSize, campaign, type, query };
}

function buildWhere(filters: ReturnType<typeof parseFilters>) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.campaign) {
    clauses.push("r.campaign_code = ?");
    values.push(filters.campaign);
  }
  if (filters.type) {
    clauses.push("r.registration_type = ?");
    values.push(filters.type);
  }
  if (filters.query) {
    const pattern = `%${escapeLike(filters.query)}%`;
    clauses.push(`(
      r.registration_no LIKE ? ESCAPE '\\' OR
      r.team_name LIKE ? ESCAPE '\\' OR
      EXISTS (
        SELECT 1 FROM registration_members search_member
        WHERE search_member.registration_id = r.id
          AND (search_member.real_name LIKE ? ESCAPE '\\'
            OR search_member.email LIKE ? ESCAPE '\\'
            OR search_member.qq LIKE ? ESCAPE '\\')
      )
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

async function listRegistrations(request: Request, env: Env, identity: AccessPayload): Promise<Response> {
  const filters = parseFilters(new URL(request.url));
  const where = buildWhere(filters);
  const offset = (filters.page - 1) * filters.pageSize;
  const baseFrom = `FROM registrations r ${where.sql}`;
  const countStatement = env.DB.prepare(`SELECT COUNT(*) AS total ${baseFrom}`).bind(...where.values);
  const listStatement = env.DB.prepare(`
    SELECT
      r.id, r.registration_no, r.campaign_code, r.registration_type, r.team_name, r.created_at,
      (SELECT COUNT(*) FROM registration_members mc WHERE mc.registration_id = r.id) AS member_count,
      (SELECT real_name FROM registration_members cm WHERE cm.registration_id = r.id AND cm.is_captain = 1) AS captain_name,
      (SELECT email FROM registration_members cm WHERE cm.registration_id = r.id AND cm.is_captain = 1) AS captain_email,
      (SELECT qq FROM registration_members cm WHERE cm.registration_id = r.id AND cm.is_captain = 1) AS captain_qq
    ${baseFrom}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ? OFFSET ?
  `).bind(...where.values, filters.pageSize, offset);
  const [countResult, listResult] = await env.DB.batch([countStatement, listStatement]);
  const total = Number((countResult.results?.[0] as { total?: number } | undefined)?.total ?? 0);
  return json({
    items: (listResult.results ?? []) as unknown as RegistrationRow[],
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
    administrator: identity.email,
  });
}

async function getRegistration(id: string, env: Env): Promise<Response> {
  const registration = await env.DB.prepare(
    `SELECT id, registration_no, campaign_code, registration_type, team_name, created_at
     FROM registrations WHERE id = ?`,
  ).bind(id).first<RegistrationRow>();
  if (!registration) return json({ error: "未找到该报名记录。" }, 404);
  const members = await env.DB.prepare(
    `SELECT id, position, is_captain, real_name, email, qq, organization
     FROM registration_members WHERE registration_id = ? ORDER BY position`,
  ).bind(id).all<MemberRow>();
  return json({ ...registration, members: members.results ?? [] });
}

async function deleteRegistration(request: Request, id: string, env: Env): Promise<Response> {
  const registration = await env.DB.prepare(
    "SELECT registration_no FROM registrations WHERE id = ?",
  ).bind(id).first<{ registration_no: string }>();
  if (!registration) return json({ error: "未找到该报名记录。" }, 404);

  let confirmation = "";
  try {
    const body = (await request.json()) as { confirmation?: string };
    confirmation = body.confirmation ?? "";
  } catch {
    return json({ error: "删除确认信息格式不正确。" }, 400);
  }
  if (confirmation !== registration.registration_no) {
    return json({ error: "请输入完整报名编号以确认删除。" }, 422);
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM registration_members WHERE registration_id = ?").bind(id),
    env.DB.prepare("DELETE FROM registrations WHERE id = ?").bind(id),
  ]);
  return json({ deleted: true, registrationNumber: registration.registration_no });
}

async function exportCsv(request: Request, env: Env): Promise<Response> {
  const filters = parseFilters(new URL(request.url));
  const where = buildWhere(filters);
  const result = await env.DB.prepare(`
    SELECT
      r.registration_no, r.campaign_code, r.registration_type, r.team_name, r.created_at,
      m.position, m.is_captain, m.real_name, m.email, m.qq, m.organization
    FROM registrations r
    INNER JOIN registration_members m ON m.registration_id = r.id
    ${where.sql}
    ORDER BY r.created_at DESC, r.id DESC, m.position ASC
  `).bind(...where.values).all<Record<string, unknown>>();

  const headers = ["报名编号", "届次", "报名类型", "队名", "提交时间", "成员序号", "是否队长", "真实姓名", "邮箱", "QQ号", "学校或组织"];
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of result.results ?? []) {
    lines.push([
      row.registration_no,
      row.campaign_code,
      row.registration_type === "team" ? "团队" : "个人",
      row.team_name,
      row.created_at,
      row.position,
      Number(row.is_captain) === 1 ? "是" : "否",
      row.real_name,
      row.email,
      row.qq,
      row.organization,
    ].map(escapeCsvCell).join(","));
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="csasc-registrations-${date}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function handleApi(request: Request, env: Env, identity: AccessPayload): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/registrations") {
    return listRegistrations(request, env, identity);
  }
  if (request.method === "GET" && url.pathname === "/api/registrations.csv") {
    return exportCsv(request, env);
  }
  const match = url.pathname.match(/^\/api\/registrations\/([^/]+)$/);
  if (match && request.method === "GET") return getRegistration(decodeURIComponent(match[1]), env);
  if (match && request.method === "DELETE") return deleteRegistration(request, decodeURIComponent(match[1]), env);
  return json({ error: "接口不存在。" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let identity: AccessPayload;
    try {
      identity = await authenticate(request, env);
    } catch {
      return json({ error: "未通过管理员身份验证。请通过 Cloudflare Access 登录。" }, 403);
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, identity);
      } catch {
        return json({ error: "管理服务暂时不可用，请稍后重试。" }, 500);
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    headers.set("Cache-Control", url.pathname.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-store");
    headers.set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    return new Response(assetResponse.body, { status: assetResponse.status, headers });
  },
};
