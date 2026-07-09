"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { jsonFetch, swrFetcher } from "@/lib/fetcher";

type UserDirectRule = {
  type: "DOMAIN" | "DOMAIN-SUFFIX" | "DOMAIN-KEYWORD" | "IP-CIDR" | "IP-CIDR6";
  value: string;
};

type RulesResp = {
  rules: string[];               // "TYPE,VALUE,POLICY[,...opts]"
  userDirect: UserDirectRule[];  // structured local overrides
  userDirectLines: string[];     // pre-rendered lines
};

const RULE_TYPES: UserDirectRule["type"][] = [
  "DOMAIN-SUFFIX", "DOMAIN", "DOMAIN-KEYWORD", "IP-CIDR", "IP-CIDR6",
];

/** "TYPE,VALUE,POLICY[,...]" → { type, value, policy } */
function parseRule(line: string): { type: string; value: string; policy: string; opts: string[] } | null {
  const parts = line.split(",").map(s => s.trim());
  if (parts.length < 2) return null;
  // FINAL rules look like "FINAL,Proxy" — no value column.
  if (parts[0] === "FINAL") {
    return { type: "FINAL", value: "", policy: parts[1] ?? "", opts: parts.slice(2) };
  }
  if (parts.length < 3) return null;
  return { type: parts[0], value: parts[1], policy: parts[2], opts: parts.slice(3) };
}

function policyPill(policy: string): string {
  const p = policy.toUpperCase();
  if (p === "DIRECT") return "bg-emerald-500/15 text-emerald-400";
  if (p === "REJECT" || p === "REJECT-TINYGIF") return "bg-red-500/15 text-red-400";
  return "bg-indigo-500/15 text-indigo-400";
}

