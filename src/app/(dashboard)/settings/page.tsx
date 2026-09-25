import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { integrationStatus } from "@/lib/env";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await (await getServices()).profiles.getProfile(user.id);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Keep it simple. Sensible defaults are already set." />
      <SettingsForm profile={profile} integrations={integrationStatus()} />
    </div>
  );
}
