"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskAction } from "@/app/actions/tasks";
import type { CreateTaskInput } from "@/lib/validation/schemas";
import type { Task } from "@/types/domain";

/**
 * One-line capture. Checks for likely duplicates first and asks before
 * creating another, the same rule the WhatsApp agent will follow.
 */
export function QuickAdd({ defaults, placeholder }: { defaults?: Partial<CreateTaskInput>; placeholder?: string }) {
  const [title, setTitle] = useState("");
  const [duplicates, setDuplicates] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (allowDuplicate: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await createTaskAction({ ...defaults, title }, allowDuplicate);
      if (!result.ok) return setError(result.error);
      if (!result.data.ok) return setDuplicates(result.data.duplicates);
      setDuplicates(null);
      setTitle("");
    });

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) submit(false);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Plus className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDuplicates(null);
            }}
            placeholder={placeholder ?? "Add a task…"}
            className="h-10 pl-9"
            aria-label="New task title"
          />
        </div>
        <Button type="submit" disabled={pending || !title.trim()} className="h-10">
          Add
        </Button>
      </form>
      {duplicates && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <span>
            You already have: <strong className="font-medium">{duplicates[0].title}</strong>
          </span>
          <span className="ml-auto flex gap-1">
            <Button size="xs" variant="outline" onClick={() => { setDuplicates(null); setTitle(""); }}>
              Keep existing
            </Button>
            <Button size="xs" onClick={() => submit(true)} disabled={pending}>
              Create another
            </Button>
          </span>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
