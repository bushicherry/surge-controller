import { requireAccess } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  await requireAccess();
  return <Dashboard />;
}
