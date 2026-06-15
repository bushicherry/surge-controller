import { surge } from "@/lib/surge";
import { ok, bad, withAuth } from "@/lib/util";
import { audit } from "@/lib/audit";
import { z } from "zod";

const Body = z.object({ group: z.string().min(1), policy: z.string().min(1) });

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const json = await req.json().catch(() => null);
    const p = Body.safeParse(json);
    if (!p.success) return bad(p.error.message);
    await surge.selectPolicy(p.data.group, p.data.policy);
    audit({ userId: ctx.userId, action: "select", payload: p.data });
    return ok();
  });
}
