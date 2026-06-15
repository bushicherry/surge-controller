import { getJSON, setJSON } from "./db";

export type Tier = 1 | 2 | 3 | 0; // 0 = unknown/other

export const TIER_GROUPS = {
  tier1: "🌏 Tier1-JP/SG/TW",
  tier2: "🇭🇰 Tier2-HK",
  tier3: "🌍 Tier3-EU/US",
} as const;

// Default regex/keyword matchers by tier.
const T1 = /(🇯🇵|🇸🇬|🇹🇼|日本|東京|东京|JP|新加坡|狮城|SG|台灣|台湾|TW)/i;
const T2 = /(🇭🇰|香港|HK|HongKong)/i;
const T3 =
  /(🇺🇸|🇬🇧|🇩🇪|🇫🇷|🇨🇦|🇳🇱|🇮🇪|🇨🇭|🇸🇪|🇮🇹|🇪🇸|🇦🇺|美國|美国|US|英国|英國|UK|德国|法国|加拿大|荷兰|澳洲|澳大利亚|EU)/i;

export function defaultClassify(name: string): Tier {
  if (T1.test(name)) return 1;
  if (T2.test(name)) return 2;
  if (T3.test(name)) return 3;
  return 0;
}

export type TierOverrides = Record<string, Tier>; // nodeName -> tier
export type TierPenalty = Record<"1" | "2" | "3", number>;

const KEY_OVERRIDES = "tier_overrides";
const KEY_PENALTY = "tier_penalty";
const KEY_TIMEOUT = "tier_timeout_ms";

export function getOverrides(): TierOverrides {
  return getJSON<TierOverrides>(KEY_OVERRIDES, {});
}
export function setOverrides(o: TierOverrides) { setJSON(KEY_OVERRIDES, o); }

export function getPenalty(): TierPenalty {
  return getJSON<TierPenalty>(KEY_PENALTY, { "1": 0, "2": 50, "3": 150 });
}
export function setPenalty(p: TierPenalty) { setJSON(KEY_PENALTY, p); }

export function getTimeoutMs(): number {
  return getJSON<number>(KEY_TIMEOUT, 1500);
}
export function setTimeoutMs(n: number) { setJSON(KEY_TIMEOUT, n); }

export function classify(name: string, overrides = getOverrides()): Tier {
  if (overrides[name]) return overrides[name];
  return defaultClassify(name);
}

export function groupByTier(names: string[], overrides = getOverrides()) {
  const out: Record<Tier, string[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const n of names) out[classify(n, overrides)].push(n);
  return out;
}

/**
 * Weighted best-pick: score = latency + penalty[tier]; unreachable excluded.
 * Returns { pick, ranking } sorted ascending by score.
 */
export function pickBest(
  latencies: Record<string, number>, // ms, -1 / 0 / very large = unreachable
  opts?: { overrides?: TierOverrides; penalty?: TierPenalty; timeoutMs?: number }
) {
  const overrides = opts?.overrides ?? getOverrides();
  const penalty = opts?.penalty ?? getPenalty();
  const timeout = opts?.timeoutMs ?? getTimeoutMs();

  const ranking = Object.entries(latencies)
    .map(([name, lat]) => {
      const tier = classify(name, overrides);
      const reachable = lat > 0 && lat < timeout;
      const tierPenalty = tier === 0 ? 1000 : penalty[String(tier) as "1" | "2" | "3"] ?? 0;
      const score = reachable ? lat + tierPenalty : Infinity;
      return { name, latency: lat, tier, reachable, score };
    })
    .sort((a, b) => a.score - b.score);

  const pick = ranking.find(r => Number.isFinite(r.score)) ?? null;
  return { pick, ranking };
}
