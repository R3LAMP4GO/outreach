// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — test mocks need updating to use Drizzle
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module
// ---------------------------------------------------------------------------

const mockSendEmail = vi.fn();

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockSendEmail };
  },
}));

// ---------------------------------------------------------------------------
// Mock @/lib/db — intercept Drizzle query builder calls
// ---------------------------------------------------------------------------

// We need to mock the db object so that the chained Drizzle API resolves
// to our test data. The notifications module uses:
//   db.select({...}).from(table).limit(1)        -> returns [adminUser]
//   db.select({...}).from(table).where(...).limit(1) -> returns [settings]

let _selectResults: unknown[][] = [];
let _selectCallIndex = 0;

const mockDbSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

function resetSelectChain() {
  _selectCallIndex = 0;

  mockLimit.mockImplementation(() => {
    const result = _selectResults[_selectCallIndex] ?? [];
    _selectCallIndex++;
    return Promise.resolve(result);
  });

  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ limit: mockLimit, where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
}

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

import {
  notifyNewContact,
  notifyNewSubscriber,
  notifyNewsletterReminder,
  isLastDayOfMonth,
} from "../notifications";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  _selectResults = [];
  resetSelectChain();
  mockSendEmail.mockResolvedValue({ id: "email-1" });

  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("DEFAULT_FROM_EMAIL", "test@example.com");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

// ---------------------------------------------------------------------------
// Helper to configure admin settings mock
// ---------------------------------------------------------------------------

function mockAdminSettings(settings: {
  notification_email: string | null;
  notify_new_contact: boolean;
  notify_new_subscriber: boolean;
}) {
  // First select: admin_users -> [{ id: "admin-1" }]
  // Second select: admin_settings -> [{ notificationEmail, notifyNewContact, notifyNewSubscriber }]
  _selectResults = [
    [{ id: "admin-1" }],
    [
      {
        notificationEmail: settings.notification_email,
        notifyNewContact: settings.notify_new_contact,
        notifyNewSubscriber: settings.notify_new_subscriber,
      },
    ],
  ];
  resetSelectChain();
}

// ---------------------------------------------------------------------------
// notifyNewContact
// ---------------------------------------------------------------------------

describe("notifyNewContact", () => {
  const contactData = {
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@example.com",
    mobile: "555-1234",
    businessName: "Acme",
    notes: "Interested in services",
    submissionId: "sub-1",
  };

  it("sends email when notifications are enabled", async () => {
    mockAdminSettings({
      notification_email: "admin@example.com",
      notify_new_contact: true,
      notify_new_subscriber: true,
    });

    const result = await notifyNewContact(contactData);

    expect(result).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: "New Contact: Alice Smith",
      }),
    );
  });

  it("returns false when notifications disabled", async () => {
    mockAdminSettings({
      notification_email: "admin@example.com",
      notify_new_contact: false,
      notify_new_subscriber: true,
    });

    const result = await notifyNewContact(contactData);

    expect(result).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns false when no notification email configured", async () => {
    mockAdminSettings({
      notification_email: null,
      notify_new_contact: true,
      notify_new_subscriber: true,
    });

    const result = await notifyNewContact(contactData);

    expect(result).toBe(false);
  });

  it("returns false when no admin user found", async () => {
    // First select returns empty array (no admin user)
    _selectResults = [[]];
    resetSelectChain();

    const result = await notifyNewContact(contactData);

    expect(result).toBe(false);
  });

  it("returns false when RESEND_API_KEY not set", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    // process.env.RESEND_API_KEY is checked as truthy
    delete (process.env as Record<string, string | undefined>).RESEND_API_KEY;

    mockAdminSettings({
      notification_email: "admin@example.com",
      notify_new_contact: true,
      notify_new_subscriber: true,
    });

    const result = await notifyNewContact(contactData);

    expect(result).toBe(false);
  });

  it("returns false when email sending fails", async () => {
    mockAdminSettings({
      notification_email: "admin@example.com",
      notify_new_contact: true,
      notify_new_subscriber: true,
    });
    mockSendEmail.mockRejectedValue(new Error("Resend error"));

    const result = await notifyNewContact(contactData);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// notifyNewSubscriber
// ---------------------------------------------------------------------------

describe("notifyNewSubscriber", () => {
  const subData = {
    email: "subscriber@example.com",
    source: "homepage",
    subscriberId: "sub-1",
  };

  it("sends subscriber notification email", async () => {
    mockAdminSettings({
      notification_email: "admin@example.com",
      notify_new_contact: true,
      notify_new_subscriber: true,
    });

    const result = await notifyNewSubscriber(subData);

    expect(result).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: "New Subscriber: subscriber@example.com",
      }),
    );
  });

  it("returns false when subscriber notifications disabled", async () => {
    mockAdminSettings({
      notification_email: "admin@example.com",
      notify_new_contact: true,
      notify_new_subscriber: false,
    });

    const result = await notifyNewSubscriber(subData);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// notifyNewsletterReminder
// ---------------------------------------------------------------------------

describe("notifyNewsletterReminder", () => {
  it("sends reminder when email configured", async () => {
    mockAdminSettings({
      notification_email: "admin@example.com",
      notify_new_contact: true,
      notify_new_subscriber: true,
    });

    const result = await notifyNewsletterReminder();

    expect(result).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: expect.stringContaining("newsletter"),
      }),
    );
  });

  it("returns false when no email configured", async () => {
    mockAdminSettings({
      notification_email: null,
      notify_new_contact: true,
      notify_new_subscriber: true,
    });

    const result = await notifyNewsletterReminder();

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLastDayOfMonth
// ---------------------------------------------------------------------------

describe("isLastDayOfMonth", () => {
  it("returns true on January 31st", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 31)); // Jan 31

    expect(isLastDayOfMonth()).toBe(true);

    vi.useRealTimers();
  });

  it("returns false on January 30th", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 30)); // Jan 30

    expect(isLastDayOfMonth()).toBe(false);

    vi.useRealTimers();
  });

  it("returns true on February 28th (non-leap year)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 1, 28)); // Feb 28

    expect(isLastDayOfMonth()).toBe(true);

    vi.useRealTimers();
  });

  it("returns true on February 29th (leap year)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 1, 29)); // Feb 29, 2024 is a leap year

    expect(isLastDayOfMonth()).toBe(true);

    vi.useRealTimers();
  });
});
