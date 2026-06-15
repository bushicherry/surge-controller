import { surge } from "@/lib/surge";
import { ok, withAuth } from "@/lib/util";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    await surge.reload();
    audit({ userId: ctx.userId, action: "reload" });
    return ok();
  });
}
