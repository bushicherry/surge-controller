import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export const metadata = { title: "Surge Controller" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const login = (session as { user?: { login?: string; avatar?: string } } | null)?.user?.login;
  const avatar = (session as { user?: { login?: string; avatar?: string } } | null)?.user?.avatar;

  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-40 backdrop-blur bg-bg/70 border-b border-border">
          <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg">⚡ Surge Controller</Link>
            <div className="flex-1" />
            {login && (
              <>
                <Link href="/" className="btn-ghost btn">Dashboard</Link>
                <Link href="/subscription" className="btn-ghost btn">订阅</Link>
                <Link href="/tokens" className="btn-ghost btn">Tokens</Link>
                <Link href="/shortcuts" className="btn-ghost btn">快捷指令</Link>
                <Link href="/audit" className="btn-ghost btn">日志</Link>
                {avatar && <img src={avatar} alt="" className="w-7 h-7 rounded-full" />}
                <form action={async () => { "use server"; await signOut(); }}>
                  <button className="btn-ghost btn text-muted">退出</button>
                </form>
              </>
            )}
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
