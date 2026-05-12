/**
 * CRM module types
 */

// ============================================================================
// Contact Types
// ============================================================================

export interface ContactListParams {
  search?: string;
  status?: string;
  page: number;
  limit: number;
}

export interface ContactListResult {
  contacts: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

export interface ContactDetailResult {
  contact: Record<string, unknown>;
  deals: Record<string, unknown>[];
  timeline: Record<string, unknown>[];
}

export interface BulkUpdateContactsParams {
  contact_ids: string[];
  updates: {
    contact_status?: "subscriber" | "lead" | "qualified" | "customer";
    tags?: string[];
    add_tags?: string[];
  };
}

export interface BulkUpdateContactsResult {
  updated: number;
  message: string;
}

export interface BulkDeleteContactsResult {
  deleted: number;
  message: string;
}

// ============================================================================
// Deal Types
// ============================================================================

export interface DealListParams {
  pipelineSlug?: string;
  search?: string;
  stageSlug?: string;
  page: number;
  limit: number;
}

export interface DealListResult {
  deals: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

export interface DealDetailResult {
  deal: Record<string, unknown>;
  history: Record<string, unknown>[];
}

export interface DealUpdateData {
  stage_id?: string;
  name?: string;
  amount?: number | null;
  probability?: number | null;
  expected_close_date?: string | null;
  notes?: string | null;
}

export interface MoveDealParams {
  dealId: string;
  stageId: string;
  userId: string;
}

export interface BulkUpdateDealsParams {
  deal_ids: string[];
  updates: {
    stage_slug?: string;
  };
  userId: string;
}

export interface BulkUpdateDealsResult {
  updated: number;
  deals: Record<string, unknown>[] | null;
}

export interface BulkDeleteDealsResult {
  deleted: number;
  message: string;
}

export interface PipelineDealsResult {
  stages: Record<string, unknown>[];
  dealsByStage: Record<string, Record<string, unknown>[]>;
  totalDeals: number;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface MetricsRpcResult {
  pipelineValue: number;
  winRate: number;
  salesCycle: number;
  activeDeals: number;
  newLeads: number;
}

export interface PipelineStage {
  stage: string;
  slug: string;
  color: string | null;
  count: number;
  value: number;
}

export interface SourceEntry {
  source: string;
  count: number;
}

export interface LeadEntry {
  date: string;
  count: number;
}

export interface ActivityEntry {
  id: string;
  changed_at: string | null;
  deal_name: string;
  from_stage: string | null;
  from_stage_color: string | null;
  to_stage: string;
  to_stage_color: string | null;
}

export interface DashboardRpcResult {
  pipeline: PipelineStage[];
  sources: SourceEntry[];
  leadsOverTime: LeadEntry[];
  recentActivity: ActivityEntry[];
}

export interface CrmMetricsResult {
  pipelineValue: number;
  winRate: number;
  avgSalesCycle: number;
  activeDeals: number;
  newLeads: number;
  dealsByStage: {
    stage: string;
    slug: string;
    color: string;
    count: number;
    value: number;
  }[];
  dealsBySource: {
    source: string;
    count: number;
  }[];
  leadsOverTime: {
    week: string;
    count: number;
  }[];
  recentActivity: {
    id: string;
    changedAt: string;
    triggerSource: null;
    dealName: string;
    fromStage: { name: string; color: string } | null;
    toStage: { name: string; color: string };
  }[];
}

// ============================================================================
// Timeline Event Types
// ============================================================================

export type TimelineEventType =
  | "contact_created"
  | "status_changed"
  | "deal_created"
  | "stage_changed"
  | "deal_won"
  | "deal_lost"
  | "form_submitted"
  | "booking_created"
  | "booking_rescheduled"
  | "booking_cancelled"
  | "newsletter_subscribed"
  | "newsletter_unsubscribed"
  | "outreach_reply"
  | "outreach_sent"
  | "email_sent"
  | "email_received"
  | "note_added"
  | "tags_updated";

export interface TimelineEventInput {
  contactId: string;
  eventType: TimelineEventType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  pipelineId?: string;
  stageId?: string;
  oldStageId?: string;
}

export interface TimelineActivityEvent {
  id: string;
  event_type: TimelineEventType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    contact_status: string | null;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export class CrmError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "CrmError";
  }
}
