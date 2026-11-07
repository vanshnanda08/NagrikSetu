import ConfigurationPanel from "@/components/admin/ConfigurationPanel";
import AuditPanel from "@/components/admin/AuditPanel";

export default async function AdministrationPage({ searchParams }: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return view === "audit" ? <AuditPanel /> : <ConfigurationPanel />;
}
