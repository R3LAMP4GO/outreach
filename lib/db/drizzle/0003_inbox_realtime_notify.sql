-- Real-time inbox: NOTIFY on outreach_replies INSERT.
-- Used by lib/realtime/pg-listener.ts to broadcast new replies to admin SSE clients.

CREATE OR REPLACE FUNCTION notify_outreach_reply_inserted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify(
    'outreach_reply_inserted',
    json_build_object(
      'id', NEW.id,
      'contact_id', NEW.contact_id,
      'campaign_id', NEW.campaign_id,
      'received_at', NEW.received_at
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_reply_inserted_notify ON outreach_replies;
CREATE TRIGGER outreach_reply_inserted_notify
AFTER INSERT ON outreach_replies
FOR EACH ROW
EXECUTE FUNCTION notify_outreach_reply_inserted();