export default function RulesView() {
  const { data, mutate, isLoading } =
    useSWR<RulesResp>("/api/surge/rules", swrFetcher);

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [q, setQ] = useState("");
  const [policyFilter, setPolicyFilter] = useState<"ALL" | "DIRECT" | "PROXY" | "REJECT">("DIRECT");

  const [newType, setNewType] = useState<UserDirectRule["type"]>("DOMAIN-SUFFIX");
  const [newValue, setNewValue] = useState("");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg("");
    try { await fn(); }
    catch (e) { setMsg(String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  const addRule = () =>
    run("add", async () => {
      const value = newValue.trim();
      if (!value) { setMsg("请输入域名或 CIDR"); return; }
      const r = await jsonFetch<{ rules: UserDirectRule[]; applied: unknown }>("/api/user-rules", {
        method: "POST",
        body: JSON.stringify({ type: newType, value }),
      });
      setNewValue("");
      setMsg(
        (r.applied as { reloaded?: boolean } | null)?.reloaded === false
          ? "已保存，但 Surge reload 失败（可能未连通 Surge）"
          : (r.applied === null ? "已保存；需要先做一次订阅更新才会生效" : "已生效")
      );
      await mutate();
    });

  const removeRule = (rule: UserDirectRule) =>
    run(`del:${rule.type}:${rule.value}`, async () => {
      await jsonFetch("/api/user-rules", {
        method: "DELETE",
        body: JSON.stringify(rule),
      });
      setMsg("已移除");
      await mutate();
    });

  const clearAll = () =>
    run("clear", async () => {
      if (!window.confirm("确定清空全部自定义直连规则？")) return;
      await jsonFetch("/api/user-rules/clear", { method: "POST" });
      setMsg("已清空并恢复到订阅原状");
      await mutate();
    });

  const live = data?.rules ?? [];
  const userDirect = data?.userDirect ?? [];

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return live
      .map(line => ({ line, parsed: parseRule(line) }))
      .filter(({ parsed }) => {
        if (!parsed) return false;
        if (policyFilter !== "ALL") {
          const p = parsed.policy.toUpperCase();
          if (policyFilter === "DIRECT" && p !== "DIRECT") return false;
          if (policyFilter === "REJECT" && !p.startsWith("REJECT")) return false;
          if (policyFilter === "PROXY" && (p === "DIRECT" || p.startsWith("REJECT"))) return false;
        }
        if (!kw) return true;
        return (parsed.value + " " + parsed.type + " " + parsed.policy).toLowerCase().includes(kw);
      });
  }, [live, q, policyFilter]);

  return (
    <div className="space-y-4">
      {msg && (
        <div className="card px-3 py-2 text-sm flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="flex-1">{msg}</span>
          <button className="text-muted text-xs" onClick={() => setMsg("")}>×</button>
        </div>
      )}

      {/* ---- Add a user direct rule ---- */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="font-semibold">➕ 新增直连规则</div>
          <div className="ml-auto text-xs text-muted">追加到 [Rule] 顶部，优先命中</div>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <select
            value={newType}
            onChange={e => setNewType(e.target.value as UserDirectRule["type"])}
            className="input w-auto">
            {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            className="input"
            placeholder={
              newType.startsWith("IP-CIDR")
                ? "192.168.1.0/24"
                : "example.com"
            }
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addRule(); }}
          />
        </div>
        <button
          className="btn-tap w-full btn-primary"
          onClick={addRule}
          disabled={busy === "add" || !newValue.trim()}>
          添加并立即生效
        </button>
      </section>

      {/* ---- User overrides (separate from subscription) ---- */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="font-semibold">✏️ 你添加的直连规则</div>
          <span className="badge bg-emerald-500/20 text-emerald-400">{userDirect.length}</span>
          <div className="ml-auto">
            <button
              onClick={clearAll}
              disabled={busy === "clear" || userDirect.length === 0}
              className="btn-tap text-xs">
              一键清除
            </button>
          </div>
        </div>
        {userDirect.length === 0 ? (
          <div className="text-sm text-muted">
            还没添加过任何自定义规则。清除按钮会把 profile 恢复到订阅刚下载的样子。
          </div>
        ) : (
          <ul className="space-y-1.5">
            {userDirect.map(r => (
              <li key={`${r.type}:${r.value}`}
                  className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
                <span className="badge bg-slate-500/15 text-muted shrink-0">{r.type}</span>
                <span className="font-mono text-sm truncate flex-1">{r.value}</span>
                <span className="badge bg-emerald-500/15 text-emerald-400 shrink-0">DIRECT</span>
                <button
                  onClick={() => removeRule(r)}
                  disabled={busy === `del:${r.type}:${r.value}`}
                  className="text-muted text-xs px-2 py-1 active:text-red-400">
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Live rules (from Surge) ---- */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="font-semibold">📜 当前生效的规则</div>
          <span className="badge bg-slate-500/20 text-muted">{live.length}</span>
          <button
            className="ml-auto text-muted text-xs"
            onClick={() => mutate()}
            disabled={isLoading}>
            刷新
          </button>
        </div>
        <input
          className="input"
          placeholder="搜索：域名 / 类型 / 策略"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <div className="grid grid-cols-4 gap-2">
          {(["DIRECT", "PROXY", "REJECT", "ALL"] as const).map(f => (
            <button
              key={f}
              onClick={() => setPolicyFilter(f)}
              aria-pressed={policyFilter === f}
              className={`btn-tap text-xs ${policyFilter === f ? "btn-primary" : ""}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted">显示 {filtered.length} / {live.length}</div>
        <ul className="space-y-1 max-h-[60vh] overflow-auto -mx-1 px-1">
          {filtered.map(({ line, parsed }, i) => (
            <li key={i} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
              <span className="badge bg-slate-500/15 text-muted shrink-0">{parsed!.type}</span>
              <span className="font-mono text-xs truncate flex-1">
                {parsed!.type === "FINAL" ? "(fallback)" : parsed!.value}
              </span>
              <span className={`badge shrink-0 ${policyPill(parsed!.policy)}`}>{parsed!.policy}</span>
            </li>
          ))}
          {filtered.length === 0 && !isLoading && (
            <li className="text-sm text-muted px-1 py-3">没匹配到规则</li>
          )}
        </ul>
      </section>
    </div>
  );
}
