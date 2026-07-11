import { basename } from "node:path";
import { ok, bad, withAuth } from "@/lib/util";
import { getSetting, setSetting } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { sanitize } from "@/lib/sanitizer";
import { writeProfileAtomic } from "@/lib/profile";
import { surge } from "@/lib/surge";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { SUB_RAW_KEY, getUserDirectRules } from "@/lib/apply";

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    // Persist a URL typed in the form (body) so "type + update" works without
    // a separate Save; otherwise fall back to the previously saved value.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const typed = typeof body?.subscription_url === "string" ? body.subscription_url.trim() : "";
    if (typed) {
      if (!/^https?:\/\//i.test(typed)) return bad("subscription_url must be http(s)");
      setSetting("subscription_url_enc", encrypt(typed));
    }

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

    // Activate + reload. `surge.reload()` only reloads whatever profile is
    // *currently active*; if Surge is running a different profile (e.g. an old
    // dated one), writing our file has no visible effect. So switch Surge to
    // the profile we manage (filename minus .conf) first, then reload.
    const profileName = basename(profilePath).replace(/\.conf$/i, "");
    const previous = await surge.currentProfile().then((p) => p?.name).catch(() => undefined);

    let switched = true;
    try {
      if (previous !== profileName) await surge.switchProfile(profileName);
    } catch { switched = false; }

    let reloaded = true;
    try { await surge.reload(); } catch { reloaded = false; }

    audit({
      userId: ctx.userId,
      action: "subscription-update",
      level: switched && reloaded ? "info" : "warn",
      payload: { ...report, profileName, previous, switched, reloaded, bytes: output.length },
    });

    return ok({ report, profileName, previous, switched, reloaded });
  });
}
