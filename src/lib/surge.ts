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
  selectPolicies: () => call<Record<string, string>>("/v1/policies/select"),
  selectPolicy: (group_name: string, policy: string) =>
    call("/v1/policies/select", {
      method: "POST",
      body: JSON.stringify({ group_name, policy }),
    }),
  testGroupDelay: (group_name: string) =>
    call<Record<string, number>>("/v1/test/group_delay", {
      method: "POST",
      body: JSON.stringify({ group_name }),
      timeoutMs: 30000,
    }),
  outbound: () => call<{ mode: string }>("/v1/outbound"),
  setOutbound: (mode: "direct" | "rule" | "proxy" | "global") =>
    call("/v1/outbound", { method: "POST", body: JSON.stringify({ mode }) }),
  reload: () => call("/v1/profiles/reload", { method: "POST" }),
  traffic: () => call<unknown>("/v1/traffic"),
  events: () => call<unknown>("/v1/events"),
  // Returns generic Surge "features/system" info (best-effort)
  outboundIp: () => call<unknown>("/v1/features/system_proxy").catch(() => null),
};
