"use client";
import useSWR from "swr";
import { useState } from "react";
import { jsonFetch, swrFetcher } from "@/lib/fetcher";

type Entry = { isGroup: 0 | 1; name: string; typeDescription: string; enabled: 0 | 1 };
type PG = Record<string, Entry[]>;

export default function Dashboard() {
  const { data: pg, mutate: refreshGroups } = useSWR<{ groups: PG; selected: Record<string, string> }>("/api/surge/policy-groups", swrFetcher, { refreshInterval: 0 });
  const { data: outbound, mutate: refreshOutbound } = useSWR<{ mode: string }>("/api/surge/outbound-mode", swrFetcher, { refreshInterval: 5000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [latencies, setLatencies] = useState<Record<string, Record<string, number>>>({});
  const [msg, setMsg] = useState<string>("");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg("");
    try { await fn(); } catch (e) { setMsg(String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  const setMode = (mode: string) =>
    run(`mode:${mode}`, async () => {
      await jsonFetch("/api/surge/outbound-mode", { method: "POST", body: JSON.stringify({ mode }) });
      await refreshOutbound();
    });

  const select = (group: string, policy: string) =>
    run(`sel:${group}`, async () => {
      await jsonFetch("/api/surge/select", { method: "POST", body: JSON.stringify({ group, policy }) });
      await refreshGroups();
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
      const r = await jsonFetch<{ pick: { name: string; score: number } }>("/api/surge/auto-best", {
        method: "POST", body: JSON.stringify({ group, apply: true }),
      });
      setMsg(`已切到 ${r.pick.name} (score ${Math.round(r.pick.score)})`);
      await refreshGroups();
    });

  const tier = (t: "1" | "2" | "3") =>
    run(`tier:${t}`, async () => {
      await jsonFetch("/api/surge/tier", { method: "POST", body: JSON.stringify({ tier: t, group: "Proxy" }) });
      await refreshGroups();
    });

  const groups = pg?.groups ?? {};
  const selected = pg?.selected ?? {};
  const mode = outbound?.mode ?? "—";

  return (
    <div className="space-y-6">
      {msg && <div className="card p-3 text-sm">{msg}</div>}

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted">出站模式</div>
        {(["direct", "rule", "proxy", "global"] as const).map(m => (
          <button key={m}
            onClick={() => setMode(m)}
            disabled={busy === `mode:${m}`}
            className={`btn ${mode === m ? "btn-primary" : ""}`}>
            {m === "direct" ? "Direct" : m === "rule" ? "Rule" : m === "proxy" ? "Global Proxy" : "Global"}
          </button>
        ))}
        <div className="flex-1" />
        <div className="text-sm text-muted">当前: <b>{mode}</b></div>
      </div>

      <div className="card p-4 space-y-2">
        <div className="text-sm text-muted mb-1">区域快切 (Proxy 主组)</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => tier("1")} disabled={busy === "tier:1"} className="btn">🌏 日/新/台</button>
          <button onClick={() => tier("2")} disabled={busy === "tier:2"} className="btn">🇭🇰 香港</button>
          <button onClick={() => tier("3")} disabled={busy === "tier:3"} className="btn">🌍 欧美</button>
          <button onClick={() => autoBest("Proxy")} disabled={busy === "auto:Proxy"} className="btn btn-primary">⚡ 自动最优</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {Object.entries(groups)
          .filter(([, entries]) => entries.some(e => e.isGroup === 0 || true)) // show all
          .map(([groupName, entries]) => {
            const sel = selected[groupName];
            const lats = latencies[groupName] ?? {};
            return (
              <div key={groupName} className="card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="font-semibold truncate flex-1">{groupName}</div>
                  <button onClick={() => testGroup(groupName)} disabled={busy === `test:${groupName}`}
                    className="btn text-xs">测延迟</button>
                  <button onClick={() => autoBest(groupName)} disabled={busy === `auto:${groupName}`}
                    className="btn btn-primary text-xs">最优</button>
                </div>
                <div className="text-xs text-muted">当前: <b>{sel ?? "—"}</b></div>
                <div className="space-y-1 max-h-72 overflow-auto">
                  {entries.map(e => {
                    const lat = lats[e.name];
                    const color = lat == null ? "text-muted" :
                      lat <= 0 ? "text-red-500" :
                      lat < 200 ? "text-green-500" :
                      lat < 500 ? "text-yellow-500" : "text-red-500";
                    return (
                      <button key={e.name}
                        onClick={() => select(groupName, e.name)}
                        disabled={busy === `sel:${groupName}`}
                        className={`w-full text-left px-2 py-1.5 rounded-lg border border-border hover:bg-bg flex items-center gap-2
                          ${sel === e.name ? "bg-accent/15 border-accent" : ""}`}>
                        <span className="flex-1 truncate text-sm">{e.name}</span>
                        {lat != null && <span className={`text-xs ${color}`}>{lat > 0 ? `${lat}ms` : "timeout"}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
