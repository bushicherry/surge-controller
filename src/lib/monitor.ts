import { execFile } from "node:child_process";

// Server-only system monitor for the Surge Mac. Everything here runs as the
// non-root LaunchAgent user, so we only use commands that work without sudo:
//   - CPU load:  sysctl vm.loadavg / hw.ncpu
//   - Memory:    sysctl hw.memsize/hw.pagesize + vm_stat
//   - Battery:   pmset -g batt   (AlDente enforces the 70% cap; we only display)
//   - Network:   route (default iface) + ifconfig (link) + netstat -ib (throughput)
// Temperature needs SMC access → only via `sudo powermetrics`, gated behind an
// env flag so the default install never prompts / errors.

const EXEC_TIMEOUT_MS = 4000;

function run(cmd: string, args: string[], timeoutMs = EXEC_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1 << 20 }, (err, stdout) => {
      // Never throw — a failed probe just yields an empty string so one bad
      // metric can't take down the whole snapshot.
      resolve(err ? "" : stdout);
    });
  });
}

async function sysctl(key: string): Promise<string> {
  return (await run("/usr/sbin/sysctl", ["-n", key])).trim();
}

export type CpuInfo = { cores: number; load1: number; load5: number; load15: number; utilPct: number };
export type MemInfo = { totalBytes: number; usedBytes: number; usedPct: number };
export type BatteryInfo = { percent: number | null; state: string; source: string };
export type NetInfo = {
  iface: string | null;
  linkUp: boolean;
  rxMbps: number | null;
  txMbps: number | null;
};
export type TempInfo = {
  cpuC: number | null;
  gpuC: number | null;
  fanRpm: number | null;
  source: "powermetrics" | "osx-cpu-temp" | "none";
  available: boolean;
};
export type MonitorSnapshot = {
  ts: number;
  cpu: CpuInfo;
  mem: MemInfo;
  battery: BatteryInfo;
  net: NetInfo;
  temp: TempInfo;
};

async function readCpu(): Promise<CpuInfo> {
  const [ncpuStr, loadStr] = await Promise.all([sysctl("hw.ncpu"), sysctl("vm.loadavg")]);
  const cores = Number(ncpuStr) || 1;
  // vm.loadavg => "{ 1.23 1.10 0.98 }"
  const nums = (loadStr.match(/[\d.]+/g) ?? []).map(Number);
  const [load1 = 0, load5 = 0, load15 = 0] = nums;
  const utilPct = Math.min(100, Math.round((load1 / cores) * 100));
  return { cores, load1, load5, load15, utilPct };
}

async function readMem(): Promise<MemInfo> {
  const [memsizeStr, pagesizeStr, vmstat] = await Promise.all([
    sysctl("hw.memsize"),
    sysctl("hw.pagesize"),
    run("/usr/bin/vm_stat", []),
  ]);
  const totalBytes = Number(memsizeStr) || 0;
  const pageSize = Number(pagesizeStr) || 4096;
  const pages = (label: string) => {
    const m = vmstat.match(new RegExp(`${label}:\\s+(\\d+)\\.`));
    return m ? Number(m[1]) : 0;
  };
  // macOS "Memory Used" ≈ active + wired + compressed.
  const used =
    (pages("Pages active") + pages("Pages wired down") + pages("Pages occupied by compressor")) *
    pageSize;
  const usedBytes = Math.min(totalBytes, used);
  const usedPct = totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0;
  return { totalBytes, usedBytes, usedPct };
}

async function readBattery(): Promise<BatteryInfo> {
  const out = await run("/usr/bin/pmset", ["-g", "batt"]);
  const pct = out.match(/(\d+)%/);
  const state = /\b(charging|discharging|charged|finishing charge)\b/i.exec(out)?.[1] ?? "unknown";
  const source = /Now drawing from '([^']+)'/.exec(out)?.[1] ?? "unknown";
  return { percent: pct ? Number(pct[1]) : null, state: state.toLowerCase(), source };
}

// Module-level sample so we can diff netstat byte counters between polls.
let lastNet: { iface: string; rx: number; tx: number; ts: number } | null = null;

async function physicalIface(): Promise<string | null> {
  // Surge runs as a VPN, so the system default route points at its `utun*`
  // tunnel — not the real uplink. Pick the physical `en*` default route
  // instead (e.g. en9 = USB Ethernet); this is what "is the cable plugged in"
  // and real throughput should be measured on.
  const routes = await run("/usr/sbin/netstat", ["-rn", "-f", "inet"]);
  const enDefault = routes
    .split("\n")
    .filter((l) => /^default\b/.test(l))
    .map((l) => l.trim().split(/\s+/).pop() ?? "")
    .find((ifc) => /^en\d+$/.test(ifc));
  if (enDefault) return enDefault;

  // Uplink down / no physical default route: fall back to the first active en*
  // that still has an IPv4, so we can at least report link state.
  const list = (await run("/sbin/ifconfig", ["-l"])).trim().split(/\s+/);
  for (const ifc of list.filter((n) => /^en\d+$/.test(n))) {
    const info = await run("/sbin/ifconfig", [ifc]);
    if (/status:\s+active/i.test(info) && /\binet\s/.test(info)) return ifc;
  }
  return null;
}

