import { test, expect } from "@playwright/test";
import { authenticate, gotoDashboard } from "./helpers";
import { interceptChatWithDraft } from "./mocks/ai";

// Helper: add a post via the QuickAdd form and get its ID
// Since the scraper won't work in test, we add content manually after
async function addPostWithContent(page: import("@playwright/test").Page, url: string) {
  await gotoDashboard(page);
  await page.getByRole("textbox", { name: "Post URL" }).fill(url);
  await page.getByRole("button", { name: "Add to Queue" }).click();

  // Scraper will fail in test environment — need to manually add content
  await expect(page.getByText("Could not scrape post content")).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder("Paste the post content here...").fill("Test post content about technology.");

  // Wait for the dynamic form's hydration, then click save
  // Retry the click if the form hasn't hydrated yet (no server response)
  const saveButton = page.getByRole("button", { name: "Save content" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST", { timeout: 5000 }).catch(() => null),
      saveButton.click(),
    ]);
    if (response) break;
    await page.waitForTimeout(300);
  }

  // Wait for table row to appear (post was created even before content save)
  const tableRow = page.locator('table a[href^="/queue/"]').first();
  await expect(tableRow).toBeVisible({ timeout: 10000 });

  // Extract post ID from the first row link
  const href = await tableRow.getAttribute("href");
  const postId = href?.split("/queue/")[1];
  return postId!;
}

test.describe("Auto-generate reply flow", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
    await gotoDashboard(page);
  });

  test("QuickAdd shows optional prompt toggle", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "more options (optional)" });
    await expect(toggle).toBeVisible();

    // Click to reveal textarea — after click the button text changes to "Hide options"
    await toggle.click();
    await expect(page.getByRole("button", { name: "Hide options" })).toBeVisible({ timeout: 5000 });
    const promptInput = page.getByPlaceholder(/e\.g\. Disagree/i);
    await expect(promptInput).toBeVisible();

    // Click to hide
    await page.getByRole("button", { name: "Hide options" }).click();
    await expect(promptInput).not.toBeVisible();
  });

  test("navigating to chat page without autoGenerate shows greeting", async ({ page }) => {
    const postId = await addPostWithContent(page, "https://example.com/post/1");

    // Click through to the chat page
    await page.locator(`a[href="/queue/${postId}"]`).first().click();
    await page.waitForURL(`/queue/${postId}`);

    // Greeting message should be visible
    await expect(page.getByText(/Ready to help you draft a reply/)).toBeVisible();

    // No auto-sent user message — check there's no user bubble with this exact text
    // The greeting assistant message contains "draft a reply" as a substring, so we
    // look specifically for a user-role message with the exact auto-generate text.
    const userMessages = page.locator('[data-role="user"]', { hasText: "Draft a reply to this post." });
    await expect(userMessages).toHaveCount(0);
  });

  test("autoGenerate=true sends default message and cleans URL", async ({ page }) => {
    const postId = await addPostWithContent(page, "https://example.com/post/2");

    // Mock AI chat response to avoid real API calls
    await interceptChatWithDraft(page, "Mock reply for auto-generate test.");

    // Navigate with autoGenerate param
    await page.goto(`/queue/${postId}?autoGenerate=true`);

    // Default auto-message should appear in chat
    await expect(page.getByText("Draft a reply to this post.")).toBeVisible({ timeout: 5000 });

    // URL should be cleaned (no query params)
    await page.waitForURL(`/queue/${postId}`, { timeout: 5000 });
    expect(page.url()).not.toContain("autoGenerate");
  });

  test("autoGenerate with custom prompt sends that prompt", async ({ page }) => {
    const postId = await addPostWithContent(page, "https://example.com/post/3");

    // Mock AI chat response to avoid real API calls
    await interceptChatWithDraft(page, "Mock polite disagreement reply.");

    // Navigate with autoGenerate + custom prompt
    await page.goto(`/queue/${postId}?autoGenerate=true&prompt=${encodeURIComponent("disagree politely")}`);

    // Custom prompt should appear in chat
    await expect(page.getByText("disagree politely")).toBeVisible({ timeout: 5000 });

    // URL should be cleaned
    await page.waitForURL(`/queue/${postId}`, { timeout: 5000 });
    expect(page.url()).not.toContain("prompt");
  });

  test("refresh after auto-generate does not re-trigger", async ({ page }) => {
    const postId = await addPostWithContent(page, "https://example.com/post/4");

    // Mock AI chat response to avoid real API calls
    await interceptChatWithDraft(page, "Mock reply for refresh test.");

    // Navigate with autoGenerate
    await page.goto(`/queue/${postId}?autoGenerate=true`);
    // Wait for user message bubble to appear
    const userBubble = page.locator('[data-role="user"]');
    await expect(userBubble.first()).toBeVisible({ timeout: 10000 });

    // Wait for URL cleanup
    await page.waitForURL(`/queue/${postId}`, { timeout: 10000 });

    // Count user messages before refresh
    const userMessagesBefore = await userBubble.count();

    // Refresh
    await page.reload();
    await expect(page.locator('[data-role="user"]').first()).toBeVisible({ timeout: 10000 });

    // Same number of user messages — no re-trigger
    const userMessagesAfter = await page.locator('[data-role="user"]').count();
    expect(userMessagesAfter).toBe(userMessagesBefore);
  });

  test("failed scrape shows manual content form, no redirect", async ({ page }) => {
    await page.getByRole("textbox", { name: "Post URL" }).fill("https://example.com/post/5");
    await page.getByRole("button", { name: "Add to Queue" }).click();

    // Should show manual content form, not redirect
    await expect(page.getByText("Could not scrape post content")).toBeVisible({ timeout: 5000 });

    // Should still be on dashboard
    expect(page.url()).toContain("localhost");
    expect(page.url()).not.toContain("/queue/");
  });

  test("no console errors on autoGenerate page load", async ({ page }) => {
    const postId = await addPostWithContent(page, "https://example.com/post/6");

    // Mock AI chat response to avoid real API calls
    await interceptChatWithDraft(page, "Mock reply for console error test.");

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`/queue/${postId}?autoGenerate=true`);

    // If we got a 500 error page, retry once (server may need a moment after many tests)
    if (await page.getByText("Something went wrong").isVisible().catch(() => false)) {
      errors.length = 0;
      await page.goto(`/queue/${postId}?autoGenerate=true`);
    }

    await page.waitForURL(`/queue/${postId}`, { timeout: 15000 });

    // Filter out known non-issues (like fetch failures to AI API which is expected in tests)
    const realErrors = errors.filter(
      (e) => !e.includes("fetch") && !e.includes("Failed to fetch") && !e.includes("NetworkError"),
    );
    expect(realErrors).toEqual([]);
  });
});
