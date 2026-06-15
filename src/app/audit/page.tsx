import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AuditView from "@/components/AuditView";

export default async function Page() {
  const s = await auth();
  if (!(s as { user?: { login?: string } } | null)?.user?.login) redirect("/login");
  return <AuditView />;
}
