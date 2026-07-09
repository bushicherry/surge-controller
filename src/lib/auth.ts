import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { env } from "./env";
import { db } from "./db";
import { sha256Hex } from "./crypto";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: env.nextAuthSecret,
  trustHost: true,
  providers: [
    GitHub({
      clientId: env.githubId,
      clientSecret: env.githubSecret,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const login = (profile as { login?: string } | null)?.login ?? "";
      if (!env.allowedLogins.length) return true; // open if not configured
      return env.allowedLogins.includes(login);
    },
    async jwt({ token, profile }) {
      if (profile) {
        const p = profile as { id?: number | string; login?: string; avatar_url?: string };
        token.gh_id = String(p.id ?? "");
        token.gh_login = p.login ?? "";
        token.gh_avatar = p.avatar_url ?? "";
        // upsert user
        const now = Date.now();
        db.prepare(`
          INSERT INTO users (github_id, login, avatar, role, created_at) VALUES (?, ?, ?, 'admin', ?)
          ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, avatar = excluded.avatar
        `).run(token.gh_id, token.gh_login, token.gh_avatar, now);
      }
      return token;
    },
    async session({ session, token }) {
      (session as { user?: { login?: string; avatar?: string; gh_id?: string } }).user = {
        login: (token.gh_login as string) ?? "",
        avatar: (token.gh_avatar as string) ?? "",
        gh_id: (token.gh_id as string) ?? "",
      };
      return session;
    },
  },
  pages: { signIn: "/login" },
});

export type AuthCtx = {
  via: "session" | "token" | "lan";
  userId?: number;
  login?: string;
};

/** True if the given Host header value matches LAN_TRUSTED_HOSTS. */
export function isLanHost(host: string | null | undefined): boolean {
  if (!host || !env.lanTrustedHosts.length) return false;
  return env.lanTrustedHosts.includes(host.toLowerCase());
}

/**
 * Server-component helper. Checks the incoming request's Host header against
 * LAN_TRUSTED_HOSTS. Used by pages to skip the /login redirect on LAN.
 */
export async function isLanRequest(): Promise<boolean> {
  // Lazy import to avoid pulling next/headers into the client bundle.
  const { headers } = await import("next/headers");
  const h = await headers();
  return isLanHost(h.get("host"));
}

/**
 * Page-level gate. Use in server components:
 *   await requireAccess();   // throws redirect("/login") if unauthorized
 */
export async function requireAccess(): Promise<{ lan: boolean; login: string | null }> {
  if (await isLanRequest()) return { lan: true, login: null };
  const session = await auth();
  const login = (session as { user?: { login?: string } } | null)?.user?.login ?? null;
  if (login) return { lan: false, login };
  const { redirect } = await import("next/navigation");
  redirect("/login");
  // unreachable — redirect() throws — but TS can't see across dynamic import.
  throw new Error("unreachable");
}

/** Resolves a request to an auth context. Returns null if unauthenticated. */
export async function authorize(req: Request): Promise<AuthCtx | null> {
  // 0) LAN trusted host — bypass all auth (typical home network).
  if (isLanHost(req.headers.get("host"))) {
    return { via: "lan", login: "lan" };
  }
  // 1) Bearer token
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const hash = sha256Hex(m[1].trim());
    const row = db
      .prepare(
        `SELECT t.id AS tid, t.user_id AS uid, u.login AS login
         FROM api_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.revoked = 0`
      )
      .get(hash) as { tid: number; uid: number; login: string } | undefined;
    if (row) {
      db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
        .run(Date.now(), row.tid);
      return { via: "token", userId: row.uid, login: row.login };
    }
  }
  // 2) Session
  const session = await auth();
  const login = (session as { user?: { login?: string } } | null)?.user?.login;
  if (login) {
    const row = db.prepare("SELECT id FROM users WHERE login = ?").get(login) as
      | { id: number } | undefined;
    return { via: "session", userId: row?.id, login };
  }
  return null;
}
