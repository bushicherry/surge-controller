import { ok, bad, withAuth } from "@/lib/util";
import { db } from "@/lib/db";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { z } from "zod";

export async function GET(req: Request) {
  return withAuth(req, async (ctx) => {
    const rows = db.prepare(
      `SELECT id, name, prefix, last_used_at, created_at, revoked
       FROM api_tokens WHERE user_id = ? ORDER BY id DESC`
    ).all(ctx.userId);
    return ok({ tokens: rows });
  });
}

const Create = z.object({ name: z.string().min(1).max(64) });
export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    if (!ctx.userId) return bad("no user");
    const json = await req.json().catch(() => null);
    const p = Create.safeParse(json);
    if (!p.success) return bad(p.error.message);
    const token = randomToken(32);
    const prefix = token.slice(0, 8);
    db.prepare(
      `INSERT INTO api_tokens (user_id, name, token_hash, prefix, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(ctx.userId, p.data.name, sha256Hex(token), prefix, Date.now());
    return ok({ token, prefix }); // only time plaintext is returned
  });
}

const Del = z.object({ id: z.number().int().positive() });
export async function DELETE(req: Request) {
  return withAuth(req, async (ctx) => {
    const json = await req.json().catch(() => null);
    const p = Del.safeParse(json);
    if (!p.success) return bad(p.error.message);
    db.prepare("UPDATE api_tokens SET revoked = 1 WHERE id = ? AND user_id = ?")
      .run(p.data.id, ctx.userId);
    return ok();
  });
}
