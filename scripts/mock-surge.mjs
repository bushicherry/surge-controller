#!/usr/bin/env node
/**
 * Minimal Surge HTTP-API stub, dependency-free.
 * Impersonates just enough endpoints for surge-controller's UI to render and
 * for smoke tests to pass end-to-end.
 *
 * Env:
 *   PORT       (default 6171)
 *   API_KEY    (default "surgepasswd") — matched against X-Key header
 *
 * Endpoints:
 *   GET  /v1/policy_groups
 *   GET  /v1/policy_groups/select?group_name=
 *   POST /v1/policy_groups/select   {group_name, policy}
 *   POST /v1/policy_groups/test     {group_name}
 *   POST /v1/policies/test          {policy_names, url}
 *   GET  /v1/outbound
 *   POST /v1/outbound               {mode}
 *   POST /v1/profiles/reload
 *   GET  /v1/rules
 */

import http from "node:http";

const PORT = Number(process.env.PORT ?? 6171);
const KEY  = process.env.API_KEY ?? "surgepasswd";

// --- Fake state ----------------------------------------------------------
const POLICIES_BY_GROUP = {
  Proxy: [
    "🌏 Tier1-JP/SG/CN",
    "🇭🇰 Tier2-HK",
    "🌍 Tier3-EU/US",
    "🇯🇵 Tokyo CN2 20260612",
    "🇸🇬 Singapore Premium",
    "🇨🇳 Shanghai",
    "🇭🇰 HongKong 1",
    "🇭🇰 HongKong 2",
    "🇺🇸 LA Netflix",
    "🇬🇧 London",
    "DIRECT",
  ],
  "🌏 Tier1-JP/SG/CN": ["🇯🇵 Tokyo CN2 20260612", "🇸🇬 Singapore Premium", "🇨🇳 Shanghai"],
  "🇭🇰 Tier2-HK":     ["🇭🇰 HongKong 1", "🇭🇰 HongKong 2"],
  "🌍 Tier3-EU/US":   ["🇺🇸 LA Netflix", "🇬🇧 London"],
  Netflix: ["🇺🇸 LA Netflix", "🇭🇰 HongKong 1"],
};

const state = {
  selected: {
    Proxy:            "🌏 Tier1-JP/SG/CN",
    "🌏 Tier1-JP/SG/CN": "🇯🇵 Tokyo CN2 20260612",
    "🇭🇰 Tier2-HK":     "🇭🇰 HongKong 1",
    "🌍 Tier3-EU/US":   "🇺🇸 LA Netflix",
    Netflix:          "🇺🇸 LA Netflix",
  },
  outbound: "rule",
  reloadCount: 0,
  rules: [
    "DOMAIN-SUFFIX,apple.com,DIRECT",
    "DOMAIN-SUFFIX,icloud.com,DIRECT",
    "DOMAIN-SUFFIX,bilibili.com,DIRECT",
    "DOMAIN-KEYWORD,taobao,DIRECT",
    "GEOIP,CN,DIRECT",
    "DOMAIN-SUFFIX,google.com,Proxy",
    "DOMAIN-SUFFIX,youtube.com,Proxy",
    "DOMAIN-SUFFIX,github.com,Proxy",
    "DOMAIN-SUFFIX,doubleclick.net,REJECT",
    "FINAL,Proxy",
  ],
};

function toEntries(policies) {
  return policies.map((name, i) => ({
    isGroup: 0,
    name,
    typeDescription: name === "DIRECT" ? "direct" : "shadowsocks",
    lineHash: `hash-${i}`,
    enabled: 1,
  }));
}

// --- HTTP wire glue ------------------------------------------------------
function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(s),
  });
  res.end(s);
}

function readJson(req) {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => {
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.headers["x-key"] !== KEY) return json(res, 401, { error: "bad X-Key" });

  const url = new URL(req.url, "http://x");
  const key = `${req.method} ${url.pathname}`;

  try {
    switch (key) {
      case "GET /v1/policy_groups":
        return json(res, 200, Object.fromEntries(
          Object.entries(POLICIES_BY_GROUP).map(([g, ps]) => [g, toEntries(ps)])
        ));

      case "GET /v1/policy_groups/select": {
        const group = url.searchParams.get("group_name") ?? "";
        return json(res, 200, { policy: state.selected[group] ?? "" });
      }

      case "POST /v1/policy_groups/select": {
        const b = await readJson(req);
        if (!b.group_name || !b.policy) return json(res, 400, { error: "missing fields" });
        state.selected[b.group_name] = b.policy;
        return json(res, 200, {});
      }

      case "POST /v1/policy_groups/test": {
        const b = await readJson(req);
        const list = POLICIES_BY_GROUP[b.group_name] ?? [];
        return json(res, 200, { available: list.filter((p) => p !== "DIRECT") });
      }

      case "POST /v1/policies/test": {
        const b = await readJson(req);
        const names = Array.isArray(b.policy_names) ? b.policy_names : [];
        // Shape mirrors real Surge: { name: { tcp, receive, available, round-one-total } }
        const out = {};
        for (const p of names) {
          let receive;
          if (p === "DIRECT") receive = 5;
          else if (p.startsWith("🇯🇵") || p.startsWith("🇸🇬") || p.startsWith("🇨🇳")) receive = 40 + Math.floor(Math.random() * 30);
          else if (p.startsWith("🇭🇰")) receive = 60 + Math.floor(Math.random() * 40);
          else receive = 180 + Math.floor(Math.random() * 120);
          out[p] = { tcp: Math.floor(receive / 4), receive, available: 1, "round-one-total": receive + 20 };
        }
        return json(res, 200, out);
      }

      case "GET /v1/outbound":
        return json(res, 200, { mode: state.outbound });

      case "POST /v1/outbound": {
        const b = await readJson(req);
        if (!["direct", "rule", "proxy", "global"].includes(b.mode))
          return json(res, 400, { error: "bad mode" });
        // Normalise Surge Mac's spelling: `proxy` is an alias for `global`.
        if (b.mode === "proxy") b.mode = "global";
        state.outbound = b.mode;
        return json(res, 200, {});
      }

      case "POST /v1/profiles/reload":
        state.reloadCount += 1;
        return json(res, 200, {});

      case "GET /v1/rules":
        return json(res, 200, { rules: state.rules });

      case "GET /v1/traffic":
      case "GET /v1/events":
      case "GET /v1/features/system_proxy":
        return json(res, 200, {});

      default:
        return json(res, 404, { error: `mock: no handler for ${key}` });
    }
  } catch (e) {
    return json(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock-surge] listening on 0.0.0.0:${PORT} (X-Key=${KEY})`);
});
