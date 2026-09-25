import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { WaitingStatus } from "@/components/waiting/waiting-status";
import { WaitingActions } from "@/components/waiting/waiting-actions";
import { NewWaitingForm } from "@/components/waiting/new-waiting-form";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default async function WaitingPage() {
  const user = await requireUser();
  const services = await getServices();
  const [{ today }, waiting, done] = await Promise.all([
    services.profiles.getToday(user.id),
    services.waiting.listWaiting(user.id),
    services.waiting.listWaiting(user.id, ["completed"]),
  ]);
  const overdue = waiting.filter((w) => w.overdue).length;

  return (
    <>
      <PageHeader
        title="Waiting for"
        description={`${waiting.length} open${overdue ? ` · ${overdue} overdue` : ""}. Things other people owe you.`}
      />
      <Card className="mb-6 p-4"><NewWaitingForm /></Card>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1.2fr_2fr_0.8fr_0.9fr_1fr] gap-4 border-b bg-muted/40 px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid">
          <span>Person</span><span>Topic</span><span>Waiting</span><span>Expected</span><span>Status</span>
        </div>
        <div className="divide-y">
          {waiting.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">You&apos;re not waiting on anyone.</p>}
          {waiting.map((w) => (
            <div key={w.id} className={cn("px-5 py-4", w.overdue && "bg-destructive/[0.03]")}>
              <div className="grid gap-1 md:grid-cols-[1.2fr_2fr_0.8fr_0.9fr_1fr] md:items-center md:gap-4">
                <span className="font-medium">{w.person}</span>
                <span className="text-sm">
                  {w.topic}
                  {w.description && <span className="block text-xs text-muted-foreground">{w.description}</span>}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">{w.daysWaiting} days</span>
                <span className="text-sm text-muted-foreground tabular-nums">{w.expectedBy ? formatShortDate(w.expectedBy) : "—"}</span>
                <span><WaitingStatus item={w} today={today} /></span>
              </div>
              <div className="mt-3"><WaitingActions id={w.id} /></div>
            </div>
          ))}
        </div>
      </Card>

      {done.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recently resolved</h2>
          <Card className="divide-y">
            {done.slice(0, 5).map((w) => (
              <div key={w.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span><span className="font-medium">{w.person}</span> <span className="text-muted-foreground">· {w.topic}</span></span>
                <WaitingStatus item={w} today={today} />
              </div>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
