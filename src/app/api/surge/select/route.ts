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
    const { group, policy } = p.data;
    try {
      await surge.selectPolicy(group, policy);
      audit({ userId: ctx.userId, action: "select", payload: { group, policy, ok: true } });
      return ok();
    } catch (e) {
      // Surge rejects a select when the policy isn't a member of the group or
      // the group isn't a `select` type. Record the full context so it stops
      // being a silent 400 (previously only *successful* selects were logged).
      const error = e instanceof Error ? e.message : String(e);
      audit({ userId: ctx.userId, action: "select", payload: { group, policy, ok: false, error } });
      console.error(`[select] failed group=${JSON.stringify(group)} policy=${JSON.stringify(policy)}: ${error}`);
      return bad(`select failed: ${error}`, 502);
    }
  });
}
