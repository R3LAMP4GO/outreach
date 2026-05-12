/**
 * Database types for outreach system
 *
 * These types use snake_case to match the outreach module's internal convention.
 * Drizzle results are converted from camelCase to snake_case via toSnakeCase() helper.
 */

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  outreachCampaigns,
  outreachContacts,
  outreachEmailEvents,
  outreachSenderAccounts,
  outreachBlocklist,
} from "@/lib/db/schema";

/**
 * Utility type: Convert camelCase keys to snake_case keys.
 * This matches the runtime conversion done by toSnakeCase() in drizzle-helpers.ts.
 */
type CamelToSnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? T extends Uppercase<T>
    ? `_${Lowercase<T>}${CamelToSnakeCase<U>}`
    : `${T}${CamelToSnakeCase<U>}`
  : S;

type SnakeCaseKeys<T> = {
  [K in keyof T as K extends string ? CamelToSnakeCase<K> : K]: T[K];
};

// Outreach types with snake_case keys (matches toSnakeCase() runtime output)
export type OutreachCampaign = SnakeCaseKeys<InferSelectModel<typeof outreachCampaigns>>;
export type OutreachCampaignInsert = SnakeCaseKeys<InferInsertModel<typeof outreachCampaigns>>;
export type OutreachCampaignUpdate = Partial<OutreachCampaignInsert>;

export type OutreachContact = SnakeCaseKeys<InferSelectModel<typeof outreachContacts>>;
export type OutreachContactInsert = SnakeCaseKeys<InferInsertModel<typeof outreachContacts>>;
export type OutreachContactUpdate = Partial<OutreachContactInsert>;

export type OutreachEmailEvent = SnakeCaseKeys<InferSelectModel<typeof outreachEmailEvents>>;
export type OutreachEmailEventInsert = SnakeCaseKeys<InferInsertModel<typeof outreachEmailEvents>>;
export type OutreachEmailEventUpdate = Partial<OutreachEmailEventInsert>;

export type OutreachSenderAccount = SnakeCaseKeys<InferSelectModel<typeof outreachSenderAccounts>>;
export type OutreachSenderAccountInsert = SnakeCaseKeys<
  InferInsertModel<typeof outreachSenderAccounts>
>;
export type OutreachSenderAccountUpdate = Partial<OutreachSenderAccountInsert>;

export type OutreachBlocklist = SnakeCaseKeys<InferSelectModel<typeof outreachBlocklist>>;
export type OutreachBlocklistInsert = SnakeCaseKeys<InferInsertModel<typeof outreachBlocklist>>;
export type OutreachBlocklistUpdate = Partial<OutreachBlocklistInsert>;

// Legacy exports for backward compatibility
export type Contact = OutreachContact;
export type ContactInsert = OutreachContactInsert;
export type ContactUpdate = OutreachContactUpdate;

export type Campaign = OutreachCampaign;
export type CampaignInsert = OutreachCampaignInsert;
export type CampaignUpdate = OutreachCampaignUpdate;
