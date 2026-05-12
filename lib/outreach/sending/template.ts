/**
 * Sequence template rendering.
 *
 * Each campaign owns three body templates (`email_{1,2,3}_template`) and three
 * optional subject templates (`email_{1,2,3}_subject_template`). Templates are
 * the "shell" — the AI-personalised content the endpoint wrote into each lead's
 * `outreach_contacts.email_N_body` / `email_N_subject` gets slotted in via
 * explicit per-step tokens.
 *
 * Recognised tokens (substituted in a single pass):
 *   {{email_1_body}}    {{email_2_body}}    {{email_3_body}}     ← from contact
 *   {{email_1_subject}} {{email_2_subject}} {{email_3_subject}}  ← from contact
 *   {{email_body}}      → current step's body (shortcut for {{email_N_body}})
 *   {{email_subject}}   → current step's subject
 *   {{signature}}       → sender.signature_html (or _plain_text)
 *   {{unsubscribe_link}}→ styled HTML footer (or plain text line)
 *
 * Substitution is one-pass: a body that contains the literal text "{{signature}}"
 * survives. Contact-level tokens like {{first_name}} are handled separately
 * in sender.ts's substituteVariables() *after* this pass.
 */

import DOMPurify from "isomorphic-dompurify";
import type { Contact, Campaign, SenderAccount } from "../types";
import { htmlToPlainText } from "../lib/utils";

/**
 * Allow-list for email-safe HTML used when sanitising sender signatures.
 * See aniketpanjwani/payload-plugin-email-newsletter for the reference list.
 */
const EMAIL_SAFE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "strike",
    "s",
    "span",
    "a",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "img",
    "div",
  ],
  ALLOWED_ATTR: ["href", "style", "target", "rel", "src", "alt", "width", "height"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
  FORBID_ATTR: ["class", "id", "onclick", "onload", "onerror", "onmouseover", "onfocus"],
};

export interface RenderInput {
  campaign: Campaign;
  contact: Contact;
  sender: SenderAccount;
  emailNumber: 1 | 2 | 3;
  unsubscribeUrl: string;
}

/** Styled HTML footer rendered when {{unsubscribe_link}} appears in the template. */
function renderUnsubscribeFooterHtml(url: string): string {
  const safeUrl = url.replace(/"/g, "&quot;");
  return (
    `<p style="font-size:12px;color:#888;margin-top:24px;">` +
    `To unsubscribe, <a href="${safeUrl}">click here</a>.</p>`
  );
}

function renderUnsubscribeFooterText(url: string): string {
  return `\n\nTo unsubscribe: ${url}`;
}

export function pickBodyTemplate(campaign: Campaign, emailNumber: 1 | 2 | 3): string {
  switch (emailNumber) {
    case 1:
      return campaign.email_1_template || `{{email_1_body}}`;
    case 2:
      return campaign.email_2_template || `{{email_2_body}}`;
    case 3:
      return campaign.email_3_template || `{{email_3_body}}`;
  }
}

export function pickSubjectTemplate(campaign: Campaign, emailNumber: 1 | 2 | 3): string | null {
  switch (emailNumber) {
    case 1:
      return campaign.email_1_subject_template?.trim() || null;
    case 2:
      return campaign.email_2_subject_template?.trim() || null;
    case 3:
      return campaign.email_3_subject_template?.trim() || null;
  }
}

/** Build the map of token → value for a given step. */
function buildSubstitutionMap(args: {
  contact: Contact;
  emailNumber: 1 | 2 | 3;
  signature: string;
  footer: string;
}): Record<string, string> {
  const { contact, emailNumber, signature, footer } = args;
  const currentBody =
    emailNumber === 1
      ? contact.email_1_body
      : emailNumber === 2
        ? contact.email_2_body
        : contact.email_3_body;
  const currentSubject =
    emailNumber === 1
      ? contact.email_1_subject
      : emailNumber === 2
        ? contact.email_2_subject || `Re: ${contact.email_1_subject}`
        : contact.email_3_subject;

  return {
    // Current step shortcuts
    email_body: currentBody ?? "",
    email_subject: currentSubject ?? "",
    // Explicit per-step
    email_1_body: contact.email_1_body ?? "",
    email_2_body: contact.email_2_body ?? "",
    email_3_body: contact.email_3_body ?? "",
    email_1_subject: contact.email_1_subject ?? "",
    email_2_subject: contact.email_2_subject ?? "",
    email_3_subject: contact.email_3_subject ?? "",
    // Sequence-level
    signature,
    unsubscribe_link: footer,
  };
}

const SEQUENCE_TOKEN_REGEX =
  /\{\{(email_body|email_subject|email_[123]_body|email_[123]_subject|signature|unsubscribe_link)\}\}/g;

/**
 * Tokens whose substituted value is block-level HTML (paragraphs, footer, etc).
 * When the editor wraps these alone inside a <p> like `<p>{{signature}}</p>`,
 * naive substitution produces invalid `<p><p>...</p></p>` nesting which
 * collapses paragraph margins — the body / signature / footer all run
 * together with no spacing.
 *
 * For these tokens we strip the surrounding <p>...</p> first so the value's
 * own block structure becomes a top-level sibling, giving natural <p>-margin
 * spacing between body / signature / unsubscribe footer.
 */
const BLOCK_LEVEL_TOKENS = new Set([
  "email_body",
  "email_1_body",
  "email_2_body",
  "email_3_body",
  "signature",
  "unsubscribe_link",
]);

/** Matches `<p ...>...{{token}}...</p>` where the token is the only meaningful content. */
const BLOCK_TOKEN_WRAPPED_IN_P =
  /<p\b[^>]*>\s*\{\{(email_body|email_[123]_body|signature|unsubscribe_link)\}\}\s*<\/p>/g;

/**
 * Matches empty <p> blocks left behind by TipTap or trailing in AI-generated
 * bodies: `<p></p>`, `<p>\s*</p>`, `<p><br></p>`, `<p>&nbsp;</p>`. These render
 * as visible blank lines in email clients, so we strip them after substitution.
 */
const EMPTY_P_REGEX = /<p\b[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\s)*\s*<\/p>/gi;

/**
 * Clean up malformed AI-generated anchor markup.
 *
 * The AI endpoint sometimes emits:
 *   1. `<a href="https://cal.com/...">URL<br>—</a>` — the `</a>` is in the
 *      wrong place, so the dash + line-break get rendered as link text.
 *   2. `<a href="...">—</a>` — a standalone anchor wrapping just an em-dash
 *      (or other punctuation), which looks like an underlined random character.
 *
 * Both make the rendered email look broken. We patch them here so the actual
 * sent email and the preview agree, and neither looks ugly.
 */
function cleanAnchors(html: string): string {
  // Step 1: if an <a> contains a <br>, split it so the <br> + everything after
  // moves OUT of the <a>. Run until stable so multiple <br>s in one anchor get
  // peeled one at a time (rare but possible).
  const splitRegex = /(<a\b[^>]*>)([\s\S]*?)(<br\s*\/?>)([\s\S]*?)(<\/a>)/gi;
  let prev: string;
  let cur = html;
  do {
    prev = cur;
    cur = cur.replace(
      splitRegex,
      (_, open, before, br, after, close) => `${open}${before}${close}${br}${after}`,
    );
  } while (cur !== prev);

  // Step 2: unwrap <a> tags whose visible text is empty or pure punctuation /
  // whitespace (em-dash, hyphen, ellipsis, etc). These are AI artefacts, not
  // real links.
  cur = cur.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (match, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (!text || /^[—–\-\u2026\s.,;:!?•·]+$/.test(text)) return inner;
    return match;
  });

  return cur;
}

