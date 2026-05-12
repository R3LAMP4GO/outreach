import { describe, it, expect } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  isBusinessHour,
  getNextBusinessHour,
  addRandomOffset,
  scheduleToBusinessHours,
} from "../business-hours";

/**
 * Helper: create a Date that represents a specific local time in a timezone.
 * e.g. makeDate("Australia/Perth", 2025, 3, 17, 10, 0) → UTC Date for Mon 17 Mar 2025 10:00 Perth
 */
function makeDate(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0,
): Date {
  return fromZonedTime(new Date(year, month - 1, day, hour, minute, 0), tz);
}

describe("isBusinessHour", () => {
  describe("Australia/Perth timezone", () => {
    const tz = "Australia/Perth";

    it("returns true for Monday 10am", () => {
      // Mon 17 Mar 2025, 10:00 Perth
      const date = makeDate(tz, 2025, 3, 17, 10, 0);
      expect(isBusinessHour(date, tz)).toBe(true);
    });

    it("returns false for Saturday", () => {
      // Sat 22 Mar 2025, 10:00 Perth
      const date = makeDate(tz, 2025, 3, 22, 10, 0);
      expect(isBusinessHour(date, tz)).toBe(false);
    });

    it("returns false for Sunday", () => {
      // Sun 23 Mar 2025, 10:00 Perth
      const date = makeDate(tz, 2025, 3, 23, 10, 0);
      expect(isBusinessHour(date, tz)).toBe(false);
    });

    it("returns false for 8:59am (before business hours)", () => {
      const date = makeDate(tz, 2025, 3, 17, 8, 59);
      expect(isBusinessHour(date, tz)).toBe(false);
    });

    it("returns false for 5:01pm (after business hours)", () => {
      // 17:01 is >= end (17), so false
      const date = makeDate(tz, 2025, 3, 17, 17, 1);
      expect(isBusinessHour(date, tz)).toBe(false);
    });

    it("returns true for exactly 9:00am", () => {
      const date = makeDate(tz, 2025, 3, 17, 9, 0);
      expect(isBusinessHour(date, tz)).toBe(true);
    });

    it("returns true for 4:59pm (last minute of business hours)", () => {
      const date = makeDate(tz, 2025, 3, 17, 16, 59);
      expect(isBusinessHour(date, tz)).toBe(true);
    });

    it("returns false for exactly 5:00pm (end boundary is exclusive)", () => {
      const date = makeDate(tz, 2025, 3, 17, 17, 0);
      expect(isBusinessHour(date, tz)).toBe(false);
    });
  });

  describe("America/New_York timezone", () => {
    const tz = "America/New_York";

    it("returns true for Tuesday 12pm ET", () => {
      const date = makeDate(tz, 2025, 3, 18, 12, 0);
      expect(isBusinessHour(date, tz)).toBe(true);
    });

    it("returns false for Saturday in New York", () => {
      const date = makeDate(tz, 2025, 3, 22, 10, 0);
      expect(isBusinessHour(date, tz)).toBe(false);
    });

    it("returns false for 7am ET (too early)", () => {
      const date = makeDate(tz, 2025, 3, 18, 7, 0);
      expect(isBusinessHour(date, tz)).toBe(false);
    });
  });

  describe("Europe/London timezone", () => {
    const tz = "Europe/London";

    it("returns true for Wednesday 14:00 London", () => {
      const date = makeDate(tz, 2025, 3, 19, 14, 0);
      expect(isBusinessHour(date, tz)).toBe(true);
    });

    it("returns false for Sunday in London", () => {
      const date = makeDate(tz, 2025, 3, 23, 11, 0);
      expect(isBusinessHour(date, tz)).toBe(false);
    });
  });

  describe("custom config", () => {
    it("uses custom business hours config", () => {
      const config = { start: 10, end: 16, days: [1, 2, 3, 4, 5] };
      const tz = "Australia/Perth";
      // 9am is before custom start of 10
      const date = makeDate(tz, 2025, 3, 17, 9, 0);
      expect(isBusinessHour(date, tz, config)).toBe(false);

      // 10am is at custom start
      const date2 = makeDate(tz, 2025, 3, 17, 10, 0);
      expect(isBusinessHour(date2, tz, config)).toBe(true);
    });
  });
});

