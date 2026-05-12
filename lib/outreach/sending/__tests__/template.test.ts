import { describe, it, expect } from "vitest";
import { renderSequenceBodyHtml, renderSequenceBodyText, renderSequenceSubject } from "../template";
import type { Contact, Campaign, SenderAccount } from "../../types";

const UNSUB_URL = "https://example.com/unsubscribe/c-1?token=xyz";

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c-1",
    email: "john@example.com",
    first_name: "John",
    email_1_subject: "S1",
    email_1_body: "<p>AI body 1 for {{first_name}}.</p>",
    email_2_body: "<p>AI body 2.</p>",
    email_3_body: "<p>AI body 3.</p>",
    email_3_subject: "S3",
    ...overrides,
  } as Contact;
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    email_1_template: "{{email_body}}\n\n{{signature}}",
    email_2_template: "{{email_body}}\n\n{{signature}}",
    email_3_template: "{{email_body}}\n\n{{signature}}",
    ...overrides,
  } as Campaign;
}

function makeSender(overrides: Partial<SenderAccount> = {}): SenderAccount {
  return {
    id: "s-1",
    email: "jake@example.com",
    name: "Jake",
    signature_html: '<p>—<br>Jake<br><a href="https://example.com">site</a></p>',
    signature_plain_text: "--\nJake\nsite: https://example.com",
    ...overrides,
  } as SenderAccount;
}

describe("per-step body/subject tokens", () => {
  it("substitutes {{email_1_body}} / {{email_2_body}} / {{email_3_body}} from contact", () => {
    const contact = makeContact({
      email_1_body: "<p>AI ONE</p>",
      email_2_body: "<p>AI TWO</p>",
      email_3_body: "<p>AI THREE</p>",
    });
    const html1 = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "WRAP: {{email_1_body}} END" }),
      contact,
      sender: makeSender(),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html1).toContain("<p>AI ONE</p>");
    expect(html1).toContain("WRAP:");
    expect(html1).toContain("END");

    const html3 = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_3_template: "X{{email_3_body}}Y" }),
      contact,
      sender: makeSender(),
      emailNumber: 3,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html3).toContain("X<p>AI THREE</p>Y");
  });

  it("substitutes a campaign-level subject template using contact subjects", () => {
    const contact = makeContact({ email_1_subject: "S-ONE" });
    const campaign = makeCampaign({ email_1_subject_template: "Quick: {{email_1_subject}}" });
    expect(renderSequenceSubject(campaign, contact, 1)).toBe("Quick: S-ONE");
  });

  it("falls back to contact subject when no subject_template is set", () => {
    const contact = makeContact({ email_1_subject: "plain subject" });
    expect(renderSequenceSubject(makeCampaign(), contact, 1)).toBe("plain subject");
  });

  it("step 2 fallback prepends Re: when no template + no email_2_subject", () => {
    const contact = makeContact({ email_1_subject: "hello", email_2_subject: null });
    expect(renderSequenceSubject(makeCampaign(), contact, 2)).toBe("Re: hello");
  });
});

describe("AI anchor cleanup", () => {
  it("splits a <a> that swallows a <br> + trailing content", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_1_body}}" }),
      contact: makeContact({
        email_1_body: '<p>Open? <a href="https://cal.com/x">https://cal.com/x<br>—<br>Jake</a></p>',
      }),
      sender: makeSender({ signature_html: null }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    // Link content is just the URL
    expect(html).toMatch(/<a href="https:\/\/cal\.com\/x">https:\/\/cal\.com\/x<\/a>/);
    // — and Jake are out of the link
    expect(html).not.toMatch(/<a[^>]*>[^<]*—/);
    expect(html).not.toMatch(/<a[^>]*>[^<]*Jake/);
  });

  it("unwraps a <a> that contains only an em-dash", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_1_body}}" }),
      contact: makeContact({
        email_1_body: '<p>Hi</p><p><a href="https://x.com">—</a><br>Jake</p>',
      }),
      sender: makeSender({ signature_html: null }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    // The dash anchor is gone, dash remains as plain text
    expect(html).toContain("—");
    expect(html).not.toMatch(/<a[^>]*>—<\/a>/);
  });

  it("leaves a real text-content <a> alone", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_1_body}}" }),
      contact: makeContact({
        email_1_body: '<p>See <a href="https://example.com">our pricing page</a> for details.</p>',
      }),
      sender: makeSender({ signature_html: null }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).toContain('<a href="https://example.com">our pricing page</a>');
  });
});

