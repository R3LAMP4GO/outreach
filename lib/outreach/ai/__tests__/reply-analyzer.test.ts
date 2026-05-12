import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock functions so vi.mock() factories can reference them
// ---------------------------------------------------------------------------
const { mockGenerateObject, mockAnthropicModel } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockAnthropicModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));

// ---------------------------------------------------------------------------
// Mock the Vercel AI SDK modules so no real API calls are made
// ---------------------------------------------------------------------------
vi.mock("ai", () => ({ generateObject: mockGenerateObject }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: mockAnthropicModel }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are registered
// ---------------------------------------------------------------------------
import { analyzeReply, sanitizeSuggestedReply } from "../reply-analyzer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGenerateObjectResult(
  overrides: Partial<{
    sentiment: string;
    summary: string;
    suggestedReply: string;
    intent: string;
  }> = {},
) {
  return {
    object: {
      sentiment: "positive",
      summary: "The contact is interested in learning more.",
      suggestedReply: "Thank you for your interest! Let me share more details.",
      intent: "wants_info",
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzeReply()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue(makeGenerateObjectResult());
  });

  it("returns the correct shape on a successful response", async () => {
    const result = await analyzeReply(
      "Jane Doe",
      "Acme Corp",
      "Q1 Campaign",
      "I would love to learn more!",
      null,
      null,
      null,
      "Jake",
    );

    expect(result).toEqual({
      sentiment: "positive",
      summary: "The contact is interested in learning more.",
      suggestedReply: "Thank you for your interest! Let me share more details.",
      intent: "wants_info",
    });
  });

  it("maps all three response fields correctly", async () => {
    mockGenerateObject.mockResolvedValue(
      makeGenerateObjectResult({
        sentiment: "negative",
        summary: "Please remove me from your list.",
        suggestedReply: "We have removed you. Sorry to bother you.",
        intent: "unsubscribe",
      }),
    );

    const result = await analyzeReply(
      "Bob Smith",
      null,
      "Outreach Campaign",
      "Unsubscribe me please.",
      null,
      null,
      null,
      "Jake",
    );

    expect(result.sentiment).toBe("negative");
    expect(result.summary).toBe("Please remove me from your list.");
    expect(result.suggestedReply).toBe("We have removed you. Sorry to bother you.");
  });

  it('strips quoted history starting with "\\nOn " before sending to model', async () => {
    const replyText =
      "Sure, sounds interesting!\nOn Mon, Jan 1 2024, Agent Girl <hi@example.com> wrote:\n> We wanted to reach out...";

    await analyzeReply("Jane", "Corp", "Campaign", replyText, null, null, null, "Jake");

    const callArg = mockGenerateObject.mock.calls[0][0];
    const prompt = callArg.prompt as string;

    expect(prompt).toContain("Sure, sounds interesting!");
    expect(prompt).not.toContain("On Mon, Jan 1 2024");
    expect(prompt).not.toContain("We wanted to reach out");
  });

  it('strips quoted history starting with "\\n>" before sending to model', async () => {
    const replyText = "Happy to chat.\n> -----Original Message-----\n> From: Agent Girl";

    await analyzeReply("Jane", "Corp", "Campaign", replyText, null, null, null, "Jake");

    const callArg = mockGenerateObject.mock.calls[0][0];
    const prompt = callArg.prompt as string;

    expect(prompt).toContain("Happy to chat.");
    expect(prompt).not.toContain("Original Message");
    expect(prompt).not.toContain("From: Agent Girl");
  });

  it("strips both \\nOn and \\n> patterns, using whichever comes first", async () => {
    const replyText = "Yes!\nOn Tue wrote:\n> Some quoted text";

    await analyzeReply("Jane", "Corp", "Campaign", replyText, null, null, null, "Jake");

    const callArg = mockGenerateObject.mock.calls[0][0];
    const prompt = callArg.prompt as string;
    expect(prompt).toContain("Yes!");
    expect(prompt).not.toContain("On Tue wrote:");
  });

  it("falls back to neutral defaults when generateObject throws an error", async () => {
    mockGenerateObject.mockRejectedValue(new Error("API error: 429 rate limited"));

    const result = await analyzeReply(
      "Jane",
      null,
      "Campaign",
      "Some reply",
      null,
      null,
      null,
      "Jake",
    );

    expect(result).toEqual({
      sentiment: "neutral",
      summary: "",
      suggestedReply: "",
      intent: "other",
    });
  });

  it("includes contactName, company and campaignName in the prompt", async () => {
    await analyzeReply(
      "Alice Walker",
      "Sunrise Ltd",
      "Spring Campaign",
      "Hello!",
      null,
      null,
      null,
      "Jake",
    );

    const callArg = mockGenerateObject.mock.calls[0][0];
    const prompt = callArg.prompt as string;

    expect(prompt).toContain("Alice Walker");
    expect(prompt).toContain("Sunrise Ltd");
    expect(prompt).toContain("Spring Campaign");
  });

  it("omits the company clause when company is null", async () => {
    await analyzeReply("Alice Walker", null, "Spring Campaign", "Hello!", null, null, null, "Jake");

    const callArg = mockGenerateObject.mock.calls[0][0];
    const prompt = callArg.prompt as string;

    expect(prompt).toContain("Alice Walker");
    expect(prompt).not.toContain(" at ");
  });

  it("uses the claude-sonnet-4-6 model", async () => {
    await analyzeReply("Jane", "Corp", "Campaign", "reply", null, null, null, "Jake");

    expect(mockAnthropicModel).toHaveBeenCalledWith("claude-sonnet-4-6");
  });

  it("includes original subject in the prompt when provided", async () => {
    await analyzeReply(
      "Jane",
      "Corp",
      "Campaign",
      "reply",
      "Re: Our service offering",
      null,
      null,
      "Jake",
    );

    const callArg = mockGenerateObject.mock.calls[0][0];
    const prompt = callArg.prompt as string;

    expect(prompt).toContain("Re: Our service offering");
  });

  it("omits subject line when originalSubject is null", async () => {
    await analyzeReply("Jane", "Corp", "Campaign", "reply", null, null, null, "Jake");

    const callArg = mockGenerateObject.mock.calls[0][0];
    const prompt = callArg.prompt as string;

    expect(prompt).not.toContain("Original email subject");
  });

  describe("conversationHistory", () => {
    it("renders all turns in chronological order with role markers when history is supplied", async () => {
      await analyzeReply(
        "Jane",
        "Corp",
        "Campaign",
        "actually we're swamped right now, can we revisit later?",
        null,
        null,
        null,
        "Jake",
        [
          {
            role: "us",
            body: "Hey Jane, wanted to introduce ourselves.",
            sentAt: "2025-01-01T10:00:00Z",
          },
          { role: "them", body: "Not interested, thanks.", sentAt: "2025-01-02T09:00:00Z" },
          { role: "us", body: "No worries — keep us in mind.", sentAt: "2025-01-02T11:00:00Z" },
        ],
      );

      const callArg = mockGenerateObject.mock.calls[0][0];
      const prompt = callArg.prompt as string;

      expect(prompt).toContain("ongoing conversation");
      expect(prompt).toContain("<conversation>");
      // All prior turns present with role markers
      expect(prompt).toContain('role="us" sent_at="2025-01-01T10:00:00Z"');
      expect(prompt).toContain("Hey Jane, wanted to introduce ourselves.");
      expect(prompt).toContain('role="them" sent_at="2025-01-02T09:00:00Z"');
      expect(prompt).toContain("Not interested, thanks.");
      expect(prompt).toContain('role="us" sent_at="2025-01-02T11:00:00Z"');
      expect(prompt).toContain("No worries — keep us in mind.");
      // Latest reply rendered last
      expect(prompt).toContain("actually we're swamped right now");

      // Chronological: each turn must appear before the next
      const idxOut1 = prompt.indexOf("Hey Jane");
      const idxIn1 = prompt.indexOf("Not interested");
      const idxOut2 = prompt.indexOf("No worries");
      const idxLatest = prompt.indexOf("actually we're swamped");
      expect(idxOut1).toBeLessThan(idxIn1);
      expect(idxIn1).toBeLessThan(idxOut2);
      expect(idxOut2).toBeLessThan(idxLatest);
    });

    it("falls back to single-reply prompt shape when history is empty/omitted", async () => {
      await analyzeReply(
        "Jane",
        "Corp",
        "Campaign",
        "Sounds good!",
        "Re: intro",
        "Hey Jane, wanted to introduce ourselves.",
        null,
        "Jake",
        [],
      );

      const callArg = mockGenerateObject.mock.calls[0][0];
      const prompt = callArg.prompt as string;

      expect(prompt).not.toContain("<conversation>");
      expect(prompt).toContain("<reply>");
      expect(prompt).toContain("<original_email>");
      expect(prompt).toContain("Sounds good!");
    });

    it("caps history at the last 20 turns", async () => {
      const history = Array.from({ length: 25 }, (_, i) => ({
        role: (i % 2 === 0 ? "us" : "them") as "us" | "them",
        body: `Turn number ${i}`,
        sentAt: `2025-01-01T00:${String(i).padStart(2, "0")}:00Z`,
      }));

      await analyzeReply("Jane", "Corp", "Campaign", "latest", null, null, null, "Jake", history);

      const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
      // Earliest 5 turns dropped
      expect(prompt).not.toContain("Turn number 0\n");
      expect(prompt).not.toContain("Turn number 4\n");
      // Most recent kept
      expect(prompt).toContain("Turn number 24");
      expect(prompt).toContain("Turn number 5");
    });
  });

  describe("voice and signoff", () => {
    it("accepts future_followup as a valid intent", async () => {
      mockGenerateObject.mockResolvedValue(
        makeGenerateObjectResult({
          intent: "future_followup",
          sentiment: "neutral",
          summary: "They want to revisit in Q3.",
          suggestedReply: "Hi Sarah,\n\nNo worries.\n\nThanks,\nJake",
        }),
      );

      const result = await analyzeReply(
        "Sarah",
        "Corp",
        "Campaign",
        "Maybe Q3?",
        null,
        null,
        null,
        "Jake",
      );

      expect(result.intent).toBe("future_followup");
    });

    it("injects the sender first name into the prompt verbatim via <sender> tag", async () => {
      await analyzeReply("Jane", "Corp", "Campaign", "Hello!", null, null, null, "Aaron");

      const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("<sender>Aaron</sender>");
      expect(prompt).toContain("signed by Aaron");
    });

    it("includes the calendar link verbatim in the system prompt", async () => {
      await analyzeReply("Jane", "Corp", "Campaign", "reply", null, null, null, "Jake");

      const system = mockGenerateObject.mock.calls[0][0].system as string;
      expect(system).toContain("__YOUR_CAL_LINK__");
    });

    it("forbids square-bracket placeholders and proposing times in the system prompt", async () => {
      await analyzeReply("Jane", "Corp", "Campaign", "reply", null, null, null, "Jake");

      const system = mockGenerateObject.mock.calls[0][0].system as string;
      // The prompt must explicitly forbid placeholder brackets and proposing times,
      // otherwise the model hallucinates `[calendar link]` and `[Tuesday 10–11am]`.
      expect(system).toContain("square brackets");
      expect(system).toMatch(/never propose specific times/i);
    });

    it('does NOT contain the banned phrase "AI automation" in the system prompt', async () => {
      await analyzeReply("Jane", "Corp", "Campaign", "reply", null, null, null, "Jake");

      const system = mockGenerateObject.mock.calls[0][0].system as string;
      // The phrase appears inside a quoted banned-phrases list, but never as
      // a description of the work itself. Scrub the banned-phrases list and
      // assert the rest is clean.
      const withoutBannedList = system.replace(/"AI automation"/g, "").replace(/"AI-powered"/g, "");
      expect(withoutBannedList).not.toContain("AI automation");
      expect(withoutBannedList).not.toContain("AI-powered");
    });
  });
});

