import { ok, withAuth } from "@/lib/util";
import { snapshot } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const snap = await snapshot();
    return ok(snap);
  });
}
