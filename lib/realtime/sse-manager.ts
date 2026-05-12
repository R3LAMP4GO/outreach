import "server-only";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import { pgListener, type NewReplyPayload } from "./pg-listener";

interface ClientEntry {
  controller: ReadableStreamDefaultController<Uint8Array>;
  userId: string;
}

interface SseManagerState {
  clients: Map<string, ClientEntry>;
  pingInterval: NodeJS.Timeout | null;
  pgUnsubscribe: (() => void) | null;
}

const PING_INTERVAL_MS = 25_000;
const encoder = new TextEncoder();

const globalForSse = globalThis as unknown as {
  __sseManagerState?: SseManagerState;
};

function getState(): SseManagerState {
  if (!globalForSse.__sseManagerState) {
    globalForSse.__sseManagerState = {
      clients: new Map(),
      pingInterval: null,
      pgUnsubscribe: null,
    };
  }
  return globalForSse.__sseManagerState;
}

function formatFrame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function enqueueOrDrop(clientId: string, frame: Uint8Array): void {
  const state = getState();
  const entry = state.clients.get(clientId);
  if (!entry) return;
  try {
    entry.controller.enqueue(frame);
  } catch (err) {
    logger.debug("[sse-manager] dead client, removing", clientId, err);
    state.clients.delete(clientId);
  }
}

function broadcast(event: string, data: unknown): void {
  const state = getState();
  const frame = formatFrame(event, data);
  for (const clientId of state.clients.keys()) {
    enqueueOrDrop(clientId, frame);
  }
}

function ensureStarted(): void {
  const state = getState();
  if (!state.pgUnsubscribe) {
    state.pgUnsubscribe = pgListener.subscribe((payload: NewReplyPayload) => {
      broadcast("reply:new", payload);
    });
  }
  if (!state.pingInterval) {
    state.pingInterval = setInterval(() => {
      sseManager.pingAll();
    }, PING_INTERVAL_MS);
    // Don't keep the process alive just for the ping timer.
    state.pingInterval.unref?.();
  }
}

export const sseManager = {
  addClient(controller: ReadableStreamDefaultController<Uint8Array>, userId: string): string {
    ensureStarted();
    const clientId = randomUUID();
    getState().clients.set(clientId, { controller, userId });
    return clientId;
  },

  removeClient(clientId: string): void {
    getState().clients.delete(clientId);
  },

  pingAll(): void {
    broadcast("ping", { t: Date.now() });
  },

  clientCount(): number {
    return getState().clients.size;
  },
};
