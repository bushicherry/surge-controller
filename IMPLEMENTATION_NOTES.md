# Implementation Notes

Running log of decisions, fixes, and pending work. Edge cases deferred on
purpose — revisit after the main tasks are stable.

---

## Deployment topology (current)

- **Surge Mac** (Intel, macOS Monterey, user `jeffreychen`) runs Surge 5.10.5
  AND `surge-controller` 24x7 via a launchd LaunchAgent, lid closed, at
  `192.168.1.1:3000`.
- **Dev Mac** (this machine) is on the same LAN. Goal: do *all* dev/debug/deploy
  remotely, never touching the Surge Mac physically.
- Surge HTTP API reachable on LAN at `192.168.1.1:6171` (key `surgepasswd`).

---

## Execution checklist (work top-down)

Code changes so far live only on the dev Mac until a `deploy`.

- [x] **Remote-ops wrapper** — `scripts/remote.sh` (deploy/logs/restart/status/power/temp).
- [x] **Q2** subscription-URL preview/update fix (code).
- [x] **Q3** select 400 guard + success/failure audit logging (code).
- [x] **Q4** monitor backend + Dashboard card (code); temp dual-source.
- [x] **SSH key auth**: `id_ed25519` installed via `ssh-copy-id`; passwordless confirmed.
- [x] **Deploy to the box**: `scripts/remote.sh deploy` works end-to-end (pull/install/build/kickstart).
- [x] **Verify monitor**: after fixing iface detection → `en9` (USB Ethernet),
      `linkUp: true`, rx/tx ~1.3 Mbps populate on 2nd poll. CPU/mem/battery OK.
- [x] **Temp decision**: keep `osx-cpu-temp` (no sudo) — it returns **CPU 35° AND
      GPU 39°** on this box. Fan is N/A without powermetrics; enable powermetrics
      later only if fan rpm is needed (`MONITOR_POWERMETRICS=1` + sudoers).
- [x] **Lid-closed keep-awake EXPLAINED**: `pmset -g` shows `sleep 0 (sleep
      prevented by nfsd)` and an active assertion `pid 312(nfsd)
      PreventUserIdleSystemSleep "com.apple.nfsd"`. NFS file sharing holds a
      no-idle-sleep assertion; on AC this also keeps it awake lid-closed (same
      mechanism as `caffeinate -s`). That's why it's run headless for years with
      **`SleepDisabled` NOT set**. FRAGILE: if NFS sharing is ever turned off or
      the machine runs off AC, it will sleep. To make it robust & independent of
      nfsd: `sudo pmset -a disablesleep 1` (optional hardening, not required today).
- [x] **Battery observation EXPLAINED**: user keeps the box on AC continuously,
      so AlDente never gets a discharge cycle to drop below its 70% cap → sits at
      ~84%. Expected. To verify the cap: unplug, let it drain <70%, replug — it
      should then hold at 70%. Dashboard already warns on >80% charging on AC.
- [ ] **Reproduce select flow** on the box; if a 400 remains, read the exact
      `{group, policy, error}` via `scripts/remote.sh audit`.
- [ ] **Run subscription update** end-to-end so the tool's tier groups actually
      exist in the live profile (unblocks the tier-flip path).
