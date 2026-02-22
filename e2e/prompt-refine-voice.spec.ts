import { test, expect, type Page } from "@playwright/test";
import { authenticate } from "./helpers";

// Fake refined voice profile for mocked preview responses (avoids AI calls)
const REFINED_VOICE_PROFILE = JSON.stringify({
  voiceDNA: ["Short punchy sentences under 15 words", "Sarcastic asides in parentheses"],
  dimensions: {
    structure: [{ pattern: "Short punchy paragraphs", signal: "embedded", evidence: "80% use 1-2 sentence paragraphs" }],
    grammar: [{ pattern: "Liberal use of em-dashes", signal: "consistent", evidence: "Found in 4 out of 6 samples" }],
    vocabulary: [{ pattern: "Heavy sarcasm markers", signal: "embedded", evidence: "Every other sentence" }],
    rhetoric: [{ pattern: "Leads with hot take, then softens", signal: "contextual", evidence: "Present in 2 of 3 openers" }],
  },
  contentModes: [
    { type: "original take", dominantPatterns: ["Rhetorical opener"], distinctiveShifts: "More assertive", exampleQuote: "Why?" },
  ],
  inconsistencies: [],
  recommendations: { leanInto: ["Sarcastic asides"], watchOutFor: ["Overusing questions"], develop: ["Long-form"] },
  consistencyScore: { rating: "moderately-consistent", summary: "Strong structural voice with sarcastic edge." },
});

function generateSamples(): string {
  return `I think the best way to ship software is to move fast and break things — but only if you have good tests.
Nobody talks about this enough: most teams spend 80% of their time on the wrong problems. They optimize for performance
when users don't even understand the UI. Here's my hot take: if your product needs a tutorial, you've already lost.

Short sentences hit harder. Trust me on this. I've been building products for 10 years and the ones that win are always
stupidly simple. Not simple as in easy to build — simple as in easy to understand. There's a massive difference.

When I see a landing page with 14 features listed, I bounce. When I see one sentence that tells me exactly what it does
and why I should care, I sign up. That's the whole game. Ship less, explain better, iterate faster.`;
}

async function createPersonaAndGo(page: Page, name: string): Promise<string> {
  const response = await page.request.post("/personas/new", { form: { name } });
  const body = await response.json();
  if (body.type !== "redirect" || !body.location) {
    throw new Error(`Persona creation failed: ${JSON.stringify(body)}`);
  }
  await page.goto(body.location);
  await expect(page.getByText("No voice profile yet")).toBeVisible({ timeout: 10000 });
  return body.location;
}

/** Setup: authenticate, create persona, extract voice profile via real AI. */
async function fullSetup(page: Page): Promise<string> {
  await authenticate(page);
  const url = await createPersonaAndGo(page, `Test Persona ${Date.now()}`);

  // Voice extraction — uses server-side mock when MOCK_AI=true (no real API calls)
  await expect(page.getByText("No voice profile yet")).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder(/Paste your writing samples here/).fill(generateSamples());
  await page.getByRole("button", { name: "Extract Voice Profile" }).click();
  await expect(page.getByText("Writing sample saved and voice profile extracted")).toBeVisible({ timeout: 30000 });
  // After invalidateAll(), the page reloads data from DB — voice profile should be present
  await expect(page.getByText("Refine with Prompt")).toBeVisible({ timeout: 15000 });

  return url;
}

/** Extract persona ID from a persona URL like /personas/abc123 */
function personaIdFromUrl(url: string): string {
  const match = url.match(/\/personas\/([^/]+)/);
  if (!match) throw new Error(`Could not extract persona ID from URL: ${url}`);
  return match[1];
}

