import { db } from "./db";

export function audit(opts: {
  userId?: number;
  action: string;
  payload?: unknown;
  ip?: string;
  ua?: string;
}) {
  db.prepare(
    `INSERT INTO audit_log (user_id, action, payload, ip, ua, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    opts.userId ?? null,
    opts.action,
    opts.payload ? JSON.stringify(opts.payload) : null,
    opts.ip ?? null,
    opts.ua ?? null,
    Date.now()
  );
}
