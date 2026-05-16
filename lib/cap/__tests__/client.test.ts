/**
 * Tests for the Cap REST client wrapper.
 *
 * fetch is stubbed globally via `vi.stubGlobal` — no real network calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CapApiError, extractCapVideoId, getVideo, getVideoAnalytics } from "../client";

// ─── Test helpers ────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response("", { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("CAP_API_KEY", "csk_test-secret-key");
  vi.stubEnv("CAP_API_BASE", "https://cap.so/api");
  vi.stubEnv("CAP_CUSTOM_DOMAIN", "");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─── extractCapVideoId ───────────────────────────────────────────────────────

describe("extractCapVideoId", () => {
  it("parses the canonical /s/<id> share link", () => {
    expect(extractCapVideoId("https://cap.so/s/abc123def")).toBe("abc123def");
  });

  it("parses the /v/<id> legacy share link", () => {
    expect(extractCapVideoId("https://cap.so/v/abc123def")).toBe("abc123def");
  });

  it("parses /embed/<id> iframe URLs", () => {
    expect(extractCapVideoId("https://cap.so/embed/abc123def")).toBe("abc123def");
  });

  it("parses /dev/<id> SDK-created share links", () => {
    expect(extractCapVideoId("https://cap.so/dev/abc123def")).toBe("abc123def");
  });

  it("parses a custom-domain /s/<id> URL", () => {
    expect(extractCapVideoId("https://video.acme.com/s/xyzABC789")).toBe("xyzABC789");
  });

  it("parses a custom-domain /embed/<id> URL", () => {
    expect(extractCapVideoId("https://video.acme.com/embed/xyzABC789")).toBe("xyzABC789");
  });

  it("ignores query strings and fragments", () => {
    expect(extractCapVideoId("https://cap.so/s/abc123def?t=42")).toBe("abc123def");
    expect(extractCapVideoId("https://cap.so/s/abc123def#start")).toBe("abc123def");
    expect(extractCapVideoId("https://cap.so/s/abc123def?utm=foo&ref=bar")).toBe("abc123def");
  });

  it("strips trailing slashes", () => {
    expect(extractCapVideoId("https://cap.so/s/abc123def/")).toBe("abc123def");
  });

  it("accepts URL-safe nanoid characters (alphanumeric, -, _)", () => {
    expect(extractCapVideoId("https://cap.so/s/a1B2_c3-D4e")).toBe("a1B2_c3-D4e");
  });

  it("accepts trimmed input", () => {
    expect(extractCapVideoId("  https://cap.so/s/abc123def  ")).toBe("abc123def");
  });

  it("returns null for unrelated paths", () => {
    expect(extractCapVideoId("https://cap.so/dashboard")).toBeNull();
    expect(extractCapVideoId("https://cap.so/pricing/foo")).toBeNull();
    expect(extractCapVideoId("https://cap.so/")).toBeNull();
  });

  it("returns null for too-short ids", () => {
    expect(extractCapVideoId("https://cap.so/s/abc")).toBeNull();
  });

  it("returns null for ids with illegal characters", () => {
    expect(extractCapVideoId("https://cap.so/s/abc 123def")).toBeNull();
    expect(extractCapVideoId("https://cap.so/s/abc!23def")).toBeNull();
  });

  it("returns null for non-http(s) schemes", () => {
    expect(extractCapVideoId("mailto:someone@cap.so/s/abc123def")).toBeNull();
    expect(extractCapVideoId("javascript:alert(1)")).toBeNull();
    expect(extractCapVideoId("ftp://cap.so/s/abc123def")).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(extractCapVideoId("not a url")).toBeNull();
    expect(extractCapVideoId("")).toBeNull();
    expect(extractCapVideoId("/s/abc123def")).toBeNull(); // missing host
  });

  it("returns null for non-string input", () => {
    // Defensive: real callers shouldn't hit this, but webhook payloads can be
    // anything. Cast through `unknown` so we don't import `any`.
    expect(extractCapVideoId(null as unknown as string)).toBeNull();
    expect(extractCapVideoId(undefined as unknown as string)).toBeNull();
    expect(extractCapVideoId(123 as unknown as string)).toBeNull();
  });
});

// ─── getVideo ────────────────────────────────────────────────────────────────

describe("getVideo", () => {
  it("hits /developer/v1/videos/:id with the bearer auth header", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "abc123def456",
          appId: "app_789",
          externalUserId: "user_42",
          name: "Product Demo",
          duration: 124.5,
          width: 1920,
          height: 1080,
          fps: 30,
          s3Key: "developer/app_789/abc123def456/result.mp4",
          transcriptionStatus: "COMPLETE",
          metadata: null,
          deletedAt: null,
          createdAt: "2025-06-15T10:30:00.000Z",
          updatedAt: "2025-06-15T10:32:00.000Z",
        },
      }),
    );

    const result = await getVideo("abc123def456");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://cap.so/api/developer/v1/videos/abc123def456");
    expect(init.method).toBe("GET");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer csk_test-secret-key");
    expect(headers.Accept).toBe("application/json");

    expect(result).toEqual({
      id: "abc123def456",
      title: "Product Demo",
      shareUrl: "https://cap.so/s/abc123def456",
      createdAt: "2025-06-15T10:30:00.000Z",
      ownerId: "user_42",
    });
  });

  it("returns null on 404 instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(404));

    const result = await getVideo("missing_video");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("defaults missing video name to 'Untitled' and ownerId to null", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "abc123def456",
          appId: "app_789",
          externalUserId: null,
          name: null,
          duration: null,
          width: null,
          height: null,
          fps: null,
          s3Key: null,
          transcriptionStatus: null,
          metadata: null,
          deletedAt: null,
          createdAt: "2025-06-15T10:30:00.000Z",
          updatedAt: null,
        },
      }),
    );

    const result = await getVideo("abc123def456");

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Untitled");
    expect(result?.ownerId).toBeNull();
  });

  it("uses CAP_CUSTOM_DOMAIN for the share URL when set", async () => {
    vi.stubEnv("CAP_CUSTOM_DOMAIN", "video.acme.com");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "abc123def456",
          name: "Demo",
          createdAt: "2025-06-15T10:30:00.000Z",
        },
      }),
    );

    const result = await getVideo("abc123def456");

    expect(result?.shareUrl).toBe("https://video.acme.com/s/abc123def456");
  });

  it("honours CAP_API_BASE when overridden", async () => {
    vi.stubEnv("CAP_API_BASE", "https://staging.cap.example/api/");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "abc",
          name: "X",
          createdAt: "2025-06-15T10:30:00.000Z",
        },
      }),
    );

    await getVideo("abc");

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://staging.cap.example/api/developer/v1/videos/abc");
  });

  it("throws CapApiError with parsed body on non-2xx (non-404)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Internal server error" }, 500));

    try {
      await getVideo("abc123def456");
      throw new Error("expected getVideo to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CapApiError);
      const apiErr = err as CapApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.message).toContain("Internal server error");
      expect(apiErr.body).toMatchObject({ error: "Internal server error" });
    }
  });

  it("throws CapApiError with status 401 on auth failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Invalid or revoked secret key" }, 401));

    await expect(getVideo("abc")).rejects.toBeInstanceOf(CapApiError);
  });

  it("throws if CAP_API_KEY is not set", async () => {
    vi.stubEnv("CAP_API_KEY", "");

    await expect(getVideo("abc")).rejects.toThrow(/CAP_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encodes the video id segment", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(404));
    await getVideo("foo/bar baz");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://cap.so/api/developer/v1/videos/foo%2Fbar%20baz");
  });
});

// ─── getVideoAnalytics ───────────────────────────────────────────────────────

describe("getVideoAnalytics", () => {
  it("throws CapApiError with a documentation pointer (no public endpoint)", async () => {
    // No fetch call expected — function throws synchronously before any
    // network access, because the endpoint doesn't exist in Cap's public API.
    try {
      await getVideoAnalytics("abc123def456");
      throw new Error("expected getVideoAnalytics to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CapApiError);
      const apiErr = err as CapApiError;
      expect(apiErr.status).toBe(501);
      expect(apiErr.message).toMatch(/no public analytics endpoint/i);
      expect(apiErr.message).toMatch(/README\.md/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
