/**
 * Newsletter Queue Trigger Tests (pg-boss)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the logger
vi.mock("../../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock pg-boss with a proper class
vi.mock("pg-boss", () => {
  class MockPgBoss {
    on() {}
    async start() {}
    async stop() {}
    async send() {
      return "job-id-test-123";
    }
    async work() {
      return "worker-id";
    }
    async getQueueStats() {
      return { name: "newsletter-send", size: 0 };
    }
  }
  return { PgBoss: MockPgBoss };
});

describe("Newsletter Queue Triggers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("triggerSendWorkflow", () => {
    it("should enqueue a newsletter-send job and return a workflowRunId", async () => {
      const { triggerSendWorkflow } = await import("../qstash-client");

      const result = await triggerSendWorkflow({
        campaignId: "campaign-123",
        sources: ["rss", "reddit"],
        maxArticles: 15,
      });

      expect(result.workflowRunId).toBe("job-id-test-123");
    });
  });

  describe("triggerCurateWorkflow", () => {
    it("should enqueue a newsletter-curate job and return a workflowRunId", async () => {
      const { triggerCurateWorkflow } = await import("../qstash-client");

      const result = await triggerCurateWorkflow({
        campaignId: "campaign-123",
        sources: ["hackernews"],
        maxArticles: 10,
        userId: "user-456",
      });

      expect(result.workflowRunId).toBe("job-id-test-123");
    });
  });

  describe("triggerCleanupWorkflow", () => {
    it("should enqueue a newsletter-cleanup job and return a workflowRunId", async () => {
      const { triggerCleanupWorkflow } = await import("../qstash-client");

      const result = await triggerCleanupWorkflow({
        olderThan: "2024-01-01T00:00:00.000Z",
        types: ["articles", "newsletters"],
      });

      expect(result.workflowRunId).toBe("job-id-test-123");
    });
  });

  describe("cancelWorkflowRun", () => {
    it("should log a warning and not throw", async () => {
      const { cancelWorkflowRun } = await import("../qstash-client");

      // cancelWorkflowRun is a no-op in pg-boss mode — should not throw
      await expect(cancelWorkflowRun("job-abc-123")).resolves.toBeUndefined();
    });
  });
});
