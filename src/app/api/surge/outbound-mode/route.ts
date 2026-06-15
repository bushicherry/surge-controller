import { surge } from "@/lib/surge";
import { ok, bad, withAuth } from "@/lib/util";
import { audit } from "@/lib/audit";
import { z } from "zod";

const Body = z.object({ mode: z.enum(["direct", "rule", "proxy", "global"]) });

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const cur = await surge.outbound();
    return ok(cur);
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const json = await req.json().catch(() => null);
    const p = Body.safeParse(json);
    if (!p.success) return bad(p.error.message);
    await surge.setOutbound(p.data.mode);
    audit({ userId: ctx.userId, action: "outbound-mode", payload: p.data });
    return ok();
  });
}
