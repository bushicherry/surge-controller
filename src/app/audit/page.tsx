import { requireAccess } from "@/lib/auth";
import AuditView from "@/components/AuditView";

export default async function Page() {
  await requireAccess();
  return <AuditView />;
}
