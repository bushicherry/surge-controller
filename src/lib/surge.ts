import { env } from "./env";

async function call<T = unknown>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 15000);
  try {
    const res = await fetch(`${env.surgeApiHost}${path}`, {
      ...init,
      headers: {
        "X-Key": env.surgeApiKey,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Surge API ${path} ${res.status}: ${text}`);
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } finally {
    clearTimeout(t);
  }
}

export type PolicyEntry = {
  isGroup: 0 | 1;
  name: string;
  typeDescription: string;
  lineHash: string;
  enabled: 0 | 1;
};
export type PolicyGroups = Record<string, PolicyEntry[]>;

export const surge = {
  policyGroups: () => call<PolicyGroups>("/v1/policy_groups"),
  // Surge returns the selected option *per group*, so build the map by querying
  // each group. Pass groupNames to avoid a redundant /v1/policy_groups fetch.
  selectPolicies: async (groupNames?: string[]): Promise<Record<string, string>> => {
    const names = groupNames ?? Object.keys(await call<PolicyGroups>("/v1/policy_groups"));
    const entries = await Promise.all(
      names.map(async (g) => {
        try {
          const r = await call<{ policy: string }>(
            `/v1/policy_groups/select?group_name=${encodeURIComponent(g)}`
          );
          return [g, r?.policy ?? ""] as const;
        } catch {
          return [g, ""] as const;
        }
      })
    );
    return Object.fromEntries(entries.filter(([, p]) => p));
  },
  selectPolicy: (group_name: string, policy: string) =>
    call("/v1/policy_groups/select", {
      method: "POST",
      body: JSON.stringify({ group_name, policy }),
    }),
  // Test every leaf policy in a group -> { name: latency(ms) }.
  // Uses `receive`; missing / non-positive nodes reported as -1 (unreachable).
  testGroupDelay: async (group_name: string): Promise<Record<string, number>> => {
    const groups = await call<PolicyGroups>("/v1/policy_groups");
    const leaves = (groups[group_name] ?? [])
      .filter((e) => e.isGroup === 0)
      .map((e) => e.name);
    if (leaves.length === 0) return {};
    const res = await call<Record<string, { receive?: number }>>("/v1/policies/test", {
      method: "POST",
      body: JSON.stringify({
        policy_names: leaves,
        url: "http://www.gstatic.com/generate_204",
      }),
      timeoutMs: 30000,
    });
    const out: Record<string, number> = {};
    for (const name of leaves) {
      const ms = res?.[name]?.receive;
      out[name] = typeof ms === "number" && ms > 0 ? ms : -1;
    }
    return out;
  },
  outbound: () => call<{ mode: string }>("/v1/outbound"),
  setOutbound: (mode: "direct" | "rule" | "proxy" | "global") =>
    call("/v1/outbound", { method: "POST", body: JSON.stringify({ mode }) }),
  reload: () => call("/v1/profiles/reload", { method: "POST" }),
  traffic: () => call<unknown>("/v1/traffic"),
  events: () => call<unknown>("/v1/events"),
  // Returns generic Surge "features/system" info (best-effort)
  outboundIp: () => call<unknown>("/v1/features/system_proxy").catch(() => null),
  // Returns the raw rules currently loaded in Surge. Shape:
  //   { rules: string[] }  — each element is a "TYPE,VALUE,POLICY[,...opts]" line.
  rules: () => call<{ rules: string[] }>("/v1/rules"),
};
