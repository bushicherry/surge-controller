"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { jsonFetch, swrFetcher } from "@/lib/fetcher";
import SystemMonitor from "./SystemMonitor";

type Entry = { isGroup: 0 | 1; name: string; typeDescription: string; enabled: 0 | 1 };
type PG = Record<string, Entry[]>;

// Tier group names as produced by the sanitizer / stored in the profile.
// Keep in sync with src/lib/tier.ts::TIER_GROUPS.
const TIER = {
  "1": "🌏 Tier1-JP/SG/CN",
  "2": "🇭🇰 Tier2-HK",
  "3": "🌍 Tier3-EU/US",
} as const;

const REGION_LABEL: Record<keyof typeof TIER, string> = {
  "1": "🇨🇳 日/新/中",
  "2": "🇭🇰 香港",
  "3": "🌍 欧美",
};

// Mirrors src/lib/tier.ts::defaultClassify — kept small & duplicated so the
// client bundle doesn't drag in server-only DB code.
const T1_RE = /(🇯🇵|🇸🇬|🇨🇳|🇹🇼|日本|東京|东京|JP|新加坡|狮城|SG|中国|中國|CN|台灣|台湾|TW)/i;
const T2_RE = /(🇭🇰|香港|HK|HongKong)/i;
const T3_RE = /(🇺🇸|🇬🇧|🇩🇪|🇫🇷|🇨🇦|🇳🇱|🇮🇪|🇨🇭|🇸🇪|🇮🇹|🇪🇸|🇦🇺|美國|美国|US|英国|英國|UK|德国|法国|加拿大|荷兰|澳洲|澳大利亚|EU)/i;
function classifyTier(name: string): "1" | "2" | "3" | null {
  if (T1_RE.test(name)) return "1";
  if (T2_RE.test(name)) return "2";
  if (T3_RE.test(name)) return "3";
  return null;
}

// Surge's real HTTP-API accepts only `direct` / `rule` / `global` (aka
// "Global Proxy"). `proxy` is a widely-used alias for `global`; we keep
// `proxy` for backwards compat with the mock, but expose a single button.
const MODE_LABEL: Record<string, string> = {
  direct: "Direct",
  rule:   "Rule",
  proxy:  "Global Proxy",
  global: "Global Proxy",
};

const MODE_META: Record<string, { dot: string; blurb: string }> = {
  direct: { dot: "bg-slate-400",  blurb: "所有流量直连，不使用代理" },
  rule:   { dot: "bg-green-500",  blurb: "按规则分流，代理命中时使用下方节点" },
  proxy:  { dot: "bg-indigo-500", blurb: "全局代理，所有流量走下方节点" },
  global: { dot: "bg-indigo-500", blurb: "全局代理，所有流量走下方节点" },
};

