import { requireAccess } from "@/lib/auth";
import RulesView from "@/components/RulesView";

export default async function Page() {
  await requireAccess();
  return <RulesView />;
}
