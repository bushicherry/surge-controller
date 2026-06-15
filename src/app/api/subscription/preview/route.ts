import { ok, bad, withAuth } from "@/lib/util";
import { getSetting } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { sanitize } from "@/lib/sanitizer";
import { env } from "@/lib/env";

/** Dry-run: fetch + sanitize, return report only. */
export async function POST(req: Request) {
  return withAuth(req, async () => {
    const url = getSetting("subscription_url_enc");
    if (!url) return bad("subscription_url not configured");
    const httpApiValue = getSetting("http_api_value")
      || `${env.surgeApiKey}@0.0.0.0:6171`;
    const subUrl = decrypt(url);
    const res = await fetch(subUrl, { headers: { "User-Agent": env.surgeUA }, cache: "no-store" });
    if (!res.ok) return bad(`fetch failed: ${res.status}`);
    const raw = await res.text();
    const { report } = sanitize(raw, { httpApiValue });
    return ok({ report, bytes: raw.length });
  });
}
