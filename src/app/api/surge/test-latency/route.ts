import { surge } from "@/lib/surge";
import { ok, bad, withAuth } from "@/lib/util";
import { z } from "zod";

const Body = z.object({ group: z.string().min(1) });

export async function POST(req: Request) {
  return withAuth(req, async () => {
    const json = await req.json().catch(() => null);
    const p = Body.safeParse(json);
    if (!p.success) return bad(p.error.message);
    const latencies = await surge.testGroupDelay(p.data.group);
    return ok({ group: p.data.group, latencies });
  });
}
