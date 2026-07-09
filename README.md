# Surge Controller

跑在 Mac 上的 Surge Mac 远程控制台 + REST API。**局域网优先**：家里 Wi-Fi 下手机直接打开 `http://<mac-lan-ip>:3000` 就能用，免登录；iPhone Safari 里「加到主屏幕」就得到一个像 App 一样全屏的图标，不用申请开发者账号也不用装商店。

> 目前**只做局域网**。GitHub OAuth / Cloudflare Tunnel / API Token / iOS 快捷指令 的代码路径都保留，但等 LAN 场景稳定后再重启对外暴露。见文末《后续可选》。

---

## 一、它能做什么

| 功能 | 说明 |
|---|---|
| 区域快切 | Tier1 (🇯🇵🇸🇬��) / Tier2 (🇭🇰) / Tier3 (欧美) 一键切换，当前区域高亮 |
| 自动最优 | 实测延迟 → 加权评分 (Tier1 < Tier2 < Tier3) → 自动选最快节点 |
| 出站模式 | Direct / Rule / Global Proxy 一键切，当前模式高亮 |
| 订阅更新 | 拉取 → 剔除 `anytls` 等 Surge Mac 不兼容节点 → 注入 `http-api` → 原子写回 + 滚动备份 → reload |
| 场景预设 | "工作模式"=Direct，"看视频"=Tier3 Netflix 之类，一键应用一组动作 |
| 操作审计 | 所有写操作落 SQLite，可在 UI 查看 |
| 移动端友好 | 移动优先布局 + 底部导航；触摸目标 ≥ 44px；PWA 支持「加到主屏幕」 |

---

## 二、在开发机上打包 → 传到 Surge Mac 部署（推荐流程）

如果你的开发机（比如 M1 Mac）跟跑 Surge 的老 Mac 不是同一台，用这套流水线在本机做完所有 UI 验证再把镜像 scp 过去。

### A. 本机快速自检（不依赖 Docker）

先跑一遍 `dev-local.sh`：它启动一个内置的 mock Surge API + `next start` + LAN 免登录，端到端验证 UI 和 API 都通了再打包镜像。

```bash
yarn install                         # 首次
yarn build                           # 首次
./scripts/dev-local.sh               # 前台跑；Ctrl-C 停

# 另开一个终端
./scripts/smoke-test.sh              # 10 项 HTTP 检查全绿即通过
open http://localhost:3000           # 浏览器看 UI，切节点、测延迟都能触发 mock
```

`dev-local.sh` 起来后自动开好：

- `http://localhost:3000` → surge-controller，LAN 模式直接进 Dashboard
- `http://127.0.0.1:6171` → `@/Users/li.chen/Documents/workspaces/personal/surge-controller/scripts/mock-surge.mjs`，一个纯 Node 无依赖的 Surge HTTP API 模拟器（假节点、假延迟、假 `outbound` 状态机）

`@/Users/li.chen/Documents/workspaces/personal/surge-controller/scripts/smoke-test.sh` 覆盖：
UI 可达（`/login` `/`）、`policy-groups` / `outbound-mode` / `settings` / `audit` / `presets`、`test-latency`、以及一次幂等的 `outbound-mode` 写回。

#### A.1 用 iPhone 在同一 Wi-Fi 下测 UI

`dev-local.sh` 会自动做三件事：绑定 `0.0.0.0`、通过 `ipconfig getifaddr` 探测 Mac 的局域网 IP、把 `<lan-ip>:3000` 加进 `LAN_TRUSTED_HOSTS`。启动日志里会直接打印手机可用地址：

```bash
./scripts/dev-local.sh
# ==> Starting Next server on 0.0.0.0:3000 ...
#     UI (Mac):    http://localhost:3000   (LAN mode → no login)
#     UI (phone):  http://192.168.x.y:3000 (open on iPhone on the same Wi-Fi)
```

在 iPhone Safari 打开上面那个 `http://192.168.x.y:3000`，进 Dashboard 后：**分享 → 添加到主屏幕**，从主屏图标点开就是全屏 PWA（有 `manifest.webmanifest` 和 `apple-icon`），观感接近原生 App。

排错清单：

- 打不开？先确认手机 Wi-Fi 和 Mac 在同一子网；macOS「系统设置 → 网络 → 防火墙」里放行 node/next 或临时关掉防火墙。
- 探测到的 IP 错了（比如你走以太网 / VPN）？手动指定：`LAN_IP=192.168.1.50 ./scripts/dev-local.sh`。
- 手机进 `/login` 而不是 Dashboard？说明 Host header 不在白名单——检查启动日志里 `Trusted:` 那一行有没有你手机访问的那个地址。

