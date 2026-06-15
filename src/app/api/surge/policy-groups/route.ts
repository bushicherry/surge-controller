import { surge } from "@/lib/surge";
import { ok, withAuth } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const [groups, selected] = await Promise.all([
      surge.policyGroups(),
      surge.selectPolicies().catch(() => ({} as Record<string, string>)),
    ]);
    return ok({ groups, selected });
  });
}
