import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  calculateNextSendTime,
  calculateEmail1SendTime,
  calculateEmail2SendTime,
  calculateEmail3SendTime,
  batchCalculateSendTimes,
} from "../calculator";
import { isBusinessHour } from "../business-hours";

describe("calculateNextSendTime", () => {
  beforeEach(() => {
    // Fix date to Monday 17 Mar 2025 10:00 Perth (02:00 UTC)
    vi.useFakeTimers();
    const monday10amPerth = fromZonedTime(new Date(2025, 2, 17, 10, 0, 0), "Australia/Perth");
    vi.setSystemTime(monday10amPerth);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a date during business hours for default timezone", () => {
    const contact = { timezone: "Australia/Perth" };
    const result = calculateNextSendTime(contact, 0, false);
    expect(isBusinessHour(result, "Australia/Perth")).toBe(true);
  });

  it("respects delay days", () => {
    const contact = { timezone: "Australia/Perth" };
    const result = calculateNextSendTime(contact, 2, false);
    const now = new Date();
    const diffDays = (result.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    // Should be at least 2 days out
    expect(diffDays).toBeGreaterThanOrEqual(1.9);
  });

  it("skips weekends when delay lands on Saturday", () => {
    // Set time to Friday 21 Mar 2025 10:00 Perth
    const friday = fromZonedTime(new Date(2025, 2, 21, 10, 0, 0), "Australia/Perth");
    vi.setSystemTime(friday);

    const contact = { timezone: "Australia/Perth" };
    // 1 day delay from Friday = Saturday → should move to Monday
    const result = calculateNextSendTime(contact, 1, false);
    expect(isBusinessHour(result, "Australia/Perth")).toBe(true);

    const zonedResult = toZonedTime(result, "Australia/Perth");
    // Day 1 = Monday (should not be Saturday=6 or Sunday=0)
    expect(zonedResult.getDay()).not.toBe(0);
    expect(zonedResult.getDay()).not.toBe(6);
  });

  it("uses default timezone when contact has no timezone", () => {
    const contact = { timezone: null };
    const result = calculateNextSendTime(contact, 0, false);
    // Default is Australia/Perth; should be in business hours there
    expect(isBusinessHour(result, "Australia/Perth")).toBe(true);
  });

  it("handles America/New_York timezone", () => {
    const contact = { timezone: "America/New_York" };
    const result = calculateNextSendTime(contact, 0, false);
    expect(isBusinessHour(result, "America/New_York")).toBe(true);
  });

  it("result remains in business hours with random offset", () => {
    const contact = { timezone: "Australia/Perth" };
    // Run multiple times to catch randomness edge cases
    for (let i = 0; i < 10; i++) {
      const result = calculateNextSendTime(contact, 0, true);
      expect(isBusinessHour(result, "Australia/Perth")).toBe(true);
    }
  });
});

describe("calculateEmail1SendTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const monday10amPerth = fromZonedTime(new Date(2025, 2, 17, 10, 0, 0), "Australia/Perth");
    vi.setSystemTime(monday10amPerth);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends during business hours with zero delay", () => {
    const contact = { timezone: "Australia/Perth" };
    const result = calculateEmail1SendTime(contact, false);
    expect(isBusinessHour(result, "Australia/Perth")).toBe(true);
  });
});

describe("calculateEmail2SendTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const monday10amPerth = fromZonedTime(new Date(2025, 2, 17, 10, 0, 0), "Australia/Perth");
    vi.setSystemTime(monday10amPerth);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to 2 day delay", () => {
    const contact = { timezone: "Australia/Perth" };
    const result = calculateEmail2SendTime(contact, 2, false);
    const now = new Date();
    const diffDays = (result.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(1.9);
  });
});

describe("calculateEmail3SendTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const monday10amPerth = fromZonedTime(new Date(2025, 2, 17, 10, 0, 0), "Australia/Perth");
    vi.setSystemTime(monday10amPerth);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to 5 day delay from now", () => {
    const contact = { timezone: "Australia/Perth" };
    const result = calculateEmail3SendTime(contact, 5, false);
    const now = new Date();
    const diffDays = (result.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    // Delay = 5, but weekends may push it further
    expect(diffDays).toBeGreaterThanOrEqual(4.9);
  });

  it("accepts custom delay", () => {
    const contact = { timezone: "Australia/Perth" };
    const result = calculateEmail3SendTime(contact, 3, false);
    const now = new Date();
    const diffDays = (result.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    // Delay = 3
    expect(diffDays).toBeGreaterThanOrEqual(2.9);
  });
});

describe("batchCalculateSendTimes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const monday10amPerth = fromZonedTime(new Date(2025, 2, 17, 10, 0, 0), "Australia/Perth");
    vi.setSystemTime(monday10amPerth);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a map with entry for each contact", () => {
    const contacts = [
      { id: "c1", timezone: "Australia/Perth" },
      { id: "c2", timezone: "America/New_York" },
      { id: "c3", timezone: null },
    ];
    const result = batchCalculateSendTimes(contacts, 1);
    expect(result.size).toBe(3);
    expect(result.has("c1")).toBe(true);
    expect(result.has("c2")).toBe(true);
    expect(result.has("c3")).toBe(true);
  });

  it("each entry is a valid Date", () => {
    const contacts = [{ id: "c1", timezone: "Australia/Perth" }];
    const result = batchCalculateSendTimes(contacts, 0);
    const date = result.get("c1");
    expect(date).toBeInstanceOf(Date);
    expect(isNaN(date!.getTime())).toBe(false);
  });
});
