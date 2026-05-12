import { describe, it, expect } from "vitest";
import {
  buildQuotedReplyText,
  buildQuotedReplyHtml,
  type QuotedSource,
} from "../build-quoted-reply";

const BASE_SOURCE: QuotedSource = {
  fromEmail: "jane@acme.com",
  fromName: "Jane Doe",
  // 2025-01-06 02:00:00 UTC — in Australia/Perth (UTC+8) that's 10:00 AM Mon.
  receivedAt: "2025-01-06T02:00:00.000Z",
  bodyText: "Hey there,\nThis is the original message.\nThanks!",
  bodyHtml: null,
  timezone: "Australia/Perth",
};

describe("buildQuotedReplyText", () => {
  it("includes the new reply text at the top", () => {
    const out = buildQuotedReplyText("No worries mate", BASE_SOURCE);
    expect(out.startsWith("No worries mate\n\n")).toBe(true);
  });

  it("inserts the Gmail-style attribution line", () => {
    const out = buildQuotedReplyText("No worries", BASE_SOURCE);
    expect(out).toContain("On Mon, Jan 6, 2025 at 10:00 AM, Jane Doe <jane@acme.com> wrote:");
  });

  it("prefixes every line of bodyText with '> '", () => {
    const out = buildQuotedReplyText("Reply", BASE_SOURCE);
    expect(out).toContain("> Hey there,");
    expect(out).toContain("> This is the original message.");
    expect(out).toContain("> Thanks!");
  });

  it("preserves chain depth — existing '> ' lines become '>> '", () => {
    const src: QuotedSource = {
      ...BASE_SOURCE,
      bodyText: "Latest reply.\n> previous reply\n>> even older",
    };
    const out = buildQuotedReplyText("New", src);
    expect(out).toContain("> Latest reply.");
    expect(out).toContain("> > previous reply");
    expect(out).toContain("> >> even older");
  });

  it("falls back to htmlToPlainText(bodyHtml) when bodyText is null", () => {
    const src: QuotedSource = {
      ...BASE_SOURCE,
      bodyText: null,
      bodyHtml: "<p>Hello</p><p>World</p>",
    };
    const out = buildQuotedReplyText("Hi", src);
    expect(out).toContain("> Hello");
    expect(out).toContain("> World");
  });

  it("returns just the new text + attribution when both bodies are null", () => {
    const src: QuotedSource = { ...BASE_SOURCE, bodyText: null, bodyHtml: null };
    const out = buildQuotedReplyText("Hi", src);
    expect(out).toContain("Hi\n\n");
    expect(out).toContain("wrote:");
    // No line should start with the quote prefix when there's nothing to quote
    expect(out.split("\n").some((l) => l.startsWith("> "))).toBe(false);
  });

  it("uses Australia/Perth when no tz supplied", () => {
    const src: QuotedSource = { ...BASE_SOURCE, timezone: undefined };
    const out = buildQuotedReplyText("X", src);
    expect(out).toContain("10:00 AM");
  });

  it("respects the supplied tz", () => {
    // 02:00 UTC → 21:00 previous-day America/New_York (UTC-5 in Jan)
    const src: QuotedSource = { ...BASE_SOURCE, timezone: "America/New_York" };
    const out = buildQuotedReplyText("X", src);
    expect(out).toContain("9:00 PM");
    expect(out).toContain("Sun, Jan 5, 2025");
  });

  it("uses raw email when fromName is missing", () => {
    const src: QuotedSource = { ...BASE_SOURCE, fromName: null };
    const out = buildQuotedReplyText("X", src);
    expect(out).toContain("On Mon, Jan 6, 2025 at 10:00 AM, jane@acme.com wrote:");
  });
});

