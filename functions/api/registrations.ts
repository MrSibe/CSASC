import {
  validateIdempotencyKey,
  validateRegistrationPayload,
} from "../../shared/registration.mjs";
import type { PagesContext, PublicEnv } from "../_shared/cloudflare.js";
import { createRegistrationNumber, getCampaignConfig, json, verifyTurnstile } from "../_shared/http.js";

const MAX_BODY_BYTES = 16 * 1024;

interface ExistingRegistration {
  registration_no: string;
  created_at: string;
}
export async function onRequestPost(context: PagesContext<PublicEnv>): Promise<Response> {
  const { request, env } = context;
  const campaign = getCampaignConfig(env);

  if (!campaign.configured) {
    return json({ error: "报名服务尚未完成配置，请稍后再试。", code: "CONFIGURATION_ERROR" }, 503);
  }
  if (!campaign.isOpen) {
    const message = campaign.status === "not_started" ? "报名尚未开始。" : "本期报名已经截止。";
    return json({ error: message, code: "REGISTRATION_CLOSED" }, 403);
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!validateIdempotencyKey(idempotencyKey)) {
    return json({ error: "提交标识无效，请刷新页面后重试。", code: "INVALID_IDEMPOTENCY_KEY" }, 400);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ error: "提交内容过大。", code: "PAYLOAD_TOO_LARGE" }, 413);
  }

  let rawBody: string;
  let rawPayload: Record<string, unknown>;
  try {
    rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: "提交内容过大。", code: "PAYLOAD_TOO_LARGE" }, 413);
    }
    rawPayload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "报名信息格式不正确。", code: "INVALID_JSON" }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT registration_no, created_at FROM registrations WHERE campaign_code = ? AND idempotency_key = ?",
  )
    .bind(campaign.code, idempotencyKey)
    .first<ExistingRegistration>();
  if (existing) {
    return json({
      registrationNumber: existing.registration_no,
      submittedAt: existing.created_at,
      reused: true,
    });
  }

  const validation = validateRegistrationPayload(rawPayload);
  if (!validation.ok) {
    return json({ error: "请检查报名信息。", code: "VALIDATION_ERROR", fields: validation.errors }, 422);
  }

  const turnstileToken = typeof rawPayload.turnstileToken === "string" ? rawPayload.turnstileToken : "";
  if (!env.TURNSTILE_SECRET || !turnstileToken) {
    return json({ error: "请完成人机验证。", code: "TURNSTILE_REQUIRED" }, 422);
  }

  let humanVerified = false;
  try {
    humanVerified = await verifyTurnstile(request, env.TURNSTILE_SECRET, turnstileToken);
  } catch {
    return json({ error: "人机验证服务暂时不可用，请稍后重试。", code: "TURNSTILE_UNAVAILABLE" }, 503);
  }
  if (!humanVerified) {
    return json({ error: "人机验证未通过，请重试。", code: "TURNSTILE_FAILED" }, 422);
  }

  const registrationId = crypto.randomUUID();
  const registrationNumber = createRegistrationNumber(campaign.code);
  const createdAt = new Date().toISOString();
  const { registrationType, teamName, members } = validation.value;
  const statements = [
    env.DB.prepare(
      `INSERT INTO registrations
        (id, registration_no, campaign_code, registration_type, team_name, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      registrationId,
      registrationNumber,
      campaign.code,
      registrationType,
      teamName || null,
      idempotencyKey,
      createdAt,
    ),
    ...members.map((member, index) =>
      env.DB.prepare(
        `INSERT INTO registration_members
          (id, registration_id, campaign_code, position, is_captain, real_name, email, email_normalized, qq, organization)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        registrationId,
        campaign.code,
        index + 1,
        index === 0 ? 1 : 0,
        member.realName,
        member.email,
        member.email,
        member.qq,
        member.organization || null,
      ),
    ),
  ];

  try {
    await env.DB.batch(statements);
  } catch {
    const retryExisting = await env.DB.prepare(
      "SELECT registration_no, created_at FROM registrations WHERE campaign_code = ? AND idempotency_key = ?",
    )
      .bind(campaign.code, idempotencyKey)
      .first<ExistingRegistration>();
    if (retryExisting) {
      return json({
        registrationNumber: retryExisting.registration_no,
        submittedAt: retryExisting.created_at,
        reused: true,
      });
    }
    return json(
      { error: "有成员已使用该邮箱报名本期活动，请联系管理员核对。", code: "DUPLICATE_EMAIL" },
      409,
    );
  }

  return json({ registrationNumber, submittedAt: createdAt, reused: false }, 201);
}
