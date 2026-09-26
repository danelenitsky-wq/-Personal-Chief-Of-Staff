/** Short, WhatsApp-style phrasing shared by both responders. */
import { diffInDays, formatShortDate, weekdayOf } from "@/lib/dates";
import type { TaskSummary } from "./tools";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "today", "tomorrow", "Sunday" (within a week) or "Oct 12". */
export function dayPhrase(day: string, today: string): string {
  const diff = diffInDays(today, day);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 1 && diff < 7) return WEEKDAYS[weekdayOf(day)];
  return formatShortDate(day);
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function taskLine(t: TaskSummary, today: string, withDay = false): string {
  const bits: string[] = [];
  if (t.dueTime) bits.push(t.dueTime);
  const day = t.plannedDate ?? t.dueDate;
  if (withDay && day) bits.push(dayPhrase(day, today));
  if (t.dueDate && t.dueDate < today) bits.push("overdue");
  return `• ${t.title}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

export function whichOne(tasks: TaskSummary[], today: string): string {
  const lines = tasks.map((t, i) => {
    const day = t.dueDate ?? t.plannedDate;
    return `${i + 1}. ${t.title}${day ? ` (${dayPhrase(day, today)})` : ""}`;
  });
  return `Which one?\n${lines.join("\n")}`;
}
