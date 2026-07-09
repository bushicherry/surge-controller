import { ok, bad, withAuth } from "@/lib/util";
import { setJSON } from "@/lib/db";
import { audit } from "@/lib/audit";
import { z } from "zod";
import type { UserDirectRule } from "@/lib/sanitizer";
import {
  USER_DIRECT_KEY,
  getUserDirectRules,
  reapplyProfile,
} from "@/lib/apply";

const RULE_TYPES = ["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "IP-CIDR", "IP-CIDR6"] as const;
const RuleSchema = z.object({
  type: z.enum(RULE_TYPES),
  // Surge accepts a very permissive value here — we only trim whitespace and
  // forbid commas / spaces that would break rule parsing.
  value: z.string().min(1).max(200)
    .refine(v => !/[,\s]/.test(v), "value must not contain commas or spaces"),
});

/** GET → current list. */
export async function GET(req: Request) {
  return withAuth(req, async () => {
    return ok({ rules: getUserDirectRules() });
  });
}

/** POST { type, value } → add (or move to top if it already exists). */
export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    const p = RuleSchema.safeParse(body);
    if (!p.success) return bad(p.error.issues[0]?.message ?? "invalid rule");

    const rule: UserDirectRule = { type: p.data.type, value: p.data.value.trim() };
    const existing = getUserDirectRules().filter(r => !(r.type === rule.type && r.value === rule.value));
    const next = [rule, ...existing];
    setJSON(USER_DIRECT_KEY, next);

    const applied = await reapplyProfile().catch(err => ({ error: String(err.message ?? err) }));

    audit({ userId: ctx.userId, action: "user-rule-add", payload: { rule, applied } });
    return ok({ rules: next, applied });
  });
}

/** DELETE { type, value } → remove one. */
export async function DELETE(req: Request) {
  return withAuth(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    const p = RuleSchema.safeParse(body);
    if (!p.success) return bad(p.error.issues[0]?.message ?? "invalid rule");

    const next = getUserDirectRules().filter(
      r => !(r.type === p.data.type && r.value === p.data.value.trim())
    );
    setJSON(USER_DIRECT_KEY, next);

    const applied = await reapplyProfile().catch(err => ({ error: String(err.message ?? err) }));

    audit({ userId: ctx.userId, action: "user-rule-remove", payload: { rule: p.data, applied } });
    return ok({ rules: next, applied });
  });
}
