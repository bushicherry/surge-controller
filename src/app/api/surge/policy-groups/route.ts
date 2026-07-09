import { surge } from "@/lib/surge";
import { ok, withAuth } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const groups = await surge.policyGroups();
    const selected = await surge
      .selectPolicies(Object.keys(groups))
      .catch(() => ({} as Record<string, string>));
    return ok({ groups, selected });
  });
}
