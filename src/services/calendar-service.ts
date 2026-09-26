/**
 * Calendar access. Phase 5 adds a Google Calendar provider; until then a
 * deterministic mock provider supplies a realistic week of events.
 */
import { fromZonedTime } from "date-fns-tz";
import type { CalendarEvent, UserProfile } from "@/types/domain";
import { addDays, dayOfIso, timeOfIso, timeToMinutes, weekdayOf } from "@/lib/dates";

export interface CalendarProvider {
  listEvents(userId: string, fromDay: string, toDay: string, timeZone: string): Promise<CalendarEvent[]>;
}

type Template = { title: string; start: string; end: string; location?: string };

/** Recurring weekly pattern keyed by weekday (0 = Sunday). */
const MOCK_WEEK: Record<number, Template[]> = {
  0: [
    { title: "Team standup", start: "09:00", end: "09:30" },
    { title: "Product review", start: "14:00", end: "15:00", location: "Zoom" },
  ],
  1: [
    { title: "Team standup", start: "09:00", end: "09:30" },
    { title: "1:1 with Ozi", start: "12:00", end: "12:45" },
    { title: "Lunch with Noa", start: "13:00", end: "14:00", location: "Port Sa'id" },
  ],
  2: [
    { title: "Team standup", start: "09:00", end: "09:30" },
    { title: "Client workshop", start: "10:00", end: "12:30", location: "Office, room 4" },
    { title: "Physio", start: "17:00", end: "17:45" },
  ],
  3: [
    { title: "Team standup", start: "09:00", end: "09:30" },
    { title: "Planning session", start: "15:00", end: "16:00" },
  ],
  4: [
    { title: "Team standup", start: "09:00", end: "09:30" },
    { title: "Investor update call", start: "11:00", end: "11:30" },
    { title: "Weekly retro", start: "16:00", end: "16:45" },
  ],
  5: [{ title: "Family dinner", start: "19:30", end: "22:00", location: "Mom's" }],
  6: [],
};

export const mockCalendarProvider: CalendarProvider = {
  async listEvents(_userId, fromDay, toDay, timeZone) {
    const events: CalendarEvent[] = [];
    for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
      for (const t of MOCK_WEEK[weekdayOf(day)]) {
        events.push({
          id: `mock-${day}-${t.start}`,
          title: t.title,
          start: fromZonedTime(`${day}T${t.start}:00`, timeZone).toISOString(),
          end: fromZonedTime(`${day}T${t.end}:00`, timeZone).toISOString(),
          location: t.location ?? null,
        });
      }
    }
    return events;
  },
};

export function createCalendarService(provider: CalendarProvider = mockCalendarProvider) {
  return {
    async getEvents(userId: string, profile: UserProfile, fromDay: string, toDay: string) {
      const events = await provider.listEvents(userId, fromDay, toDay, profile.timezone);
      return events.sort((a, b) => a.start.localeCompare(b.start));
    },

    async getDayAvailability(userId: string, profile: UserProfile, day: string) {
      const events = await provider.listEvents(userId, day, day, profile.timezone);
      return {
        events: events.sort((a, b) => a.start.localeCompare(b.start)),
        freeMinutes: freeMinutesInWorkingHours(events, day, profile),
      };
    },
  };
}

/** Minutes inside working hours on `day` not covered by any event. */
export function freeMinutesInWorkingHours(
  events: CalendarEvent[],
  day: string,
  profile: Pick<UserProfile, "timezone" | "workingHoursStart" | "workingHoursEnd">,
  fromTime?: string,
): number {
  const workStart = timeToMinutes(profile.workingHoursStart ?? "09:00");
  const workEnd = timeToMinutes(profile.workingHoursEnd ?? "18:00");
  const start = Math.max(workStart, fromTime ? timeToMinutes(fromTime) : 0);
  if (start >= workEnd) return 0;

  const busy = events
    .filter((e) => !e.allDay && dayOfIso(e.start, profile.timezone) === day)
    .map((e) => [timeToMinutes(timeOfIso(e.start, profile.timezone)), timeToMinutes(timeOfIso(e.end, profile.timezone)) || 24 * 60] as const)
    .map(([s, e]) => [Math.max(s, start), Math.min(e, workEnd)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  let covered = 0;
  let cursor = start;
  for (const [s, e] of busy) {
    if (e <= cursor) continue;
    covered += e - Math.max(s, cursor);
    cursor = e;
  }
  return workEnd - start - covered;
}

export type CalendarService = ReturnType<typeof createCalendarService>;
