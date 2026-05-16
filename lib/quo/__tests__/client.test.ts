/**
 * Tests for the Quo REST client wrapper.
 *
 * fetch is stubbed globally via `vi.stubGlobal` — no real network calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCall,
  getCallSummary,
  getCallTranscript,
  QuoApiError,
  sendSms,
  upsertContact,
} from "../client";

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
  vi.stubEnv("QUO_API_KEY", "test-api-key");
  vi.stubEnv("QUO_API_BASE", "https://api.openphone.com/v1");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─── sendSms ─────────────────────────────────────────────────────────────────

describe("sendSms", () => {
  it("POSTs to /messages with auth header, content-type, and the expected body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "AC123",
          from: "+15550001111",
          to: ["+15552223333"],
          text: "Hello there",
          direction: "outgoing",
          createdAt: "2026-05-15T12:00:00.000Z",
        },
      }),
    );

    const result = await sendSms({
      from: "+15550001111",
      to: "+15552223333",
      content: "Hello there",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openphone.com/v1/messages");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("test-api-key");
    expect(headers.Authorization.startsWith("Bearer")).toBe(false);
    expect(headers["Content-Type"]).toBe("application/json");

    expect(JSON.parse(init.body as string)).toEqual({
      from: "+15550001111",
      to: ["+15552223333"],
      content: "Hello there",
    });

    // Response shape is transformed: API `text` -> our `body`.
    expect(result.id).toBe("AC123");
    expect(result.body).toBe("Hello there");
    expect(result.direction).toBe("outgoing");
  });

  it("honours QUO_API_BASE when overridden", async () => {
    vi.stubEnv("QUO_API_BASE", "https://staging.example.com/v1/");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "AC1",
          from: "+1",
          to: ["+2"],
          text: "hi",
          direction: "outgoing",
          createdAt: "2026-05-15T00:00:00Z",
        },
      }),
    );

    await sendSms({ from: "+1", to: "+2", content: "hi" });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://staging.example.com/v1/messages");
  });

  it("throws if QUO_API_KEY is not set", async () => {
    vi.stubEnv("QUO_API_KEY", "");
    await expect(sendSms({ from: "+1", to: "+2", content: "x" })).rejects.toThrow(/QUO_API_KEY/);
  });
});

// ─── getCallSummary ──────────────────────────────────────────────────────────

describe("getCallSummary", () => {
  it("returns null on 404 instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(404));

    const result = await getCallSummary("AC404");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openphone.com/v1/call-summaries/AC404");
  });

  it("flattens the summary string[] into a single newline-joined string", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          callId: "ACxyz",
          summary: ["Customer asked about pricing", "Follow up next Tuesday"],
          nextSteps: ["Send quote"],
          status: "completed",
        },
      }),
    );

    const result = await getCallSummary("ACxyz");

    expect(result).not.toBeNull();
    expect(result?.callId).toBe("ACxyz");
    expect(result?.summary).toBe("Customer asked about pricing\nFollow up next Tuesday");
    expect(result?.nextSteps).toEqual(["Send quote"]);
  });
});

// ─── getCallTranscript ───────────────────────────────────────────────────────

describe("getCallTranscript", () => {
  it("returns null on 404", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(404));
    const result = await getCallTranscript("ACnone");
    expect(result).toBeNull();
  });

  it("renames `identifier` to `speaker` in dialogue entries", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          callId: "ACt1",
          dialogue: [
            { content: "Hello", start: 0.16, end: 0.48, identifier: "+15551111111" },
            { content: "Hi there", start: 1.0, end: 2.5, identifier: "+15552222222" },
          ],
        },
      }),
    );

    const result = await getCallTranscript("ACt1");

    expect(result?.dialogue).toHaveLength(2);
    expect(result?.dialogue[0]).toEqual({
      speaker: "+15551111111",
      content: "Hello",
      start: 0.16,
      end: 0.48,
    });
  });
});

// ─── getCall ─────────────────────────────────────────────────────────────────

describe("getCall", () => {
  it("hits /calls/{id} and returns the parsed call", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "ACcall",
          direction: "incoming",
          status: "completed",
          duration: 42,
          createdAt: "2026-05-15T10:00:00Z",
          completedAt: "2026-05-15T10:00:42Z",
          participants: ["+15553334444"],
          phoneNumberId: "PNabc",
        },
      }),
    );

    const result = await getCall("ACcall");

    expect(result.id).toBe("ACcall");
    expect(result.duration).toBe(42);
    expect(result.direction).toBe("incoming");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openphone.com/v1/calls/ACcall");
  });
});

// ─── Error handling ──────────────────────────────────────────────────────────

describe("error handling", () => {
  it("throws QuoApiError with status and parsed body on non-2xx", async () => {
    // 500 triggers the retry-once path — return 500 twice so the second
    // attempt also fails and the error surfaces.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ message: "internal blip", code: "internal_error" }, 500),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: "internal blip", code: "internal_error" }, 500),
      );

    try {
      await getCall("ACboom");
      throw new Error("expected getCall to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(QuoApiError);
      const apiErr = err as QuoApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.message).toContain("internal blip");
      expect(apiErr.body).toMatchObject({
        message: "internal blip",
        code: "internal_error",
      });
    }

    // retry-once-on-5xx: fetch is invoked twice for a 500.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on 5xx and succeeds when the second attempt is 2xx", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(503)).mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "ACretry",
          direction: "outgoing",
          status: "completed",
          duration: 1,
          createdAt: "2026-05-15T10:00:00Z",
          completedAt: null,
        },
      }),
    );

    const result = await getCall("ACretry");

    expect(result.id).toBe("ACretry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "bad request" }, 400));

    await expect(getCall("ACbad")).rejects.toBeInstanceOf(QuoApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─── upsertContact ───────────────────────────────────────────────────────────

describe("upsertContact", () => {
  it("splits name into first/last and wraps the phone number in the documented shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "CNT123",
          source: "outreach",
          defaultFields: {
            firstName: "Jane",
            lastName: "Doe",
            company: "Acme",
            phoneNumbers: [{ value: "+15551112222" }],
          },
        },
      }),
    );

    const result = await upsertContact({
      name: "Jane Doe",
      phoneNumber: "+15551112222",
      company: "Acme",
      source: "outreach",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openphone.com/v1/contacts");
    expect(init.method).toBe("POST");

    expect(JSON.parse(init.body as string)).toEqual({
      defaultFields: {
        firstName: "Jane",
        lastName: "Doe",
        company: "Acme",
        phoneNumbers: [{ name: "Mobile", value: "+15551112222" }],
      },
      source: "outreach",
    });

    expect(result).toEqual({
      id: "CNT123",
      name: "Jane Doe",
      company: "Acme",
      source: "outreach",
      phoneNumbers: ["+15551112222"],
    });
  });
});
