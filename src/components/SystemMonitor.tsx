"use client";
import type { ReactNode } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";

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
    </section>
  );
}
