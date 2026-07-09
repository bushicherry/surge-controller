import { ok, withAuth } from "@/lib/util";
import { surge } from "@/lib/surge";
import { getUserDirectRules } from "@/lib/apply";
import { userRuleLine } from "@/lib/sanitizer";

/**
 * Returns the current, live rule list from Surge + the user-managed direct
 * rules we track locally, so the /rules page can show both in one shot.
 */
export async function GET(req: Request) {
  return withAuth(req, async () => {
    const live = await surge.rules().catch(() => ({ rules: [] as string[] }));
    const userRules = getUserDirectRules();
    return ok({
      rules: live.rules,
      userDirect: userRules,
      userDirectLines: userRules.map(userRuleLine),
    });
  });
}
