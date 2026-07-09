import { getSetting, getJSON } from "./db";
import { sanitize, type UserDirectRule } from "./sanitizer";
import { writeProfileAtomic } from "./profile";
import { surge } from "./surge";
import { env } from "./env";

/** Setting keys we own. */
export const SUB_RAW_KEY  = "subscription_raw";
export const USER_DIRECT_KEY = "user_direct_rules";

export function getUserDirectRules(): UserDirectRule[] {
  return getJSON<UserDirectRule[]>(USER_DIRECT_KEY, []);
}

/**
 * Re-run sanitize() against the last cached subscription with the current
 * user-direct rules, write the profile atomically, and ask Surge to reload.
 * Returns null if no cached subscription exists yet (caller decides UX).
 */
export async function reapplyProfile(): Promise<
  | { reloaded: boolean; bytes: number; userDirectRules: number }
  | null
> {
  const raw = getSetting(SUB_RAW_KEY);
  if (!raw) return null;

  const profilePath = getSetting("profile_path") || env.surgeProfilePath;
  const httpApiValue =
    getSetting("http_api_value") || `${env.surgeApiKey}@0.0.0.0:6171`;
  if (!profilePath) throw new Error("profile_path not configured");

  const userDirectRules = getUserDirectRules();
  const { output } = sanitize(raw, { httpApiValue, userDirectRules });

  await writeProfileAtomic(profilePath, output);

  let reloaded = true;
  try { await surge.reload(); } catch { reloaded = false; }

  return { reloaded, bytes: output.length, userDirectRules: userDirectRules.length };
}
