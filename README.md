# Surge Controller

Web 控制台 + REST API，远程管理 MacBook 上的 Surge Mac。GitHub OAuth 登录，长效 API Token 供 iPhone 快捷指令 / Siri 调用。通过 Cloudflare Tunnel 暴露到公网。

## 功能

- GitHub OAuth 登录 + 长效 API Token (Bearer)
- 策略组节点切换 / 逐组延迟测试
- **Tier 加权评分自动最优**：Tier1 (🇯🇵🇸🇬🇹🇼) → Tier2 (🇭🇰) → Tier3 (欧美)
- **区域快切**：sanitizer 自动生成 `🌏 Tier1-JP/SG/TW` / `🇭🇰 Tier2-HK` / `🌍 Tier3-EU/US` 三个 select 组
- 出站模式快切：Direct / Rule / Global Proxy
- 场景预设：一次切多个策略组 + 模式
- 订阅更新管线：拉取 → 剔除 `anytls` 等不兼容节点 → 注入 `http-api` → 原子写文件 + 备份 → reload
- 操作审计日志
- iOS 快捷指令模板页

## 部署

### 1. 安装 & 构建
```bash
yarn install
yarn build
```

### 2. 环境变量
```bash
cp .env.example .env.local
# 编辑 .env.local：
#   NEXTAUTH_SECRET / APP_ENC_KEY：openssl rand -base64 32
#   NEXTAUTH_URL：https://surge.onenew.site
#   GITHUB_ID / GITHUB_SECRET：在 https://github.com/settings/developers 新建 OAuth App
#     Authorization callback URL: https://surge.onenew.site/api/auth/callback/github
#   ALLOWED_GITHUB_LOGINS：你的 GitHub 用户名（逗号分隔多个）
#   SURGE_PROFILE_PATH：Surge profile 绝对路径
#     一般在 ~/Library/Application Support/Surge/Profiles/Default.conf
```

### 3. launchd 守护
```bash
cp scripts/com.bushicherry.surgecontroller.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.bushicherry.surgecontroller.plist
# 编辑 plist 里的绝对路径以匹配本机
```
或直接 `pnpm start` 运行测试。

### 4. Cloudflare Tunnel
在现有 tunnel 配置里追加一条 ingress：
```yaml
- hostname: surge.onenew.site
  service: http://localhost:3000
```
然后在 Cloudflare Zero Trust → Access → Applications 创建一个 Self-hosted 应用绑定 `surge.onenew.site`，policy 复用 GitHub OAuth；并创建 **Service Token**（给快捷指令用）。

### 5. 首次配置
1. 浏览器访问 `https://surge.onenew.site` 用 GitHub 登录
2. **订阅** 页：填写订阅 URL、Surge profile 路径，点「保存」→「立即更新 + Reload」
3. **Tokens** 页：生成一个 API Token 给快捷指令用（仅显示一次，立即复制）
4. **快捷指令** 页：参考 curl 模板配置 iOS 快捷指令

## API 一览

所有 endpoint 需要 `Authorization: Bearer <token>` 或浏览器 session。

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
| `GET/POST /api/settings` | 读取/更新订阅URL、路径、tier 参数 |
| `GET/POST/DELETE /api/tokens` | 管理 API Token |
| `GET/POST/DELETE /api/presets`, `POST /api/presets/apply` | 场景预设 |
| `GET  /api/audit` | 操作日志 |

## 安全

- 订阅 URL 用 `APP_ENC_KEY` 派生的 AES-256-GCM 加密后存 SQLite
- API Token 仅存 SHA-256 哈希，生成时显示一次
- 6171 端口不暴露公网；所有外部调用经 Next.js 转发
- Cloudflare Access 在公网入口再加一层 OAuth/Service Token

## 数据 & 备份

- SQLite：`./data/app.db`
- profile 写入时自动备份到 `<profile>.bak.<timestamp>`，保留最近 5 份

