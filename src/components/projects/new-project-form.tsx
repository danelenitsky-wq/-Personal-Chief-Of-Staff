"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { createProjectAction } from "@/app/actions/projects";

export function NewProjectForm({ lifeAreas }: { lifeAreas: string[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", goal: "", lifeArea: "", deadline: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus /> New project
      </Button>
    );
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = () =>
    startTransition(async () => {
      const r = await createProjectAction({
        name: form.name,
        goal: form.goal || null,
        lifeArea: form.lifeArea || null,
        deadline: form.deadline || null,
      });
      if (!r.ok) return setError(r.error);
      setForm({ name: "", goal: "", lifeArea: "", deadline: "" });
      setOpen(false);
    });

  return (
    <Card className="w-full space-y-3 p-4 sm:w-[28rem]">
      <div className="space-y-1.5">
        <Label>Project</Label>
        <Input autoFocus value={form.name} onChange={set("name")} placeholder="e.g. Organize finances" />
      </div>
      <div className="space-y-1.5">
        <Label>Goal</Label>
        <Input value={form.goal} onChange={set("goal")} placeholder="What does done look like?" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Life area</Label>
          <NativeSelect value={form.lifeArea} onChange={set("lifeArea")}>
            <option value="">None</option>
            {lifeAreas.map((a) => <option key={a}>{a}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label>Deadline</Label>
          <Input type="date" value={form.deadline} onChange={set("deadline")} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={pending || !form.name.trim()}>Create project</Button>
      </div>
    </Card>
  );
}