- [~] **Harden plist** (blind spots): the plist is now a gitignored per-machine
      file with a committed `*.plist.example` template (fixes the deploy blocker
      where the box's `jeffreychen`-path edits made `git pull --ff-only` fail).
      Template bakes in `ThrottleInterval` (10s) + absolute `DB_PATH`. Real
      `NEXTAUTH_SECRET` + `APP_ENC_KEY` still PENDING user action — put them in
      `.env.local` on the box (Next.js loads it), not in git. To apply the
      hardening on the box: copy the template → real plist with box paths, `cp`
      to `~/Library/LaunchAgents/`, `launchctl unload/load -w`.
- [x] **Deploy blocker found & fixed**: box was stuck at `fe46e8a` (one behind
      `origin/main`) because its tracked plist was locally edited (per-machine
      paths) → `git pull --ff-only` refused. Now that the plist is gitignored,
      pulls are clean. Also confirmed: the box IS serving the round-2 build
      (structured logs present, buildId current); the stale 2-col UI / Tier2
      ordering the user saw was **cached old client JS** — a hard reload fixes it.

### Round 2 (Jul 11) — 10-item feedback, all deployed & verified
- **#9 keystone**: Surge was running `Airport0708`, app writes `Airport.conf`.
  `reload` only reloads the *active* profile → updates never applied. Fix:
  update route now `switchProfile(basename)` + reload. Verified: profile→Airport.
- **#3 select 400**: `auto`=url-test, `fallback`=fallback → reject `/select`.
  Policy-groups API now returns `groupTypes`; Dashboard makes non-select groups
  read-only. Also the sanitizer now adds tier groups as **members of Proxy**
  (they weren't) so region quick-switch works. Verified: select Proxy→Tier2-HK 200.
- **#7 tiering**: flag-first classify; "CN2"/"CMIN2" no longer drags 🇭🇰 into
  tier1. Verified: Tier2-HK=[HK CN2, HK 9929].
- **#5 fan flicker**: dropped `osx-cpu-temp -f` (garbage rpm). Fan=powermetrics only.
- **#4 logging**: `src/lib/log.ts` structured multi-line + levels; audit carries level.
- **#8 form**: keep URL after preview/update, show which URL is used + switch result.
- **#2 net**: relabeled to single throughput line (soft-router up≈down).
- **#10**: auto-best shows 测速中… immediately.
- **#6**: SystemMonitor sparkline charts (CPU/mem/net/temp), 60-sample rolling.
- **#1 answer**: monitor polls every 4s, SWR pauses when tab hidden; each poll
  spawns ~8 short CLI procs (sysctl/vm_stat/pmset/netstat/ifconfig/osx-cpu-temp).
  Impact minimal (<1% avg). powermetrics intentionally NOT used (heavy + sudo).

### Network detection note
`route -n get default` returns Surge's `utun*` tunnel (Surge is the system VPN).
`physicalIface()` instead parses `netstat -rn -f inet` and picks the `en*`
default route (en9 here, gw 192.168.100.1). Wi-Fi `en0` is inactive on this box.

---

## Q1 — Fully remote dev / deploy workflow (DONE: `scripts/remote.sh`)

Remote Login (SSH) is enabled on the Surge Mac. All ops go through the wrapper
`scripts/remote.sh` (config via env `REMOTE_USER`/`REMOTE_HOST`/`REMOTE_DIR`,
defaults `jeffreychen` / `192.168.1.1` / `/Users/jeffreychen/workspaces/surge-controller`).

```bash
scripts/remote.sh deploy      # git pull --ff-only + yarn install + build + kickstart
scripts/remote.sh restart     # kickstart the launchd agent
scripts/remote.sh status      # launchd state + HTTP health
scripts/remote.sh logs [N]    # tail stdout/stderr
scripts/remote.sh tailf       # follow logs
scripts/remote.sh power       # sleep / clamshell keep-awake settings (see Q3-lid)
scripts/remote.sh temp        # CPU/GPU/fan on the box
scripts/remote.sh audit [N]   # recent audit rows via the API
scripts/remote.sh exec '<cmd>'
scripts/remote.sh ssh         # interactive shell
```

REMOTE repo path (git-synced): `/Users/jeffreychen/workspaces/surge-controller`.
Audit trail is also exposed over LAN at `/api/audit` (now includes select
failures — see Q3).

### 24x7 lid-closed caveat (user says already configured — VERIFY)
macOS sleeps on lid close unless on AC power AND kept awake. Verify with:
```bash
scripts/remote.sh power
```
Look for `SleepDisabled  1` (set by `sudo pmset -a disablesleep 1`) and/or system
`sleep 0`, or an active `caffeinate` no-sleep assertion. If none, the whole stack
sleeps when the lid closes.

---

## Q2 — FIXED: "subscription_url not configured" on Preview

**Cause**: `预览`/`立即更新` only read the *saved* `subscription_url_enc` from the
DB. The typed value in the form is only persisted by the separate `保存设置`
button, so "type URL → Preview" sent no URL.

**Fix**:
- `SubscriptionForm.update()` now sends `{ subscription_url }` in the POST body
  when the field is non-empty; clears + refreshes after a real update.
- `api/subscription/preview` uses the body URL if present, else the saved one
  (validates `http(s)`); does NOT persist (dry run).
- `api/subscription/update` persists the typed URL (encrypted) before proceeding.

Note: `update` still needs `profile_path` configured (via Save or env
`SURGE_PROFILE_PATH`). Deferred: let update accept path/httpApi inline too.

---

## Q3 — FIXED: select 400 + coarse logging

**Symptoms**: manual node select / "选最优" → `Surge API /v1/policy_groups/select
400: {"error":"invalid parameters"}`; only the *first* select ever logged; no
error ever logged.

**Cause A (logging)**: `audit()` ran only *after* a successful `selectPolicy`,
and `withAuth` swallowed errors into a 500 without auditing or `console.error`.
So failures were invisible in both `/api/audit` and `stderr.log`.

**Cause B (the 400)**: Dashboard flips the master `Proxy` group to a tier group
(`select("Proxy", tierGroupName)`) after selecting a leaf. If the running Surge
profile doesn't actually contain our injected tier groups (e.g. because the
subscription was never pushed through this tool — see Q2), that tier group is
not a member of `Proxy`, so Surge rejects it as `invalid parameters`.

**Fix**:
- `api/surge/select` + `api/surge/auto-best`: wrap `selectPolicy` in try/catch,
  `audit()` BOTH success and failure with `{group, policy, ok, error}`, and
  `console.error` on failure (→ shows in `stderr.log`). Return `502` with detail.
- `Dashboard.canFlipProxyTo(group)`: only flip `Proxy` when the tier group is a
  real member of `groups["Proxy"]` and not already selected. Prevents the
  invalid-parameters call entirely.

**Verify after deploy**: reproduce the select, then check `/api/audit` — the
exact failing `{group, policy, error}` is now recorded. If a 400 still appears,
the audit entry tells us the precise group/policy Surge rejected.

Deferred (edge cases):
- Client-side: disable node buttons for non-`select` groups (url-test/fallback
  reject manual selection). Need `typeDescription` mapping.
- Confirm real profile group structure once a sanitized profile is pushed.

---

## Q4 — Surge Mac monitoring (IMPLEMENTED, temp gated)

Target machine facts: **MacBook Pro 15" 2016 (A1707)**, Intel, AMD Radeon Pro,
macOS Monterey. **Homebrew is broken → do NOT rely on brew.** Battery is already
capped at 70% by **AlDente**, so the dashboard only needs to *display* battery.

Built:
- `src/lib/monitor.ts` — non-root probes via `execFile` (no shell): CPU load
  (`sysctl vm.loadavg`/`hw.ncpu`), memory (`sysctl hw.memsize/hw.pagesize` +
  `vm_stat`, reads page size dynamically so Intel 4K pages work), battery
  (`pmset -g batt`), network (default iface via `route`, link via `ifconfig`,
  throughput by diffing `netstat -ibn` byte counters between polls).
- `src/app/api/monitor/route.ts` — `GET /api/monitor` (auth'd, dynamic, nodejs).
- `src/components/SystemMonitor.tsx` — card on the Dashboard, polls every 4s.
  Column parsing verified against live macOS output (Ibytes=col6, Obytes=col9).

Temperature: **dual-source, `osx-cpu-temp` is the default** (installed OK on the
box; no sudo). Verified readings:
- `osx-cpu-temp` → CPU 33.8°C (reads an SMC proximity sensor; runs as the agent).
- `powermetrics` → CPU die 41.73°C, GPU die 35.00°C, Fan 1999 rpm (more accurate
  + GPU + fan, but needs root).

`readTemp()` logic:
1. If `MONITOR_POWERMETRICS=1` → try `sudo -n powermetrics --samplers smc`
   (CPU+GPU+fan). Needs a passwordless sudoers rule for powermetrics.
2. Else → `osx-cpu-temp` (CPU always; `-g` GPU and `-f` fan best-effort, 0 → N/A).
   Binary path overridable via `OSX_CPU_TEMP_BIN` (default `/usr/local/bin/osx-cpu-temp`).

So GPU temp + fan need powermetrics enabled; CPU works out of the box today.

Original constraint table (why the above bounds exist):

| Metric | Command (no root) | Feasible? |
|---|---|---|
| CPU load / per-core | `top -l1` / `sysctl -n vm.loadavg` / `host_processor_info` | Yes |
| Memory | `vm_stat`, `sysctl hw.memsize` | Yes |
| Battery % + charging + AC | `pmset -g batt`, `pmset -g ps` | Yes |
| Network up/down Mbps | sample `netstat -ib` twice, diff bytes / interval | Yes |
| Link up (cable) | `ifconfig en0` status: active / `networksetup -getmedia` | Yes |
| **CPU/GPU temperature** | `powermetrics` (**needs sudo**) or SMC via helper (`osx-cpu-temp`, `istats`) | **No, without extra tooling** |
| **Cap charge at ~70%** | SMC write (AlDente / bclm) — **needs root helper** | **No, monitor only** |

Design:
- New route `GET /api/monitor` runs the above via `child_process.execFile`
  (fixed args, no shell interpolation), returns a JSON snapshot. Cache ~2s.
- Sampling for Mbps: keep last `netstat -ib` reading in module memory, diff.
- New UI panel (e.g. `/status` or a Dashboard card) polling every ~3-5s.
- Thresholds: CPU > 85% sustained, mem pressure, battery == 100% (warn "unplug
  or enable charge limit"), link down, throughput anomalies.

Open decisions (need user):
1. **Temperature**: install a small helper (`brew install osx-cpu-temp` / iStats)
   OR grant the agent sudo for `powermetrics` OR skip temps? Recommend
   `osx-cpu-temp` (CPU only; GPU temp on Intel is unreliable without powermetrics).
2. **Battery 70% cap**: the app can only *monitor/alert*, not *enforce*, without
   a root SMC helper (AlDente-style). Recommend: alert-only, or install AlDente
   separately and just monitor.

---

## Q5 — Blind-spot scan (unknown unknowns)

Ranked by likely impact:

1. **Secrets use insecure defaults if env not set.** `env.ts` falls back
   `NEXTAUTH_SECRET="dev-insecure-secret"`, `APP_ENC_KEY="dev-insecure-key..."`.
   If the launchd plist doesn't export real values, the subscription URL is
   "encrypted" with a known key (i.e. not secret) and sessions are forgeable.
   ACTION: ensure both are set in the plist env (32+ bytes, random).
2. **Rotating `APP_ENC_KEY` bricks stored secrets.** `decrypt()` throws on
   existing `subscription_url_enc` → preview/update 500 with a crypto error.
   ACTION: document that changing the key requires re-entering the subscription.
3. **LAN auth bypass is Host-header based.** `LAN_TRUSTED_HOSTS` skips auth for
   matching Host headers; Host is client-settable. Any LAN device (or a request
   with a spoofed Host) can fully control Surge (rewrite profile, change mode).
   Home-LAN-only, no HTTPS. ACTION: accept for home use, but document the trust
   boundary; consider binding to the LAN IP only, not 0.0.0.0, if untrusted
   devices share the network.
4. **Lid-closed sleep** kills Surge + controller (see Q1 caveat).
5. **Node/native-module fragility.** `better-sqlite3` is a native addon tied to
   the Node ABI. Target runs Node 24 (prebuilt binaries may be absent → source
   build needs Xcode CLT). A future `brew upgrade node` silently breaks the app
   (NODE_MODULE_VERSION mismatch) with no auto-rebuild. ACTION: pin Node
   (nvm/volta) or add a postinstall rebuild; prefer Node 20 LTS.
6. **launchd crash-loop.** `KeepAlive=true` with no `ThrottleInterval` respawns
   fast on a boot-time failure (already observed with the cwd EPERM). ACTION:
   add `ThrottleInterval` (e.g. 10s) to the plist.
7. **Relative `DB_PATH`/`data/` depends on WorkingDirectory.** Broke once via
   TCC/cwd. ACTION: prefer an absolute `DB_PATH` outside TCC-protected folders.
8. **PWA stale cache after deploy.** Service worker may serve old JS/routes
   post-deploy. ACTION: verify SW cache-busting / versioning.
9. **Latency test cost.** `testGroupDelay` tests every leaf; large subscriptions
   → slow (30s timeout) and hammers endpoints. ACTION: cap / parallelize / cache.
10. **Surge 6 API drift.** Endpoints validated on 5.10.5; the planned Surge 6
    upgrade may change response shapes (`/v1/policies/test`, select). ACTION:
    re-run smoke test against Surge 6 before/after upgrade.

---

## Pending / deferred (come back to these)

- [ ] Q4 monitoring implementation (after temp/battery decisions).
- [ ] `scripts/deploy-remote.sh` + `/deploy` workflow.
- [ ] plist: set real `NEXTAUTH_SECRET` + `APP_ENC_KEY`, add `ThrottleInterval`,
      absolute `DB_PATH`.
- [ ] Lid-closed keep-awake (`pmset`/`caffeinate`) verified.
- [ ] Disable manual select in non-`select` groups (client-side).
- [ ] Pin Node runtime (avoid better-sqlite3 ABI breakage).
</CodeContent>
<parameter name="EmptyFile">false
