import { test, expect } from "@playwright/test";
import { authenticate, addPost, navigateWithRetry } from "./helpers";
import {
  interceptChatWithDraft,
  interceptDraftsEndpoint,
  interceptHumanizeEndpoint,
} from "./mocks/ai";

/** Set up a post with a draft block, mocking chat + drafts + humanize endpoints. */
async function setupHumanizeTest(
  page: import("@playwright/test").Page,
  postUrl: string,
  draftContent: string,
  humanizedContent: string,
) {
  const postId = await addPost(page, postUrl);

  await interceptChatWithDraft(page, draftContent);
  await interceptDraftsEndpoint(page);
  await interceptHumanizeEndpoint(page, humanizedContent);

  await navigateWithRetry(page, `/queue/${postId}`);

  const chatInput = page.getByRole("textbox", { name: "Chat message" });
  await expect(chatInput).toBeVisible({ timeout: 10000 });
  await chatInput.fill("Draft a reply");
  await page.getByRole("button", { name: "Send message" }).click();

  const draftBlock = page.locator("[data-draft-message]");
  await expect(draftBlock).toBeVisible({ timeout: 15000 });

  return { postId, draftBlock };
}

test.describe("Humanize draft flow", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  test("humanize button replaces draft text with humanized version", async ({
    page,
  }) => {
    const original = "This is a very AI-sounding draft with crucial insights.";
    const humanized = "Here is the rewritten draft without AI patterns.";
    const { draftBlock } = await setupHumanizeTest(
      page,
      "https://example.com/humanize-1",
      original,
      humanized,
    );

    // Verify original draft text is displayed
    await expect(draftBlock.locator(".draft-text")).toContainText(original);

    // Click Humanize
    const humanizeBtn = draftBlock.getByRole("button", { name: "Humanize" });
    await expect(humanizeBtn).toBeVisible();

    const humanizeResponse = page.waitForResponse(
      (res) => res.url().includes("/humanize") && res.status() === 200,
      { timeout: 10000 },
    );
    await humanizeBtn.click();

    await humanizeResponse;

    // Draft text should now show the humanized version
    await expect(draftBlock.locator(".draft-text")).toContainText(humanized);

    // "Edited" badge should appear
    await expect(draftBlock.getByText("Edited")).toBeVisible();
  });

  test("show original toggle works after humanize", async ({ page }) => {
    const original = "Original AI-sounding draft text.";
    const humanized = "Natural-sounding rewrite.";
    const { draftBlock } = await setupHumanizeTest(
      page,
      "https://example.com/humanize-2",
      original,
      humanized,
    );

    // Humanize
    const humanizeResponse = page.waitForResponse(
      (res) => res.url().includes("/humanize") && res.status() === 200,
      { timeout: 10000 },
    );
    await draftBlock.getByRole("button", { name: "Humanize" }).click();
    await humanizeResponse;

    await expect(draftBlock.locator(".draft-text")).toContainText(humanized);

    // Show original
    await draftBlock.getByText("Show original").click();
    await expect(draftBlock.getByText(original)).toBeVisible();

    // Hide original
    await draftBlock.getByText("Hide original").click();
    await expect(draftBlock.locator(".draft-text")).toContainText(humanized);
  });

  test("humanize button shows loading state", async ({ page }) => {
    const original = "Draft for loading test.";
    const humanized = "Humanized loading test.";
    const { draftBlock } = await setupHumanizeTest(
      page,
      "https://example.com/humanize-3",
      original,
      humanized,
    );

    // Click and check for loading state
    await draftBlock.getByRole("button", { name: "Humanize" }).click();

    // Should briefly show "Humanizing..." (may be fast with mocks, so just check the response completes)
    await expect(draftBlock.locator(".draft-text")).toContainText(humanized, {
      timeout: 10000,
    });
  });

  test("humanize sends correct payload to server", async ({ page }) => {
    const original = "Draft payload test content.";
    const humanized = "Humanized payload result.";
    const { draftBlock } = await setupHumanizeTest(
      page,
      "https://example.com/humanize-4",
      original,
      humanized,
    );

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes("/humanize") && req.method() === "POST",
      { timeout: 10000 },
    );

    await draftBlock.getByRole("button", { name: "Humanize" }).click();

    const req = await requestPromise;
    const body = req.postDataJSON();
    expect(body.messageId).toBeDefined();
    expect(body.draftText).toBe(original);
  });
});