describe("sanitizeSuggestedReply()", () => {
  it("strips trailing JSON syntax leaked by the model", () => {
    expect(sanitizeSuggestedReply("Hi Mac,\n\nThanks,\nJake'}")).toBe("Hi Mac,\n\nThanks,\nJake");
    expect(sanitizeSuggestedReply('Hi Mac,\n\nThanks,\nJake"}')).toBe("Hi Mac,\n\nThanks,\nJake");
    expect(sanitizeSuggestedReply("Hi Mac,\n\nThanks,\nJake'}  }   ")).toBe(
      "Hi Mac,\n\nThanks,\nJake",
    );
    expect(sanitizeSuggestedReply("Thanks,\nJake}")).toBe("Thanks,\nJake");
    expect(sanitizeSuggestedReply("Thanks,\nJake];")).toBe("Thanks,\nJake");
  });

  it("leaves clean output untouched", () => {
    const clean = "Hi Mac,\n\nGlad it resonated.\n\nThanks,\nJake";
    expect(sanitizeSuggestedReply(clean)).toBe(clean);
  });

  it("handles empty / undefined-ish input safely", () => {
    expect(sanitizeSuggestedReply("")).toBe("");
  });

  it("does NOT strip legitimate punctuation mid-body", () => {
    // A quote mid-sentence must survive; we only strip trailing junk.
    const text = 'Hi Mac,\n\nShe said "yes" and meant it.\n\nThanks,\nJake';
    expect(sanitizeSuggestedReply(text)).toBe(text);
  });

  it("strips trailing newlines and whitespace", () => {
    expect(sanitizeSuggestedReply("Thanks,\nJake\n\n  ")).toBe("Thanks,\nJake");
  });
});