describe("block-level token wrapping (paragraph spacing)", () => {
  it("strips the outer <p> when a block token sits alone in a paragraph", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({
        email_1_template: "<p>{{email_1_body}}</p><p>{{signature}}</p><p>{{unsubscribe_link}}</p>",
      }),
      contact: makeContact({ email_1_body: "<p>Hi Maria</p><p>Body content</p>" }),
      sender: makeSender({ signature_html: "<p>—<br>Jake</p>" }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    // No <p><p>...</p></p> double-wrapping anywhere.
    expect(html).not.toMatch(/<p[^>]*>\s*<p/);
    // Body, signature, footer all appear as top-level <p> siblings.
    expect(html).toContain("<p>Hi Maria</p>");
    expect(html).toContain("<p>Body content</p>");
    expect(html).toMatch(/<p[^>]*>—<br>Jake<\/p>/);
  });

  it("strips trailing empty <p></p> / <p><br></p> blocks", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_1_body}}" }),
      contact: makeContact({
        email_1_body: "<p>Real content</p><p></p><p><br></p><p>&nbsp;</p>",
      }),
      sender: makeSender({ signature_html: null }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).toBe("<p>Real content</p>");
  });

  it("strips empty paragraphs mid-content too", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_1_body}}" }),
      contact: makeContact({
        email_1_body: "<p>A</p><p></p><p>B</p>",
      }),
      sender: makeSender({ signature_html: null }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).toBe("<p>A</p><p>B</p>");
  });

  it("still substitutes inline tokens without stripping their surroundings", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({
        email_1_template: "<p>Subject was {{email_1_subject}} — body follows.</p>",
      }),
      contact: makeContact({ email_1_subject: "Hello" }),
      sender: makeSender(),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).toContain("<p>Subject was Hello — body follows.</p>");
  });
});

describe("renderSequenceBodyHtml", () => {
  it("expands {{email_body}}, {{signature}}, {{unsubscribe_link}} in order", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({
        email_1_template:
          "<header>Hi</header>{{email_body}}<sig>{{signature}}</sig>{{unsubscribe_link}}",
      }),
      contact: makeContact(),
      sender: makeSender(),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).toContain("AI body 1");
    expect(html).toContain("<sig><p>");
    expect(html).toContain("Jake");
    expect(html).toContain("To unsubscribe");
    expect(html).toContain(UNSUB_URL);
    expect(html.indexOf("AI body 1")).toBeLessThan(html.indexOf("Jake"));
    expect(html.indexOf("Jake")).toBeLessThan(html.indexOf("To unsubscribe"));
  });

  it("omits the unsubscribe footer when {{unsubscribe_link}} is not in the template", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_body}}\n{{signature}}" }),
      contact: makeContact(),
      sender: makeSender(),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).not.toContain("To unsubscribe");
    expect(html).not.toContain(UNSUB_URL);
  });

  it("omits the signature when {{signature}} is not in the template", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_body}}" }),
      contact: makeContact(),
      sender: makeSender(),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).not.toContain("Jake");
  });

  it("renders empty (not literal 'null') when sender has no signature", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_body}}--{{signature}}--END" }),
      contact: makeContact(),
      sender: makeSender({ signature_html: null }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).toContain("----END");
    expect(html).not.toContain("null");
  });

  it("does NOT re-expand sequence tokens that appear verbatim inside the contact body", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_body}} | {{signature}}" }),
      contact: makeContact({ email_1_body: "<p>I literally typed {{signature}} here</p>" }),
      sender: makeSender({ signature_html: "<p>JAKE_SIG</p>" }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    // The literal {{signature}} inside the body must survive (one-pass top-down).
    expect(html).toContain("{{signature}}");
    // The real {{signature}} in the template slot still expands once.
    expect(html).toContain("JAKE_SIG");
  });

  it("strips dangerous tags/attrs from the signature (XSS defence-in-depth)", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{signature}}" }),
      contact: makeContact(),
      sender: makeSender({
        signature_html:
          '<p>Jake<script>alert(1)</script><img src=x onerror="alert(1)"></p><iframe src="evil"></iframe>',
      }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).toContain("Jake");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<iframe");
  });

  it("preserves the styled unsubscribe footer markup", () => {
    const html = renderSequenceBodyHtml({
      campaign: makeCampaign({ email_1_template: "{{email_body}}{{unsubscribe_link}}" }),
      contact: makeContact(),
      sender: makeSender(),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(html).toMatch(/<p style="font-size:12px;color:#888/);
    expect(html).toContain(`<a href="${UNSUB_URL}">click here</a>`);
  });
});

describe("renderSequenceBodyText", () => {
  it("uses signature_plain_text and an inline text footer", () => {
    const text = renderSequenceBodyText({
      campaign: makeCampaign({
        email_1_template: "{{email_body}}\n{{signature}}\n{{unsubscribe_link}}",
      }),
      contact: makeContact({ email_1_body: "Hi {{first_name}}." }),
      sender: makeSender(),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(text).toContain("--\nJake");
    expect(text).toContain(`To unsubscribe: ${UNSUB_URL}`);
    expect(text).not.toContain("<p");
  });

  it("falls back to HTML-stripped signature when signature_plain_text is null", () => {
    const text = renderSequenceBodyText({
      campaign: makeCampaign({ email_1_template: "{{signature}}" }),
      contact: makeContact(),
      sender: makeSender({ signature_plain_text: null }),
      emailNumber: 1,
      unsubscribeUrl: UNSUB_URL,
    });
    expect(text).toContain("Jake");
    expect(text).not.toContain("<");
  });
});
