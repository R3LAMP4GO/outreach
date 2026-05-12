import { describe, it, expect } from "vitest";
import {
  NewsletterGenerator,
  SubjectLineGenerator,
  generateNewsletter,
  generateSubjectLines,
  type Article,
  type GenerationOptions,
} from "../template";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    title: "Test Article on Growth Strategy",
    url: "https://example.com/article",
    content: "This is a test article about growth and marketing strategy for businesses.",
    author: "Author",
    publishedAt: new Date("2025-06-01"),
    source: "test",
    summary: "A deep dive into growth strategy for modern businesses.",
    keyInsights: ["Insight one", "Insight two", "Insight three"],
    psychologyPrinciple: "Social proof drives conversions",
    actionableFramework: "Step 1: Analyze. Step 2: Implement. Step 3: Measure.",
    ...overrides,
  };
}

function makeArticles(count: number): Article[] {
  return Array.from({ length: count }, (_, i) =>
    makeArticle({
      id: `a${i + 1}`,
      title: `Article ${i + 1} on Growth Strategy`,
      url: `https://example.com/article-${i + 1}`,
      summary: `Summary for article ${i + 1} about growth and marketing.`,
    }),
  );
}

// ---------------------------------------------------------------------------
// SubjectLineGenerator
// ---------------------------------------------------------------------------

