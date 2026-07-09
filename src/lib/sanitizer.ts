import { TIER_GROUPS, classify, getOverrides, type Tier } from "./tier";

// Surge 5 supported proxy types (whitelist). Anything else is dropped.
// Ref: https://manual.nssurge.com/policy/proxy.html
// Intentionally NOT included (require Surge 6.x, unusable on Surge 5.10.5):
//   anytls (Mac 6.4.3+), trust-tunnel (6.4.4+), h2-connect (6.6.0+).
// vless is intentionally absent too: Surge does not support VLESS at all.
const ALLOWED_TYPES = new Set([
  "http", "https", "socks5", "socks5-tls", "ssh",
  "ss", "shadowsocks",
  "trojan", "vmess",
  "snell", "tuic", "hysteria2",
  "wireguard", "direct", "reject", "reject-tinygif",
  "external",
]);

export type UserDirectRule = {
  // One of the common Surge rule prefixes. Enum keeps the DB payload tiny
  // and lets the UI pre-validate before it hits the backend.
  type: "DOMAIN" | "DOMAIN-SUFFIX" | "DOMAIN-KEYWORD" | "IP-CIDR" | "IP-CIDR6";
  value: string;
};

export const USER_DIRECT_BEGIN = "# --- user-direct-begin (managed by surge-controller) ---";
export const USER_DIRECT_END   = "# --- user-direct-end ---";

export function userRuleLine(r: UserDirectRule): string {
  // IP-CIDR needs no-resolve so it doesn't DNS-thrash; DOMAIN-* do not.
  const opt = r.type === "IP-CIDR" || r.type === "IP-CIDR6" ? ",no-resolve" : "";
  return `${r.type},${r.value},DIRECT${opt}`;
}

export type SanitizeReport = {
  removedProxies: string[];
  // Dropped proxies grouped by their (unsupported) type, e.g.
  //   { anytls: ["JP-01", "SG-02"], vless: ["HK-03"] }
  // Lets the UI show how many nodes are waiting on a Surge 6 upgrade.
  removedByType: Record<string, string[]>;
  affectedGroups: string[];
  tier1: string[];
  tier2: string[];
  tier3: string[];
  injectedHttpApi: boolean;
  tierGroupsAdded: string[];
  userDirectRules: number;
};

type Section = {
  name: string;          // e.g. "General", "Proxy", "Proxy Group"
  lines: string[];       // raw lines (without the [Section] header)
};

function parseSections(input: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { name: "__preamble", lines: [] };
  for (const raw of input.split(/\r?\n/)) {
    const m = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) {
      sections.push(current);
      current = { name: m[1].trim(), lines: [] };
    } else {
      current.lines.push(raw);
    }
  }
  sections.push(current);
  return sections;
}

function serialize(sections: Section[]): string {
  const out: string[] = [];
  for (const s of sections) {
    if (s.name !== "__preamble") out.push(`[${s.name}]`);
    for (const l of s.lines) out.push(l);
  }
  return out.join("\n");
}

function isCommentOrEmpty(line: string) {
  const t = line.trim();
  return t === "" || t.startsWith("#") || t.startsWith(";") || t.startsWith("//");
}

/** Parse a proxy line: "name = type, host, port, ..."  → { name, type } */
function parseProxyLine(line: string): { name: string; type: string } | null {
  if (isCommentOrEmpty(line)) return null;
  const eq = line.indexOf("=");
  if (eq < 0) return null;
  const name = line.slice(0, eq).trim();
  const rhs = line.slice(eq + 1).trim();
  const type = rhs.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!name || !type) return null;
  return { name, type };
}

/** Parse a proxy-group line: "name = type, member1, member2, ..." */
function parseGroupLine(line: string):
  | { name: string; type: string; members: string[]; trailing: string[]; raw: string }
  | null {
  if (isCommentOrEmpty(line)) return null;
  const eq = line.indexOf("=");
  if (eq < 0) return null;
  const name = line.slice(0, eq).trim();
  const parts = line.slice(eq + 1).split(",").map(s => s.trim());
  const type = (parts.shift() ?? "").toLowerCase();
  if (!name || !type) return null;
  // Members are non-key=value parts; key=value (e.g. url=..., interval=...) keep as trailing.
  const members: string[] = [];
  const trailing: string[] = [];
  for (const p of parts) {
    if (/^[a-zA-Z][a-zA-Z0-9-]*\s*=/.test(p)) trailing.push(p);
    else if (p) members.push(p);
  }
  return { name, type, members, trailing, raw: line };
}

function rebuildGroupLine(g: {
  name: string; type: string; members: string[]; trailing: string[];
}): string {
  const parts = [g.type, ...g.members, ...g.trailing].filter(Boolean);
  return `${g.name} = ${parts.join(", ")}`;
}

export interface SanitizeOptions {
  httpApiValue: string; // e.g. "surgepasswd@0.0.0.0:6171"
  userDirectRules?: UserDirectRule[];
}

/** Strip any previously-injected user-direct block from a [Rule] section. */
function stripUserDirectBlock(lines: string[]): string[] {
  const out: string[] = [];
  let skipping = false;
  for (const l of lines) {
    const t = l.trim();
    if (t === USER_DIRECT_BEGIN) { skipping = true; continue; }
    if (t === USER_DIRECT_END)   { skipping = false; continue; }
    if (skipping) continue;
    out.push(l);
  }
  return out;
}

