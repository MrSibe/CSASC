import { TEAM_MAX_MEMBERS, TEAM_MIN_MEMBERS } from "../../shared/registration.mjs";
import type { PagesContext, PublicEnv } from "../_shared/cloudflare.js";
import { getCampaignConfig, json } from "../_shared/http.js";

export async function onRequestGet(context: PagesContext<PublicEnv>): Promise<Response> {
  const campaign = getCampaignConfig(context.env);
  return json({
    campaignCode: campaign.code,
    campaignTitle: campaign.title,
    opensAt: campaign.opensAt,
    closesAt: campaign.closesAt,
    isOpen: campaign.isOpen,
    status: campaign.status,
    teamMinMembers: TEAM_MIN_MEMBERS,
    teamMaxMembers: TEAM_MAX_MEMBERS,
    turnstileSiteKey: context.env.TURNSTILE_SITE_KEY ?? "",
  });
}
