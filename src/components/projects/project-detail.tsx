"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Star } from "lucide-react";
import type { Project, Task } from "@/types/domain";
import type { ProjectDetail } from "@/services/project-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { QuickAdd } from "@/components/tasks/quick-add";
import { setNextActionAction, updateProjectAction } from "@/app/actions/projects";
import { formatDayLabel } from "@/lib/dates";

type Props = {
  detail: Omit<ProjectDetail, "waiting"> & { waiting: { id: string; person: string; topic: string; expectedBy?: string | null }[] };
  today: string;
  projects: Pick<Project, "id" | "name">[];
  lifeAreas: string[];
};

export function ProjectDetailView({ detail, today, projects, lifeAreas }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState(detail.project.notes ?? "");
  const [pending, startTransition] = useTransition();
  const all = [...detail.openTasks, ...detail.blockedTasks, ...detail.completedTasks];
  const openTask = all.find((t) => t.id === openId) ?? null;

  const makeNext = (task: Task) => startTransition(async () => void (await setNextActionAction(detail.project.id, task.id)));
  const saveNotes = () => startTransition(async () => void (await updateProjectAction(detail.project.id, { notes: notes || null })));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card className={detail.needsAttention ? "border-warning/50 bg-warning/5" : "bg-accent/40"}>
          <CardContent className="py-4">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Next action</p>
            {detail.nextAction ? (
              <p className="mt-1 flex items-center gap-2 font-medium">
                <ArrowRight className="size-4 text-primary" /> {detail.nextAction.title}
              </p>
            ) : (
              <p className="mt-1 text-sm">
                <span className="font-medium">Needs attention.</span>{" "}
                <span className="text-muted-foreground">Pick one of the open tasks below with the star, or add one.</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle>Open tasks · {detail.openTasks.length}</CardTitle>
          </CardHeader>
          <div className="px-5 pb-4">
            <QuickAdd defaults={{ projectId: detail.project.id, lifeArea: detail.project.lifeArea }} placeholder="Add a task to this project…" />
          </div>
          <div className="divide-y border-t">
            {detail.openTasks.length === 0 && <p className="px-5 py-5 text-sm text-muted-foreground">No open tasks.</p>}
            {detail.openTasks.map((t) => (
              <div key={t.id} className="flex items-center">
                <div className="min-w-0 flex-1"><TaskRow task={t} today={today} onOpen={(x) => setOpenId(x.id)} /></div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mr-3"
                  disabled={pending}
                  title={detail.nextAction?.id === t.id ? "Current next action" : "Make next action"}
                  onClick={() => makeNext(t)}
                >
                  <Star className={detail.nextAction?.id === t.id ? "fill-warning text-warning" : "text-muted-foreground"} />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {detail.blockedTasks.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-3"><CardTitle>Blocked</CardTitle></CardHeader>
            <div className="divide-y border-t">
              {detail.blockedTasks.map((t) => <TaskRow key={t.id} task={t} today={today} onOpen={(x) => setOpenId(x.id)} />)}
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="pb-3"><CardTitle>Completed · {detail.completedTasks.length}</CardTitle></CardHeader>
          <div className="divide-y border-t">
            {detail.completedTasks.length === 0 && <p className="px-5 py-5 text-sm text-muted-foreground">Nothing completed yet.</p>}
            {detail.completedTasks.map((t) => <TaskRow key={t.id} task={t} today={today} onOpen={(x) => setOpenId(x.id)} />)}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Waiting on</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {detail.waiting.length === 0 && <p className="text-sm text-muted-foreground">Nobody.</p>}
            {detail.waiting.map((w) => (
              <div key={w.id} className="text-sm">
                <p className="font-medium">{w.person}</p>
                <p className="text-xs text-muted-foreground">
                  {w.topic}
                  {w.expectedBy ? ` · expected ${formatDayLabel(w.expectedBy, today)}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, links, decisions…" className="min-h-32" />
            {notes !== (detail.project.notes ?? "") && (
              <div className="flex justify-end">
                <Button size="sm" onClick={saveNotes} disabled={pending}>Save notes</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TaskDetailSheet task={openTask} projects={projects} lifeAreas={lifeAreas} onClose={() => setOpenId(null)} />
    </div>
  );
}
