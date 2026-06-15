import { NextResponse } from "next/server";
import { authorize, type AuthCtx } from "./auth";

export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export function ok(data: Json = { ok: true }) {
  return NextResponse.json(data);
}
export function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}
export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function withAuth(
  req: Request,
  fn: (ctx: AuthCtx) => Promise<Response> | Response
) {
  const ctx = await authorize(req);
  if (!ctx) return unauthorized();
  try {
    return await fn(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return bad(msg, 500);
  }
}
