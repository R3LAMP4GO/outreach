/**
 * Queue Client Configuration Tests (pg-boss)
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

// Mock server-only so it doesn't throw outside Next.js
vi.mock("server-only", () => ({}));

// Mock pg-boss with a proper class so `new PgBoss(...)` works
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
      return { name: "newsletter-send", size: 0 };
    }
  }
  return { PgBoss: MockPgBoss };
});

describe("Queue Client Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;

    const { getBoss } = await import("@/lib/queue/client");
    await expect(getBoss()).rejects.toThrow("DATABASE_URL environment variable is not set");
  });

  it("should return a boss instance when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";

    const { getBoss } = await import("@/lib/queue/client");
    const boss = await getBoss();

    expect(boss).toBeDefined();
  });

  it("should return the same instance on multiple calls (singleton)", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";

    const { getBoss } = await import("@/lib/queue/client");
    const boss1 = await getBoss();
    const boss2 = await getBoss();

    expect(boss1).toBe(boss2);
  });
});