export function sanitize(input: string, opts: SanitizeOptions): {
  output: string;
  report: SanitizeReport;
} {
  const sections = parseSections(input);
  const report: SanitizeReport = {
    removedProxies: [],
    removedByType: {},
    affectedGroups: [],
    tier1: [],
    tier2: [],
    tier3: [],
    injectedHttpApi: false,
    tierGroupsAdded: [],
    userDirectRules: 0,
  };

  // 1) Filter [Proxy]
  const proxySec = sections.find(s => s.name === "Proxy");
  const keptProxyNames = new Set<string>();
  if (proxySec) {
    const next: string[] = [];
    for (const line of proxySec.lines) {
      const parsed = parseProxyLine(line);
      if (!parsed) { next.push(line); continue; }
      if (!ALLOWED_TYPES.has(parsed.type)) {
        report.removedProxies.push(parsed.name);
        (report.removedByType[parsed.type] ??= []).push(parsed.name);
        continue;
      }
      keptProxyNames.add(parsed.name);
      next.push(line);
    }
    proxySec.lines = next;
  }

  // 2) Clean [Proxy Group] references; drop tier groups we manage (will re-add)
  const groupSec = sections.find(s => s.name === "Proxy Group");
  const managedNames = new Set<string>(Object.values(TIER_GROUPS));
  if (groupSec) {
    const next: string[] = [];
    for (const line of groupSec.lines) {
      const g = parseGroupLine(line);
      if (!g) { next.push(line); continue; }
      if (managedNames.has(g.name)) continue; // drop, re-added below
      const before = g.members.length;
      g.members = g.members.filter(m =>
        // keep built-in policies & subgroup references; drop removed proxies
        ["DIRECT", "REJECT", "REJECT-TINYGIF"].includes(m.toUpperCase()) ||
        keptProxyNames.has(m) ||
        // group-to-group reference: keep (sanitizer can't tell here, will be validated by Surge)
        true
      );
      // Now strictly remove members that match a removedProxy name
      g.members = g.members.filter(m => !report.removedProxies.includes(m));
      if (g.members.length === 0) {
        g.members.push("DIRECT");
        report.affectedGroups.push(g.name);
      } else if (g.members.length !== before) {
        report.affectedGroups.push(g.name);
      }
      next.push(rebuildGroupLine(g));
    }
    groupSec.lines = next;
  }

  // 3) Append tier subgroups
  const overrides = getOverrides();
  const buckets: Record<Exclude<Tier, 0>, string[]> = { 1: [], 2: [], 3: [] };
  for (const name of keptProxyNames) {
    const t = classify(name, overrides);
    if (t === 1 || t === 2 || t === 3) buckets[t].push(name);
  }
  report.tier1 = buckets[1];
  report.tier2 = buckets[2];
  report.tier3 = buckets[3];

  const tierLines: string[] = [];
  const addTier = (groupName: string, members: string[]) => {
    if (members.length === 0) members = ["DIRECT"];
    tierLines.push(`${groupName} = select, ${members.join(", ")}`);
    report.tierGroupsAdded.push(groupName);
  };
  addTier(TIER_GROUPS.tier1, buckets[1]);
  addTier(TIER_GROUPS.tier2, buckets[2]);
  addTier(TIER_GROUPS.tier3, buckets[3]);

  if (!sections.find(s => s.name === "Proxy Group")) {
    sections.push({ name: "Proxy Group", lines: [] });
  }
  const gs = sections.find(s => s.name === "Proxy Group")!;
  gs.lines.push("", "# --- managed by surge-controller ---", ...tierLines);

  // 4) Inject [General] http-api
  if (!sections.find(s => s.name === "General")) {
    sections.unshift({ name: "General", lines: [] });
  }
  const general = sections.find(s => s.name === "General")!;
  const target = `http-api = ${opts.httpApiValue}`;
  let replaced = false;
  general.lines = general.lines.map(l => {
    if (/^\s*http-api\s*=/.test(l)) { replaced = true; return target; }
    return l;
  });
  if (!replaced) general.lines.push(target);
  report.injectedHttpApi = true;

  // 5) Inject user-managed DIRECT rules at the top of [Rule] so they win
  //    against anything the subscription defines. We wrap them in sentinels
  //    so we can strip & re-inject cleanly on every sanitize() pass.
  const userRules = opts.userDirectRules ?? [];
  if (!sections.find(s => s.name === "Rule")) {
    sections.push({ name: "Rule", lines: [] });
  }
  const ruleSec = sections.find(s => s.name === "Rule")!;
  ruleSec.lines = stripUserDirectBlock(ruleSec.lines);
  if (userRules.length > 0) {
    const block = [
      USER_DIRECT_BEGIN,
      ...userRules.map(userRuleLine),
      USER_DIRECT_END,
      "",
    ];
    ruleSec.lines = [...block, ...ruleSec.lines];
    report.userDirectRules = userRules.length;
  }

  return { output: serialize(sections), report };
}
