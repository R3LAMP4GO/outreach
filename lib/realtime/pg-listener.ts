import "server-only";
import postgres from "postgres";
import { logger } from "@/lib/logger";

export interface NewReplyPayload {
  id: string;
  contact_id: string;
  campaign_id: string | null;
  received_at: string | null;
}

type Subscriber = (payload: NewReplyPayload) => void;

const CHANNEL = "outreach_reply_inserted";
const RECONNECT_MS = 5000;

interface PgListenerState {
  sql: postgres.Sql | null;
  subscribers: Set<Subscriber>;
  connected: boolean;
  connecting: boolean;
  reconnectTimer: NodeJS.Timeout | null;
}

const globalForListener = globalThis as unknown as {
  __pgListenerState?: PgListenerState;
};

function getState(): PgListenerState {
  if (!globalForListener.__pgListenerState) {
    globalForListener.__pgListenerState = {
      sql: null,
      subscribers: new Set(),
      connected: false,
      connecting: false,
      reconnectTimer: null,
    };
  }
  return globalForListener.__pgListenerState;
}

async function connect(): Promise<void> {
  const state = getState();
  if (state.connected || state.connecting) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error("[pg-listener] DATABASE_URL not set, cannot start listener");
    return;
  }

  state.connecting = true;

  try {
    // Dedicated connection — LISTEN holds it forever, must not share the pool.
    const sql = postgres(connectionString, {
      prepare: false,
      max: 1,
      idle_timeout: 0,
      max_lifetime: null as unknown as number,
      connection: {
        application_name: "website-realtime-listener",
      },
    });

    await sql.listen(
      CHANNEL,
      (payloadStr) => {
        try {
          const payload = JSON.parse(payloadStr) as NewReplyPayload;
          for (const sub of state.subscribers) {
            try {
              sub(payload);
            } catch (err) {
              logger.error("[pg-listener] subscriber threw", err);
            }
          }
        } catch (err) {
          logger.error("[pg-listener] failed to parse NOTIFY payload", err, payloadStr);
        }
      },
      () => {
        logger.info("[pg-listener] connected, listening on", CHANNEL);
      },
    );

    state.sql = sql;
    state.connected = true;
    state.connecting = false;
  } catch (err) {
    state.connecting = false;
    state.connected = false;
    logger.error("[pg-listener] connect failed, retrying in", RECONNECT_MS, "ms", err);
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  const state = getState();
  if (state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    state.connected = false;
    if (state.sql) {
      state.sql.end({ timeout: 1 }).catch(() => {});
      state.sql = null;
    }
    void connect();
  }, RECONNECT_MS);
}

export const pgListener = {
  /**
   * Subscribe to NOTIFY payloads on `outreach_reply_inserted`.
   * Lazily starts the listener on the first subscribe.
   * Returns an unsubscribe function.
   */
  subscribe(handler: Subscriber): () => void {
    const state = getState();
    state.subscribers.add(handler);
    if (!state.connected && !state.connecting) {
      void connect();
    }
    return () => {
      state.subscribers.delete(handler);
    };
  },

  /** For tests: number of active subscribers. */
  _subscriberCount(): number {
    return getState().subscribers.size;
  },

  /** For tests: force a reconnect cycle. */
  _scheduleReconnect: scheduleReconnect,
};
