/**
 * Security-aware sending strategy
 *
 * Uses imported contact data (email_security_gateway, security_tier)
 * to adjust sending behavior for better deliverability.
 */

import type { Contact, Campaign } from "../types";
import {
  OUTREACH_ENTERPRISE_GATEWAY_EXTRA_DELAY_MS,
  OUTREACH_MAX_EMAILS_PER_DOMAIN_PER_HOUR,
} from "@/lib/constants";

/**
 * Known enterprise email security gateways
 * Contacts behind these gateways get extra delay and text-only treatment
 */
const ENTERPRISE_GATEWAYS = new Set([
  "proofpoint",
  "mimecast",
  "barracuda",
  "ironport",
  "cisco ironport",
  "fortimail",
  "fortinet",
  "messagelabs",
  "symantec",
  "broadcom",
  "sophos",
  "trendmicro",
  "trend micro",
]);

/**
 * Deliverability strategy for a contact
 */
export interface DeliverabilityStrategy {
  /** Extra delay in milliseconds before sending */
  extraDelayMs: number;
  /** Force text-only for this email */
  forceTextOnly: boolean;
  /** Domain key for throttling */
  domainThrottleKey: string;
}

/**
 * Determine deliverability strategy based on contact security data
 *
 * @param contact - Contact to evaluate
 * @param campaign - Campaign settings
 * @param emailNumber - Which email in the sequence
 * @returns Strategy with extra delay, text mode, and domain key
 */
export function getDeliverabilityStrategy(
  contact: Contact,
  campaign: Campaign,
  emailNumber: number,
): DeliverabilityStrategy {
  const domain = contact.email.split("@")[1]?.toLowerCase() || "";
  const gateway = (contact.email_security_gateway || "").toLowerCase();
  const tier = (contact.security_tier || "").toLowerCase();

  const isEnterpriseGateway = ENTERPRISE_GATEWAYS.has(gateway);
  const isHighSecurity = tier === "enterprise" || tier === "high";

  return {
    extraDelayMs: isEnterpriseGateway ? OUTREACH_ENTERPRISE_GATEWAY_EXTRA_DELAY_MS : 0,
    forceTextOnly: (isEnterpriseGateway || isHighSecurity) && emailNumber === 1,
    domainThrottleKey: domain,
  };
}

/**
 * In-memory domain send tracker
 * Tracks timestamps of recent sends per domain
 *
 * TODO: This is ephemeral — resets on every Vercel cold start. The throttle
 * only works within a single warm function instance (i.e. within one cron
 * batch). For cross-invocation enforcement, move to a Redis or DB counter.
 */
const domainSendTimestamps = new Map<string, number[]>();

/**
 * Check if a domain should be throttled based on recent send volume
 *
 * @param domain - Email domain
 * @param maxPerHour - Maximum sends per domain per hour
 * @returns True if domain should be throttled
 */
export function shouldThrottleDomain(
  domain: string,
  maxPerHour: number = OUTREACH_MAX_EMAILS_PER_DOMAIN_PER_HOUR,
): boolean {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  const timestamps = domainSendTimestamps.get(domain) || [];
  // Clean old entries
  const recent = timestamps.filter((t) => t > oneHourAgo);
  domainSendTimestamps.set(domain, recent);

  return recent.length >= maxPerHour;
}

/**
 * Record a send to a domain for throttle tracking
 *
 * @param domain - Email domain
 */
export function recordDomainSend(domain: string): void {
  const timestamps = domainSendTimestamps.get(domain) || [];
  timestamps.push(Date.now());
  domainSendTimestamps.set(domain, timestamps);
}

/**
 * Clear domain send tracking (for testing or daily reset)
 */
export function clearDomainTracking(): void {
  domainSendTimestamps.clear();
}