describe("getNextBusinessHour", () => {
  it("returns same date if already in business hours", () => {
    const tz = "Australia/Perth";
    // Mon 10am Perth
    const date = makeDate(tz, 2025, 3, 17, 10, 0);
    const result = getNextBusinessHour(date, tz);
    expect(result.getTime()).toBe(date.getTime());
  });

  it("advances Saturday to Monday 9am", () => {
    const tz = "Australia/Perth";
    // Sat 22 Mar 2025 10:00 Perth
    const date = makeDate(tz, 2025, 3, 22, 10, 0);
    const result = getNextBusinessHour(date, tz);

    // Should be Monday 24 Mar 2025 09:00 Perth
    expect(isBusinessHour(result, tz)).toBe(true);
    // Verify it's the correct Monday
    const expected = makeDate(tz, 2025, 3, 24, 9, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("advances Sunday to Monday 9am", () => {
    const tz = "Australia/Perth";
    // Sun 23 Mar 2025 14:00 Perth
    const date = makeDate(tz, 2025, 3, 23, 14, 0);
    const result = getNextBusinessHour(date, tz);

    const expected = makeDate(tz, 2025, 3, 24, 9, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("advances evening to next day 9am", () => {
    const tz = "Australia/Perth";
    // Mon 17 Mar 2025 20:00 Perth (8pm, after business hours)
    const date = makeDate(tz, 2025, 3, 17, 20, 0);
    const result = getNextBusinessHour(date, tz);

    // Should be Tue 18 Mar 2025 09:00 Perth
    const expected = makeDate(tz, 2025, 3, 18, 9, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("advances early morning to 9am same day", () => {
    const tz = "Australia/Perth";
    // Mon 17 Mar 2025 06:00 Perth
    const date = makeDate(tz, 2025, 3, 17, 6, 0);
    const result = getNextBusinessHour(date, tz);

    const expected = makeDate(tz, 2025, 3, 17, 9, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("works with America/New_York timezone", () => {
    const tz = "America/New_York";
    // Sat 22 Mar 2025 12:00 ET
    const date = makeDate(tz, 2025, 3, 22, 12, 0);
    const result = getNextBusinessHour(date, tz);
    expect(isBusinessHour(result, tz)).toBe(true);
  });

  it("advances Friday evening to Monday 9am", () => {
    const tz = "Australia/Perth";
    // Fri 21 Mar 2025 18:00 Perth
    const date = makeDate(tz, 2025, 3, 21, 18, 0);
    const result = getNextBusinessHour(date, tz);

    const expected = makeDate(tz, 2025, 3, 24, 9, 0);
    expect(result.getTime()).toBe(expected.getTime());
  });
});

describe("addRandomOffset", () => {
  it("returns a date within the specified range", () => {
    const date = new Date("2025-03-17T10:00:00Z");
    const result = addRandomOffset(date, 30);
    const diffMinutes = (result.getTime() - date.getTime()) / (1000 * 60);
    expect(diffMinutes).toBeGreaterThanOrEqual(0);
    expect(diffMinutes).toBeLessThan(30);
  });

  it("does not mutate the original date", () => {
    const date = new Date("2025-03-17T10:00:00Z");
    const original = date.getTime();
    addRandomOffset(date, 60);
    expect(date.getTime()).toBe(original);
  });
});

describe("scheduleToBusinessHours", () => {
  it("parses half-hour time windows correctly", () => {
    const config = scheduleToBusinessHours({
      send_days: ["Monday", "Tuesday"],
      send_window_start: "09:30",
      send_window_end: "16:30",
    });
    expect(config.start).toBe(9.5);
    expect(config.end).toBe(16.5);
    expect(config.days).toEqual([1, 2]);
  });

  it("parses whole-hour time windows correctly", () => {
    const config = scheduleToBusinessHours({
      send_days: ["Monday"],
      send_window_start: "09:00",
      send_window_end: "17:00",
    });
    expect(config.start).toBe(9);
    expect(config.end).toBe(17);
  });
});

describe("half-hour precision", () => {
  const tz = "Australia/Perth";
  // 09:30 - 16:30, Mon-Fri
  const halfHourConfig = { start: 9.5, end: 16.5, days: [1, 2, 3, 4, 5] };

  describe("isBusinessHour with fractional hours", () => {
    it("returns true for 10:00 (within 09:30-16:30)", () => {
      const date = makeDate(tz, 2025, 3, 17, 10, 0);
      expect(isBusinessHour(date, tz, halfHourConfig)).toBe(true);
    });

    it("returns false for 09:00 (before 09:30 start)", () => {
      const date = makeDate(tz, 2025, 3, 17, 9, 0);
      expect(isBusinessHour(date, tz, halfHourConfig)).toBe(false);
    });

    it("returns false for 09:15 (before 09:30 start)", () => {
      const date = makeDate(tz, 2025, 3, 17, 9, 15);
      expect(isBusinessHour(date, tz, halfHourConfig)).toBe(false);
    });

    it("returns true for exactly 09:30 (start boundary inclusive)", () => {
      const date = makeDate(tz, 2025, 3, 17, 9, 30);
      expect(isBusinessHour(date, tz, halfHourConfig)).toBe(true);
    });

    it("returns true for 16:29 (last minute before end)", () => {
      const date = makeDate(tz, 2025, 3, 17, 16, 29);
      expect(isBusinessHour(date, tz, halfHourConfig)).toBe(true);
    });

    it("returns false for 16:30 (end boundary exclusive)", () => {
      const date = makeDate(tz, 2025, 3, 17, 16, 30);
      expect(isBusinessHour(date, tz, halfHourConfig)).toBe(false);
    });
  });

  describe("getNextBusinessHour with fractional hours", () => {
    it("advances 09:00 to 09:30 on same day", () => {
      const date = makeDate(tz, 2025, 3, 17, 9, 0);
      const result = getNextBusinessHour(date, tz, halfHourConfig);
      const expected = makeDate(tz, 2025, 3, 17, 9, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("advances Saturday to Monday 09:30", () => {
      const date = makeDate(tz, 2025, 3, 22, 10, 0);
      const result = getNextBusinessHour(date, tz, halfHourConfig);
      const expected = makeDate(tz, 2025, 3, 24, 9, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("returns same date if already within half-hour window", () => {
      const date = makeDate(tz, 2025, 3, 17, 12, 0);
      const result = getNextBusinessHour(date, tz, halfHourConfig);
      expect(result.getTime()).toBe(date.getTime());
    });
  });
});
