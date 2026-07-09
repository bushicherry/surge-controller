import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { auth, signOut, isLanRequest } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Surge Controller",
  applicationName: "Surge",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Surge",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafc" },
    { media: "(prefers-color-scheme: dark)",  color: "#090b12" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const NAV = [
  { href: "/",             label: "首页" },
  { href: "/rules",        label: "规则" },
  { href: "/subscription", label: "订阅" },
  { href: "/audit",        label: "日志" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lan = await isLanRequest();
  const session = lan ? null : await auth();
  const login = (session as { user?: { login?: string; avatar?: string } } | null)?.user?.login;
  const avatar = (session as { user?: { login?: string; avatar?: string } } | null)?.user?.avatar;
  const showNav = lan || !!login;

  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-dvh">
        {/* Desktop / tablet nav — hidden on phones */}
        <header className="hidden md:block sticky top-0 z-40 backdrop-blur bg-bg/70 border-b border-border safe-top">
          <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg">⚡ Surge Controller</Link>
            <div className="flex-1" />
            {showNav && (
              <>
                {NAV.map(n => (
                  <Link key={n.href} href={n.href} className="btn-ghost btn">{n.label}</Link>
                ))}
                {lan && <span className="badge bg-green-500/20 text-green-400">LAN</span>}
                {avatar && <img src={avatar} alt="" className="w-7 h-7 rounded-full" />}
                {!lan && (
                  <form action={async () => { "use server"; await signOut(); }}>
                    <button className="btn-ghost btn text-muted">退出</button>
                  </form>
                )}
              </>
            )}
          </nav>
        </header>

        {/* Mobile top bar — visible only on phones */}
        <header className="md:hidden sticky top-0 z-40 backdrop-blur bg-bg/80 border-b border-border safe-top">
          <div className="px-4 h-12 flex items-center gap-2">
            <div className="font-semibold text-base">⚡ Surge</div>
            {lan && <span className="badge bg-green-500/20 text-green-400">LAN</span>}
            <div className="flex-1" />
            {!lan && !!login && (
              <form action={async () => { "use server"; await signOut(); }}>
                <button className="btn-ghost btn text-xs text-muted">退出</button>
              </form>
            )}
          </div>
        </header>

        {/* Reserve bottom space on mobile so pages can scroll clear of the tab bar. */}
        <main className={`max-w-5xl mx-auto px-3 md:px-4 py-4 md:py-6 ${showNav ? "pb-28 md:pb-6" : ""}`}>{children}</main>

        {showNav && <BottomNav items={NAV} />}
      </body>
    </html>
  );
}
