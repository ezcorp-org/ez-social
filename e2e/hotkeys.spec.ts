import { test, expect } from "@playwright/test";
import { authenticate, addPost, navigateWithRetry, gotoDashboard } from "./helpers";
import { interceptChatWithDraft } from "./mocks/ai";

test.describe("Hotkey navigation", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
    await gotoDashboard(page);
    // Blur any focused form element so hotkeys aren't swallowed
    await page.locator("h1").click();
  });

  test("pressing 'n' opens QuickAdd modal and auto-focuses URL input", async ({ page }) => {
    // Modal should not be visible initially
    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();

    // Press 'n'
    await page.keyboard.press("n");

    // Modal should appear with QuickAdd form
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    // URL input inside the modal should be focused
    const modalInput = page.locator('#modal-quick-add input[type="url"]');
    await expect(modalInput).toBeFocused();
  });

  test("pressing Escape closes QuickAdd modal", async ({ page }) => {
    // Open modal
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();
  });

  test("Escape closes modal even when focused in the URL input", async ({ page }) => {
    // Open modal — input is auto-focused
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();
    const modalInput = page.locator('#modal-quick-add input[type="url"]');
    await expect(modalInput).toBeFocused();

    // Type something to confirm we're in the input
    await page.keyboard.type("https://example.com");
    await expect(modalInput).toHaveValue("https://example.com");

    // Escape should still close the modal
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();
  });

  test("clicking backdrop closes QuickAdd modal", async ({ page }) => {
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    // Click the backdrop (the fixed overlay div) at position 10,10 which is outside the modal card
    const backdrop = page.locator(".fixed.inset-0");
    await backdrop.click({ position: { x: 10, y: 10 } });

    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();
  });

  test("close button closes QuickAdd modal", async ({ page }) => {
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();
  });

  test("hotkeys do not fire when typing in an input", async ({ page }) => {
    // Focus the URL input on the page
    const urlInput = page.getByRole("textbox", { name: "Post URL" });
    await urlInput.focus();

    // Type 'n' into the input
    await page.keyboard.press("n");

    // Modal should NOT open
    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();

    // The input should have the character
    await expect(urlInput).toHaveValue("n");
  });

  test("hotkeys do not fire with modifier keys", async ({ page }) => {
    // Press Ctrl+n — should not open modal
    await page.keyboard.press("Control+n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();

    // Press Alt+n — should not open modal
    await page.keyboard.press("Alt+n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();
  });

  test("pressing 'l' navigates to the latest post", async ({ page }) => {
    test.setTimeout(60000);
    const postId = await addPost(page, "https://example.com/hotkey-test-1");

    await navigateWithRetry(page, "/");

    // Press 'l'
    await page.keyboard.press("l");

    // Should navigate to the post page
    await page.waitForURL(`/queue/${postId}`, { timeout: 15000 });
    expect(page.url()).toContain(`/queue/${postId}`);
  });

  test("pressing 'l' does nothing when there are no posts", async ({ page }) => {
    // Fresh user with no posts — pressing 'l' should stay on current page
    const currentUrl = page.url();
    await page.keyboard.press("l");

    // Small wait to confirm no navigation happened
    await page.waitForTimeout(500);
    expect(page.url()).toBe(currentUrl);
  });

  test("hotkeys work from non-dashboard app pages", async ({ page }) => {
    await navigateWithRetry(page, "/personas");

    // Press 'n' — modal should open
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    // Escape to close
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Quick Add" })).not.toBeVisible();
  });

  test("QuickAdd modal submission works from non-dashboard pages", async ({ page }) => {
    test.setTimeout(60000);

    // Mock AI chat response in case autoGenerate triggers
    await interceptChatWithDraft(page, "Mock reply for hotkey submission test.");

    // First add a post so we have a queue page to navigate to
    const postId = await addPost(page, "https://example.com/hotkey-submit-test");

    // Navigate to a non-dashboard page (the post page itself)
    await navigateWithRetry(page, `/queue/${postId}`);

    // Open QuickAdd modal
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    // Fill in a URL and submit
    const modalInput = page.locator('#modal-quick-add input[type="url"]');
    await modalInput.fill("https://example.com/from-queue-page");
    await page.locator('#modal-quick-add button[type="submit"]').click();

    // Should either redirect to the new post or show the manual content form — NOT a 500/404 error
    const result = await Promise.race([
      page.getByText("Could not scrape post content").waitFor({ timeout: 15000 }).then(() => "needs-content" as const),
      page.waitForURL(/\/queue\/(?!.*hotkey-submit-test).*\?autoGenerate/, { timeout: 15000 }).then(() => "redirected" as const),
    ]).catch(() => "error" as const);

    expect(result).not.toBe("error");
    // Ensure we didn't hit an error page
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("QuickAdd from post page shows new post context and auto-generates", async ({ page }) => {
    test.setTimeout(90000);

    // Mock AI chat response for autoGenerate
    await interceptChatWithDraft(page, "Mock reply for auto-generate hotkey test.");

    // Create first post
    const firstPostId = await addPost(page, "https://example.com/first-post");

    // Navigate to the first post's page
    await navigateWithRetry(page, `/queue/${firstPostId}`);

    // Verify we see the first post's URL in the context card
    await expect(page.locator("text=example.com/first-post")).toBeVisible({ timeout: 5000 });

    // Open QuickAdd modal and submit a second post
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    const modalInput = page.locator('#modal-quick-add input[type="url"]');
    await modalInput.fill("https://example.com/second-post");
    await page.locator('#modal-quick-add button[type="submit"]').click();

    // The modal may show "Could not scrape" — if so, paste content and save
    const needsContent = await page.getByText("Could not scrape post content")
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (needsContent) {
      // Fill and save content inside the modal
      await page.locator('#modal-quick-add textarea[name="content"]').fill("Second post content.");
      await page.locator('#modal-quick-add button:has-text("Save content")').click();
    }

    // Wait until the URL changes away from the first post
    await page.waitForFunction(
      (firstId: string) => !window.location.pathname.includes(firstId),
      firstPostId,
      { timeout: 30000 },
    );

    // The URL should be for the NEW post
    expect(page.url()).not.toContain(firstPostId);
    expect(page.url()).toContain("/queue/");

    // The context card should show the second post's URL, not the first
    await expect(page.locator("text=example.com/second-post")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=example.com/first-post")).not.toBeVisible();

    // Auto-generate should have fired — the user message "Draft a reply" should appear in the chat
    const chatLog = page.locator('[role="log"]');
    await expect(chatLog).toBeVisible({ timeout: 5000 });
    await expect(chatLog.getByText("Draft a reply to this post.")).toBeVisible({ timeout: 10000 });
  });
});
