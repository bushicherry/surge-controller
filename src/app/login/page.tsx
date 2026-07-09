import { signIn, auth, isLanRequest } from "@/lib/auth";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { headers } from "next/headers";

export default async function LoginPage() {
  if (await isLanRequest()) redirect("/");
  const session = await auth();
  if ((session as { user?: { login?: string } } | null)?.user?.login) redirect("/");

  const oauthConfigured = !!(env.githubId && env.githubSecret);
  const host = (await headers()).get("host") ?? "";

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-md text-center space-y-4">
        <div className="text-3xl">⚡</div>
        <h1 className="text-xl font-semibold">Surge Controller</h1>

        {oauthConfigured ? (
          <>
            <p className="text-sm text-muted">使用 GitHub 账号登录</p>
            <form action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}>
              <button className="btn btn-primary w-full">用 GitHub 登录</button>
            </form>
          </>
        ) : (
          <div className="text-sm text-muted space-y-3 text-left">
            <p><b>此实例仅接受局域网访问。</b></p>
            <p>
              你请求的域名 <code className="text-fg">{host}</code> 不在 <code>LAN_TRUSTED_HOSTS</code> 白名单中，
              而且尚未配置 GitHub OAuth，所以无法登录。
            </p>
            <p>解决方式（挑一个）：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>用局域网地址访问，例如 <code>http://&lt;mac-lan-ip&gt;:3000</code>；</li>
              <li>把 <code>{host}</code> 加进服务器 <code>.env.local</code> 的 <code>LAN_TRUSTED_HOSTS</code>；</li>
              <li>或者配置 <code>GITHUB_ID</code> / <code>GITHUB_SECRET</code> 开启公网 OAuth。</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
