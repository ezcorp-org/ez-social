import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @cloudflare/puppeteer before importing scraper
const mockClose = vi.fn();
const mockEvaluate = vi.fn();
const mockGoto = vi.fn();
const mockNewPage = vi.fn();
const mockLaunch = vi.fn();

vi.mock("@cloudflare/puppeteer", () => ({
  default: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

import {
  scrapeUrl,
  scrapeTwitter,
  scrapeBrowser,
  isTwitterUrl,
  stripHtml,
} from "./scraper";
import type { BrowserWorker } from "@cloudflare/puppeteer";

function createMockBrowser(): BrowserWorker {
  return {} as BrowserWorker;
}

function setupPuppeteerMocks(
  evaluateResult: { content: string; author?: string } = {
    content: "Post content",
    author: "Author Name",
  },
) {
  mockNewPage.mockResolvedValue({
    goto: mockGoto,
    evaluate: mockEvaluate,
  });
  mockEvaluate.mockResolvedValue(evaluateResult);
  mockLaunch.mockResolvedValue({
    newPage: mockNewPage,
    close: mockClose,
  });
}

describe("isTwitterUrl", () => {
  it("recognizes x.com URLs", () => {
    expect(isTwitterUrl("https://x.com/user/status/123")).toBe(true);
  });

  it("recognizes twitter.com URLs", () => {
    expect(isTwitterUrl("https://twitter.com/user/status/123")).toBe(true);
  });

  it("rejects other domains", () => {
    expect(isTwitterUrl("https://linkedin.com/post/123")).toBe(false);
    expect(isTwitterUrl("https://example.com")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isTwitterUrl("not-a-url")).toBe(false);
  });
});

describe("stripHtml", () => {
  it("strips HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("converts <br> to newlines", () => {
    expect(stripHtml("line one<br>line two<br/>line three")).toBe(
      "line one\nline two\nline three",
    );
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot; &#39; &mdash; &hellip;")).toBe(
      '& < > " \' — …',
    );
  });

  it("trims whitespace", () => {
    expect(stripHtml("  hello  ")).toBe("hello");
  });
});

describe("scrapeTwitter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses FxTwitter API for full tweet text", async () => {
    const fxResponse = {
      tweet: { text: "Full tweet content here", author: { name: "Test User" } },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fxResponse), { status: 200 }),
    );

    const result = await scrapeTwitter("https://x.com/test/status/123");

    expect(result).toEqual({
      content: "Full tweet content here",
      author: "Test User",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.fxtwitter.com/test/status/123",
      expect.any(Object),
    );
  });

  it("falls back to oEmbed when FxTwitter fails", async () => {
    const oembedResponse = {
      html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hello world</p>&mdash; Test User (@test) <a href="https://twitter.com/test/status/123">Feb 19, 2026</a></blockquote>',
      author_name: "Test User",
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 500 })) // FxTwitter fails
      .mockResolvedValueOnce(
        new Response(JSON.stringify(oembedResponse), { status: 200 }),
      ); // oEmbed succeeds

    const result = await scrapeTwitter("https://x.com/test/status/123");

    expect(result).not.toBeNull();
    expect(result!.content).toContain("Hello world");
    expect(result!.author).toBe("Test User");
  });

  it("returns null when both FxTwitter and oEmbed fail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = await scrapeTwitter("https://x.com/user/status/deleted");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network error"),
    );

    const result = await scrapeTwitter("https://x.com/test/status/123");
    expect(result).toBeNull();
  });

  it("returns undefined author when FxTwitter author name is missing", async () => {
    const fxResponse = {
      tweet: { text: "content", author: {} },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fxResponse), { status: 200 }),
    );

    const result = await scrapeTwitter("https://x.com/test/status/123");
    expect(result).not.toBeNull();
    expect(result!.author).toBeUndefined();
  });

  it("falls back to oEmbed for non-status Twitter URLs", async () => {
    const oembedResponse = {
      html: '<blockquote class="twitter-tweet"><p>content</p></blockquote>',
      author_name: "User",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(oembedResponse), { status: 200 }),
    );

    // URL without /status/ path — tweetPath returns null, skips FxTwitter
    const result = await scrapeTwitter("https://x.com/test");
    expect(result).not.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("publish.twitter.com/oembed"),
      expect.any(Object),
    );
  });
});

describe("scrapeBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("launches browser, navigates, and extracts content", async () => {
    setupPuppeteerMocks({ content: "Hello world", author: "Jane" });
    const browser = createMockBrowser();

    const result = await scrapeBrowser(browser, "https://example.com/post");

    expect(mockLaunch).toHaveBeenCalledWith(browser);
    expect(mockGoto).toHaveBeenCalledWith("https://example.com/post", {
      waitUntil: "networkidle0",
      timeout: 15000,
    });
    expect(result).toEqual({ content: "Hello world", author: "Jane" });
  });

  it("closes browser after successful scrape", async () => {
    setupPuppeteerMocks();
    const browser = createMockBrowser();

    await scrapeBrowser(browser, "https://example.com");

    expect(mockClose).toHaveBeenCalled();
  });

  it("returns null and closes browser on navigation error", async () => {
    mockLaunch.mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn().mockRejectedValue(new Error("Navigation timeout")),
        evaluate: mockEvaluate,
      }),
      close: mockClose,
    });

    const result = await scrapeBrowser(
      createMockBrowser(),
      "https://slow-site.com",
    );

    expect(result).toBeNull();
    expect(mockClose).toHaveBeenCalled();
  });

  it("returns null when launch fails", async () => {
    mockLaunch.mockRejectedValue(new Error("launch failed"));

    const result = await scrapeBrowser(
      createMockBrowser(),
      "https://example.com",
    );
    expect(result).toBeNull();
  });

  it("handles browser.close throwing", async () => {
    mockLaunch.mockResolvedValue({
      newPage: vi.fn().mockRejectedValue(new Error("newPage failed")),
      close: vi.fn().mockRejectedValue(new Error("close failed")),
    });

    const result = await scrapeBrowser(
      createMockBrowser(),
      "https://example.com",
    );
    expect(result).toBeNull();
  });
});

describe("scrapeUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("uses FxTwitter for x.com URLs (no browser needed)", async () => {
    const fxResponse = {
      tweet: { text: "tweet text", author: { name: "Author" } },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fxResponse), { status: 200 }),
    );

    const result = await scrapeUrl(undefined, "https://x.com/a/status/123");

    expect(result).not.toBeNull();
    expect(result!.content).toContain("tweet text");
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("uses FxTwitter for twitter.com URLs", async () => {
    const fxResponse = {
      tweet: { text: "content", author: { name: "User" } },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fxResponse), { status: 200 }),
    );

    const result = await scrapeUrl(
      undefined,
      "https://twitter.com/u/status/456",
    );

    expect(result).not.toBeNull();
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("uses browser for non-Twitter URLs", async () => {
    setupPuppeteerMocks({ content: "LinkedIn post", author: "Bob" });

    const result = await scrapeUrl(
      createMockBrowser(),
      "https://linkedin.com/post/123",
    );

    expect(result).toEqual({ content: "LinkedIn post", author: "Bob" });
    expect(mockLaunch).toHaveBeenCalled();
  });

  it("returns null for non-Twitter URLs when browser is undefined", async () => {
    const result = await scrapeUrl(undefined, "https://linkedin.com/post/123");
    expect(result).toBeNull();
  });
});
