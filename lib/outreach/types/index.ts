/**
 * Type definitions for the outreach system
 *
 * All types use snake_case keys to match the outreach module's internal convention.
 * Drizzle results are converted from camelCase to snake_case via toSnakeCase() helper.
 */

// Export database module first
export * from "./database";
export * from "./config";

// Import types from database module (already snake_case)
import type {
  OutreachCampaign,
  OutreachContact,
  OutreachEmailEvent,
  OutreachSenderAccount,
  OutreachBlocklist,
} from "./database";

// Re-export with convenience names
export type Campaign = OutreachCampaign;
export type CampaignInsert = import("./database").OutreachCampaignInsert;
export type CampaignUpdate = import("./database").OutreachCampaignUpdate;

export type Contact = OutreachContact;
export type ContactInsert = import("./database").OutreachContactInsert;
export type ContactUpdate = import("./database").OutreachContactUpdate;

export type EmailEvent = OutreachEmailEvent;
export type EmailEventInsert = import("./database").OutreachEmailEventInsert;

export type SenderAccount = OutreachSenderAccount;
export type SenderAccountInsert = import("./database").OutreachSenderAccountInsert;
export type SenderAccountUpdate = import("./database").OutreachSenderAccountUpdate;

export type BlocklistEntry = OutreachBlocklist;
export type BlocklistEntryInsert = import("./database").OutreachBlocklistInsert;

// OutreachSchedule is used via toSnakeCase() so needs snake_case keys too
import type { InferSelectModel } from "drizzle-orm";
import type { outreachSchedules } from "@/lib/db/schema";

type CamelToSnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? T extends Uppercase<T>
    ? `_${Lowercase<T>}${CamelToSnakeCase<U>}`
    : `${T}${CamelToSnakeCase<U>}`
  : S;

type SnakeCaseKeys<T> = {
  [K in keyof T as K extends string ? CamelToSnakeCase<K> : K]: T[K];
};

export type OutreachSchedule = SnakeCaseKeys<InferSelectModel<typeof outreachSchedules>>;

// Helper types for status
export type CampaignStatus = Campaign["status"];
export type ContactStatus = Contact["status"];
export type EventType = EmailEvent["event_type"];
