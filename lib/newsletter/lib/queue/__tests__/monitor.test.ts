/**
 * Queue Monitor Tests (pg-boss)
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

// Mock qstash-client (used by cancelWorkflow in monitor)
vi.mock("../qstash-client", () => ({
  cancelWorkflowRun: vi.fn().mockResolvedValue(undefined),
}));

// Mock server-only
vi.mock("server-only", () => ({}));

// Hold a reference to the mock class so tests can control its behavior
let mockGetQueueStatsImpl: () => Promise<unknown> = async () => ({
  name: "newsletter-send",
  size: 0,
});

vi.mock("pg-boss", () => {
  class MockPgBoss {
    on() {}
    async start() {}
    async stop() {}
    async send() {
      return "job-id-123";
    }
    async work() {
      return "worker-id";
    }
    async getQueueStats() {
      return mockGetQueueStatsImpl();
    }
  }
  return { PgBoss: MockPgBoss };
});

describe("Queue Monitor", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    vi.resetModules();
    // Reset to healthy default
    mockGetQueueStatsImpl = async () => ({ name: "newsletter-send", size: 0 });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getWorkflowRunStatus", () => {
    it("should return null (not supported with pg-boss)", async () => {
      const { getWorkflowRunStatus } = await import("../monitor");
      const status = await getWorkflowRunStatus("job-123");
      expect(status).toBeNull();
    });
  });

  describe("getRecentWorkflowRuns", () => {
    it("should return empty array (not supported with pg-boss)", async () => {
      const { getRecentWorkflowRuns } = await import("../monitor");
      const runs = await getRecentWorkflowRuns(10);
      expect(runs).toEqual([]);
    });
  });

  describe("getQueueHealth", () => {
    it("should return healthy when pg-boss responds OK", async () => {
      const { getQueueHealth } = await import("../monitor");
      const health = await getQueueHealth();

      expect(health.healthy).toBe(true);
      expect(health.issues).toHaveLength(0);
    });

    it("should return unhealthy when pg-boss throws", async () => {
      mockGetQueueStatsImpl = async () => {
        throw new Error("connection refused");
      };

      const { getQueueHealth } = await import("../monitor");
      const health = await getQueueHealth();

      expect(health.healthy).toBe(false);
      expect(health.issues[0]).toMatch(/pg-boss health check failed/);
    });
  });

  describe("cancelWorkflow", () => {
    it("should delegate to cancelWorkflowRun", async () => {
      const { cancelWorkflow } = await import("../monitor");
      const { cancelWorkflowRun } = await import("../qstash-client");

      await cancelWorkflow("job-123");

      expect(cancelWorkflowRun).toHaveBeenCalledWith("job-123");
    });
  });
});
