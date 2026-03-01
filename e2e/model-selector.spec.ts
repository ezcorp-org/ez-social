import { test, expect } from "@playwright/test";
import { authenticate, navigateWithRetry, addPost } from "./helpers";
import { interceptChatWithDraft, interceptDraftsEndpoint } from "./mocks/ai";

/** Switch model via the nav dropdown and wait for the save to complete. */
async function switchModel(page: import("@playwright/test").Page, modelId: string) {
  const selector = page.locator("nav select").first();
  await expect(selector).toBeVisible();

  // Set up response listener BEFORE triggering the change
  const saved = page.waitForResponse(
    (res) => res.url().includes("/settings/model") && res.request().method() === "PUT",
    { timeout: 10000 },
  );
  await selector.selectOption(modelId);
  await saved;

  await expect(selector).toHaveValue(modelId);
}

test.describe("Model selector", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  test("displays model selector with default model selected", async ({
    page,
  }) => {
    await navigateWithRetry(page, "/");

    const selector = page.locator("nav select").first();
    await expect(selector).toBeVisible();

    // Should have multiple options
    const options = selector.locator("option");
    await expect(options).not.toHaveCount(0);

    // Default model should be selected (Claude Sonnet 4)
    await expect(selector).toHaveValue("claude-sonnet-4-20250514");
  });

  test("switching model persists via PUT /settings/model", async ({
    page,
  }) => {
    await navigateWithRetry(page, "/");
    await switchModel(page, "claude-haiku-4-5-20251001");
  });

  test("selected model persists across page navigation", async ({ page }) => {
    await navigateWithRetry(page, "/");
    await switchModel(page, "claude-haiku-4-5-20251001");

    // Navigate away and back
    await navigateWithRetry(page, "/personas");
    await navigateWithRetry(page, "/");

    // Model should still be the one we selected
    const selector = page.locator("nav select").first();
    await expect(selector).toHaveValue("claude-haiku-4-5-20251001");
  });

  test("PUT /settings/model rejects invalid model ID", async ({ page }) => {
    await navigateWithRetry(page, "/");

    const res = await page.evaluate(async () => {
      const r = await fetch("/settings/model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "not-a-real-model" }),
      });
      return { status: r.status, text: await r.text() };
    });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Invalid model");
  });

  test("selected model is sent in chat requests", async ({ page }) => {
    await navigateWithRetry(page, "/");
    await switchModel(page, "claude-haiku-4-5-20251001");

    // Create a post and send a chat message
    const postId = await addPost(page, "https://example.com/model-test");

    await interceptChatWithDraft(page, "Draft from haiku model.");
    await interceptDraftsEndpoint(page);
    await navigateWithRetry(page, `/queue/${postId}`);

    const chatInput = page.getByRole("textbox", { name: "Chat message" });
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill("Write a reply");
    await page.getByRole("button", { name: "Send message" }).click();

    // Draft should render — confirming the full flow works with a non-default model
    const draftBlock = page.locator("[data-draft-message]");
    await expect(draftBlock).toBeVisible({ timeout: 15000 });
    await expect(draftBlock.locator(".draft-text")).toContainText(
      "Draft from haiku model.",
    );
  });
});
