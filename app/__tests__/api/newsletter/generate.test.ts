/**
 * Tests for newsletter generation API endpoint
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

// Type for the mocked auth function
type MockAuthFunction = {
  mockResolvedValueOnce: (value: Session | null) => typeof vi.fn;
  mockResolvedValue: (value: Session | null) => typeof vi.fn;
};

// Mock Next.js modules
vi.mock("next/server", () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn((body, init) => ({
      json: async () => body,
      status: init?.status || 200,
      headers: new Map(Object.entries(init?.headers || {})),
    })),
  },
}));

// Mock auth with explicit typing
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve<Session | null>(null)),
}));

// Mock credentials service
vi.mock("@/lib/services/credentials", () => ({
  getCredential: vi.fn(() =>
    Promise.resolve({
      key: "api_key",
      value: "test-api-key-value",
    }),
  ),
}));

// Mock rate limiting
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({
      success: true,
      remaining: 4,
      resetIn: 3600000,
    }),
  ),
  getClientIp: vi.fn(() => "127.0.0.1"),
  rateLimiters: {
    api: { limit: 100, windowMs: 60000 },
  },
}));

// Mock newsletter orchestrator
vi.mock("@/lib/newsletter/orchestrator", () => ({
  createNewsletterOrchestrator: vi.fn(() => ({
    generateNewsletter: vi.fn(() =>
      Promise.resolve({
        newsletterId: "test-newsletter-id",
        subject: "Test Newsletter",
        html: "<html><body>Test</body></html>",
        articleCount: 10,
      }),
    ),
  })),
}));

describe("POST /api/newsletter/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set required environment variables
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  });

  it("should reject unauthenticated requests", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as unknown as MockAuthFunction).mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/newsletter/generate/route");
    const request = new Request("http://localhost:3000/api/newsletter/generate", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe("Authentication required");
  });

  it("should reject requests when rate limit is exceeded", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as unknown as MockAuthFunction).mockResolvedValueOnce({
      user: {
        id: "test-user-id",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        totpEnabled: false,
        avatarUrl: null,
        image: null,
      },
      expires: "2024-12-31",
    });

    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetIn: 1800000,
    });

    const { POST } = await import("@/app/api/newsletter/generate/route");
    const request = new Request("http://localhost:3000/api/newsletter/generate", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Rate limit exceeded");
  });

  it("should reject invalid request body", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as unknown as MockAuthFunction).mockResolvedValueOnce({
      user: {
        id: "test-user-id",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        totpEnabled: false,
        avatarUrl: null,
        image: null,
      },
      expires: "2024-12-31",
    });

    const { POST } = await import("@/app/api/newsletter/generate/route");
    const request = new Request("http://localhost:3000/api/newsletter/generate", {
      method: "POST",
      body: JSON.stringify({ campaignId: "invalid-uuid" }),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("should successfully generate newsletter", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as unknown as MockAuthFunction).mockResolvedValue({
      user: {
        id: "test-user-id",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        totpEnabled: false,
        avatarUrl: null,
        image: null,
      },
      expires: "2024-12-31",
    });

    const { POST } = await import("@/app/api/newsletter/generate/route");
    const request = new Request("http://localhost:3000/api/newsletter/generate", {
      method: "POST",
      body: JSON.stringify({ manual: true }),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.newsletterId).toBe("test-newsletter-id");
    expect(data.preview).toBeDefined();
    expect(data.preview.subject).toBe("Test Newsletter");
    expect(data.preview.articleCount).toBe(10);
  });

  it("should handle orchestrator errors gracefully", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as unknown as MockAuthFunction).mockResolvedValue({
      user: {
        id: "test-user-id",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        totpEnabled: false,
        avatarUrl: null,
        image: null,
      },
      expires: "2024-12-31",
    });

    const { createNewsletterOrchestrator } = await import("@/lib/newsletter/orchestrator");
    vi.mocked(createNewsletterOrchestrator).mockReturnValueOnce({
      generateNewsletter: vi.fn(() => Promise.reject(new Error("Orchestrator error"))),
    } as never);

    const { POST } = await import("@/app/api/newsletter/generate/route");
    const request = new Request("http://localhost:3000/api/newsletter/generate", {
      method: "POST",
      body: JSON.stringify({ manual: true }),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain("AI curation pipeline encountered an error");
  });
});
