import { surge } from "@/lib/surge";
import { ok, withAuth } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const [outbound, selected, traffic] = await Promise.all([
      surge.outbound().catch(() => null),
      surge.selectPolicies().catch(() => ({})),
      surge.traffic().catch(() => null),
    ]);
    return ok({ outbound, selected, traffic });
  });
}
