"use client";
import useSWR from "swr";
import { useState } from "react";
import { jsonFetch, swrFetcher } from "@/lib/fetcher";

type Settings = {
  profile_path: string;
  http_api_value: string;
  has_subscription: boolean;
  tier_penalty: { "1": number; "2": number; "3": number };
  tier_timeout_ms: number;
};

export default function SubscriptionForm() {
  const { data, mutate } = useSWR<Settings>("/api/settings", swrFetcher);
  const [subUrl, setSubUrl] = useState("");
  const [path, setPath] = useState("");
  const [httpApi, setHttpApi] = useState("");
  const [penalty, setPenalty] = useState({ "1": 0, "2": 50, "3": 150 });
  const [timeout, setTimeoutMs] = useState(1500);
  const [msg, setMsg] = useState<string>("");
  const [report, setReport] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (data && !path && data.profile_path) {
    setPath(data.profile_path); setHttpApi(data.http_api_value);
    setPenalty(data.tier_penalty); setTimeoutMs(data.tier_timeout_ms);
  }

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await jsonFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...(subUrl ? { subscription_url: subUrl } : {}),
          profile_path: path,
          http_api_value: httpApi,
          tier_penalty: penalty,
          tier_timeout_ms: timeout,
        }),
      });
      setSubUrl(""); setMsg("已保存"); await mutate();
    } catch (e) { setMsg(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  const update = async (dryRun: boolean) => {
    setBusy(true); setMsg(""); setReport(null);
    try {
      const r = await jsonFetch<{ report: unknown }>(
        dryRun ? "/api/subscription/preview" : "/api/subscription/update",
        {
          method: "POST",
          body: JSON.stringify(subUrl ? { subscription_url: subUrl } : {}),
        }
      );
      setReport(r.report);
      setMsg(dryRun ? "Dry run 完成" : "更新+reload 完成");
      if (!dryRun && subUrl) { setSubUrl(""); await mutate(); }
    } catch (e) { setMsg(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">订阅 & 设置</h1>
      {msg && <div className="card p-3 text-sm">{msg}</div>}

      <div className="card p-4 space-y-3">
        <label className="text-sm">订阅 URL <span className="text-muted">({data?.has_subscription ? "已保存，留空不修改" : "未配置"})</span>
          <input className="input mt-1" value={subUrl} onChange={e => setSubUrl(e.target.value)} placeholder="https://..."/>
        </label>
        <label className="text-sm">Surge profile 绝对路径
          <input className="input mt-1" value={path} onChange={e => setPath(e.target.value)} placeholder="/Users/.../Default.conf"/>
        </label>
        <label className="text-sm">http-api 注入值
          <input className="input mt-1" value={httpApi} onChange={e => setHttpApi(e.target.value)} placeholder="surgepasswd@0.0.0.0:6171"/>
        </label>
        <button onClick={save} disabled={busy} className="btn btn-primary">保存设置</button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="font-semibold">Tier 加权评分参数</div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {(["1", "2", "3"] as const).map(k => (
            <label key={k}>Tier {k} penalty
              <input className="input mt-1" type="number" value={penalty[k]}
                onChange={e => setPenalty(p => ({ ...p, [k]: Number(e.target.value) }))}/>
            </label>
          ))}
          <label className="col-span-3">超时阈值 (ms)
            <input className="input mt-1" type="number" value={timeout}
              onChange={e => setTimeoutMs(Number(e.target.value))}/>
          </label>
        </div>
        <button onClick={save} disabled={busy} className="btn">保存 Tier 参数</button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="font-semibold">订阅更新</div>
        <div className="flex gap-2">
          <button onClick={() => update(true)} disabled={busy} className="btn">预览 (Dry-Run)</button>
          <button onClick={() => update(false)} disabled={busy} className="btn btn-primary">立即更新 + Reload</button>
        </div>
        {report != null && (
          <pre className="text-xs bg-bg p-3 rounded-lg overflow-auto max-h-80">
            {JSON.stringify(report, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
