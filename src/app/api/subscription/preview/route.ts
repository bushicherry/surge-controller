import { ok, bad, withAuth } from "@/lib/util";
import { getSetting } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { sanitize } from "@/lib/sanitizer";
import { env } from "@/lib/env";
import { getUserDirectRules } from "@/lib/apply";

/** Dry-run: fetch + sanitize, return report only. */
export async function POST(req: Request) {
  return withAuth(req, async () => {
    // Prefer a URL typed in the form (sent in the body) so "type + preview"
    // works without first hitting Save; fall back to the saved encrypted URL.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const typed = typeof body?.subscription_url === "string" ? body.subscription_url.trim() : "";
    const saved = getSetting("subscription_url_enc");
    const subUrl = typed || (saved ? decrypt(saved) : "");
    if (!subUrl) return bad("subscription_url not configured");
    if (!/^https?:\/\//i.test(subUrl)) return bad("subscription_url must be http(s)");
    const httpApiValue = getSetting("http_api_value")
      || `${env.surgeApiKey}@0.0.0.0:6171`;
    const res = await fetch(subUrl, { headers: { "User-Agent": env.surgeUA }, cache: "no-store" });
    if (!res.ok) return bad(`fetch failed: ${res.status}`);
    const raw = await res.text();
    const { report } = sanitize(raw, {
      httpApiValue,
      userDirectRules: getUserDirectRules(),
    });
    return ok({ report, bytes: raw.length });
  });
}
