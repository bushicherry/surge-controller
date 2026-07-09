function req(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  nextAuthSecret: req("NEXTAUTH_SECRET", "dev-insecure-secret"),
  nextAuthUrl: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  githubId: process.env.GITHUB_ID ?? "",
  githubSecret: process.env.GITHUB_SECRET ?? "",
  allowedLogins: (process.env.ALLOWED_GITHUB_LOGINS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean),
  encKey: req("APP_ENC_KEY", "dev-insecure-key-please-change-32b!!"),
  surgeApiHost: process.env.SURGE_API_HOST ?? "http://127.0.0.1:6171",
  surgeApiKey: process.env.SURGE_API_KEY ?? "surgepasswd",
  surgeProfilePath: process.env.SURGE_PROFILE_PATH ?? "",
  surgeUA: process.env.SURGE_UA ?? "Surge/2650",
  dbPath: process.env.DB_PATH ?? "./data/app.db",
  /**
   * Hosts (Host header values) that are trusted as LAN, e.g.
   *   "192.168.1.50:3000,my-mac.local:3000,localhost:3000"
   * Requests whose Host header matches one of these entries skip auth entirely.
   * Exact match (case-insensitive); include the port if you serve on non-80/443.
   * Leave empty to disable LAN bypass.
   */
  lanTrustedHosts: (process.env.LAN_TRUSTED_HOSTS ?? "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
};
