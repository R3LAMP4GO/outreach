import DOMPurify from "isomorphic-dompurify";
import { OUTREACH_DEFAULT_TIMEZONE } from "@/lib/constants";
import { htmlToPlainText } from "@/lib/outreach/lib/utils";

export interface QuotedSource {
  fromEmail: string;
  fromName?: string | null;
  /** ISO timestamp */
  receivedAt: string;
  bodyText: string | null;
  bodyHtml: string | null;
  /** IANA tz for the attribution date — defaults to Australia/Perth */
  timezone?: string | null;
}

/**
 * Gmail-style attribution date, e.g. "Mon, Jan 6, 2025 at 10:00 AM".
 * Always en-US locale to match Gmail's reference format.
 */
function formatAttributionDate(iso: string, tz: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    // Fallback: if the timestamp is unparseable, return the raw string.
    return iso;
  }

  let resolvedTz = tz;
  try {
    // Validate tz — Intl will throw on an unknown identifier.
    new Intl.DateTimeFormat("en-US", { timeZone: resolvedTz });
  } catch {
    resolvedTz = OUTREACH_DEFAULT_TIMEZONE;
  }

  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: resolvedTz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: resolvedTz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${datePart} at ${timePart}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap bare http(s) URLs in clickable <a> tags. Operates on already-HTML-escaped
 * text — the regex matches `&amp;` inside query strings (the escaped form of `&`).
 *
 * Strips trailing punctuation that's commonly adjacent to a URL but not part of
 * it (`. , ; : ! ?`) so a sentence-ending URL renders as a clean link.
 *
 * Email clients (Gmail, Outlook, Apple Mail) auto-linkify URLs in plain-text
 * emails but NOT in HTML emails. Without this step, a URL in an HTML reply
 * shows as text the recipient has to copy-paste.
 */
function linkifyUrls(escapedText: string): string {
  // Allow letters, digits, common URL chars, and the escaped ampersand `&amp;`.
  // Disallow whitespace, HTML tag boundaries, and the closing chars produced
  // by escapeHtml (`&quot;`, `&#39;` — already escaped, so `<`, `>`, `"`, `'`
  // can't appear in escapedText anyway).
  return escapedText.replace(
    /\bhttps?:\/\/[\w\-._~:/?#@!$()*+,=%]+(?:&amp;[\w\-._~:/?#@!$()*+,=%]+)*/g,
    (url) => {
      // Strip trailing punctuation that wasn't really part of the URL.
      const match = url.match(/^(.*?)([.,;:!?]*)$/);
      const cleanUrl = match?.[1] ?? url;
      const tail = match?.[2] ?? "";
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${tail}`;
    },
  );
}

// Exported for unit tests.
export const _internal = { linkifyUrls, escapeHtml };

interface Attribution {
  text: string;
  html: string;
}

function buildAttribution(source: QuotedSource): Attribution {
  const tz = source.timezone || OUTREACH_DEFAULT_TIMEZONE;
  const date = formatAttributionDate(source.receivedAt, tz);
  const name = source.fromName?.trim();

  // Plain text: "On <date>, <Name> <email> wrote:" — use angle brackets when
  // there's a display name, raw email otherwise.
  const text = name
    ? `On ${date}, ${name} <${source.fromEmail}> wrote:`
    : `On ${date}, ${source.fromEmail} wrote:`;

  const html = name
    ? `On ${escapeHtml(date)}, ${escapeHtml(name)} &lt;<a href="mailto:${escapeHtml(
        source.fromEmail,
      )}">${escapeHtml(source.fromEmail)}</a>&gt; wrote:`
    : `On ${escapeHtml(date)}, <a href="mailto:${escapeHtml(source.fromEmail)}">${escapeHtml(
        source.fromEmail,
      )}</a> wrote:`;

  return { text, html };
}

/**
 * DOMPurify allowlist mirroring components/admin/EmailThread.tsx — sanitize
 * untrusted inbound HTML before embedding in our outbound reply.
 */
function sanitizeInboundHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "code",
      "pre",
      "div",
      "span",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  });
}

/**
 * Build a Gmail-style plain-text reply body:
 *
 *   {newText}
 *
 *   On {date}, {Name} <{email}> wrote:
 *   > {previous body, every line "> "-prefixed}
 *
 * Each inbound message already contains its own quoted ancestor chain (Gmail
 * auto-quotes on every reply), so quoting only the immediate previous message
 * preserves full thread depth on the recipient's side.
 */
export function buildQuotedReplyText(newText: string, source: QuotedSource): string {
  const attribution = buildAttribution(source);

  // Resolve quoted body — prefer plain text, fall back to html→text conversion.
  let quoted = source.bodyText ?? "";
  if (!quoted && source.bodyHtml) {
    quoted = htmlToPlainText(source.bodyHtml);
  }

  const trimmedNew = newText.replace(/\s+$/, "");

  if (!quoted.trim()) {
    // Edge case: no prior body to quote. Still emit the attribution so the
    // recipient sees we're replying to something.
    return `${trimmedNew}\n\n${attribution.text}\n`;
  }

  const quotedLines = quoted
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  return `${trimmedNew}\n\n${attribution.text}\n${quotedLines}`;
}

/**
 * Build a Gmail-style HTML reply body using the `gmail_quote` pattern. Gmail
 * recognises this exact structure and renders it as a collapsed
 * "Show trimmed content" block.
 */
export function buildQuotedReplyHtml(newText: string, source: QuotedSource): string {
  const attribution = buildAttribution(source);

  // Order matters: escape → linkify → newlines.
  // - escape first so user input can't inject HTML.
  // - linkify on the escaped string so we wrap raw URLs in <a> tags before
  //   newlines turn into <br> (linkify doesn't span line breaks).
  const escaped = escapeHtml(newText.replace(/\s+$/, ""));
  const linked = linkifyUrls(escaped);
  const newTextHtml = linked.replace(/\n/g, "<br>");

  let quotedInner = "";
  if (source.bodyHtml && source.bodyHtml.trim()) {
    quotedInner = sanitizeInboundHtml(source.bodyHtml);
  } else if (source.bodyText && source.bodyText.trim()) {
    quotedInner = escapeHtml(source.bodyText).replace(/\r?\n/g, "<br>");
  }

  return [
    `<div dir="ltr">${newTextHtml}</div>`,
    `<br>`,
    `<div class="gmail_quote gmail_quote_container">`,
    `<div dir="ltr" class="gmail_attr">${attribution.html}</div>`,
    `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${quotedInner}</blockquote>`,
    `</div>`,
  ].join("");
}
