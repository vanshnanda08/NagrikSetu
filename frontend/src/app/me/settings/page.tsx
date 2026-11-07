import ProfileSettings from "@/components/account/ProfileSettings";
import SecuritySettings from "@/components/account/SecuritySettings";

export default async function AccountSettingsPage({ searchParams }: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return tab === "security" ? <SecuritySettings /> : <ProfileSettings />;
}
