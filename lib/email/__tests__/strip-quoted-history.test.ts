import { describe, it, expect } from "vitest";
import { stripQuotedText, stripQuotedHtml } from "../strip-quoted-history";

describe("stripQuotedText", () => {
  it("returns empty string for empty input", () => {
    expect(stripQuotedText("")).toBe("");
  });

  it("returns the input unchanged when there's no quoted history", () => {
    expect(stripQuotedText("Hey, sounds good!")).toBe("Hey, sounds good!");
  });

  it('cuts at "On <date>, <name> wrote:" (Gmail / iOS)', () => {
    const input = `Sounds great!\nOn Mon, Jan 1 2025 at 10:00, Jane <j@x.com> wrote:\n> earlier message`;
    expect(stripQuotedText(input)).toBe("Sounds great!");
  });

  it("cuts at a leading > quoted block", () => {
    const input = `Yes please.\n> hi\n> there`;
    expect(stripQuotedText(input)).toBe("Yes please.");
  });

  it("cuts at -----Original Message----- (Outlook)", () => {
    const input = `Confirmed.\n-----Original Message-----\nFrom: Jane`;
    expect(stripQuotedText(input)).toBe("Confirmed.");
  });

  it("cuts at the Outlook reply header block (From: / Sent: / Subject:)", () => {
    const input = `Booked it in.\nFrom: Jane Doe <j@x.com>\nSent: Monday\nTo: me\nSubject: Re: Hi\n\n[quoted body]`;
    expect(stripQuotedText(input)).toBe("Booked it in.");
  });

  it("uses whichever marker comes first when several are present", () => {
    const input = `Yep.\nOn Tue wrote:\n> some quoted\n-----Original Message-----`;
    expect(stripQuotedText(input)).toBe("Yep.");
  });

  it("trims trailing whitespace from the cleaned body", () => {
    const input = `Sure thing.   \n\nOn Mon wrote:\n> quoted`;
    expect(stripQuotedText(input)).toBe("Sure thing.");
  });
});

describe("stripQuotedHtml", () => {
  it("returns empty string for empty input", () => {
    expect(stripQuotedHtml("")).toBe("");
  });

  it("strips a Gmail .gmail_quote_container block", () => {
    const html = `<div dir="ltr">My fresh reply.</div><div class="gmail_quote gmail_quote_container"><div class="gmail_attr">On Mon wrote:</div><blockquote>old</blockquote></div>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("My fresh reply.");
    expect(out).not.toContain("On Mon wrote:");
    expect(out).not.toContain(">old<");
  });

  it("strips a bare blockquote.gmail_quote", () => {
    const html = `<p>Reply body.</p><blockquote class="gmail_quote">earlier</blockquote>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("Reply body.");
    expect(out).not.toContain("earlier");
  });

  it("strips trailing <blockquote> chains (Apple Mail / generic)", () => {
    const html = `<div>Hi there.</div><blockquote>quoted A<blockquote>quoted B</blockquote></blockquote>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("Hi there.");
    expect(out).not.toContain("quoted A");
    expect(out).not.toContain("quoted B");
  });

  it("strips a Yahoo .yahoo_quoted block", () => {
    const html = `<div>My note.</div><div class="yahoo_quoted">prior thread</div>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("My note.");
    expect(out).not.toContain("prior thread");
  });

  it("strips a stray .gmail_attr line that escapes its container", () => {
    const html = `<div>Hi.</div><div class="gmail_attr">On Mon wrote:</div>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("Hi.");
    expect(out).not.toContain("On Mon wrote:");
  });

  it("leaves bodies without quoted history untouched", () => {
    const html = `<p>Just a plain reply.</p>`;
    expect(stripQuotedHtml(html)).toContain("Just a plain reply.");
  });

  it("strips Notion-Mail style: top-level <div> wrapper + plain attribution + nested blockquotes", () => {
    const html = `<div>
      <p>My new content.</p>
      <p>Sent with Notion Mail</p>
      <div>On Fri, 10 Apr 2026 10:33:15 GMT Treasurer DFC &lt;t@x.com&gt; wrote:</div>
      <blockquote>Thanks Jake.<blockquote>We did not discuss Google v Microsoft.<blockquote>Ok great, send through the NDA.</blockquote></blockquote></blockquote>
    </div>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("My new content.");
    expect(out).toContain("Sent with Notion Mail");
    expect(out).not.toContain("On Fri, 10 Apr 2026");
    expect(out).not.toContain("Thanks Jake");
    expect(out).not.toContain("Google v Microsoft");
    expect(out).not.toContain("send through the NDA");
  });

  it("strips a deeply nested blockquote chain even without a wrapping container", () => {
    const html = `<div>Reply.</div><blockquote>L1<blockquote>L2<blockquote>L3</blockquote></blockquote></blockquote>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("Reply.");
    expect(out).not.toContain("L1");
    expect(out).not.toContain("L2");
    expect(out).not.toContain("L3");
  });

  it("strips an attribution line that lives inside a deeply nested wrapper", () => {
    const html = `<div><div><p>Hi there.</p><div><div>On Mon, 1 Jan 2025 at 10:00, Jane wrote:</div><blockquote>old reply</blockquote></div></div></div>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("Hi there.");
    expect(out).not.toContain("On Mon");
    expect(out).not.toContain("old reply");
  });

  it("strips Outlook -----Original Message----- divider and following content", () => {
    const html = `<div>My reply.</div><div>-----Original Message-----</div><div>From: Jane</div><div>Hello there</div>`;
    const out = stripQuotedHtml(html);
    expect(out).toContain("My reply.");
    expect(out).not.toContain("Original Message");
    expect(out).not.toContain("From: Jane");
    expect(out).not.toContain("Hello there");
  });
});