describe("buildQuotedReplyHtml", () => {
  it("wraps new text in <div dir='ltr'> with newlines as <br>", () => {
    const out = buildQuotedReplyHtml("Line one\nLine two", BASE_SOURCE);
    expect(out).toContain('<div dir="ltr">Line one<br>Line two</div>');
  });

  it("escapes <, >, & in new text", () => {
    const out = buildQuotedReplyHtml("a < b & c > d", BASE_SOURCE);
    expect(out).toContain("a &lt; b &amp; c &gt; d");
    expect(out).not.toContain("a < b & c > d");
  });

  it("renders attribution inside class='gmail_attr' div", () => {
    const out = buildQuotedReplyHtml("Hi", BASE_SOURCE);
    expect(out).toContain('<div dir="ltr" class="gmail_attr">');
    expect(out).toContain("Jane Doe");
    expect(out).toContain("&lt;");
    expect(out).toContain("&gt;");
    expect(out).toContain("wrote:");
  });

  it("uses Gmail's exact blockquote style attribute", () => {
    const out = buildQuotedReplyHtml("Hi", BASE_SOURCE);
    expect(out).toContain(
      '<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">',
    );
  });

  it("uses gmail_quote_container wrapper", () => {
    const out = buildQuotedReplyHtml("Hi", BASE_SOURCE);
    expect(out).toContain('class="gmail_quote gmail_quote_container"');
  });

  it("sanitizes inbound bodyHtml — strips <script>", () => {
    const src: QuotedSource = {
      ...BASE_SOURCE,
      bodyHtml: "<p>Hello</p><script>alert('xss')</script>",
    };
    const out = buildQuotedReplyHtml("Hi", src);
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(");
    expect(out).toContain("<p>Hello</p>");
  });

  it("strips javascript: URIs from inbound HTML", () => {
    const src: QuotedSource = {
      ...BASE_SOURCE,
      bodyHtml: '<a href="javascript:alert(1)">click</a>',
    };
    const out = buildQuotedReplyHtml("Hi", src);
    expect(out).not.toContain("javascript:");
  });

  it("falls back to escaped bodyText with <br> when bodyHtml is null", () => {
    const src: QuotedSource = {
      ...BASE_SOURCE,
      bodyHtml: null,
      bodyText: "Line A\nLine B",
    };
    const out = buildQuotedReplyHtml("Hi", src);
    // The fallback content lives inside the blockquote
    expect(out).toContain("Line A<br>Line B");
  });

  it("attribution date matches the Gmail format 'On Mon, Jan 6, 2025 at 10:00 AM'", () => {
    const out = buildQuotedReplyHtml("Hi", BASE_SOURCE);
    expect(out).toContain("On Mon, Jan 6, 2025 at 10:00 AM");
  });

  describe("URL auto-linking", () => {
    it("wraps the calendar URL in a clickable <a> tag", () => {
      const out = buildQuotedReplyHtml("Grab a slot: https://cal.example.com/intro", BASE_SOURCE);
      expect(out).toContain(
        '<a href="https://cal.example.com/intro" target="_blank" rel="noopener noreferrer">https://cal.example.com/intro</a>',
      );
    });

    it("linkifies http and https URLs", () => {
      const out = buildQuotedReplyHtml("http://example.com and https://example.org", BASE_SOURCE);
      expect(out).toContain('<a href="http://example.com"');
      expect(out).toContain('<a href="https://example.org"');
    });

    it("strips trailing punctuation from the linked URL", () => {
      // "Visit https://example.com." — the period belongs to the sentence,
      // not the URL.
      const out = buildQuotedReplyHtml("Visit https://example.com.", BASE_SOURCE);
      expect(out).toContain('<a href="https://example.com"');
      expect(out).toContain("</a>.");
      expect(out).not.toContain('href="https://example.com."');
    });

    it("does not linkify plain text without a URL", () => {
      // The attribution line legitimately contains a `mailto:` <a> for the
      // sender, so scope this assertion to the new-text region above the
      // gmail_quote container.
      const out = buildQuotedReplyHtml("No links here mate.", BASE_SOURCE);
      const newTextRegion = out.split('<div class="gmail_quote')[0];
      expect(newTextRegion).not.toContain("<a href=");
    });

    it("escapes HTML in user input before linkifying (no injection)", () => {
      const out = buildQuotedReplyHtml(
        "<script>alert(1)</script> https://example.com",
        BASE_SOURCE,
      );
      expect(out).not.toContain("<script>");
      expect(out).toContain("&lt;script&gt;");
      expect(out).toContain('<a href="https://example.com"');
    });

    it("preserves URL with path, query string, and hash", () => {
      const out = buildQuotedReplyHtml(
        "See https://example.com/path/page?q=hello#section for details",
        BASE_SOURCE,
      );
      expect(out).toContain(
        '<a href="https://example.com/path/page?q=hello#section" target="_blank"',
      );
    });
  });
});
