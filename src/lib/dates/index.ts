/**
 * Date helpers. All "calendar day" values are plain YYYY-MM-DD strings that
 * are interpreted in the user's timezone; timestamps are ISO strings (UTC).
 */
import { formatInTimeZone } from "date-fns-tz";

export type DayString = string; // YYYY-MM-DD

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayString(value: string): boolean {
  return DAY_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Today's calendar date in the given timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): DayString {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

/** Current HH:mm in the given timezone. */
export function nowTimeIn(timeZone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timeZone, "HH:mm");
}

/** Pure day arithmetic on YYYY-MM-DD strings (no timezone involved). */
export function addDays(day: DayString, days: number): DayString {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(day: DayString): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export function diffInDays(from: DayString, to: DayString): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function startOfWeek(day: DayString, weekStartsOn: 0 | 1): DayString {
  const offset = (weekdayOf(day) - weekStartsOn + 7) % 7;
  return addDays(day, -offset);
}

export function weekDays(day: DayString, weekStartsOn: 0 | 1): DayString[] {
  const start = startOfWeek(day, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export type ResolvedDate = { date: DayString; time?: string };

export type ResolveOptions = {
  timeZone: string;
  now?: Date;
  weekStartsOn?: 0 | 1;
};

/**
 * Resolve a relative date phrase ("tomorrow", "Sunday", "next week",
 * "end of week", "in two weeks", "tonight") to an absolute day in the
 * user's timezone. Returns null when the phrase is not recognised, so the
 * caller never invents a deadline.
 */
export function resolveRelativeDate(
  phrase: string,
  { timeZone, now = new Date(), weekStartsOn = 0 }: ResolveOptions,
): ResolvedDate | null {
  const text = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  const today = todayIn(timeZone, now);

  if (isDayString(text)) return { date: text };
  if (text === "today") return { date: today };
  if (text === "tonight") return { date: today, time: "20:00" };
  if (text === "tomorrow") return { date: addDays(today, 1) };
  if (text === "day after tomorrow") return { date: addDays(today, 2) };

  if (text === "next week") {
    return { date: addDays(startOfWeek(today, weekStartsOn), 7) };
  }

  if (text === "end of week" || text === "end of the week" || text === "this week") {
    // Last working day of the current week: Thursday for Sunday-start weeks,
    // Friday for Monday-start weeks.
    const lastWorkday = addDays(startOfWeek(today, weekStartsOn), 4);
    return { date: lastWorkday < today ? today : lastWorkday };
  }

  const inMatch = text.match(/^in (\d+|[a-z]+) (day|days|week|weeks)$/);
  if (inMatch) {
    const raw = inMatch[1];
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    if (!n) return null;
    const perUnit = inMatch[2].startsWith("week") ? 7 : 1;
    return { date: addDays(today, n * perUnit) };
  }

  const weekdayMatch = text.match(/^(next |this |on )?([a-z]+)$/);
  if (weekdayMatch) {
    const index = WEEKDAYS.indexOf(weekdayMatch[2]);
    if (index === -1) return null;
    const current = weekdayOf(today);
    // "Sunday" means the next Sunday; if today is Sunday, a week from today.
    let delta = (index - current + 7) % 7;
    // "next Monday" is treated the same as "Monday" (the coming one).
    if (delta === 0) delta = 7;
    return { date: addDays(today, delta) };
  }

  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today", "Tomorrow", "Yesterday", "Mon", or "Sep 29". */
export function formatDayLabel(day: DayString, today: DayString): string {
  const diff = diffInDays(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return WEEKDAY_SHORT[weekdayOf(day)];
  return formatShortDate(day);
}

export function formatShortDate(day: DayString): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function formatWeekdayShort(day: DayString): string {
  return WEEKDAY_SHORT[weekdayOf(day)];
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** HH:mm of an ISO timestamp in the given timezone. */
export function timeOfIso(iso: string, timeZone: string): string {
  return formatInTimeZone(new Date(iso), timeZone, "HH:mm");
}

/** Calendar day of an ISO timestamp in the given timezone. */
export function dayOfIso(iso: string, timeZone: string): DayString {
  return formatInTimeZone(new Date(iso), timeZone, "yyyy-MM-dd");
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
