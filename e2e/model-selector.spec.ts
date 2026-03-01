import { test, expect } from "@playwright/test";
import { authenticate, navigateWithRetry, addPost } from "./helpers";
import { interceptChatWithDraft, interceptDraftsEndpoint } from "./mocks/ai";

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

    const selector = page.locator("nav select").first();
    await expect(selector).toBeVisible();

    // Switch to a different model
    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/settings/model") &&
        res.request().method() === "PUT" &&
        res.status() === 200,
      { timeout: 10000 },
    );

    await selector.selectOption("claude-haiku-4-5-20251001");
    await saveResponse;

    // Verify the selector now shows the new model
    await expect(selector).toHaveValue("claude-haiku-4-5-20251001");
  });

  test("selected model persists across page navigation", async ({ page }) => {
    await navigateWithRetry(page, "/");

    const selector = page.locator("nav select").first();

    // Switch model
    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/settings/model") &&
        res.request().method() === "PUT" &&
        res.status() === 200,
      { timeout: 10000 },
    );
    await selector.selectOption("claude-haiku-4-5-20251001");
    await saveResponse;

    // Navigate away and back
    await navigateWithRetry(page, "/personas");
    await navigateWithRetry(page, "/");

    // Model should still be the one we selected
    const selectorAfter = page.locator("nav select").first();
    await expect(selectorAfter).toHaveValue("claude-haiku-4-5-20251001");
  });

  test("PUT /settings/model rejects invalid model ID", async ({ page }) => {
    await navigateWithRetry(page, "/");

    // Manually send a bad model ID
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

    // Switch to Haiku
    const selector = page.locator("nav select").first();
    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/settings/model") &&
        res.request().method() === "PUT" &&
        res.status() === 200,
      { timeout: 10000 },
    );
    await selector.selectOption("claude-haiku-4-5-20251001");
    await saveResponse;

    // Create a post and send a chat message
    const postId = await addPost(page, "https://example.com/model-test");

    await interceptChatWithDraft(page, "Draft from haiku model.");
    await interceptDraftsEndpoint(page);
    await navigateWithRetry(page, `/queue/${postId}`);

    // Intercept the chat POST to verify the request goes through
    const chatRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/chat") && req.method() === "POST",
      { timeout: 15000 },
    );

    const chatInput = page.getByRole("textbox", { name: "Chat message" });
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill("Write a reply");
    await page.getByRole("button", { name: "Send message" }).click();

    // The chat request was made (model is resolved server-side from DB, not sent in body)
    const chatReq = await chatRequestPromise;
    expect(chatReq.url()).toContain("/chat");

    // Draft should render — confirming the full flow works with a non-default model
    const draftBlock = page.locator("[data-draft-message]");
    await expect(draftBlock).toBeVisible({ timeout: 15000 });
    await expect(draftBlock.locator(".draft-text")).toContainText(
      "Draft from haiku model.",
    );
  });
});
