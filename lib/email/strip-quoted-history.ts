/**
 * Strip quoted reply history from email bodies before rendering each turn
 * in a thread view.
 *
 * Email clients (Gmail, Outlook, Apple Mail, Yahoo, etc.) include the prior
 * message inline whenever someone hits "Reply". When we already render every
 * earlier turn as its own bubble, those inline quotes become visual duplicates.
 *
 * This module provides:
 * - `stripQuotedText` for plain-text bodies (also used by the AI reply analyzer
 *   so it doesn't analyze the same content twice)
 * - `stripQuotedHtml`  for HTML bodies — strips Gmail/Yahoo/Outlook quote
 *   containers and any trailing <blockquote> chain that wraps the prior message
 *
 * Patterns sourced from how Mailspring (`quoted-html-transformer`) and Inbox
 * Zero (`extract-reply.client`) handle the same problem.
 */

/**
 * Strip the quoted history block from a plain-text email body.
 *
 * Cuts at the earliest of:
 *   - `\nOn <…> wrote:` (Gmail / iOS / many clients)
 *   - `\n>` quoted-prefix block
 *   - `\n-----Original Message-----` (Outlook)
 *   - `\nFrom: ` reply header (Outlook)
 */
export function stripQuotedText(text: string): string {
  if (!text) return "";
  let cleaned = text;

  const cutMarkers: Array<RegExp | string> = [
    /\n[ \t]*On .*wrote:/, // Gmail/iOS — "On Mon, Jan 1, 2025 at 10:00, Jane <…> wrote:"
    "\n>",
    /\n[ \t]*-----\s*Original Message\s*-----/i,
    /\n[ \t]*From:\s.+\n(?:.*\n){0,4}?(?:Sent|To|Subject):/i, // Outlook reply header block
  ];

  let earliest = -1;
  for (const marker of cutMarkers) {
    const idx = typeof marker === "string" ? cleaned.indexOf(marker) : cleaned.search(marker);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
  }

  if (earliest !== -1) cleaned = cleaned.slice(0, earliest);
  return cleaned.trim();
}

/**
 * Strip quoted-history blocks from an HTML email body.
 *
 * Removes (in order):
 * 1. `.gmail_quote_container` / `.gmail_quote` — Gmail's wrapper for the inline
 *    "On … wrote:" + blockquote chain
 * 2. `.yahoo_quoted` — Yahoo / AOL
 * 3. Any trailing `<blockquote>` element at the document root (covers Outlook,
 *    Apple Mail, and stripped/legacy clients that just append a blockquote)
 * 4. The Gmail attribution paragraph if it leaks out (`<div class="gmail_attr">`)
 *
 * Runs server-side (jsdom in tests, isomorphic-dompurify already pulls one in
 * via `linkedom`) and client-side (DOMParser).
 */
export function stripQuotedHtml(html: string): string {
  if (!html) return "";

  // Use DOMParser when available (browser); fall back to a regex stripper on
  // the server so we don't pull in a parser dep for SSR.
  if (typeof DOMParser !== "undefined") {
    return stripWithDomParser(html);
  }
  return stripWithRegex(html);
}

/**
 * Matches reply-attribution lines that signal the start of quoted history.
 * The element carrying this text (and everything after it within its parent)
 * gets stripped.
 */
// Note: avoiding the `s` (dotall) regex flag for tsconfig-target compatibility;
// `[\s\S]` covers any character including newlines.
const ATTRIBUTION_REGEX =
  /^\s*(?:On[\s\S]{0,300}?\bwrote:|-----\s*Original Message\s*-----|From:[\s\S]+?Sent:|De\s?:[\s\S]+?Envoyé\s?:|Von:[\s\S]+?Gesendet:)/i;

