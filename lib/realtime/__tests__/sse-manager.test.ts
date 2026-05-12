import { describe, it, expect, vi, beforeEach } from "vitest";

const { subscribeMock, capturedSubscribers } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  capturedSubscribers: { current: [] as Array<(p: unknown) => void> },
}));

vi.mock("../pg-listener", () => ({
  pgListener: {
    subscribe: (h: (p: unknown) => void) => {
      subscribeMock();
      capturedSubscribers.current.push(h);
      return () => {
        capturedSubscribers.current = capturedSubscribers.current.filter((s) => s !== h);
      };
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).__sseManagerState;
  subscribeMock.mockClear();
  capturedSubscribers.current = [];
  vi.resetModules();
});

type MockController = ReadableStreamDefaultController<Uint8Array> & {
  enqueue: ReturnType<typeof vi.fn>;
};

function makeController(): MockController {
  return {
    enqueue: vi.fn<(c: Uint8Array) => void>(),
    close: vi.fn(),
    error: vi.fn(),
  } as unknown as MockController;
}

function frameToString(frame: Uint8Array): string {
  return new TextDecoder().decode(frame);
}

describe("sseManager", () => {
  it("addClient registers a client and subscribes to pgListener once", async () => {
    const { sseManager } = await import("../sse-manager");
    const c1 = makeController();
    const c2 = makeController();

    sseManager.addClient(c1, "user-1");
    sseManager.addClient(c2, "user-2");

    expect(sseManager.clientCount()).toBe(2);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("broadcasts reply:new from pgListener to all clients", async () => {
    const { sseManager } = await import("../sse-manager");
    const c1 = makeController();
    const c2 = makeController();
    sseManager.addClient(c1, "u1");
    sseManager.addClient(c2, "u2");

    const payload = {
      id: "r-1",
      contact_id: "c-1",
      campaign_id: null,
      received_at: null,
    };
    capturedSubscribers.current[0]!(payload);

    expect(c1.enqueue).toHaveBeenCalledTimes(1);
    expect(c2.enqueue).toHaveBeenCalledTimes(1);
    const frame = frameToString(c1.enqueue.mock.calls[0][0]);
    expect(frame).toContain("event: reply:new");
    expect(frame).toContain(JSON.stringify(payload));
    expect(frame.endsWith("\n\n")).toBe(true);
  });

  it("pingAll sends a ping frame to every client", async () => {
    const { sseManager } = await import("../sse-manager");
    const c1 = makeController();
    sseManager.addClient(c1, "u1");

    sseManager.pingAll();
    const frame = frameToString(c1.enqueue.mock.calls[0][0]);
    expect(frame).toContain("event: ping");
  });

  it("removeClient drops the client from the registry", async () => {
    const { sseManager } = await import("../sse-manager");
    const c1 = makeController();
    const id = sseManager.addClient(c1, "u1");

    sseManager.removeClient(id);
    expect(sseManager.clientCount()).toBe(0);

    sseManager.pingAll();
    expect(c1.enqueue).not.toHaveBeenCalled();
  });

  it("auto-removes a client whose controller throws on enqueue", async () => {
    const { sseManager } = await import("../sse-manager");
    const c1 = makeController();
    c1.enqueue.mockImplementation(() => {
      throw new Error("client gone");
    });
    sseManager.addClient(c1, "u1");
    expect(sseManager.clientCount()).toBe(1);

    sseManager.pingAll();

    expect(sseManager.clientCount()).toBe(0);
  });
});
