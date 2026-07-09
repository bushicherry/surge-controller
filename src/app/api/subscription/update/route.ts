import { ok, bad, withAuth } from "@/lib/util";
import { getSetting, setSetting } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { sanitize } from "@/lib/sanitizer";
import { writeProfileAtomic } from "@/lib/profile";
import { surge } from "@/lib/surge";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { SUB_RAW_KEY, getUserDirectRules } from "@/lib/apply";

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const url = getSetting("subscription_url_enc");
    const profilePath = getSetting("profile_path") || env.surgeProfilePath;
    const httpApiValue = getSetting("http_api_value")
      || `${env.surgeApiKey}@0.0.0.0:6171`;

    if (!url) return bad("subscription_url not configured");
    if (!profilePath) return bad("profile_path not configured");

    const subUrl = decrypt(url);

    // Fetch
    const res = await fetch(subUrl, {
      headers: { "User-Agent": env.surgeUA },
      cache: "no-store",
    });
    if (!res.ok) return bad(`fetch subscription failed: ${res.status}`);
    const raw = await res.text();

    // Cache raw so /api/user-rules can re-sanitize without re-fetching.
    setSetting(SUB_RAW_KEY, raw);

    // Sanitize (with any existing user-direct rules re-applied on top).
    const { output, report } = sanitize(raw, {
      httpApiValue,
      userDirectRules: getUserDirectRules(),
    });

    // Write
    await writeProfileAtomic(profilePath, output);

    // Reload
    let reloaded = true;
    try { await surge.reload(); } catch { reloaded = false; }

    audit({
      userId: ctx.userId,
      action: "subscription-update",
      payload: { ...report, reloaded, bytes: output.length },
    });

    return ok({ report, reloaded });
  });
}
