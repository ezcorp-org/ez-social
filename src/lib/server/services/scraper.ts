import puppeteer from "@cloudflare/puppeteer";
import type { BrowserWorker } from "@cloudflare/puppeteer";

export interface ScrapeResult {
  content: string;
  author?: string;
}

const TWITTER_HOST_RE = /^(?:x|twitter)\.com$/i;

/** Strip HTML tags and decode common entities. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .trim();
}

/** Extract the tweet path (e.g. "karpathy/status/123") from a Twitter/X URL. */
function tweetPath(targetUrl: string): string | null {
  try {
    const u = new URL(targetUrl);
    // pathname like /karpathy/status/2024583544157458452
    const match = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    return match ? `${match[1]}/status/${match[2]}` : null;
  } catch {
    return null;
  }
}

/**
 * Try the FxTwitter API first — it returns the full, untruncated tweet text.
 * Falls back to the oEmbed API which truncates long tweets.
 */
export async function scrapeTwitter(
  targetUrl: string,
): Promise<ScrapeResult | null> {
  // Try FxTwitter for full text
  const path = tweetPath(targetUrl);
  if (path) {
    try {
      const res = await fetch(`https://api.fxtwitter.com/${path}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          tweet?: { text?: string; author?: { name?: string } };
        };
        const text = data.tweet?.text?.trim();
        if (text) {
          return {
            content: text,
            author: data.tweet?.author?.name || undefined,
          };
        }
      }
    } catch {
      /* fall through to oEmbed */
    }
  }

  // Fallback: oEmbed (truncates long tweets)
  try {
    const oembed = `https://publish.twitter.com/oembed?url=${encodeURIComponent(targetUrl)}&omit_script=true`;
    const res = await fetch(oembed, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      html?: string;
      author_name?: string;
    };
    if (!data.html) return null;

    const content = stripHtml(data.html);
    if (!content) return null;

    return {
      content,
      author: data.author_name || undefined,
    };
  } catch {
    return null;
  }
}

/** Check if a URL is a Twitter/X post. */
export function isTwitterUrl(url: string): boolean {
  try {
    return TWITTER_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Scrape a generic page using Cloudflare Browser Rendering.
 */
export async function scrapeBrowser(
  browser: BrowserWorker,
  targetUrl: string,
): Promise<ScrapeResult | null> {
  let browserInstance;
  try {
    browserInstance = await puppeteer.launch(browser);
    const page = await browserInstance.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 15000 });

    const result = await page.evaluate(() => {
      const ogAuthor =
        document
          .querySelector('meta[property="article:author"]')
          ?.getAttribute("content") ||
        document
          .querySelector('meta[name="author"]')
          ?.getAttribute("content") ||
        null;

      const linkedinAuthor =
        document
          .querySelector(".feed-shared-actor__name")
          ?.textContent?.trim() ||
        document
          .querySelector(".update-components-actor__name")
          ?.textContent?.trim() ||
        null;

      const author = ogAuthor || linkedinAuthor || null;

      const linkedinContent =
        document.querySelector(".feed-shared-text")?.textContent?.trim() ||
        document
          .querySelector(".update-components-text")
          ?.textContent?.trim();
      const ogDescription = document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content");
      const articleBody = document
        .querySelector("article")
        ?.textContent?.trim();
      const bodyText = document.body?.innerText?.substring(0, 5000) || "";

      const content =
        linkedinContent || ogDescription || articleBody || bodyText;

      return { content: content || "", author: author || undefined };
    });

    return { content: result.content, author: result.author };
  } catch {
    return null;
  } finally {
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch {
        /* ignore close errors */
      }
    }
  }
}

/**
 * Scrape post content from a URL.
 * Uses oEmbed for Twitter/X, Puppeteer browser binding for everything else.
 */
export async function scrapeUrl(
  browser: BrowserWorker | undefined,
  targetUrl: string,
): Promise<ScrapeResult | null> {
  if (isTwitterUrl(targetUrl)) {
    return scrapeTwitter(targetUrl);
  }

  if (!browser) return null;
  return scrapeBrowser(browser, targetUrl);
}
