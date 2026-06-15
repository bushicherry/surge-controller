import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if ((session as { user?: { login?: string } } | null)?.user?.login) redirect("/");
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="card p-8 w-full max-w-sm text-center space-y-4">
        <div className="text-2xl">⚡</div>
        <h1 className="text-xl font-semibold">Surge Controller</h1>
        <p className="text-sm text-muted">使用 GitHub 账号登录</p>
        <form action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}>
          <button className="btn btn-primary w-full">用 GitHub 登录</button>
        </form>
      </div>
    </div>
  );
}
