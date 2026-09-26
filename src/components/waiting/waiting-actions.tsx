"use client";

import { useState, useTransition } from "react";
import { BellPlus, Check, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createFollowUpAction, markRepliedAction, remindTomorrowAction } from "@/app/actions/waiting";

export function WaitingActions({ id, compact = false }: { id: string; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const r = await fn();
      setNote(r.ok ? success : (r.error ?? "Failed"));
    });

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="xs" variant="outline" disabled={pending} onClick={() => act(() => markRepliedAction(id), "Marked replied")}>
        <Check /> {compact ? "Replied" : "Mark replied"}
      </Button>
      {!compact && (
        <>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => act(() => createFollowUpAction(id), "Follow-up task added for today")}>
            <ListPlus /> Follow-up task
          </Button>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => act(() => remindTomorrowAction(id), "Reminder set for tomorrow morning")}>
            <BellPlus /> Remind tomorrow
          </Button>
        </>
      )}
      {note && <span className="ml-1 text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}
