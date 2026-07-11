import { surge } from "@/lib/surge";
import { ok, withAuth } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const groups = await surge.policyGroups();
    const selected = await surge
      .selectPolicies(Object.keys(groups))
      .catch(() => ({} as Record<string, string>));

    // Surge only exposes a group's type via its typeDescription when that group
    // appears as a *member* of another group. Build a best-effort map so the UI
    // can disable manual selection on non-select groups (url-test/fallback/…),
    // which otherwise return "invalid parameters" on /select.
    const groupTypes: Record<string, string> = {};
    for (const members of Object.values(groups)) {
      for (const m of members) {
        if (m.isGroup === 1 && !groupTypes[m.name]) groupTypes[m.name] = m.typeDescription;
      }
    }
    return ok({ groups, selected, groupTypes });
  });
}
