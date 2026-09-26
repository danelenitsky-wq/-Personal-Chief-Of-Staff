import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default async function InsightsPage() {
  const user = await requireUser();
  const i = await (await getServices()).insights.getInsights(user.id);
  const maxArea = Math.max(1, ...i.byLifeArea.map((a) => a.completed + a.open));
  const delta = i.completedThisWeek - i.completedLastWeek;

  const stats = [
    { label: "Completed this week", value: i.completedThisWeek, note: delta === 0 ? "Same as last week" : `${delta > 0 ? "+" : ""}${delta} vs last week` },
    { label: "Postponed tasks", value: i.postponedCount, note: "Moved at least once" },
    { label: "Overdue", value: i.overdueCount, note: "Past their deadline" },
    { label: "Waiting on others", value: i.waitingCount, note: `${i.overdueWaitingCount} overdue` },
  ];

  return (
    <>
      <PageHeader title="Insights" description="A quiet look at how the week is going. No scores." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>By life area</CardTitle><span className="text-xs text-muted-foreground">done this week · open</span></CardHeader>
          <CardContent className="space-y-3">
            {i.byLifeArea.map((a) => (
              <div key={a.area} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-sm">
                <span className="truncate">{a.area}</span>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="bg-success" style={{ width: `${(a.completed / maxArea) * 100}%` }} />
                  <div className="bg-primary/35" style={{ width: `${(a.open / maxArea) * 100}%` }} />
                </div>
                <span className="text-right text-xs text-muted-foreground tabular-nums">{a.completed} · {a.open}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Keeps getting postponed</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {i.mostPostponed.length === 0 && <p className="text-sm text-muted-foreground">Nothing is being pushed around. Nice.</p>}
            {i.mostPostponed.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{t.title}</span>
                <Badge variant="warning">{t.postponeCount}×</Badge>
              </div>
            ))}
            {i.mostPostponed.length > 0 && (
              <p className="pt-2 text-xs text-muted-foreground">
                Worth a look: break these down, delegate them, or let them go.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Active project progress</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {i.projects.map((p) => (
              <div key={p.project.id} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>{p.project.name}</span>
                  <span className="text-muted-foreground tabular-nums">{p.progress}%</span>
                </div>
                <Progress value={p.progress} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
