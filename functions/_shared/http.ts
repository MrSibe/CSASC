import type { PublicEnv } from "./cloudflare.js";

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BASE_HEADERS, ...extraHeaders },
  });
}
export interface CampaignConfig {
  code: string;
  title: string;
  opensAt: string;
  closesAt: string;
  activityStartsAt: string;
  activityEndsAt: string;
  isOpen: boolean;
  configured: boolean;
  status: "open" | "not_started" | "closed" | "configuration_error";
}

export function getCampaignConfig(env: PublicEnv, now = new Date()): CampaignConfig {
  const code = env.CAMPAIGN_CODE?.trim() ?? "";
  const title = env.CAMPAIGN_TITLE?.trim() || (code ? `第 ${code} 期` : "报名活动");
  const opensAtDate = env.REGISTRATION_OPENS_AT ? new Date(env.REGISTRATION_OPENS_AT) : null;
  const closesAtDate = env.REGISTRATION_CLOSES_AT ? new Date(env.REGISTRATION_CLOSES_AT) : null;
  const activityStartsAtDate = env.ACTIVITY_STARTS_AT ? new Date(env.ACTIVITY_STARTS_AT) : null;
  const activityEndsAtDate = env.ACTIVITY_ENDS_AT ? new Date(env.ACTIVITY_ENDS_AT) : null;
  const activityConfigured =
    activityStartsAtDate &&
    activityEndsAtDate &&
    !Number.isNaN(activityStartsAtDate.getTime()) &&
    !Number.isNaN(activityEndsAtDate.getTime()) &&
    activityStartsAtDate < activityEndsAtDate;
  const configured = Boolean(
    code &&
      opensAtDate &&
      closesAtDate &&
      !Number.isNaN(opensAtDate.getTime()) &&
      !Number.isNaN(closesAtDate.getTime()) &&
      opensAtDate < closesAtDate,
  );

  if (!configured || !opensAtDate || !closesAtDate) {
    return {
      code,
      title,
      opensAt: env.REGISTRATION_OPENS_AT ?? "",
      closesAt: env.REGISTRATION_CLOSES_AT ?? "",
      activityStartsAt: env.ACTIVITY_STARTS_AT ?? "",
      activityEndsAt: env.ACTIVITY_ENDS_AT ?? "",
      isOpen: false,
      configured: false,
      status: "configuration_error",
    };
  }

  const isOpen = now >= opensAtDate && now <= closesAtDate;
  return {
    code,
    title,
    opensAt: opensAtDate.toISOString(),
    closesAt: closesAtDate.toISOString(),
    activityStartsAt: activityConfigured ? activityStartsAtDate.toISOString() : "",
    activityEndsAt: activityConfigured ? activityEndsAtDate.toISOString() : "",
    isOpen,
    configured,
    status: isOpen ? "open" : now < opensAtDate ? "not_started" : "closed",
  };
}

export function createRegistrationNumber(campaignCode: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `CSASC-${campaignCode}-${suffix}`;
}

export async function verifyTurnstile(request: Request, secret: string, token: string): Promise<boolean> {
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) form.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
