import { ok, bad, withAuth } from "@/lib/util";
import { surge } from "@/lib/surge";
import { TIER_GROUPS } from "@/lib/tier";
import { audit } from "@/lib/audit";
import { z } from "zod";

const Body = z.object({
  tier: z.enum(["1", "2", "3"]),
  group: z.string().default("Proxy"),
});

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const json = await req.json().catch(() => null);
    const p = Body.safeParse(json);
    if (!p.success) return bad(p.error.message);
    const target =
      p.data.tier === "1" ? TIER_GROUPS.tier1 :
      p.data.tier === "2" ? TIER_GROUPS.tier2 : TIER_GROUPS.tier3;
    await surge.selectPolicy(p.data.group, target);
    audit({ userId: ctx.userId, action: "tier-switch", payload: { tier: p.data.tier, group: p.data.group } });
    return ok({ selected: target });
  });
}
