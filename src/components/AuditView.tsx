"use client";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";

type Entry = { id: number; login?: string; action: string; payload?: string; created_at: number };

export default function AuditView() {
  const { data } = useSWR<{ entries: Entry[] }>("/api/audit", swrFetcher, { refreshInterval: 5000 });
  const entries = data?.entries ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">操作日志</h1>
      <div className="card divide-y divide-border">
        {entries.map(e => (
          <div key={e.id} className="p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="badge bg-accent/15">{e.action}</span>
              <span className="text-muted text-xs">{e.login ?? "—"}</span>
              <span className="flex-1" />
              <span className="text-muted text-xs">{new Date(e.created_at).toLocaleString()}</span>
            </div>
            {e.payload && <pre className="text-xs text-muted mt-1 overflow-auto">{e.payload}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
