import { ok, bad, withAuth } from "@/lib/util";
import { db } from "@/lib/db";
import { surge } from "@/lib/surge";
import { audit } from "@/lib/audit";
import { z } from "zod";

const Body = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().optional(),
}).refine(b => b.id || b.name, { message: "id or name required" });

type Action =
  | { type: "select"; group: string; policy: string }
  | { type: "outbound"; mode: "direct" | "rule" | "proxy" | "global" };

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const json = await req.json().catch(() => null);
    const p = Body.safeParse(json);
    if (!p.success) return bad(p.error.message);
    const row = (p.data.id
      ? db.prepare("SELECT * FROM presets WHERE id = ?").get(p.data.id)
      : db.prepare("SELECT * FROM presets WHERE name = ?").get(p.data.name)) as
      | { id: number; name: string; payload: string } | undefined;
    if (!row) return bad("preset not found", 404);
    const actions = JSON.parse(row.payload) as Action[];
    for (const a of actions) {
      if (a.type === "select") await surge.selectPolicy(a.group, a.policy);
      else if (a.type === "outbound") await surge.setOutbound(a.mode);
    }
    audit({ userId: ctx.userId, action: "preset-apply", payload: { name: row.name } });
    return ok({ applied: actions.length });
  });
}
