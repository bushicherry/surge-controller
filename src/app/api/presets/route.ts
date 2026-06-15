import { ok, bad, withAuth } from "@/lib/util";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { z } from "zod";

const Action = z.object({
  type: z.enum(["select", "outbound"]),
  group: z.string().optional(),
  policy: z.string().optional(),
  mode: z.enum(["direct", "rule", "proxy", "global"]).optional(),
});
const Create = z.object({
  name: z.string().min(1).max(64),
  icon: z.string().max(8).optional(),
  actions: z.array(Action).min(1),
});

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const rows = db.prepare("SELECT * FROM presets ORDER BY sort, id").all() as Array<{
      id: number; name: string; icon: string | null; payload: string; sort: number;
    }>;
    return ok({ presets: rows.map(r => ({ ...r, actions: JSON.parse(r.payload) })) });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const json = await req.json().catch(() => null);
    const p = Create.safeParse(json);
    if (!p.success) return bad(p.error.message);
    const now = Date.now();
    const info = db.prepare(
      `INSERT INTO presets (name, icon, payload, sort, created_at) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(name) DO UPDATE SET icon = excluded.icon, payload = excluded.payload`
    ).run(p.data.name, p.data.icon ?? null, JSON.stringify(p.data.actions), now);
    audit({ userId: ctx.userId, action: "preset-upsert", payload: { name: p.data.name } });
    return ok({ id: info.lastInsertRowid });
  });
}

const Del = z.object({ id: z.number().int().positive() });
export async function DELETE(req: Request) {
  return withAuth(req, async (ctx) => {
    const json = await req.json().catch(() => null);
    const p = Del.safeParse(json);
    if (!p.success) return bad(p.error.message);
    db.prepare("DELETE FROM presets WHERE id = ?").run(p.data.id);
    audit({ userId: ctx.userId, action: "preset-delete", payload: p.data });
    return ok();
  });
}
