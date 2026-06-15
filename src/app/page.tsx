import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const session = await auth();
  if (!(session as { user?: { login?: string } } | null)?.user?.login) redirect("/login");
  return <Dashboard />;
}
