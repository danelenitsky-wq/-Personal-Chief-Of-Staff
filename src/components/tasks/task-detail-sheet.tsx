"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  ENERGY_LEVELS,
  PRIORITIES,
  TASK_CONTEXTS,
  TASK_STATUSES,
  type Project,
  type Task,
  type TaskActivity,
} from "@/types/domain";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { deleteTaskAction, getTaskActivityAction, updateTaskAction } from "@/app/actions/tasks";
import type { UpdateTaskInput } from "@/lib/validation/schemas";

type Props = {
  task: Task | null;
  projects: Pick<Project, "id" | "name">[];
  lifeAreas: string[];
  onClose: () => void;
};

const SOURCE_LABEL = { whatsapp: "WhatsApp", dashboard: "Dashboard", agent: "Agent" } as const;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Draft = {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  dueDate: string;
  dueTime: string;
  plannedDate: string;
  estimatedMinutes: string;
  lifeArea: string;
  projectId: string;
  context: string;
  energyLevel: string;
};

function toDraft(task: Task): Draft {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? "",
    dueTime: task.dueTime ?? "",
    plannedDate: task.plannedDate ?? "",
    estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : "",
    lifeArea: task.lifeArea ?? "",
    projectId: task.projectId ?? "",
    context: task.context ?? "",
    energyLevel: task.energyLevel ?? "",
  };
}

function toInput(d: Draft): UpdateTaskInput {
  const orNull = (v: string) => (v === "" ? null : v);
  return {
    title: d.title,
    description: orNull(d.description),
    status: d.status,
    priority: d.priority,
    dueDate: orNull(d.dueDate),
    dueTime: orNull(d.dueTime),
    plannedDate: orNull(d.plannedDate),
    estimatedMinutes: d.estimatedMinutes ? Number(d.estimatedMinutes) : null,
    lifeArea: orNull(d.lifeArea),
    projectId: orNull(d.projectId),
    context: orNull(d.context) as UpdateTaskInput["context"],
    energyLevel: orNull(d.energyLevel) as UpdateTaskInput["energyLevel"],
  };
}

export function TaskDetailSheet({ task, projects, lifeAreas, onClose }: Props) {
  const [draft, setDraft] = useState<Draft | null>(task ? toDraft(task) : null);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(task ? toDraft(task) : null);
    setError(null);
    setActivity([]);
    if (task) {
      getTaskActivityAction(task.id).then((r) => r.ok && setActivity(r.data));
    }
  }, [task]);

  const set = <K extends keyof Draft>(key: K) => (e: { target: { value: string } }) =>
    setDraft((d) => (d ? { ...d, [key]: e.target.value } : d));

  const save = () =>
    task &&
    draft &&
    startTransition(async () => {
      const result = await updateTaskAction(task.id, toInput(draft));
      if (!result.ok) return setError(result.error);
      onClose();
    });

  const remove = () =>
    task &&
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (!result.ok) return setError(result.error);
      onClose();
    });

  return (
    <Sheet open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()}>
        {task && draft && (
          <>
            <div className="border-b px-6 pt-5 pb-4">
              <SheetTitle className="sr-only">Edit task</SheetTitle>
              <SheetDescription className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">From {SOURCE_LABEL[task.source]}</Badge>
                {task.postponeCount > 1 && <Badge variant="warning">Postponed {task.postponeCount}×</Badge>}
              </SheetDescription>
              <Input
                value={draft.title}
                onChange={set("title")}
                className="h-auto border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                aria-label="Title"
              />
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <Field label="Notes">
                <Textarea value={draft.description} onChange={set("description")} placeholder="Add details…" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Status">
                  <NativeSelect value={draft.status} onChange={set("status")}>
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>{capitalize(s)}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Priority">
                  <NativeSelect value={draft.priority} onChange={set("priority")}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{capitalize(p)}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Deadline">
                  <Input type="date" value={draft.dueDate} onChange={set("dueDate")} />
                </Field>
                <Field label="Time">
                  <Input type="time" value={draft.dueTime} onChange={set("dueTime")} />
                </Field>
                <Field label="Planned for">
                  <Input type="date" value={draft.plannedDate} onChange={set("plannedDate")} />
                </Field>
                <Field label="Duration (min)">
                  <Input type="number" min={1} value={draft.estimatedMinutes} onChange={set("estimatedMinutes")} />
                </Field>
                <Field label="Life area">
                  <NativeSelect value={draft.lifeArea} onChange={set("lifeArea")}>
                    <option value="">None</option>
                    {lifeAreas.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Project">
                  <NativeSelect value={draft.projectId} onChange={set("projectId")}>
                    <option value="">None</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Context">
                  <NativeSelect value={draft.context} onChange={set("context")}>
                    <option value="">Any</option>
                    {TASK_CONTEXTS.map((c) => (
                      <option key={c} value={c}>{capitalize(c)}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Energy">
                  <NativeSelect value={draft.energyLevel} onChange={set("energyLevel")}>
                    <option value="">Not set</option>
                    {ENERGY_LEVELS.map((e) => (
                      <option key={e} value={e}>{capitalize(e)}</option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Activity</p>
                <ol className="space-y-2 border-l pl-4">
                  {activity.length === 0 && <li className="text-xs text-muted-foreground">No activity yet.</li>}
                  {activity.map((a) => (
                    <li key={a.id} className="relative text-xs">
                      <span className="absolute top-1.5 -left-[19px] size-1.5 rounded-full bg-border" />
                      <span className="font-medium">{capitalize(a.kind)}</span>
                      {a.detail && a.kind !== "updated" ? <span className="text-muted-foreground"> · {a.detail}</span> : null}
                      <span className="text-muted-foreground">
                        {" "}· via {SOURCE_LABEL[a.source]} ·{" "}
                        {new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex items-center justify-between border-t px-6 py-4">
              <Button variant="ghost" size="sm" onClick={remove} disabled={pending} className="text-destructive hover:text-destructive">
                <Trash2 /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" onClick={save} disabled={pending || !draft.title.trim()}>Save changes</Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