function stripWithDomParser(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const body = doc.body;
    if (!body) return html;

    // 1. Remove every <blockquote>. In HTML email these are effectively always
    //    quoted history (Gmail/Apple Mail/Outlook all use them this way).
    //    Mailspring, Inbox Zero, and Chatwoot all take this approach.
    body.querySelectorAll("blockquote").forEach((el) => el.remove());

    // 2. Gmail / Yahoo / Outlook explicit quote containers
    body
      .querySelectorAll(
        ".gmail_quote_container, .gmail_quote, .gmail_attr, .yahoo_quoted, [class*='yahoo_quoted'], #appendonsend, #divRplyFwdMsg, hr#stopSpelling, .OutlookMessageHeader",
      )
      .forEach((el) => removeWithFollowingSiblings(el));

    // 3. Walk every container and find an attribution-line element
    //    (e.g. "On Fri, 10 Apr 2026 ... wrote:"). Drop it plus all subsequent
    //    siblings within its parent. This catches Notion Mail / plaintext-style
    //    attributions that aren't wrapped in a recognisable container.
    stripAttributionAndAfter(body);

    // 4. Final pass: trim trailing empty/whitespace nodes left behind.
    let last = body.lastElementChild;
    while (last && isEmptyTextNode(last)) {
      const prev = last.previousElementSibling;
      last.remove();
      last = prev;
    }

    return body.innerHTML.trim();
  } catch {
    return stripWithRegex(html);
  }
}

/**
 * Remove `el` along with every sibling that comes after it within its parent.
 * Used for divider/attribution elements where the quoted chain follows them
 * as siblings (Outlook `#divRplyFwdMsg`, Notion Mail attribution `<div>`s).
 */
function removeWithFollowingSiblings(el: Element): void {
  let node: Element | null = el;
  while (node) {
    const next: Element | null = node.nextElementSibling;
    node.remove();
    node = next;
  }
}

/**
 * Recursively descend into the doc looking for an element whose own text
 * starts with a reply-attribution pattern. When found, drop it and every
 * following sibling. Walks depth-first so nested wrappers (e.g.
 * `<div><div>On ... wrote:</div>...</div>`) are caught.
 */
function stripAttributionAndAfter(root: Element): void {
  // Children snapshot — we may mutate during iteration.
  const children = Array.from(root.children);
  for (const child of children) {
    // Skip nodes that have already been removed by a prior iteration.
    if (!child.isConnected) continue;

    const ownText = directTextContent(child).trim();
    if (ownText && ATTRIBUTION_REGEX.test(ownText)) {
      removeWithFollowingSiblings(child);
      return;
    }
    // Recurse — the attribution may live in a deeper wrapper
    stripAttributionAndAfter(child);
  }
}

/**
 * Concatenated text of the element's direct text-node children only
 * (excludes text from nested elements). Lets us tell whether THIS element
 * carries the "On ... wrote:" line vs. just containing children that do.
 */
function directTextContent(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      out += node.textContent ?? "";
    }
  }
  return out;
}

function isEmptyTextNode(el: Element): boolean {
  return el.tagName === "BR" || (el.textContent ?? "").trim() === "";
}

/**
 * Server-side / fallback stripper. Conservative — only removes well-known
 * Gmail / Yahoo wrappers and trailing blockquote chains. Misses the exotic
 * cases the DOM walker catches, which is acceptable because in production the
 * thread renders client-side anyway (the EmailThread component is `"use client"`).
 */
function stripWithRegex(html: string): string {
  let out = html;

  // 1. Strip ALL <blockquote>...</blockquote> blocks (nested handled by looping).
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, "");
  }

  // 2. Gmail / Yahoo wrappers (anywhere, not just trailing)
  out = out.replace(/<div[^>]*class="[^"]*gmail_quote_container[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  out = out.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  out = out.replace(/<div[^>]*class="[^"]*gmail_attr[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  out = out.replace(/<div[^>]*class="[^"]*yahoo_quoted[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");

  // 3. Cut at the first reply-attribution line ("On ... wrote:" /
  //    "-----Original Message-----"). Everything after is quoted history.
  const cuts: RegExp[] = [
    /<div[^>]*>\s*On[\s\S]{0,300}?\bwrote:/i,
    /<p[^>]*>\s*On[\s\S]{0,300}?\bwrote:/i,
    /On[\s\S]{0,300}?\bwrote:/i,
    /-----\s*Original Message\s*-----/i,
  ];
  let earliest = -1;
  for (const re of cuts) {
    const m = out.match(re);
    if (m && m.index !== undefined && (earliest === -1 || m.index < earliest)) {
      earliest = m.index;
    }
  }
  if (earliest !== -1) out = out.slice(0, earliest);

  return out.trim();
}