### B. 打包 linux/amd64 镜像（旧 Mac 是 Intel）

本机是 arm64、目标是 x86_64，用 buildx + QEMU 一次搞定：

```bash
./scripts/build-image.sh             # docker buildx build --platform linux/amd64 --load
./scripts/export-image.sh            # docker save | gzip → ./dist/surge-controller.tar.gz
```

首次构建 3–6 分钟（QEMU 里跑 `yarn install` + `next build`），之后有 buildx cache 就秒级。

### C. 在容器里再验一遍（可选但推荐）

镜像做好后，用 `docker-compose.test.yml` 起一次「app 镜像 + mock-surge」，这就跟旧 Mac 上跑的镜像**完全一致**：

```bash
docker compose -f docker-compose.test.yml up -d
BASE=http://localhost:3000 ./scripts/smoke-test.sh
docker compose -f docker-compose.test.yml down -v
```

### D. 传到 Surge Mac 并启动

```bash
# 一条命令搞定：scp + docker load + docker compose up -d
REMOTE=li.chen@old-mac.local ./scripts/deploy-to-remote.sh
```

首次会把 `.env.example` 复制成 `.env.local` 然后**停下来**要求你填 secrets——按屏幕提示 ssh 进去改完再 `docker compose up -d`。

### E. 远程验收

在开发机上直接对着老 Mac 打 smoke test：

```bash
BASE=http://<old-mac-lan-ip>:3000 ./scripts/smoke-test.sh
# 或走公网 + Bearer token：
BASE=https://surge.onenew.site TOKEN=<token> ./scripts/smoke-test.sh
```

全绿说明 UI 可达、Surge HTTP API 打通、DB 挂载正常。

---

## 三、5 分钟跑起来（Docker，直接在 Surge Mac 上）

> 老 Mac 上 yarn / Node 版本一团乱？直接 Docker。前置只需 Docker Desktop。

### 1. 准备 Surge

在 Surge profile 的 `[General]` 部分确保有：

```ini
http-api = surgepasswd@0.0.0.0:6171
```

- **password** 自己取一个，等会儿填到 `SURGE_API_KEY`
- **必须是 `0.0.0.0`**，不能写 `127.0.0.1`——容器要从 `host.docker.internal` 访问它
- 改完点 Surge 菜单栏 → Reload

记下 profile 的绝对路径，通常是：

```
~/Library/Application Support/Surge/Profiles/Default.conf
```

> 若不知道路径，Surge 菜单栏 → Profiles → "Show in Finder"，右键 → "Copy as Pathname"。

### 2. 生成两个密钥

打开终端跑两次：

```bash
openssl rand -base64 32   # → NEXTAUTH_SECRET
openssl rand -base64 32   # → APP_ENC_KEY
```

各自把输出复制出来。**这两个 key 的作用是不同的：**

| 变量 | 干什么的 | 丢了会怎样 |
|---|---|---|
| `NEXTAUTH_SECRET` | 给 GitHub 登录后下发的 session cookie 签名 | 别人能伪造你的登录态，绕过 GitHub OAuth |
| `APP_ENC_KEY` | AES-256-GCM 加密 SQLite 里的敏感字段（目前是订阅 URL） | 数据库里已加密的订阅 URL 解不出来，需要在 UI 重填一次 |

两个分开是为了：旋转 `APP_ENC_KEY` 时不需要把所有人踢下线，反之亦然。

### 3. 查一下 Mac 的 LAN IP

```bash
ipconfig getifaddr en0   # 通常是 192.168.x.x
```

把这个 IP 记下来，等下要填到 `LAN_TRUSTED_HOSTS`，手机也要用这个地址访问。

### 4. 写配置

```bash
cp .env.example .env.local
```

打开 `.env.local`，按文件里的注释填。**局域网模式**只需要这些：

```bash
# 必填
NEXTAUTH_SECRET=<刚才 openssl 生成的第一个>
APP_ENC_KEY=<刚才 openssl 生成的第二个>
SURGE_API_KEY=<你在 Surge profile 写的 http-api 密码>
HOST_SURGE_PROFILE=/Users/your-name/Library/Application Support/Surge/Profiles/Default.conf

# LAN 白名单：填你 Mac 的 LAN IP + 端口（顺手加 localhost 和 .local 便捷别名）
LAN_TRUSTED_HOSTS=192.168.1.50:3000,localhost:3000,my-mac.local:3000

# 公网/OAuth 现阶段留空即可；见文末《后续可选》
# NEXTAUTH_URL=
# GITHUB_ID=
# GITHUB_SECRET=
# ALLOWED_GITHUB_LOGINS=
```

