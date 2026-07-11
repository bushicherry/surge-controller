// Structured, level-aware logger. Produces readable multi-field lines so the
// launchd stdout/stderr logs are scannable (previously everything was a single
// undifferentiated line with no severity).
//
//   2026-07-11T07:12:03.412Z ERROR [select] Surge rejected select
//     group="auto"
//     policy="🇭🇰 香港 9929 20260708"
//     error="Surge API /v1/policy_groups/select 400: {\"error\":\"invalid parameters\"}"

export type LogLevel = "info" | "warn" | "error";

export function log(
  level: LogLevel,
  scope: string,
  msg: string,
  fields?: Record<string, unknown>
) {
  const ts = new Date().toISOString();
  const head = `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
  const detail =
    fields && Object.keys(fields).length
      ? "\n" +
        Object.entries(fields)
          .map(([k, v]) => `  ${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("\n")
      : "";
  const out = head + detail;
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const logger = {
  info: (scope: string, msg: string, fields?: Record<string, unknown>) => log("info", scope, msg, fields),
  warn: (scope: string, msg: string, fields?: Record<string, unknown>) => log("warn", scope, msg, fields),
  error: (scope: string, msg: string, fields?: Record<string, unknown>) => log("error", scope, msg, fields),
};
