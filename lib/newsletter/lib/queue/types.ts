/**
 * Newsletter Queue Types
 *
 * Type definitions for all newsletter job data and results.
 * Extracted from newsletter-queue.ts for use with QStash Workflow.
 */

/**
 * Job Data Interfaces
 */

export interface CurateJobData {
  campaignId: string;
  sources: string[];
  maxArticles?: number;
  userId?: string;
}

export interface GenerateJobData {
  campaignId: string;
  articles: Array<{
    id: string;
    title: string;
    url: string;
    summary: string;
    source: string;
  }>;
  templateId?: string;
  userId?: string;
}

export interface PublishJobData {
  campaignId: string;
  newsletterId: string;
  subscriberIds?: string[];
  batchSize?: number;
  userId?: string;
}

export interface CleanupJobData {
  olderThan: Date;
  types: Array<"articles" | "newsletters" | "events">;
}

/**
 * Job Result Interfaces
 */

export interface CurateJobResult {
  success: boolean;
  articles: Array<{
    id: string;
    title: string;
    url: string;
    summary?: string;
    score: number;
    source: string;
  }>;
  totalFetched: number;
  totalFiltered: number;
  duration: number;
  error?: string;
}

export interface GenerateJobResult {
  success: boolean;
  newsletterId: string;
  html: string;
  text: string;
  subjectLines: string[];
  duration: number;
  error?: string;
}

export interface PublishJobResult {
  success: boolean;
  sent: number;
  failed: number;
  duration: number;
  errors?: Array<{ subscriberId: string; error: string }>;
}

export interface CleanupJobResult {
  success: boolean;
  deleted: {
    articles?: number;
    newsletters?: number;
    events?: number;
  };
  duration: number;
}

/**
 * Workflow payload types for QStash workflows
 */

export interface SendWorkflowPayload {
  campaignId: string;
  sources: string[];
  maxArticles?: number;
  subscriberIds?: string[];
  batchSize?: number;
  userId?: string;
  testMode?: boolean;
  testEmails?: string[];
}

export interface CurateWorkflowPayload {
  campaignId: string;
  sources: string[];
  maxArticles?: number;
  userId?: string;
}

export interface PublishWorkflowPayload {
  campaignId: string;
  newsletterId: string;
  subscriberIds?: string[];
  batchSize?: number;
  userId?: string;
}

export interface CleanupWorkflowPayload {
  olderThan: string; // ISO date string (serialized for QStash)
  types: Array<"articles" | "newsletters" | "events">;
}
