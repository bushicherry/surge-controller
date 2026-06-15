import { ok, withAuth } from "@/lib/util";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const rows = db.prepare(
      `SELECT a.*, u.login FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT 200`
    ).all();
    return ok({ entries: rows });
  });
}