test.describe("Refine voice profile — dedicated page", () => {
  test.setTimeout(60000);

  test("Refine with Prompt link is hidden when no voice profile exists", async ({ page }) => {
    await authenticate(page);
    await createPersonaAndGo(page, `Test Persona ${Date.now()}`);

    await expect(page.getByText("No voice profile yet")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Refine with Prompt")).not.toBeVisible();
  });

  test("visiting /refine without voice profile redirects to persona page", async ({ page }) => {
    await authenticate(page);
    const url = await createPersonaAndGo(page, `Test Persona ${Date.now()}`);
    const personaId = personaIdFromUrl(url);

    // Directly navigate to /refine — should redirect back
    await page.goto(`/personas/${personaId}/refine`);
    await page.waitForURL(`**/personas/${personaId}`, { timeout: 10000 });
    expect(page.url()).toContain(`/personas/${personaId}`);
    expect(page.url()).not.toContain("/refine");
  });

  test("full refine flow: navigate, input, preview, diff, accept, discard", async ({ page }) => {
    // This single test covers the entire refine feature end-to-end.
    // Consolidates multiple scenarios to minimize expensive AI extraction calls.

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const url = await fullSetup(page);
    const personaId = personaIdFromUrl(url);

    // ── Step 1: Navigate to /refine page via link ──

    const refineLink = page.getByRole("link", { name: "Refine with Prompt" });
    await expect(refineLink).toBeVisible();
    await refineLink.click();

    await page.waitForURL(`**/personas/${personaId}/refine`, { timeout: 10000 });

    // ── Step 2: Verify input phase UI ──

    await expect(page.getByText("Refine Voice Profile")).toBeVisible();
    await expect(page.getByText(/Describe how you'd like your voice profile updated/)).toBeVisible();

    const backLink = page.getByRole("link", { name: new RegExp("Back to") });
    await expect(backLink).toBeVisible();

    const textarea = page.getByPlaceholder(/I tend to be more sarcastic/i);
    await expect(textarea).toBeVisible();

    const previewBtn = page.getByRole("button", { name: "Preview Changes" });
    await expect(previewBtn).toBeVisible();
    await expect(previewBtn).toBeDisabled();

    // ── Step 3: Button disabled for empty/whitespace input ──

    await textarea.fill("   ");
    await expect(previewBtn).toBeDisabled();

    await textarea.fill("");
    await expect(previewBtn).toBeDisabled();

    await textarea.fill("Make my tone more casual");
    await expect(previewBtn).toBeEnabled();

    // ── Step 4: Mock POST (preview) to avoid AI call, verify loading → diff ──

    await page.route(`**/personas/${personaId}/voice`, (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({ status: 200, contentType: "text/plain", body: REFINED_VOICE_PROFILE });
      }
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
      return route.continue();
    });

    // Re-fill to ensure Svelte reactivity enables the button
    await textarea.fill("Make my tone more casual");
    await expect(previewBtn).toBeEnabled({ timeout: 5000 });

    const postRequest = page.waitForRequest(
      (req) => req.url().includes("/voice") && req.method() === "POST",
    );

    await previewBtn.click();

    // Verify POST payload
    const req = await postRequest;
    const body = req.postDataJSON();
    expect(body.userPrompt).toBe("Make my tone more casual");
    expect(body.preview).toBe(true);

    // ── Step 5: Diff phase — before/after displayed ──

    // Wait for diff to render
    await expect(page.getByText("Voice DNA")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Current").first()).toBeVisible();
    await expect(page.getByText("Proposed").first()).toBeVisible();

    // Accept and Discard buttons visible
    const acceptBtn = page.getByRole("button", { name: "Accept Changes" });
    const discardBtn = page.getByRole("button", { name: "Discard" });
    await expect(acceptBtn).toBeVisible();
    await expect(discardBtn).toBeVisible();

    // ── Step 6: Discard → navigates back to persona page, no PUT call ──

    let putCalled = false;
    page.on("request", (req) => {
      if (req.url().includes("/voice") && req.method() === "PUT") {
        putCalled = true;
      }
    });

    await discardBtn.click();
    await page.waitForURL(`**/personas/${personaId}`, { timeout: 10000 });
    expect(page.url()).not.toContain("/refine");
    expect(putCalled).toBe(false);

    // ── Step 7: Go back to /refine and test Accept flow ──

    await page.getByRole("link", { name: "Refine with Prompt" }).click();
    await page.waitForURL(`**/personas/${personaId}/refine`, { timeout: 10000 });

    await page.getByPlaceholder(/I tend to be more sarcastic/i).fill("More sarcasm please");
    await page.getByRole("button", { name: "Preview Changes" }).click();

    // Wait for diff
    await expect(page.getByText("Voice DNA")).toBeVisible({ timeout: 10000 });

    // Click Accept
    const putRequest = page.waitForRequest(
      (req) => req.url().includes("/voice") && req.method() === "PUT",
    );
    await page.getByRole("button", { name: "Accept Changes" }).click();

    // Verify PUT was called with the refined profile
    const putReq = await putRequest;
    const putBody = putReq.postDataJSON();
    expect(putBody.profile).toBeDefined();
    expect(putBody.profile.voiceDNA).toBeDefined();

    // Redirects back to persona page
    await page.waitForURL(`**/personas/${personaId}`, { timeout: 10000 });
    expect(page.url()).not.toContain("/refine");

    // ── Step 8: No console errors throughout ──

    const realErrors = errors.filter(
      (e) => !e.includes("fetch") && !e.includes("Failed to fetch") && !e.includes("NetworkError"),
    );
    expect(realErrors).toEqual([]);
  });

  test("loading state shows spinner during preview", async ({ page }) => {
    const url = await fullSetup(page);
    const personaId = personaIdFromUrl(url);

    // Navigate to refine page
    await page.getByRole("link", { name: "Refine with Prompt" }).click();
    await page.waitForURL(`**/personas/${personaId}/refine`, { timeout: 10000 });

    // Delayed mock to observe loading state
    await page.route(`**/personas/${personaId}/voice`, async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 1500));
        return route.fulfill({ status: 200, contentType: "text/plain", body: REFINED_VOICE_PROFILE });
      }
      return route.continue();
    });

    await page.getByPlaceholder(/I tend to be more sarcastic/i).fill("More sarcasm");
    await page.getByRole("button", { name: "Preview Changes" }).click();

    // Should show loading indicator
    await expect(page.getByText("Generating refined profile...")).toBeVisible({ timeout: 3000 });

    // Should eventually show diff
    await expect(page.getByText("Voice DNA")).toBeVisible({ timeout: 10000 });
  });
});