describe("SubjectLineGenerator", () => {
  it("returns default subject for empty articles", () => {
    const subjects = SubjectLineGenerator.generate([]);
    expect(subjects).toEqual(["Your Weekly Business Insights"]);
  });

  it("returns 5 variations for non-empty articles", () => {
    const subjects = SubjectLineGenerator.generate([makeArticle()]);
    expect(subjects).toHaveLength(5);
  });

  it("truncates subject lines to 50 chars or less", () => {
    const subjects = SubjectLineGenerator.generate([makeArticle()]);
    for (const s of subjects) {
      expect(s.length).toBeLessThanOrEqual(50);
    }
  });

  it("extracts topic keyword from article summary", () => {
    const article = makeArticle({
      title: "The Future of AI in Marketing",
      summary: "AI is transforming marketing strategy for enterprises",
    });
    const subjects = SubjectLineGenerator.generate([article]);
    // At least one subject should contain a recognized keyword from summary
    const hasKeyword = subjects.some(
      (s) =>
        s.toLowerCase().includes("ai") ||
        s.toLowerCase().includes("marketing") ||
        s.toLowerCase().includes("strategy"),
    );
    expect(hasKeyword).toBe(true);
  });

  it("falls back to 'business strategy' when no keyword matches", () => {
    const article = makeArticle({
      title: "Generic Title",
      summary: "Nothing interesting here",
    });
    const subjects = SubjectLineGenerator.generate([article]);
    const hasFallback = subjects.some((s) => s.toLowerCase().includes("business strategy"));
    expect(hasFallback).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NewsletterGenerator
// ---------------------------------------------------------------------------

describe("NewsletterGenerator", () => {
  it("throws when no articles provided", () => {
    const gen = new NewsletterGenerator();
    expect(() => gen.generate([])).toThrow("At least one article is required");
  });

  it("generates template with 1 article", () => {
    const gen = new NewsletterGenerator();
    const template = gen.generate([makeArticle()]);

    expect(template.subject).toBeTruthy();
    expect(template.preheader).toBeTruthy();
    expect(template.html).toContain("<!DOCTYPE html>");
    expect(template.text).toBeTruthy();
    expect(template.metadata.articleCount).toBe(1);
    expect(template.metadata.estimatedReadTime).toMatch(/\d+ min read/);
    expect(template.metadata.generatedAt).toBeInstanceOf(Date);
  });

  it("generates template with 5 articles (includes all sections)", () => {
    const articles = makeArticles(5);
    const gen = new NewsletterGenerator();
    const template = gen.generate(articles);

    expect(template.metadata.articleCount).toBe(5);
    // HTML should have Insight, Story, and Framework sections
    expect(template.html).toContain("The Insight");
    expect(template.html).toContain("The Story");
    expect(template.html).toContain("The Framework");
    expect(template.html).toContain("One Action");
    // Articles 4-5 go into "More Worth Reading"
    expect(template.html).toContain("More Worth Reading");
    expect(template.html).toContain("article-4");
    expect(template.html).toContain("article-5");
  });

  it("generates template with 10 articles (caps bonus at 3)", () => {
    const articles = makeArticles(10);
    const gen = new NewsletterGenerator();
    const template = gen.generate(articles);

    expect(template.metadata.articleCount).toBe(10);
    // P.S. section shows articles 4-6 (slice(3, 6))
    expect(template.html).toContain("article-4");
    expect(template.html).toContain("article-5");
    expect(template.html).toContain("article-6");
    // Article 7+ should not be in "More Worth Reading"
    expect(template.html).not.toContain("article-7");
  });

  it("omits Story section when only 1 article", () => {
    const gen = new NewsletterGenerator();
    const template = gen.generate([makeArticle()]);

    // Story and Framework need article indices 1 and 2
    expect(template.html).not.toContain("The Story");
    expect(template.html).not.toContain("The Framework");
  });

  it("includes Story but omits Framework with 2 articles", () => {
    const gen = new NewsletterGenerator();
    const template = gen.generate(makeArticles(2));

    expect(template.html).toContain("The Story");
    expect(template.html).not.toContain("The Framework");
  });

  it("generates preheader from first article summary", () => {
    const article = makeArticle({
      summary: "A".repeat(200),
    });
    const gen = new NewsletterGenerator();
    const template = gen.generate([article]);

    // Preheader should be truncated to ~100 chars + "..."
    expect(template.preheader.length).toBeLessThanOrEqual(104);
    expect(template.preheader).toContain("...");
  });

  it("calculates read time based on content", () => {
    const longArticle = makeArticle({
      summary: Array(500).fill("word").join(" "),
    });
    const gen = new NewsletterGenerator();
    const template = gen.generate([longArticle]);

    // 500 words / 225 ≈ 3 min
    expect(template.metadata.estimatedReadTime).toMatch(/\d+ min read/);
  });

  it("applies brand options to HTML output", () => {
    const options: GenerationOptions = {
      brandName: "Custom Brand",
      brandColor: "#ff0000",
      unsubscribeUrl: "https://example.com/unsub",
      footerText: "Custom footer text",
      socialLinks: {
        twitter: "https://twitter.com/test",
        linkedin: "https://linkedin.com/in/test",
      },
    };
    const gen = new NewsletterGenerator(options);
    const template = gen.generate([makeArticle()]);

    expect(template.html).toContain("Custom Brand");
    expect(template.html).toContain("#ff0000");
    expect(template.html).toContain("https://example.com/unsub");
    expect(template.html).toContain("Custom footer text");
    expect(template.html).toContain("Twitter");
    expect(template.html).toContain("LinkedIn");
  });

  it("omits social link anchors when not provided", () => {
    const gen = new NewsletterGenerator({ socialLinks: {} });
    const template = gen.generate([makeArticle()]);

    // No Twitter/LinkedIn/Website anchor tags should be rendered
    expect(template.html).not.toContain("Twitter");
    expect(template.html).not.toContain("LinkedIn");
    expect(template.html).not.toContain(">Website<");
  });

  it("includes logo when logoUrl provided", () => {
    const gen = new NewsletterGenerator({
      logoUrl: "https://example.com/logo.png",
    });
    const template = gen.generate([makeArticle()]);

    expect(template.html).toContain("https://example.com/logo.png");
  });

  it("includes web version link when webVersionUrl provided", () => {
    const gen = new NewsletterGenerator({
      webVersionUrl: "https://example.com/web-version",
    });
    const template = gen.generate([makeArticle()]);

    expect(template.html).toContain("View this email in your browser");
    expect(template.html).toContain("https://example.com/web-version");
  });

  it("includes article engagement metrics in Story section", () => {
    const articles = makeArticles(2);
    articles[1].engagement = { upvotes: 42, comments: 7 };

    const gen = new NewsletterGenerator();
    const template = gen.generate(articles);

    expect(template.html).toContain("42 upvotes");
    expect(template.html).toContain("7 comments");
  });

  it("includes psychology principle in Insight section", () => {
    const gen = new NewsletterGenerator();
    const template = gen.generate([makeArticle({ psychologyPrinciple: "Anchoring bias" })]);

    expect(template.html).toContain("Anchoring bias");
    expect(template.html).toContain("The Psychology:");
  });

  it("includes key insights as list items", () => {
    const gen = new NewsletterGenerator();
    const template = gen.generate([
      makeArticle({ keyInsights: ["First", "Second", "Third", "Fourth"] }),
    ]);

    // Only first 3 insights shown in Insight section
    expect(template.html).toContain("First");
    expect(template.html).toContain("Second");
    expect(template.html).toContain("Third");
  });
});

// ---------------------------------------------------------------------------
// Plain text generation
// ---------------------------------------------------------------------------

describe("NewsletterGenerator plain text", () => {
  it("generates plain text with sections", () => {
    const gen = new NewsletterGenerator();
    const template = gen.generate(makeArticles(3));

    expect(template.text).toContain("THE INSIGHT");
    expect(template.text).toContain("THE STORY");
    expect(template.text).toContain("THE FRAMEWORK");
    expect(template.text).toContain("ONE ACTION");
    expect(template.text).toContain("P.S.");
  });

  it("plain text includes unsubscribe link", () => {
    const gen = new NewsletterGenerator({
      unsubscribeUrl: "https://example.com/unsub",
    });
    const template = gen.generate([makeArticle()]);

    expect(template.text).toContain("https://example.com/unsub");
  });

  it("plain text includes web version URL when set", () => {
    const gen = new NewsletterGenerator({
      webVersionUrl: "https://example.com/web",
    });
    const template = gen.generate([makeArticle()]);

    expect(template.text).toContain("https://example.com/web");
  });
});

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

describe("generateNewsletter", () => {
  it("returns a complete template", () => {
    const template = generateNewsletter([makeArticle()]);

    expect(template.subject).toBeTruthy();
    expect(template.html).toContain("<!DOCTYPE html>");
    expect(template.text).toBeTruthy();
  });

  it("passes options through", () => {
    const template = generateNewsletter([makeArticle()], {
      brandName: "My Newsletter",
    });

    expect(template.html).toContain("My Newsletter");
  });
});

describe("generateSubjectLines", () => {
  it("returns 5 subject line variations", () => {
    const subjects = generateSubjectLines([makeArticle()]);
    expect(subjects).toHaveLength(5);
  });

  it("returns default for empty articles", () => {
    const subjects = generateSubjectLines([]);
    expect(subjects).toEqual(["Your Weekly Business Insights"]);
  });
});
