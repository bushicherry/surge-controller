import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Page() {
  const s = await auth();
  if (!(s as { user?: { login?: string } } | null)?.user?.login) redirect("/login");

  const examples = [
    { name: "切日新台 (Tier1)", method: "POST", path: "/api/surge/tier", body: { tier: "1", group: "Proxy" } },
    { name: "切香港 (Tier2)", method: "POST", path: "/api/surge/tier", body: { tier: "2", group: "Proxy" } },
    { name: "切欧美 (Tier3)", method: "POST", path: "/api/surge/tier", body: { tier: "3", group: "Proxy" } },
    { name: "自动最优", method: "POST", path: "/api/surge/auto-best", body: { group: "Proxy" } },
    { name: "Direct 模式", method: "POST", path: "/api/surge/outbound-mode", body: { mode: "direct" } },
    { name: "Rule 模式", method: "POST", path: "/api/surge/outbound-mode", body: { mode: "rule" } },
    { name: "Global Proxy", method: "POST", path: "/api/surge/outbound-mode", body: { mode: "proxy" } },
    { name: "更新订阅", method: "POST", path: "/api/subscription/update", body: {} },
    { name: "应用预设", method: "POST", path: "/api/presets/apply", body: { name: "工作模式" } },
    { name: "选择指定节点", method: "POST", path: "/api/surge/select", body: { group: "Proxy", policy: "🇯🇵 東京 CN2 20260612" } },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">iOS 快捷指令 / curl 模板</h1>
      <div className="card p-4 text-sm space-y-2">
        <p>每个请求都需要带 Header：</p>
        <pre className="bg-bg p-2 rounded-lg">Authorization: Bearer &lt;YOUR_API_TOKEN&gt;
Content-Type: application/json
CF-Access-Client-Id: &lt;cf service token id&gt;
CF-Access-Client-Secret: &lt;cf service token secret&gt;</pre>
        <p className="text-muted">CF-Access-* 仅当域名受 Cloudflare Access 保护时需要。在 Cloudflare Zero Trust 中为该 application 创建 Service Token 并将其加入 policy。</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {examples.map(ex => {
          const curl = `curl -X ${ex.method} \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(ex.body)}' \\
  https://surge.onenew.site${ex.path}`;
          return (
            <div key={ex.name} className="card p-4 space-y-2">
              <div className="font-medium">{ex.name}</div>
              <div className="text-xs text-muted">{ex.method} {ex.path}</div>
              <pre className="text-xs bg-bg p-2 rounded-lg overflow-auto whitespace-pre-wrap break-all">{curl}</pre>
              <div className="text-xs text-muted">
                iOS 快捷指令：「获取 URL 内容」→ URL 填 <code>https://surge.onenew.site{ex.path}</code>，方法 {ex.method}，请求体设为 JSON：<code>{JSON.stringify(ex.body)}</code>，Headers 同上。
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