> `HOST_SURGE_PROFILE` 路径里有空格没关系，**不要**自己加引号——docker compose 的 env_file 会处理。

### 5. 启动

```bash
docker compose up -d --build
docker compose logs -f surge-controller   # 看启动日志
```

打开浏览器：

- 同一台 Mac 上：`http://localhost:3000`
- 手机/局域网设备：`http://192.168.1.50:3000`（换成你的 LAN IP）

如果 `LAN_TRUSTED_HOSTS` 里有这个地址，会**直接进 Dashboard，不要求登录**，右上角会显示绿色 `LAN` 标签。

### 6. iPhone 加到主屏幕（PWA）

1. iPhone 连上同一个 Wi-Fi
2. Safari 打开 `http://<mac-lan-ip>:3000`（用 `.local` 别名也行，见 FAQ）
3. 应该**直接进 Dashboard**、顶部有绿色 `LAN` 标签、免登录
4. 分享按钮 → **加到主屏幕** → 命名「Surge」→ 添加
5. 主屏幕出现 ⚡ 图标；点它进入的是**全屏**（没有 Safari 地址栏），跟原生 App 观感一致

> 不需要 Apple Developer 账号、不用签名、不装 TestFlight/App Store。iOS 的「Add to Home Screen」就是给 PWA 用的。

### 7. 首次使用

1. 打开 `/subscription`：填订阅 URL、点「保存」→「立即更新 + Reload」
2. 回到首页试一下：
   - 出站模式 4 个大按钮 → 当前模式会**加深高亮**
   - 区域快切 3 个按钮 → 当前区域会**加深高亮**（切完自己看，UI 立刻反馈）
   - 点具体节点组的标题可以展开/收起，展开后能一个个测延迟、按行选择

---

## 三、更新 / 重启 / 备份

```bash
# 拉新代码后重新构建并滚动重启
docker compose up -d --build

# 看日志
docker compose logs -f surge-controller

# 停掉
docker compose down

# 备份 SQLite（订阅 URL、token 哈希、审计日志都在里面）
cp data/app.db data/app.db.$(date +%F).bak
```

数据卷：
- `./data` → 容器 `/data`：SQLite + WAL
- `$HOST_SURGE_PROFILE` → 容器 `/surge/profile.conf`：Surge 配置文件（订阅写回这里）

profile 每次写入会自动保留最近 5 份备份到 `<profile>.bak.<timestamp>`，由 Mac 上的 Surge 进程直接看到。

---

## 四、API 一览

现阶段只走 LAN 鉴权：请求 `Host` 头匹配 `LAN_TRUSTED_HOSTS` 就放行。（Bearer Token / GitHub OAuth 的代码路径保留但 UI 已下线，等要开公网时再启用。）

| Method & Path | 用途 |
|---|---|
| `GET  /api/surge/policy-groups` | 列出所有策略组 + 当前选中 |
| `POST /api/surge/select` `{group,policy}` | 切换某组节点 |
| `POST /api/surge/test-latency` `{group}` | 测延迟 |
| `POST /api/surge/auto-best` `{group}` | Tier 加权选最优并应用 |
| `POST /api/surge/tier` `{tier:"1"\|"2"\|"3", group?}` | 一键切到 Tier 子组 |
| `GET/POST /api/surge/outbound-mode` | 查询/切换 direct/rule/proxy/global |
| `POST /api/surge/reload` | 重载 Surge profile |
| `POST /api/subscription/preview` | Dry-run，只返回 sanitize 报告 |
| `POST /api/subscription/update` | 拉取 → sanitize → 写文件 → reload |
| `GET/PATCH /api/settings` | 读取/更新订阅URL、路径、tier 参数 |
| `GET/POST/DELETE /api/tokens` | 管理 API Token（路由保留，UI 已下线） |
| `GET/POST/DELETE /api/presets`, `POST /api/presets/apply` | 场景预设 |
| `GET  /api/audit` | 操作日志 |

---

## 五、安全考量

| 风险面 | 缓解 |
|---|---|
| 订阅 URL（含私钥） | `APP_ENC_KEY` 派生密钥 AES-256-GCM 加密后存 SQLite |
| Bearer Token 泄漏 | 只存 SHA-256 哈希，明文仅在生成那一刻显示一次 |
| Surge 6171 暴露 LAN | `0.0.0.0:6171` 监听是必须的，但密码由 `SURGE_API_KEY` 保护；可在 macOS 防火墙限制源 IP |
| 公网入口被穷举 | Cloudflare Access 在域名前再加一层 GitHub OAuth；只有 `ALLOWED_GITHUB_LOGINS` 里的用户能登录 |
| LAN 完全不鉴权 | 默认 `LAN_TRUSTED_HOSTS` 为空（即不开 LAN 旁路）；启用前确认 Wi-Fi 网络可信 |

