import { ok, withAuth } from "@/lib/util";
import { setJSON } from "@/lib/db";
import { audit } from "@/lib/audit";
import { USER_DIRECT_KEY, reapplyProfile } from "@/lib/apply";

/** POST → wipe every user-managed direct rule and re-apply the profile. */
export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    setJSON(USER_DIRECT_KEY, []);
    const applied = await reapplyProfile().catch(err => ({ error: String(err.message ?? err) }));
    audit({ userId: ctx.userId, action: "user-rule-clear", payload: { applied } });
    return ok({ rules: [], applied });
  });
}
