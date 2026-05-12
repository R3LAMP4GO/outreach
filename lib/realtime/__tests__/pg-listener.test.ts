import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted state for the postgres() mock so tests can capture the listen call.
// ---------------------------------------------------------------------------
const { listenSpy, capturedHandler } = vi.hoisted(() => ({
  listenSpy: vi.fn(),
  capturedHandler: { current: null as null | ((p: string) => void) },
}));

vi.mock("postgres", () => {
  const factory = () => {
    const sql = {
      listen: (_channel: string, handler: (payload: string) => void, onConnect?: () => void) => {
        listenSpy(_channel);
        capturedHandler.current = handler;
        onConnect?.();
        return Promise.resolve({ unlisten: vi.fn() });
      },
      end: vi.fn(() => Promise.resolve()),
    };
    return sql;
  };
  return { default: factory };
});

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  // Reset module + globalThis cache between tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).__pgListenerState;
  listenSpy.mockClear();
  capturedHandler.current = null;
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://test";
});

describe("pgListener", () => {
  it("starts the LISTEN on first subscribe and fans out NOTIFY payloads", async () => {
    const { pgListener } = await import("../pg-listener");

    const handler = vi.fn();
    pgListener.subscribe(handler);

    // Wait for the async connect() to resolve.
    await new Promise((r) => setTimeout(r, 0));

    expect(listenSpy).toHaveBeenCalledWith("outreach_reply_inserted");
    expect(capturedHandler.current).toBeTypeOf("function");

    const payload = {
      id: "r-1",
      contact_id: "c-1",
      campaign_id: "camp-1",
      received_at: "2024-01-01T00:00:00Z",
    };
    capturedHandler.current!(JSON.stringify(payload));

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("delivers NOTIFY payloads to multiple subscribers", async () => {
    const { pgListener } = await import("../pg-listener");

    const a = vi.fn();
    const b = vi.fn();
    pgListener.subscribe(a);
    pgListener.subscribe(b);

    await new Promise((r) => setTimeout(r, 0));

    capturedHandler.current!(
      JSON.stringify({
        id: "r-2",
        contact_id: "c-2",
        campaign_id: null,
        received_at: null,
      }),
    );

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe removes the handler", async () => {
    const { pgListener } = await import("../pg-listener");

    const handler = vi.fn();
    const unsub = pgListener.subscribe(handler);
    await new Promise((r) => setTimeout(r, 0));

    unsub();
    capturedHandler.current!(
      JSON.stringify({
        id: "r-3",
        contact_id: "c-3",
        campaign_id: null,
        received_at: null,
      }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores malformed NOTIFY payloads without throwing", async () => {
    const { pgListener } = await import("../pg-listener");

    const handler = vi.fn();
    pgListener.subscribe(handler);
    await new Promise((r) => setTimeout(r, 0));

    expect(() => capturedHandler.current!("not json")).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
