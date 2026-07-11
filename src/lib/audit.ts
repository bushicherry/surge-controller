import { db } from "./db";
import { log, type LogLevel } from "./log";

export function audit(opts: {
  userId?: number;
  action: string;
  payload?: unknown;
  ip?: string;
  ua?: string;
  level?: LogLevel;
}) {
  const level: LogLevel = opts.level ?? "info";
  // Persist level alongside the payload so /api/audit can surface severity.
  const payload =
    opts.payload && typeof opts.payload === "object"
      ? { level, ...(opts.payload as Record<string, unknown>) }
      : { level, value: opts.payload };

  db.prepare(
    `INSERT INTO audit_log (user_id, action, payload, ip, ua, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    opts.userId ?? null,
    opts.action,
    JSON.stringify(payload),
    opts.ip ?? null,
    opts.ua ?? null,
    Date.now()
  );

  // Also emit a structured, level-tagged console line for the launchd logs.
  log(level, opts.action, level === "error" ? "failed" : "ok", {
    userId: opts.userId,
    ...(typeof opts.payload === "object" ? (opts.payload as Record<string, unknown>) : { value: opts.payload }),
  });
}