async function readNet(): Promise<NetInfo> {
  const iface = await physicalIface();
  if (!iface) return { iface: null, linkUp: false, rxMbps: null, txMbps: null };

  const [ifcfg, netstat] = await Promise.all([
    run("/sbin/ifconfig", [iface]),
    run("/usr/sbin/netstat", ["-ibn", "-I", iface]),
  ]);
  const linkUp = /status:\s+active/i.test(ifcfg);

  // Use the "<Link#N>" row so we read the interface's own byte counters once.
  const linkRow = netstat.split("\n").find((l) => /<Link#\d+>/.test(l));
  let rxMbps: number | null = null;
  let txMbps: number | null = null;
  if (linkRow) {
    const cols = linkRow.trim().split(/\s+/);
    // Columns: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes ...
    const rx = Number(cols[6]);
    const tx = Number(cols[9]);
    const now = Date.now();
    if (Number.isFinite(rx) && Number.isFinite(tx)) {
      if (lastNet && lastNet.iface === iface) {
        const dt = (now - lastNet.ts) / 1000;
        if (dt > 0.2) {
          rxMbps = Math.max(0, ((rx - lastNet.rx) * 8) / dt / 1e6);
          txMbps = Math.max(0, ((tx - lastNet.tx) * 8) / dt / 1e6);
          rxMbps = Math.round(rxMbps * 100) / 100;
          txMbps = Math.round(txMbps * 100) / 100;
        }
      }
      lastNet = { iface, rx, tx, ts: now };
    }
  }
  return { iface, linkUp, rxMbps, txMbps };
}

const OSX_CPU_TEMP_BIN = process.env.OSX_CPU_TEMP_BIN ?? "/usr/local/bin/osx-cpu-temp";
const NONE_TEMP: TempInfo = { cpuC: null, gpuC: null, fanRpm: null, source: "none", available: false };

const numOr = (m: RegExpMatchArray | null): number | null =>
  m ? Math.round(Number(m[1])) : null;

// powermetrics is the most accurate (CPU die + GPU die + fan) but needs root.
// Enable with a passwordless sudoers rule for powermetrics + MONITOR_POWERMETRICS=1.
async function readTempPowermetrics(): Promise<TempInfo | null> {
  const out = await run(
    "/usr/bin/sudo",
    ["-n", "/usr/bin/powermetrics", "--samplers", "smc", "-n1", "-i1"],
    3000
  );
  if (!out) return null;
  const cpuC = numOr(out.match(/CPU die temperature:\s+([\d.]+)/i));
  const gpuC = numOr(out.match(/GPU die temperature:\s+([\d.]+)/i));
  const fanRpm = numOr(out.match(/Fan:\s+([\d.]+)\s*rpm/i));
  if (cpuC == null && gpuC == null && fanRpm == null) return null;
  return { cpuC, gpuC, fanRpm, source: "powermetrics", available: true };
}

// osx-cpu-temp reads the SMC without root. We only read CPU + GPU here — its
// `-f` fan output is unreliable on this hardware (flickers 0/2 rpm), so fan rpm
// is left to powermetrics.
async function readTempOsxCpuTemp(): Promise<TempInfo | null> {
  const [cpuOut, gpuOut] = await Promise.all([
    run(OSX_CPU_TEMP_BIN, [], 2000),
    run(OSX_CPU_TEMP_BIN, ["-g"], 2000),
  ]);
  const cpuC = numOr(cpuOut.match(/([\d.]+)\s*°?\s*C/i));
  let gpuC = numOr(gpuOut.match(/([\d.]+)\s*°?\s*C/i));
  if (gpuC === 0) gpuC = null; // unsupported sensor prints 0.0
  if (cpuC == null && gpuC == null) return null;
  return { cpuC, gpuC, fanRpm: null, source: "osx-cpu-temp", available: true };
}

async function readTemp(): Promise<TempInfo> {
  if (process.env.MONITOR_POWERMETRICS === "1") {
    const pm = await readTempPowermetrics();
    if (pm) return pm;
  }
  const osx = await readTempOsxCpuTemp();
  return osx ?? NONE_TEMP;
}

export async function snapshot(): Promise<MonitorSnapshot> {
  const [cpu, mem, battery, net, temp] = await Promise.all([
    readCpu(),
    readMem(),
    readBattery(),
    readNet(),
    readTemp(),
  ]);
  return { ts: Date.now(), cpu, mem, battery, net, temp };
}
