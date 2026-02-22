---
phase: quick-003
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/server/services/scraper.ts
  - src/routes/(app)/+page.server.ts
  - src/app.d.ts
  - wrangler.jsonc
  - package.json
autonomous: true

must_haves:
  truths:
    - "Scraper uses Cloudflare Browser Rendering binding instead of external HTTP service"
    - "Adding a post with a URL scrapes content and author from the page"
    - "Scraper gracefully returns null on failure (timeout, bad URL, missing binding)"
  artifacts:
    - path: "src/lib/server/services/scraper.ts"
      provides: "Browser-based scraper using @cloudflare/puppeteer"
      exports: ["scrapeUrl", "ScrapeResult"]
    - path: "wrangler.jsonc"
      provides: "Browser binding configuration"
      contains: "browser"
  key_links:
    - from: "src/routes/(app)/+page.server.ts"
      to: "src/lib/server/services/scraper.ts"
      via: "passes platform.env.BROWSER binding"
      pattern: "scrapeUrl.*BROWSER"
---

<objective>
Replace the stub external scraper service with a real implementation using @cloudflare/puppeteer and Cloudflare Browser Rendering binding.

Purpose: The current scraper calls a non-existent external service (SCRAPER_SERVICE_URL). This replaces it with an inline browser-based scraper that uses Cloudflare's Browser Rendering API, eliminating the external dependency entirely.

Output: Working scraper that launches a headless browser via Cloudflare binding, navigates to a URL, and extracts post content and author.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/server/services/scraper.ts
@src/routes/(app)/+page.server.ts
@src/app.d.ts
@wrangler.jsonc
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add browser binding and install @cloudflare/puppeteer</name>
  <files>wrangler.jsonc, package.json, src/app.d.ts</files>
  <action>
    1. Install @cloudflare/puppeteer as a dependency:
       `bun add @cloudflare/puppeteer`

    2. Add browser binding to wrangler.jsonc. Add this top-level property:
       ```jsonc
       "browser": {
         "binding": "BROWSER"
       }
       ```

    3. Update the Platform interface in src/app.d.ts:
       - Add `BROWSER?: Fetcher;` to the env object (Fetcher is the type for browser bindings from @cloudflare/workers-types which is already in devDeps)
       - Remove `SCRAPER_SERVICE_URL?: string;` since it's no longer needed
  </action>
  <verify>Run `bun run typecheck` to confirm types are valid (may have errors in scraper.ts until Task 2 -- that's fine, just confirm app.d.ts and wrangler changes are correct)</verify>
  <done>wrangler.jsonc has browser binding, app.d.ts has BROWSER Fetcher type, @cloudflare/puppeteer is installed</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite scraper to use @cloudflare/puppeteer with browser binding</name>
  <files>src/lib/server/services/scraper.ts, src/routes/(app)/+page.server.ts</files>
  <action>
    1. Rewrite src/lib/server/services/scraper.ts:
       - Keep the `ScrapeResult` interface exactly as-is (same export shape)
       - Change `scrapeUrl` signature to accept a `browser: Fetcher | undefined` instead of `scraperBaseUrl: string | undefined`
       - If browser binding is undefined/falsy, return null early (same pattern as before)
       - Implementation:
         ```typescript
         import puppeteer from "@cloudflare/puppeteer";

         export async function scrapeUrl(
           browser: Fetcher | undefined,
           targetUrl: string,
         ): Promise<ScrapeResult | null> {
           if (!browser) return null;

           let browserInstance;
           try {
             browserInstance = await puppeteer.launch(browser);
             const page = await browserInstance.newPage();
             await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 15000 });

             // Extract content and author using page.evaluate
             const result = await page.evaluate(() => {
               // Try Open Graph and meta tags first for author
               const ogAuthor = document.querySelector('meta[property="article:author"]')?.getAttribute("content")
                 || document.querySelector('meta[name="author"]')?.getAttribute("content")
                 || null;

               // For Twitter/X: look for the display name in the tweet
               const tweetAuthor = document.querySelector('[data-testid="User-Name"]')?.textContent?.split("@")[0]?.trim()
                 || null;

               // For LinkedIn: look for author name
               const linkedinAuthor = document.querySelector('.feed-shared-actor__name')?.textContent?.trim()
                 || document.querySelector('.update-components-actor__name')?.textContent?.trim()
                 || null;

               const author = ogAuthor || tweetAuthor || linkedinAuthor || null;

               // Content extraction: try structured content first, fall back to body text
               // Twitter/X post content
               const tweetContent = document.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
               // LinkedIn post content
               const linkedinContent = document.querySelector('.feed-shared-text')?.textContent?.trim()
                 || document.querySelector('.update-components-text')?.textContent?.trim();
               // Generic: og:description or article body
               const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute("content");
               const articleBody = document.querySelector('article')?.textContent?.trim();
               // Final fallback: page body, truncated
               const bodyText = document.body?.innerText?.substring(0, 5000) || "";

               const content = tweetContent || linkedinContent || ogDescription || articleBody || bodyText;

               return { content: content || "", author: author || undefined };
             });

             return {
               content: result.content,
               author: result.author,
             };
           } catch {
             return null;
           } finally {
             if (browserInstance) {
               try { await browserInstance.close(); } catch { /* ignore close errors */ }
             }
           }
         }
         ```

    2. Update src/routes/(app)/+page.server.ts in the addPost action:
       - Replace the scraperUrl/SCRAPER_SERVICE_URL lines (lines 64-68) with:
         ```typescript
         const browser = event.platform?.env?.BROWSER;
         ```
       - Update both scrapeUrl calls to pass `browser` instead of `scraperUrl`:
         ```typescript
         let scrapeResult = await scrapeUrl(browser, url);
         if (!scrapeResult) {
           scrapeResult = await scrapeUrl(browser, url); // single retry
         }
         ```
       - Remove the `import { env } from "$env/dynamic/private"` ONLY IF `env` is no longer used anywhere else in the file. Check the getServices function first -- it uses `env.DATABASE_URL`, so keep the import.

    3. Remove the SCRAPER_SERVICE_URL reference entirely. The only references should have been in +page.server.ts (which we just changed) and app.d.ts (changed in Task 1).
  </action>
  <verify>
    Run `bun run typecheck` -- should pass with no errors.
    Run `bun test` -- existing tests should still pass (scraper has no tests, but ensure nothing else breaks).
  </verify>
  <done>
    - scrapeUrl accepts a Fetcher binding instead of a URL string
    - +page.server.ts passes platform.env.BROWSER to scrapeUrl
    - No references to SCRAPER_SERVICE_URL remain in codebase
    - TypeScript compiles cleanly
    - Existing tests pass
  </done>
</task>

</tasks>

<verification>
- `bun run typecheck` passes
- `bun test` passes
- `grep -r "SCRAPER_SERVICE_URL" src/` returns no results
- `grep -r "BROWSER" src/app.d.ts` shows the Fetcher binding type
- wrangler.jsonc contains browser binding config
- scraper.ts exports same ScrapeResult interface
</verification>

<success_criteria>
- @cloudflare/puppeteer installed and browser binding configured in wrangler.jsonc
- scraper.ts uses puppeteer.launch(browser) with the Cloudflare browser binding
- +page.server.ts passes platform.env.BROWSER to scrapeUrl
- All SCRAPER_SERVICE_URL references removed
- TypeScript compiles, existing tests pass
- Scraper gracefully returns null when binding unavailable or page fails to load
</success_criteria>

<output>
After completion, create `.planning/quick/003-implement-scraper-with-cloudflare-puppeteer/003-SUMMARY.md`
</output>
