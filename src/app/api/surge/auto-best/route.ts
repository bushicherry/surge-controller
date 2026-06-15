import { surge } from "@/lib/surge";
import { ok, bad, withAuth } from "@/lib/util";
import { audit } from "@/lib/audit";
import { pickBest } from "@/lib/tier";
import { z } from "zod";

const Body = z.object({
  group: z.string().min(1).default("Proxy"),
  apply: z.boolean().default(true),
});

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const json = await req.json().catch(() => ({}));
    const p = Body.safeParse(json ?? {});
    if (!p.success) return bad(p.error.message);

    const latencies = await surge.testGroupDelay(p.data.group);
    const { pick, ranking } = pickBest(latencies);
    if (!pick) return bad("no reachable node");

    if (p.data.apply) {
      await surge.selectPolicy(p.data.group, pick.name);
      audit({ userId: ctx.userId, action: "auto-best", payload: { group: p.data.group, pick: pick.name } });
    }
    return ok({ group: p.data.group, pick, ranking });
  });
}