**特别提醒**：不要把 cloudflared 本机用的 `127.0.0.1` 加进 `LAN_TRUSTED_HOSTS`——否则任何通过 Tunnel 进来的请求都能绕过 Cloudflare Access。

---

## 六、不用 Docker 直接跑（开发用）

```bash
yarn install
yarn build
# .env.local 里把 SURGE_API_HOST 改成 http://127.0.0.1:6171
# 把 SURGE_PROFILE_PATH 改成 Mac 上的真实绝对路径
# 把 DB_PATH 改成 ./data/app.db
yarn start
```

要让它开机自启可参考 `scripts/com.bushicherry.surgecontroller.plist`（launchd unit），自己改路径后：

```bash
cp scripts/com.bushicherry.surgecontroller.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.bushicherry.surgecontroller.plist
```

不过 Docker 路线一般更省心。

---

## 七、常见问题

**Q：手机上打开 LAN 地址显示登录页**
A：检查 `LAN_TRUSTED_HOSTS` 里写的地址是否**完全匹配**浏览器里的地址（含端口）。例如你在手机里输的是 `http://my-mac.local:3000`，那 `LAN_TRUSTED_HOSTS` 就要包含 `my-mac.local:3000` 这一项。

**Q：容器起不来，日志 `connect ECONNREFUSED host.docker.internal:6171`**
A：Surge 的 `http-api` 监听 IP 写成 `127.0.0.1` 了，改成 `0.0.0.0` 再 Reload Surge。

**Q：订阅更新失败，`EACCES: permission denied, open '/surge/profile.conf'`**
A：Mac 上该 profile 文件的所有者不是当前用户，或挂载路径里有 macOS 隐私权限（Files & Folders）限制。在 系统设置 → 隐私与安全 → Files and Folders → Docker，授予对应目录访问权限。

**Q：iPhone 上 Safari 显示登录页而不是 Dashboard**
A：`LAN_TRUSTED_HOSTS` 里没匹配上你在浏览器里输的地址。iPhone 打开的 URL 是什么、白名单里就要包含什么。比如：
- 输 `http://192.168.1.50:3000` → 白名单要有 `192.168.1.50:3000`
- 输 `http://my-mac.local:3000` → 白名单要有 `my-mac.local:3000`

**Q：mDNS `.local` 域名解析不到**
A：iPhone 一般支持 mDNS，但如果路由器/Wi-Fi 关了组播就不行。用 IP 是最稳的兜底方案。给 Mac 一个 DHCP 静态绑定，IP 就不会变。

**Q：加到主屏幕后打开是白屏 / 显示登录页**
A：iOS 的 PWA 是独立 storage，第一次打开就相当于一个全新会话；重要的是**加到主屏幕的那个 URL** 本身就在 `LAN_TRUSTED_HOSTS` 里。如果你之前在 Safari 里通过 `.local` 加的，主屏幕图标打开也是 `.local`，白名单也得有它。

---

## 八、后续可选（等 LAN 稳定后再开）

OAuth / 公网 / Bearer Token 的路径全部代码仍在，只是 UI 入口下线了。要重新启用：

**开公网**：
1. 去 https://github.com/settings/developers → New OAuth App（Homepage / Callback 用你的域名）
2. 填 `.env.local`：`NEXTAUTH_URL` / `GITHUB_ID` / `GITHUB_SECRET` / `ALLOWED_GITHUB_LOGINS`
3. cloudflared tunnel ingress 加一条 `hostname → http://localhost:3000`
4. Cloudflare Zero Trust → Access → Applications 绑域名，policy 用 GitHub OAuth（双保险）
5. 重启容器：`docker compose up -d`

**重新开启 API Tokens / iOS 快捷指令**：
- `POST /api/tokens` 生成 token 的路由仍在
- 需要把 `src/app/tokens/page.tsx` 和 `src/components/TokensView.tsx` 从 git 历史里 revert 回来（或者直接 `curl` 生成）
- 修 `withAuth` → 允许 LAN 上下文创建 token（当前 `ctx.userId` 在 LAN 模式下是 `undefined`，插入会因 NOT NULL 失败——这也是之前「点生成没反应」的根因）

**特别提醒**：不要把 cloudflared 本机用的 `127.0.0.1` 加进 `LAN_TRUSTED_HOSTS`——否则任何通过 Tunnel 进来的请求都能绕过 Cloudflare Access。