/** One-pass substitution — inserted text is NOT re-scanned. */
function substituteOnce(template: string, map: Record<string, string>): string {
  // Pass 1: block-level tokens wrapped alone in a <p> — replace the whole <p>.
  let out = template.replace(BLOCK_TOKEN_WRAPPED_IN_P, (match, key: string) =>
    BLOCK_LEVEL_TOKENS.has(key) && map[key] !== undefined ? map[key] : match,
  );
  // Pass 2: any remaining tokens get their value inserted in place.
  out = out.replace(SEQUENCE_TOKEN_REGEX, (_, key: string) => map[key] ?? "");
  // Pass 3: drop empty <p>s anywhere they ended up — from the template, from
  // the AI body's trailing whitespace, or from a block-token substitution that
  // landed next to one. Subjects (no HTML) never hit this regex.
  out = out.replace(EMPTY_P_REGEX, "");
  // Pass 4: clean malformed AI anchor markup (cal.com URL link swallowing a
  // <br>, lone <a>—</a> punctuation anchors, etc).
  out = cleanAnchors(out);
  return out;
}

/**
 * Build the per-step HTML body by expanding the campaign template.
 * Signature is sanitised via DOMPurify (EMAIL_SAFE_CONFIG).
 */
export function renderSequenceBodyHtml(input: RenderInput): string {
  const { campaign, contact, sender, emailNumber, unsubscribeUrl } = input;
  const template = pickBodyTemplate(campaign, emailNumber);
  const signature = sender.signature_html
    ? DOMPurify.sanitize(sender.signature_html, EMAIL_SAFE_CONFIG)
    : "";
  const footer = renderUnsubscribeFooterHtml(unsubscribeUrl);
  return substituteOnce(
    template,
    buildSubstitutionMap({ contact, emailNumber, signature, footer }),
  );
}

/** Plain-text counterpart. */
export function renderSequenceBodyText(input: RenderInput): string {
  const { campaign, contact, sender, emailNumber, unsubscribeUrl } = input;
  const template = pickBodyTemplate(campaign, emailNumber);
  const signature =
    sender.signature_plain_text ??
    (sender.signature_html ? htmlToPlainText(sender.signature_html) : "");
  const footer = renderUnsubscribeFooterText(unsubscribeUrl);
  return substituteOnce(
    template,
    buildSubstitutionMap({ contact, emailNumber, signature, footer }),
  );
}

/**
 * Render the subject line for a step.
 * If the campaign has a subject template for this step, substitute its tokens
 * against the contact. Otherwise fall back to the contact's per-step subject
 * (with the existing "Re:" prepend for step 2).
 */
export function renderSequenceSubject(
  campaign: Campaign,
  contact: Contact,
  emailNumber: 1 | 2 | 3,
): string {
  const template = pickSubjectTemplate(campaign, emailNumber);
  if (template) {
    return substituteOnce(
      template,
      buildSubstitutionMap({ contact, emailNumber, signature: "", footer: "" }),
    );
  }
  // Fallback: original per-lead subject behaviour
  switch (emailNumber) {
    case 1:
      return contact.email_1_subject ?? "";
    case 2:
      return contact.email_2_subject || `Re: ${contact.email_1_subject ?? ""}`;
    case 3:
      return contact.email_3_subject ?? "";
  }
}
