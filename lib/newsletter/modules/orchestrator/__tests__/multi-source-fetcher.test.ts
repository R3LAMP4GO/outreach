// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — partial Supabase mocks cause type mismatches
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MultiSourceFetcher } from "../multi-source-fetcher";
import type { BaseSource } from "../../sources/base-source";
import type { FetchResult } from "../../../types/article";

// Suppress logger noise
vi.mock("../../../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSource(
  name: string,
  enabled: boolean,
  fetchFn: () => Promise<FetchResult>,
): BaseSource {
  return {
    getName: () => name,
    isEnabled: () => enabled,
    fetchArticles: fetchFn,
  } as unknown as BaseSource;
}

function makeArticle(id: string, url: string) {
  return {
    id,
    title: `Article ${id}`,
    url,
    content: `Content ${id}`,
    publishedAt: new Date(),
    source: "test",
    status: "pending" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function successResult(
  sourceName: string,
  articles: FetchResult["articles"],
  duration = 100,
): FetchResult {
  return {
    success: true,
    source: sourceName,
    articles,
    metadata: {
      fetchedAt: new Date(),
      duration,
      articleCount: articles.length,
    },
  };
}

function _failResult(sourceName: string, message: string): FetchResult {
  return {
    success: false,
    source: sourceName,
    articles: [],
    error: { message, code: "FETCH_ERROR" },
    metadata: { fetchedAt: new Date(), duration: 50, articleCount: 0 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MultiSourceFetcher", () => {
  let fetcher: MultiSourceFetcher;

  beforeEach(() => {
    fetcher = new MultiSourceFetcher();
  });

  it("returns empty result when no sources provided", async () => {
    const result = await fetcher.fetchAll([]);
    expect(result.articles).toEqual([]);
    expect(result.summary.totalSources).toBe(0);
  });

  it("returns empty result when all sources are disabled", async () => {
    const s = createMockSource("disabled", false, async () => successResult("disabled", []));

    const result = await fetcher.fetchAll([s]);
    expect(result.articles).toEqual([]);
    expect(result.summary.totalSources).toBe(0);
  });

  it("fetches from multiple sources concurrently", async () => {
    const a1 = makeArticle("1", "https://a.com/1");
    const a2 = makeArticle("2", "https://b.com/2");

    const s1 = createMockSource("source1", true, async () => successResult("source1", [a1]));
    const s2 = createMockSource("source2", true, async () => successResult("source2", [a2]));

    const result = await fetcher.fetchAll([s1, s2]);

    expect(result.articles).toHaveLength(2);
    expect(result.summary.totalSources).toBe(2);
    expect(result.summary.successfulSources).toBe(2);
    expect(result.summary.failedSources).toBe(0);
    expect(result.summary.totalArticles).toBe(2);
  });

  it("handles timeout — slow source returns error result", async () => {
    const fastArticle = makeArticle("1", "https://fast.com/1");

    const fastSource = createMockSource("fast", true, async () =>
      successResult("fast", [fastArticle], 10),
    );

    const slowSource = createMockSource("slow", true, () => {
      return new Promise<FetchResult>((resolve) => {
        // Never resolves within timeout
        setTimeout(() => resolve(successResult("slow", [], 999999)), 999999);
      });
    });

    const result = await fetcher.fetchAll([fastSource, slowSource], {
      timeout: 50, // 50ms timeout
    });

    expect(result.summary.successfulSources).toBeGreaterThanOrEqual(1);
    expect(result.articles.length).toBeGreaterThanOrEqual(1);
    // Slow source should have failed
    const slowResult = result.results.find((r) => r.source === "slow");
    expect(slowResult?.success).toBe(false);
  });

  it("isolates source failures — one fails, others succeed", async () => {
    const article = makeArticle("1", "https://good.com/1");

    const goodSource = createMockSource("good", true, async () => successResult("good", [article]));

    const badSource = createMockSource("bad", true, async () => {
      throw new Error("Source is down");
    });

    const result = await fetcher.fetchAll([goodSource, badSource], {
      continueOnError: true,
    });

    expect(result.summary.successfulSources).toBe(1);
    expect(result.summary.failedSources).toBe(1);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe("https://good.com/1");
  });

  it("deduplicates articles by URL", async () => {
    const article1 = makeArticle("1", "https://same.com/article");
    const article2 = makeArticle("2", "https://same.com/article"); // same URL

    const s1 = createMockSource("s1", true, async () => successResult("s1", [article1]));
    const s2 = createMockSource("s2", true, async () => successResult("s2", [article2]));

    const result = await fetcher.fetchAll([s1, s2]);

    expect(result.articles).toHaveLength(1);
    expect(result.summary.totalArticles).toBe(1);
  });

  it("aggregates results correctly", async () => {
    const a1 = makeArticle("1", "https://a.com");
    const a2 = makeArticle("2", "https://b.com");
    const a3 = makeArticle("3", "https://c.com");

    const s1 = createMockSource("fast", true, async () => successResult("fast", [a1], 50));
    const s2 = createMockSource("medium", true, async () => successResult("medium", [a2], 100));
    const s3 = createMockSource("slow", true, async () => successResult("slow", [a3], 200));

    const result = await fetcher.fetchAll([s1, s2, s3]);

    expect(result.articles).toHaveLength(3);
    expect(result.results).toHaveLength(3);
    expect(result.summary.totalSources).toBe(3);
    expect(result.summary.fastestSource?.name).toBe("fast");
    expect(result.summary.slowestSource?.name).toBe("slow");
  });

  it("tracks performance metrics after fetch", async () => {
    const s1 = createMockSource("perf-source", true, async () =>
      successResult("perf-source", [makeArticle("1", "https://a.com")], 100),
    );

    await fetcher.fetchAll([s1]);

    const metrics = fetcher.getSourceMetrics("perf-source");
    expect(metrics).toBeDefined();
    expect(metrics!.fetchCount).toBe(1);
    expect(metrics!.successRate).toBe(1);
    expect(metrics!.averageDuration).toBe(100);
    expect(metrics!.averageArticleCount).toBe(1);
  });

  it("resets metrics", async () => {
    const s1 = createMockSource("src", true, async () => successResult("src", [], 10));

    await fetcher.fetchAll([s1]);
    expect(fetcher.getPerformanceMetrics()).toHaveLength(1);

    fetcher.resetMetrics();
    expect(fetcher.getPerformanceMetrics()).toHaveLength(0);
  });

  it("fetchFromSources filters by name", async () => {
    const s1 = createMockSource("wanted", true, async () =>
      successResult("wanted", [makeArticle("1", "https://a.com")]),
    );
    const s2 = createMockSource("unwanted", true, async () =>
      successResult("unwanted", [makeArticle("2", "https://b.com")]),
    );

    const result = await fetcher.fetchFromSources([s1, s2], ["wanted"]);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe("https://a.com");
  });

  it("fetchFromSources returns empty for no matching names", async () => {
    const s1 = createMockSource("src", true, async () => successResult("src", []));

    const result = await fetcher.fetchFromSources([s1], ["nonexistent"]);
    expect(result.articles).toEqual([]);
    expect(result.summary.totalSources).toBe(0);
  });

  it("re-throws on error when continueOnError is false", async () => {
    const badSource = createMockSource("bad", true, async () => {
      throw new Error("fatal");
    });

    await expect(fetcher.fetchAll([badSource], { continueOnError: false })).rejects.toThrow(
      "fatal",
    );
  });
});
