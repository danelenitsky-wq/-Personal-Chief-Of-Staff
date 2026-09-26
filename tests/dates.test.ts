import { describe, expect, it } from "vitest";
import { addDays, resolveRelativeDate, startOfWeek, todayIn, formatDayLabel } from "@/lib/dates";

// Wednesday 2026-09-23, 23:30 in Jerusalem but still 20:30 UTC.
const LATE_EVENING = new Date("2026-09-23T20:30:00Z");
const tz = "Asia/Jerusalem";
const opts = { timeZone: tz, now: LATE_EVENING };

describe("relative date parsing", () => {
  it("resolves today and tomorrow in the user's timezone, not UTC", () => {
    expect(todayIn(tz, LATE_EVENING)).toBe("2026-09-23");
    // 01:30 on the 24th in Jerusalem while UTC still says the 23rd
    const afterMidnight = new Date("2026-09-23T22:30:00Z");
    expect(resolveRelativeDate("today", { timeZone: tz, now: afterMidnight })).toEqual({ date: "2026-09-24" });
    expect(resolveRelativeDate("today", { timeZone: "UTC", now: afterMidnight })).toEqual({ date: "2026-09-23" });
    expect(resolveRelativeDate("Tomorrow", opts)).toEqual({ date: "2026-09-24" });
  });

  it("gives tonight an evening time", () => {
    expect(resolveRelativeDate("tonight", opts)).toEqual({ date: "2026-09-23", time: "20:00" });
  });

  it("resolves weekday names to the coming occurrence", () => {
    expect(resolveRelativeDate("Sunday", opts)).toEqual({ date: "2026-09-27" });
    expect(resolveRelativeDate("friday", opts)).toEqual({ date: "2026-09-25" });
    // Saying "Wednesday" on a Wednesday means next week's.
    expect(resolveRelativeDate("wednesday", opts)).toEqual({ date: "2026-09-30" });
    expect(resolveRelativeDate("next monday", opts)).toEqual({ date: "2026-09-28" });
  });

  it("resolves next week and end of week with the user's week start", () => {
    expect(resolveRelativeDate("next week", { ...opts, weekStartsOn: 0 })).toEqual({ date: "2026-09-27" });
    expect(resolveRelativeDate("next week", { ...opts, weekStartsOn: 1 })).toEqual({ date: "2026-09-28" });
    expect(resolveRelativeDate("end of week", { ...opts, weekStartsOn: 0 })).toEqual({ date: "2026-09-24" });
    expect(resolveRelativeDate("end of week", { ...opts, weekStartsOn: 1 })).toEqual({ date: "2026-09-25" });
  });

  it("resolves 'in N days/weeks' with words or digits", () => {
    expect(resolveRelativeDate("in two weeks", opts)).toEqual({ date: "2026-10-07" });
    expect(resolveRelativeDate("in 3 days", opts)).toEqual({ date: "2026-09-26" });
    expect(resolveRelativeDate("in a week", opts)).toEqual({ date: "2026-09-30" });
  });

  it("returns null instead of inventing a date", () => {
    expect(resolveRelativeDate("soonish", opts)).toBeNull();
    expect(resolveRelativeDate("in many weeks", opts)).toBeNull();
  });

  it("does day arithmetic across month boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(startOfWeek("2026-09-23", 0)).toBe("2026-09-20");
    expect(startOfWeek("2026-09-23", 1)).toBe("2026-09-21");
    expect(formatDayLabel("2026-09-24", "2026-09-23")).toBe("Tomorrow");
    expect(formatDayLabel("2026-10-15", "2026-09-23")).toBe("Oct 15");
  });
});
