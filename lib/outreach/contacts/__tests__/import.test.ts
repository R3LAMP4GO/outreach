import { describe, it, expect, vi, beforeEach } from "vitest";
import { importContacts, validateContact } from "../import";
import type { ImportContactInput } from "../types";

// Must use vi.hoisted so mocks are available inside the hoisted vi.mock factory
const { mockReturning, mockValues, mockInsert } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  return { mockReturning, mockValues, mockInsert };
});

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    execute: vi.fn(),
    delete: vi.fn().mockReturnValue({ where: vi.fn() }),
  },
}));

vi.mock("../queries", () => ({
  getBlockedEmails: vi.fn().mockResolvedValue(new Set()),
  emailExistsInCampaign: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../campaigns/actions", () => ({
  incrementCampaignStat: vi.fn().mockResolvedValue(undefined),
}));

import { getBlockedEmails, emailExistsInCampaign } from "../queries";
import { incrementCampaignStat } from "../../campaigns/actions";

/** Valid contact input */
function validContact(overrides: Partial<ImportContactInput> = {}): ImportContactInput {
  return {
    email: "john@example.com",
    first_name: "John",
    email_1_subject: "Hello",
    email_1_body: "<p>Hi John</p>",
    email_2_body: "<p>Following up</p>",
    email_3_subject: "Last note",
    email_3_body: "<p>Final</p>",
    ...overrides,
  };
}

describe("validateContact", () => {
  it("returns no errors for a valid contact", () => {
    const errors = validateContact(validContact());
    expect(errors).toEqual([]);
  });

  it("requires email", () => {
    const errors = validateContact(validContact({ email: "" }));
    expect(errors).toContain("Email is required");
  });

  it("validates email format", () => {
    const errors = validateContact(validContact({ email: "not-an-email" }));
    expect(errors).toContain("Invalid email format");
  });

  it("requires email_1_subject", () => {
    const errors = validateContact(validContact({ email_1_subject: "" }));
    expect(errors).toContain("Email 1 subject is required");
  });

  it("requires email_1_body", () => {
    const errors = validateContact(validContact({ email_1_body: "" }));
    expect(errors).toContain("Email 1 body is required");
  });

  it("requires email_2_body", () => {
    const errors = validateContact(validContact({ email_2_body: "" }));
    expect(errors).toContain("Email 2 body is required");
  });

  it("requires email_3_subject", () => {
    const errors = validateContact(validContact({ email_3_subject: "" }));
    expect(errors).toContain("Email 3 subject is required");
  });

  it("requires email_3_body", () => {
    const errors = validateContact(validContact({ email_3_body: "" }));
    expect(errors).toContain("Email 3 body is required");
  });

  it("does not require email_2_subject (optional for threading)", () => {
    const errors = validateContact(validContact({ email_2_subject: undefined }));
    expect(errors).toEqual([]);
  });

  it("rejects email longer than 255 characters", () => {
    const longEmail = "a".repeat(250) + "@b.com";
    const errors = validateContact(validContact({ email: longEmail }));
    expect(errors).toContain("Email too long (max 255 characters)");
  });

  it("rejects email_1_subject longer than 500 characters", () => {
    const errors = validateContact(validContact({ email_1_subject: "x".repeat(501) }));
    expect(errors).toContain("Email 1 subject too long (max 500 characters)");
  });

  it("returns multiple errors at once", () => {
    const errors = validateContact(
      validContact({
        email: "",
        email_1_subject: "",
        email_1_body: "",
      }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("importContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBlockedEmails).mockResolvedValue(new Set());
    vi.mocked(emailExistsInCampaign).mockResolvedValue(false);
    // Default: successful insert returning one row
    mockReturning.mockResolvedValue([{ id: "1" }]);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("returns success with zero imported for empty array", async () => {
    const result = await importContacts("camp-1", []);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(0);
  });

  it("imports valid contacts", async () => {
    const result = await importContacts("camp-1", [validContact()]);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("detects duplicates within the same batch", async () => {
    const contacts = [
      validContact({ email: "dup@example.com" }),
      validContact({ email: "DUP@example.com" }), // same email, different case
    ];
    const result = await importContacts("camp-1", contacts);
    expect(result.duplicates).toBe(1);
  });

  it("detects duplicates against existing campaign contacts", async () => {
    vi.mocked(emailExistsInCampaign).mockResolvedValue(true);
    const result = await importContacts("camp-1", [validContact()]);
    expect(result.duplicates).toBe(1);
    expect(result.imported).toBe(0);
  });

  it("filters out blocked emails", async () => {
    vi.mocked(getBlockedEmails).mockResolvedValue(new Set(["john@example.com"]));
    const result = await importContacts("camp-1", [validContact()]);
    expect(result.blocked).toBe(1);
    expect(result.imported).toBe(0);
  });

  it("records validation errors with email and reason", async () => {
    const result = await importContacts("camp-1", [validContact({ email: "invalid" })]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].email).toBe("invalid");
    expect(result.errors[0].reason).toBe("Validation failed");
  });

  it("handles database insert error", async () => {
    mockReturning.mockRejectedValue(new Error("DB error"));
    const result = await importContacts("camp-1", [validContact()]);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.reason === "Database error")).toBe(true);
  });

  it("increments campaign stat after successful import", async () => {
    await importContacts("camp-1", [validContact()]);
    expect(incrementCampaignStat).toHaveBeenCalledWith("camp-1", "total_contacts", 1);
  });

  it("does not increment campaign stat when nothing imported", async () => {
    vi.mocked(emailExistsInCampaign).mockResolvedValue(true);
    await importContacts("camp-1", [validContact()]);
    expect(incrementCampaignStat).not.toHaveBeenCalled();
  });

  it("lowercases email on insert", async () => {
    await importContacts("camp-1", [validContact({ email: "John@EXAMPLE.COM" })]);
    // The values call receives an array of camelCase objects with lowercased email
    const valuesArg = mockValues.mock.calls[0][0];
    expect(valuesArg[0].email).toBe("john@example.com");
  });

  it("maps mobile to phone field (n8n alias)", async () => {
    await importContacts("camp-1", [validContact({ mobile: "+61400000000", phone: undefined })]);
    const valuesArg = mockValues.mock.calls[0][0];
    expect(valuesArg[0].phone).toBe("+61400000000");
  });

  it("sets success=false when all contacts fail validation", async () => {
    const result = await importContacts("camp-1", [validContact({ email: "" })]);
    expect(result.success).toBe(false);
  });
});
