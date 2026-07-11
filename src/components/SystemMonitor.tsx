"use client";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";

const HISTORY_LEN = 60; // ~4 min at a 4s poll

type Snap = {
  ts: number;
  cpu: { cores: number; load1: number; utilPct: number };
  mem: { totalBytes: number; usedBytes: number; usedPct: number };
  battery: { percent: number | null; state: string; source: string };
  net: { iface: string | null; linkUp: boolean; rxMbps: number | null; txMbps: number | null };
  temp: { cpuC: number | null; gpuC: number | null; fanRpm: number | null; source: string; available: boolean };
};

const gb = (b: number) => (b / 1024 ** 3).toFixed(1);

function barColor(pct: number) {
  return pct < 70 ? "bg-green-500" : pct < 90 ? "bg-yellow-500" : "bg-red-500";
}

function tempColor(c: number | null) {
  if (c == null) return "";
  return c < 70 ? "text-green-500" : c < 85 ? "text-yellow-500" : "text-red-500";
}

function Sparkline({
  points, stroke, max, unit,
}: { points: number[]; stroke: string; max?: number; unit?: string }) {
  const w = 100, h = 34, pad = 2;
  const last = points.length ? points[points.length - 1] : 0;
  if (points.length < 2) {
    return <div className="h-[34px] flex items-center text-xs text-muted">采样中…</div>;
  }
  const hi = Math.max(max ?? 0, ...points, 1e-6);
  const stepX = (w - pad * 2) / (points.length - 1);
  const y = (v: number) => h - pad - (v / hi) * (h - pad * 2);
  const pts = points.map((p, i) => `${(pad + i * stepX).toFixed(1)},${y(p).toFixed(1)}`);
  const line = "M" + pts.join(" L");
  const area = `M${pad},${h - pad} L${pts.join(" L")} L${(pad + (points.length - 1) * stepX).toFixed(1)},${h - pad} Z`;
  const id = `sg-${stroke.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[34px]">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.5"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="absolute top-0 right-0 text-[10px] tabular-nums text-muted">
        {last.toFixed(unit === "%" ? 0 : 2)}{unit}
      </span>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted truncate">{sub}</div>}
    </div>
  );
}

export default function SystemMonitor() {
  const { data, error } = useSWR<Snap>("/api/monitor", swrFetcher, { refreshInterval: 4000 });
  const [history, setHistory] = useState<Snap[]>([]);

  useEffect(() => {
    if (!data) return;
    setHistory((h) => {
      if (h.length && h[h.length - 1].ts === data.ts) return h; // dedupe same sample
      return [...h, data].slice(-HISTORY_LEN);
    });
  }, [data]);

  if (error) return null;
  if (!data) {
    return <section className="card p-4 text-sm text-muted">加载监控中…</section>;
  }

  const { cpu, mem, battery, net, temp } = data;

  // Battery: AlDente caps at ~70%. Green near the cap, warn if it drifts high
  // (cap not working) or is fully charged on AC.
  const batt = battery.percent;
  const battColor =
    batt == null ? "text-muted" :
    batt >= 90 ? "text-red-500" :
    batt >= 78 ? "text-yellow-500" : "text-green-500";
  // AlDente targets 70%; still charging well above that on AC likely means the
  // cap isn't enforcing.
  const battWarn =
    batt != null && batt >= 80 && battery.source === "AC Power" && battery.state === "charging";

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${net.linkUp ? "bg-green-500" : "bg-red-500"}`} />
        <span className="text-xs text-muted">Surge 机器监控</span>
        <span className="ml-auto text-xs text-muted">{net.iface ?? "—"} · {net.linkUp ? "已连接" : "断开"}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="space-y-1">
          <Metric label={`CPU 负载 (${cpu.cores} 核)`} value={`${cpu.utilPct}%`} sub={`load ${cpu.load1.toFixed(2)}`} />
          <div className="h-1.5 rounded-full bg-bg overflow-hidden">
            <div className={`h-full ${barColor(cpu.utilPct)}`} style={{ width: `${cpu.utilPct}%` }} />
          </div>
        </div>

        <div className="space-y-1">
          <Metric label="内存" value={`${mem.usedPct}%`} sub={`${gb(mem.usedBytes)} / ${gb(mem.totalBytes)} GB`} />
          <div className="h-1.5 rounded-full bg-bg overflow-hidden">
            <div className={`h-full ${barColor(mem.usedPct)}`} style={{ width: `${mem.usedPct}%` }} />
          </div>
        </div>

        <Metric
          label="电池 (AlDente 限 70%)"
          value={<span className={battColor}>{batt != null ? `${batt}%` : "—"}</span>}
          sub={`${battery.state} · ${battery.source}${battWarn ? " ⚠ 未限流?" : ""}`}
        />

        <Metric
          label="温度"
          value={
            temp.available ? (
              <span className={tempColor(temp.cpuC)}>
                {[
                  temp.cpuC != null ? `CPU ${temp.cpuC}°` : null,
                  temp.gpuC != null ? `GPU ${temp.gpuC}°` : null,
                ].filter(Boolean).join(" · ") || "—"}
              </span>
            ) : "N/A"
          }
          sub={
            temp.available
              ? `${temp.fanRpm != null ? `风扇 ${temp.fanRpm}rpm · ` : ""}${temp.source}`
              : "装 osx-cpu-temp 或开 powermetrics"
          }
        />

        <div className="col-span-2">
          <Metric
            label="网络吞吐（软路由上下行接近，作活动量参考）"
            value={
              net.rxMbps != null || net.txMbps != null
                ? `↓ ${(net.rxMbps ?? 0).toFixed(2)} · ↑ ${(net.txMbps ?? 0).toFixed(2)} Mbps`
                : "—"
            }
          />
        </div>
      </div>

      <div className="border-t border-border pt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="space-y-0.5">
          <div className="text-xs text-muted">CPU %</div>
          <Sparkline points={history.map((s) => s.cpu.utilPct)} stroke="#22c55e" max={100} unit="%" />
        </div>
        <div className="space-y-0.5">
          <div className="text-xs text-muted">内存 %</div>
          <Sparkline points={history.map((s) => s.mem.usedPct)} stroke="#6366f1" max={100} unit="%" />
        </div>
        <div className="space-y-0.5">
          <div className="text-xs text-muted">下行 Mbps</div>
          <Sparkline points={history.map((s) => s.net.rxMbps ?? 0)} stroke="#0ea5e9" unit="" />
        </div>
        <div className="space-y-0.5">
          <div className="text-xs text-muted">CPU 温度 °C</div>
          <Sparkline points={history.map((s) => s.temp.cpuC ?? 0)} stroke="#f59e0b" max={100} unit="°" />
        </div>
      </div>
    </section>
  );
}
