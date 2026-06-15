"use client";
import useSWR from "swr";
import { useState } from "react";
import { jsonFetch, swrFetcher } from "@/lib/fetcher";

type Token = { id: number; name: string; prefix: string; last_used_at: number | null; created_at: number; revoked: number };

export default function TokensView() {
  const { data, mutate } = useSWR<{ tokens: Token[] }>("/api/tokens", swrFetcher);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name) return;
    setBusy(true); setCreated(null);
    try {
      const r = await jsonFetch<{ token: string }>("/api/tokens", { method: "POST", body: JSON.stringify({ name }) });
      setCreated(r.token); setName(""); await mutate();
    } finally { setBusy(false); }
  };

  const revoke = async (id: number) => {
    if (!confirm("撤销该 token?")) return;
    await jsonFetch("/api/tokens", { method: "DELETE", body: JSON.stringify({ id }) });
    await mutate();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">API Tokens</h1>
      <p className="text-sm text-muted">用于 iPhone 快捷指令 / curl 等无浏览器场景。请求时携带 Header: <code>Authorization: Bearer &lt;token&gt;</code></p>

      <div className="card p-4 flex gap-2">
        <input className="input" placeholder="token 名称 (如 iphone-shortcut)" value={name} onChange={e => setName(e.target.value)} />
        <button onClick={create} disabled={busy || !name} className="btn btn-primary">生成</button>
      </div>

      {created && (
        <div className="card p-4 border-accent">
          <div className="text-sm text-muted mb-2">仅显示一次，请立即复制：</div>
          <code className="block break-all p-2 bg-bg rounded-lg text-sm">{created}</code>
        </div>
      )}

      <div className="card divide-y divide-border">
        {(data?.tokens ?? []).map(t => (
          <div key={t.id} className="p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium text-sm">{t.name} {t.revoked ? <span className="badge bg-red-500/20 text-red-400">已撤销</span> : null}</div>
              <div className="text-xs text-muted">前缀 {t.prefix}··· · 创建于 {new Date(t.created_at).toLocaleString()} · {t.last_used_at ? `最近使用 ${new Date(t.last_used_at).toLocaleString()}` : "未使用"}</div>
            </div>
            {!t.revoked && <button onClick={() => revoke(t.id)} className="btn text-xs">撤销</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
