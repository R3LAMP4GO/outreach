import { describe, test, expect } from "vitest";
import { extractCallData } from "../gg-client";

const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * Live integration test. Hits the real Anthropic API via gg-ai.
 * Skipped when ANTHROPIC_API_KEY is not in the environment.
 */
describe("extractCallData()", () => {
  test.skipIf(!hasApiKey)(
    "extracts caller info, role, and callback intent from a Quo transcript",
    async () => {
      const result = await extractCallData({
        transcript: [
          "Agent: Hi, this is Quo calling on behalf of __YOUR_BRAND__. Is this Aesthetics Beauty Salon?",
          "Sarah: Hi this is Sarah, the manager at Aesthetics Beauty Salon. How can I help?",
          "Agent: We build custom booking and CRM systems for salons. Wanted to see if you'd be open to a quick chat about modernising yours?",
          "Sarah: Yeah maybe. Reach back out in a couple days, we're slammed today.",
          "Agent: No worries Sarah, I'll give you a buzz then. Have a good one.",
        ].join("\n"),
        summary:
          "Spoke to Sarah, the manager at Aesthetics Beauty Salon. She asked to be called back in a couple of days as they're busy today.",
        callDurationSeconds: 42,
        callerNumber: "+61400123456",
      });

      expect(result.personName).toBe("Sarah");
      expect(result.personRole?.toLowerCase()).toContain("manager");
      expect(result.followUpIntent).toBe(true);
      expect(result.sentiment).toBe("callback");

      // followUpDate should be a parseable ISO date 2-3 days out from today.
      expect(result.followUpDate).not.toBeNull();
      const parsed = new Date(`${result.followUpDate}T00:00:00Z`);
      expect(Number.isNaN(parsed.getTime())).toBe(false);

      const today = new Date();
      const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      const diffDays = Math.round((parsed.getTime() - todayUtc) / 86_400_000);
      expect(diffDays).toBeGreaterThanOrEqual(2);
      expect(diffDays).toBeLessThanOrEqual(3);
    },
    60_000,
  );
});
