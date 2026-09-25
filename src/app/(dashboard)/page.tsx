import Link from "next/link";
import { ArrowRight, Clock, AlertTriangle, CalendarCheck, Hourglass } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TopTaskCard } from "@/components/today/top-task-card";
import { Timeline } from "@/components/today/timeline";
import { ProjectCard } from "@/components/projects/project-card";
import { WaitingStatus } from "@/components/waiting/waiting-status";
import { WaitingActions } from "@/components/waiting/waiting-actions";
import { QuickAdd } from "@/components/tasks/quick-add";
import { formatMinutes, nowTimeIn } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default async function TodayPage() {
  const user = await requireUser();
  const services = await getServices();
  const o = await services.planning.getTodayOverview(user.id);
  const now = nowTimeIn(o.profile.timezone);
  const longDate = new Date(`${o.today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const stats = [
    { label: "Free today", value: formatMinutes(Math.round(o.freeMinutes / 15) * 15 || 0), icon: Clock, tone: "" },
    { label: "Due today", value: String(o.dueTodayCount), icon: CalendarCheck, tone: "", href: "/tasks?view=today" },
    { label: "Overdue", value: String(o.overdueCount), icon: AlertTriangle, tone: o.overdueCount ? "text-destructive" : "", href: "/tasks?view=overdue" },
    { label: "Waiting", value: String(o.waitingCount), icon: Hourglass, tone: "", href: "/waiting" },
  ];

  return (
    <div className="space-y-10">
      <header className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{longDate}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{o.greeting}.</h1>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone, href }) => {
            const body = (
              <Card className="px-4 py-3.5 transition-colors hover:bg-muted/30">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5" /> {label}
                </p>
                <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", tone)}>{value}</p>
              </Card>
            );
            return href ? <Link key={label} href={href}>{body}</Link> : <div key={label}>{body}</div>;
          })}
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold">Top 3 today</h2>
            <p className="text-sm text-muted-foreground">The few things that make today a good day.</p>
          </div>
          <Link href="/tasks?view=today" className="text-sm text-muted-foreground hover:text-foreground">
            All today <ArrowRight className="inline size-3.5" />
          </Link>
        </div>
        {o.topTasks.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            {o.topTasks.map((task, i) => (
              <TopTaskCard key={task.id} task={task} index={i} today={o.today} />
            ))}
          </div>
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">Nothing pressing today. Enjoy the space.</Card>
        )}
        <QuickAdd defaults={{ plannedDate: o.today }} placeholder="Capture something for today…" />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Today&apos;s timeline</CardTitle>
            <span className="text-xs text-muted-foreground">Calendar sample data until Google Calendar is connected</span>
          </CardHeader>
          <Timeline items={o.timeline} now={now} />
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Waiting for</CardTitle>
            <Link href="/waiting" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </CardHeader>
          <CardContent className="space-y-1 px-2 pt-2">
            {o.waiting.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Not waiting on anyone.</p>}
            {o.waiting.map((w) => (
              <div key={w.id} className="rounded-lg px-3 py-2.5 hover:bg-muted/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{w.person}</p>
                    <p className="truncate text-xs text-muted-foreground">{w.topic} · {w.daysWaiting}d waiting</p>
                  </div>
                  <WaitingStatus item={w} today={o.today} />
                </div>
                {w.overdue && <div className="mt-2"><WaitingActions id={w.id} compact /></div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-base font-semibold">Active projects</h2>
          <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
            All projects <ArrowRight className="inline size-3.5" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {o.projects.slice(0, 4).map((p) => (
            <ProjectCard key={p.project.id} summary={p} today={o.today} compact />
          ))}
        </div>
      </section>
    </div>
  );
}
