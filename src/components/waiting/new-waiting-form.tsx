"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWaitingForAction } from "@/app/actions/waiting";

export function NewWaitingForm() {
  const [form, setForm] = useState({ person: "", topic: "", expectedBy: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await createWaitingForAction({ ...form, expectedBy: form.expectedBy || null });
          if (!r.ok) return setError(r.error);
          setError(null);
          setForm({ person: "", topic: "", expectedBy: "" });
        });
      }}
    >
      <Input value={form.person} onChange={set("person")} placeholder="Who? e.g. Danny" className="sm:w-40" aria-label="Person" />
      <Input value={form.topic} onChange={set("topic")} placeholder="What for? e.g. contract feedback" className="flex-1" aria-label="Topic" />
      <Input type="date" value={form.expectedBy} onChange={set("expectedBy")} className="sm:w-40" aria-label="Expected by" />
      <Button type="submit" disabled={pending || !form.person.trim() || !form.topic.trim()}>
        <Plus /> Add
      </Button>
      {error && <p className="text-sm text-destructive sm:self-center">{error}</p>}
    </form>
  );
}
