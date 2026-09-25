import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { integrationStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const services = await getServices();
  const [profile, counts, waiting] = await Promise.all([
    services.profiles.getProfile(user.id),
    services.tasks.countByView(user.id),
    services.waiting.listWaiting(user.id),
  ]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        userLabel={profile.name ?? user.email ?? "You"}
        demo={user.demo}
        counts={{ today: counts.today, overdue: counts.overdue, waiting: waiting.length }}
        whatsappConnected={integrationStatus().whatsapp}
      />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