export default function Dashboard() {
  const { data: pg, mutate: refreshGroups } =
    useSWR<{ groups: PG; selected: Record<string, string> }>("/api/surge/policy-groups", swrFetcher);
  const { data: outbound, mutate: refreshOutbound } =
    useSWR<{ mode: string }>("/api/surge/outbound-mode", swrFetcher, { refreshInterval: 5000 });

  const [busy, setBusy] = useState<string | null>(null);
  const [latencies, setLatencies] = useState<Record<string, Record<string, number>>>({});
  const [msg, setMsg] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg("");
    try { await fn(); }
    catch (e) { setMsg(String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  // True only when `group` is one of our tier groups, is an actual member of
  // the Proxy group, and Proxy isn't already pointing at it. Selecting a
  // non-member policy on Proxy makes Surge return "invalid parameters".
  const canFlipProxyTo = (group: string): boolean => {
    const groups = pg?.groups ?? {};
    const selected = pg?.selected ?? {};
    const isTierGroup = (Object.values(TIER) as string[]).includes(group);
    if (!isTierGroup) return false;
    if (selected["Proxy"] === group) return false;
    return (groups["Proxy"] ?? []).some(e => e.name === group);
  };

  const setMode = (mode: string) =>
    run(`mode:${mode}`, async () => {
      await jsonFetch("/api/surge/outbound-mode", { method: "POST", body: JSON.stringify({ mode }) });
      await refreshOutbound();
      setMsg(`已切到 ${MODE_LABEL[mode] ?? mode}`);
    });

  const select = (group: string, policy: string) =>
    run(`sel:${group}`, async () => {
      await jsonFetch("/api/surge/select", {
        method: "POST", body: JSON.stringify({ group, policy }),
      });
      // If the group we just picked in is a tier subgroup, also switch the
      // master `Proxy` group to that tier — otherwise effective routing
      // still resolves through whichever tier `Proxy` was pointing at, and
      // the tap feels like a no-op. Only flip when the tier group is really a
      // member of Proxy; otherwise Surge rejects it with "invalid parameters".
      if (canFlipProxyTo(group)) {
        await jsonFetch("/api/surge/select", {
          method: "POST", body: JSON.stringify({ group: "Proxy", policy: group }),
        });
      }
      await refreshGroups();
      setMsg(`已切到 ${policy}`);
    });

  const testGroup = (group: string) =>
    run(`test:${group}`, async () => {
      const r = await jsonFetch<{ latencies: Record<string, number> }>("/api/surge/test-latency", {
        method: "POST", body: JSON.stringify({ group }),
      });
      setLatencies(prev => ({ ...prev, [group]: r.latencies }));
    });

  const autoBest = (group: string) =>
    run(`auto:${group}`, async () => {
      const r = await jsonFetch<{
        pick: { name: string; score: number };
        ranking: { name: string; latency: number }[];
      }>("/api/surge/auto-best", {
        method: "POST", body: JSON.stringify({ group, apply: true }),
      });
      // Merge the latency map so the picked node's ms shows immediately,
      // and the group's node list reflects the fresh measurement.
      const map: Record<string, number> = {};
      for (const it of r.ranking) map[it.name] = it.latency;
      setLatencies(prev => ({ ...prev, [group]: { ...(prev[group] ?? {}), ...map } }));
      // Same as select(): auto-best on a tier subgroup only updates that
      // subgroup's selection. If Proxy still points at a *different* tier,
      // the banner would show the pick but the effective leaf wouldn't
      // change — so we also flip Proxy to that tier (only if it's a real
      // member of Proxy, else Surge returns "invalid parameters").
      if (canFlipProxyTo(group)) {
        await jsonFetch("/api/surge/select", {
          method: "POST", body: JSON.stringify({ group: "Proxy", policy: group }),
        });
      }
      setMsg(`已切到 ${r.pick.name} (score ${Math.round(r.pick.score)})`);
      await refreshGroups();
    });

  const tier = (t: "1" | "2" | "3") =>
    run(`tier:${t}`, async () => {
      await jsonFetch("/api/surge/tier", { method: "POST", body: JSON.stringify({ tier: t, group: "Proxy" }) });
      await refreshGroups();
      setMsg(`已切到 ${REGION_LABEL[t]}`);
    });

  const groups = pg?.groups ?? {};
  const selected = pg?.selected ?? {};
  const mode = outbound?.mode ?? "—";
  const proxySel = selected["Proxy"];
  const isDirect = mode === "direct";

  // Walk `selected` from Proxy through any nested groups until we hit a leaf
  // node (something that isn't itself a group). This is what the user actually
  // wants to see in the status hero: the concrete endpoint being used, not
  // the intermediate tier bucket.
  const leafNode = useMemo<string | null>(() => {
    if (!proxySel) return null;
    let cur: string | undefined = proxySel;
    const seen = new Set<string>();
    while (cur && groups[cur] && selected[cur] && !seen.has(cur)) {
      seen.add(cur);
      cur = selected[cur];
    }
    return cur ?? null;
  }, [proxySel, groups, selected]);

  // Which region is currently active on the Proxy master group?
  // - Exact match if user picked a tier subgroup directly.
  // - Otherwise classify the resolved leaf node (so auto-best still highlights
  //   the region the picked node belongs to).
  const activeTier = useMemo<"1" | "2" | "3" | null>(() => {
    if (!proxySel) return null;
    for (const [t, name] of Object.entries(TIER)) if (name === proxySel) return t as "1" | "2" | "3";
    return classifyTier(leafNode ?? proxySel);
  }, [proxySel, leafNode]);

  const groupNames = Object.keys(groups);
  const primaryGroups = groupNames.filter(g => g === "Proxy" || Object.values(TIER).includes(g as (typeof TIER)[keyof typeof TIER]));
  const otherGroups = groupNames.filter(g => !primaryGroups.includes(g));

  const modeMeta = MODE_META[mode] ?? { dot: "bg-slate-400", blurb: "" };
  // Compose the status headline: prefer the resolved leaf node, then the
  // tier group name, then a placeholder. In Direct mode neither matters.
  const statusHeadline =
    isDirect ? modeMeta.blurb :
    leafNode ?? proxySel ?? "—";
  // Only show the "via <tier group>" sub-line when there really is a
  // hop between Proxy and the leaf (i.e. proxySel is a group, not the leaf itself).
  const statusVia =
    !isDirect && proxySel && leafNode && proxySel !== leafNode ? proxySel : null;

  return (
    <div className="space-y-4">
      {msg && (
        <div className="card px-3 py-2 text-sm flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="flex-1">{msg}</span>
          <button className="text-muted text-xs" onClick={() => setMsg("")}>×</button>
        </div>
      )}

      {/* Status hero ----------------------------------------------------- */}
      <section className="card p-4 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${modeMeta.dot}`} />
          <span className="text-xs text-muted">当前节点</span>
          <span className="ml-auto text-xs text-muted">{MODE_LABEL[mode] ?? mode}</span>
        </div>
        <div className={`text-lg font-semibold truncate ${isDirect ? "text-muted" : ""}`}>{statusHeadline}</div>
        {statusVia && (
          <div className="text-xs text-muted truncate">via {statusVia}</div>
        )}
      </section>

      {/* Surge machine resource / power / network monitor ---------------- */}
      <SystemMonitor />

      {/* Outbound mode --------------------------------------------------- */}
      <section className="card p-4 space-y-3">
        <div className="text-xs text-muted">出站模式</div>
        <div className="grid grid-cols-3 gap-2">
          {(["direct", "rule", "proxy"] as const).map(m => (
            <button key={m}
              onClick={() => setMode(m)}
              disabled={busy === `mode:${m}`}
              // A profile currently on `global` should still light up the
              // Global Proxy button (they mean the same thing).
              aria-pressed={mode === m || (m === "proxy" && mode === "global")}
              className={`btn-tap ${mode === m || (m === "proxy" && mode === "global") ? "btn-primary" : ""}`}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </section>

      {isDirect ? (
        <section className="card p-4 text-sm text-muted">
          当前为 <b className="text-fg">Direct</b> 模式，切换区域 / 节点不会生效。先切到 <b className="text-fg">Rule</b> 或 <b className="text-fg">Global Proxy</b> 再选择节点。
        </section>
      ) : (
      <>
      {/* Region quick switch --------------------------------------------- */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">区域快切</span>
          <span className="ml-auto font-semibold truncate max-w-[65%]">
            {proxySel ? proxySel : "—"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["1", "2", "3"] as const).map(t => (
            <button key={t}
              onClick={() => tier(t)}
              disabled={busy === `tier:${t}`}
              aria-pressed={activeTier === t}
              className={`btn-tap ${activeTier === t ? "btn-primary" : ""}`}>
              {REGION_LABEL[t]}
            </button>
          ))}
        </div>
        <button
          onClick={() => autoBest("Proxy")}
          disabled={busy === "auto:Proxy"}
          className="btn-tap w-full text-base">
          ⚡ 自动最优（跨全区域）
        </button>
      </section>

      {/* Detailed group cards -------------------------------------------- */}
      <div className="grid md:grid-cols-2 gap-3">
        {[...primaryGroups.filter(g => g !== "Proxy"), ...otherGroups].map(groupName => {
          const entries = groups[groupName] ?? [];
          const sel = selected[groupName];
          const lats = latencies[groupName] ?? {};
          const isOpen = expanded[groupName] ?? false;
          return (
            <section key={groupName} className="card">
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [groupName]: !isOpen }))}
                className="w-full p-4 flex items-center gap-2 text-left">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-sm">{groupName}</div>
                  <div className="text-xs text-muted truncate">
                    {sel ?? "—"}
                  </div>
                </div>
                <span className="text-muted text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="border-t border-border p-3 space-y-2">
                  <div className="flex gap-2">
                    <button onClick={() => testGroup(groupName)}
                      disabled={busy === `test:${groupName}`}
                      className="btn-tap flex-1 text-xs">测延迟</button>
                    {/* Action button: accented text + border, but no filled
                        background so it doesn't read as a toggle-on state. */}
                    <button onClick={() => autoBest(groupName)}
                      disabled={busy === `auto:${groupName}`}
                      className="btn-tap flex-1 text-xs text-accent border-accent/60 font-medium">
                      ⚡ 选最优
                    </button>
                  </div>
                  <div className="space-y-1 max-h-80 overflow-auto -mx-1 px-1">
                    {entries.map(e => {
                      const lat = lats[e.name];
                      const color =
                        lat == null ? "text-muted" :
                        lat <= 0     ? "text-red-500" :
                        lat < 200    ? "text-green-500" :
                        lat < 500    ? "text-yellow-500" : "text-red-500";
                      const active = sel === e.name;
                      return (
                        <button key={e.name}
                          onClick={() => select(groupName, e.name)}
                          disabled={busy === `sel:${groupName}`}
                          aria-pressed={active}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border flex items-center gap-2 transition
                            ${active
                              ? "bg-accent/15 border-accent"
                              : "border-border hover:bg-bg"}`}>
                          <span className="flex-1 truncate text-sm">{e.name}</span>
                          {lat != null && <span className={`text-xs tabular-nums ${color}`}>{lat > 0 ? `${lat}ms` : "timeout"}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
