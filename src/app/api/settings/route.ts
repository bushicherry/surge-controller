import { ok, bad, withAuth } from "@/lib/util";
import { getSetting, setSetting } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getOverrides, setOverrides, getPenalty, setPenalty, getTimeoutMs, setTimeoutMs } from "@/lib/tier";
import { env } from "@/lib/env";
import { z } from "zod";

export async function GET(req: Request) {
  return withAuth(req, async () => {
    return ok({
      profile_path: getSetting("profile_path") || env.surgeProfilePath,
      http_api_value: getSetting("http_api_value") || `${env.surgeApiKey}@0.0.0.0:6171`,
      has_subscription: !!getSetting("subscription_url_enc"),
      tier_overrides: getOverrides(),
      tier_penalty: getPenalty(),
      tier_timeout_ms: getTimeoutMs(),
    });
  });
}

const Patch = z.object({
  subscription_url: z.string().url().optional(),
  profile_path: z.string().optional(),
  http_api_value: z.string().optional(),
  tier_overrides: z.record(z.string(), z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])).optional(),
  tier_penalty: z.object({ "1": z.number(), "2": z.number(), "3": z.number() }).optional(),
  tier_timeout_ms: z.number().int().positive().optional(),
});

export async function PATCH(req: Request) {
  return withAuth(req, async () => {
    const json = await req.json().catch(() => null);
    const p = Patch.safeParse(json);
    if (!p.success) return bad(p.error.message);
    const d = p.data;
    if (d.subscription_url) setSetting("subscription_url_enc", encrypt(d.subscription_url));
    if (d.profile_path) setSetting("profile_path", d.profile_path);
    if (d.http_api_value) setSetting("http_api_value", d.http_api_value);
    if (d.tier_overrides) setOverrides(d.tier_overrides);
    if (d.tier_penalty) setPenalty(d.tier_penalty);
    if (d.tier_timeout_ms) setTimeoutMs(d.tier_timeout_ms);
    return ok();
  });
}
