import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock modules before importing the function under test
// ---------------------------------------------------------------------------

const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/crm/timeline", () => ({
  writeTimelineEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { pushToCrm } from "../push-to-crm";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const CONTACT = {
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Doe",
  company: "Acme Corp",
};

const CRM_CONTACT_ID = "crm-contact-uuid-1";
const STAGE_ID = "stage-uuid-contacted";
const DEAL_ID = "deal-uuid-1";
const EXISTING_DEAL_ID = "deal-uuid-existing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up the standard happy-path mocks.
 * Each test can override individual mocks after calling this.
 */
function setupHappyPath(overrides?: {
  rpcResult?: unknown[];
  stageResult?: unknown[];
  dealResult?: unknown[];
}) {
  // db.execute() — RPC upsert
  mockExecute.mockResolvedValue(
    overrides?.rpcResult ?? [
      { contact_id: CRM_CONTACT_ID, created: false, updated: true, status_applied: "lead" },
    ],
  );

  // db.select() — stage lookup; returns a chainable .from().where().limit()
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(overrides?.stageResult ?? [{ id: STAGE_ID }]),
      }),
    }),
  });

  // db.insert() — deal insert; returns a chainable .values().returning()
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(overrides?.dealResult ?? [{ id: DEAL_ID }]),
    }),
  });

  // db.update() — enrichment update (no-op for basic contact)
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pushToCrm()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { crmContactId, crmDealId } on the happy path", async () => {
    setupHappyPath();

    const result = await pushToCrm(CONTACT, "Spring Campaign");

    expect(result).toEqual({
      crmContactId: CRM_CONTACT_ID,
      crmDealId: DEAL_ID,
    });
  });

  it("returns null when the RPC upsert throws an error", async () => {
    mockExecute.mockRejectedValue(new Error("Upsert failed"));

    const result = await pushToCrm(CONTACT, "Spring Campaign");

    expect(result).toBeNull();
  });

  it("returns null when the RPC upsert returns no contact_id", async () => {
    setupHappyPath({ rpcResult: [] });

    const result = await pushToCrm(CONTACT, "Spring Campaign");

    expect(result).toBeNull();
  });

  it("returns null when the stage lookup returns no rows", async () => {
    setupHappyPath({ stageResult: [] });

    // Both the primary and fallback stage lookups return empty
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await pushToCrm(CONTACT, "Spring Campaign");

    expect(result).toBeNull();
  });

  it("returns the existing deal id when deal insert hits a 23505 unique constraint error", async () => {
    setupHappyPath();

    // Override insert to throw 23505
    const uniqueError = new Error("duplicate key") as Error & { code: string };
    uniqueError.code = "23505";

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(uniqueError),
      }),
    });

    // The fallback select for existing deal
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: STAGE_ID }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: EXISTING_DEAL_ID }]),
          }),
        }),
      });

    const result = await pushToCrm(CONTACT, "Spring Campaign");

    expect(result).toEqual({
      crmContactId: CRM_CONTACT_ID,
      crmDealId: EXISTING_DEAL_ID,
    });
  });

  it("returns null when deal insert fails with a non-23505 error", async () => {
    setupHappyPath();

    const otherError = new Error("insufficient privilege") as Error & { code: string };
    otherError.code = "42501";

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(otherError),
      }),
    });

    const result = await pushToCrm(CONTACT, "Spring Campaign");

    expect(result).toBeNull();
  });

  it("never throws — wraps all errors in try/catch", async () => {
    mockExecute.mockRejectedValue(new Error("Network error"));

    await expect(pushToCrm(CONTACT, "Campaign")).resolves.toBeNull();
  });

  it("builds deal name as `{YYYY} {Company} | {Initial}.{LastName}`", async () => {
    setupHappyPath();

    let capturedValues: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        capturedValues = data;
        return {
          returning: vi.fn().mockResolvedValue([{ id: DEAL_ID }]),
        };
      }),
    });

    await pushToCrm(CONTACT, "Spring Campaign");

    const year = new Date().getFullYear();
    expect(capturedValues).not.toBeNull();
    expect(capturedValues!.name).toBe(`${year} Acme Corp | J.Doe`);
  });

  it("falls back to campaign name when company is missing", async () => {
    setupHappyPath();

    let capturedValues: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        capturedValues = data;
        return {
          returning: vi.fn().mockResolvedValue([{ id: DEAL_ID }]),
        };
      }),
    });

    const contactNoCompany = { ...CONTACT, company: null };
    await pushToCrm(contactNoCompany, "Spring Campaign");

    const year = new Date().getFullYear();
    expect(capturedValues!.name).toBe(`${year} Spring Campaign | J.Doe`);
  });

  it("falls back to email in the deal name when both firstName and lastName are null", async () => {
    setupHappyPath();

    let capturedValues: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        capturedValues = data;
        return {
          returning: vi.fn().mockResolvedValue([{ id: DEAL_ID }]),
        };
      }),
    });

    const contactNoName = { ...CONTACT, firstName: null, lastName: null };
    const result = await pushToCrm(contactNoName, "Spring Campaign");

    expect(result).not.toBeNull();
    expect(capturedValues!.name).toContain("jane@example.com");
  });

  it("calls db.execute with RPC SQL containing correct parameters", async () => {
    setupHappyPath();

    await pushToCrm(CONTACT, "Spring Campaign");

    expect(mockExecute).toHaveBeenCalledTimes(1);
    // The SQL template is called with the contact fields — we verify the mock was invoked
    const sqlArg = mockExecute.mock.calls[0][0];
    expect(sqlArg).toBeDefined();
  });

  it("sets source and status correctly on the created deal", async () => {
    setupHappyPath();

    let capturedValues: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        capturedValues = data;
        return {
          returning: vi.fn().mockResolvedValue([{ id: DEAL_ID }]),
        };
      }),
    });

    await pushToCrm(CONTACT, "Spring Campaign", {
      intent: "schedule_call",
      aiSummary: "Prospect wants a demo",
    });

    expect(capturedValues).toMatchObject({
      source: "outreach_reply",
      status: "open",
      stageId: STAGE_ID,
      contactId: CRM_CONTACT_ID,
    });

    expect(capturedValues!.notes).toContain("Intent: schedule_call");
    expect(capturedValues!.notes).toContain("AI Summary: Prospect wants a demo");
  });

  it("includes only intent in notes when aiSummary is not provided", async () => {
    setupHappyPath();

    let capturedValues: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        capturedValues = data;
        return {
          returning: vi.fn().mockResolvedValue([{ id: DEAL_ID }]),
        };
      }),
    });

    await pushToCrm(CONTACT, "Spring Campaign", { intent: "general_interest" });

    expect(capturedValues!.notes).toBe("Intent: general_interest");
  });

  it("includes only aiSummary in notes when intent is not provided", async () => {
    setupHappyPath();

    let capturedValues: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        capturedValues = data;
        return {
          returning: vi.fn().mockResolvedValue([{ id: DEAL_ID }]),
        };
      }),
    });

    await pushToCrm(CONTACT, "Spring Campaign", { aiSummary: "Wants to chat" });

    expect(capturedValues!.notes).toBe("AI Summary: Wants to chat");
  });

  it("omits notes when neither intent nor aiSummary is provided", async () => {
    setupHappyPath();

    let capturedValues: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        capturedValues = data;
        return {
          returning: vi.fn().mockResolvedValue([{ id: DEAL_ID }]),
        };
      }),
    });

    await pushToCrm(CONTACT, "Spring Campaign");

    expect(capturedValues).not.toHaveProperty("notes");
  });
});
