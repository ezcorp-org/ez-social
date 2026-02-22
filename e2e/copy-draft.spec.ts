import { test, expect } from "@playwright/test";
import { authenticate, addPost, navigateWithRetry } from "./helpers";
import { interceptChatWithDraft, interceptDraftsEndpoint } from "./mocks/ai";

/** Navigate to a post page and set up the chat mock */
async function setupDraftTest(
  page: import("@playwright/test").Page,
  postUrl: string,
  draftContent: string,
  opts: { mockDrafts?: boolean } = {},
) {
  const postId = await addPost(page, postUrl);

  // Set up route intercepts BEFORE navigating to the post page
  await interceptChatWithDraft(page, draftContent);
  if (opts.mockDrafts) {
    await interceptDraftsEndpoint(page);
  }

  // Navigate with retry to handle transient 500s under parallel load
  await navigateWithRetry(page, `/queue/${postId}`);

  // Send a message to trigger the AI response
  const chatInput = page.getByRole("textbox", { name: "Chat message" });
  await expect(chatInput).toBeVisible({ timeout: 10000 });
  await chatInput.fill("Draft a reply");
  await page.getByRole("button", { name: "Send message" }).click();

  // Wait for the draft block to appear
  const draftBlock = page.locator("[data-draft-message]");
  await expect(draftBlock).toBeVisible({ timeout: 15000 });

  return { postId, draftBlock };
}

test.describe("Copy draft flow", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  test("copy button copies draft text and shows visual feedback", async ({ page }) => {
    const draftContent = "This is my thoughtful reply to your post.";
    const { draftBlock } = await setupDraftTest(page, "https://example.com/draft-copy-1", draftContent);

    // Verify draft text is displayed
    await expect(draftBlock.locator(".draft-text")).toContainText(draftContent);

    // Verify Copy button exists
    const copyButton = draftBlock.getByRole("button", { name: "Copy" });
    await expect(copyButton).toBeVisible();

    // Grant clipboard permissions and click Copy
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await copyButton.click();

    // Verify visual feedback — button text changes
    await expect(draftBlock.getByText("Copied! (marked complete)")).toBeVisible();

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(draftContent);

    // Feedback text should revert after ~2 seconds
    await expect(draftBlock.getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 5000 });
  });

  test("copy button sends accepted feedback to server", async ({ page }) => {
    const draftContent = "A polite disagreement with the premise.";
    const { draftBlock } = await setupDraftTest(page, "https://example.com/draft-copy-2", draftContent);

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    // Intercept the drafts API call
    const feedbackPromise = page.waitForRequest(
      (req) => req.url().includes("/drafts") && req.method() === "POST",
      { timeout: 10000 },
    );

    await draftBlock.getByRole("button", { name: "Copy" }).click();

    const feedbackRequest = await feedbackPromise;
    const feedbackBody = feedbackRequest.postDataJSON();
    expect(feedbackBody.type).toBe("feedback");
    expect(feedbackBody.action).toBe("accepted");
    expect(feedbackBody.draftText).toBe(draftContent);
  });

  // Note: "copy marks post status as complete" is verified by the integration test
  // (server.test.ts) since E2E mocked chat responses don't persist chat messages
  // to the DB, which prevents the drafts endpoint from saving feedback (FK constraint).

  test("edit button opens editor and saves changes", async ({ page }) => {
    const draftContent = "Original draft text before editing.";
    const { draftBlock } = await setupDraftTest(page, "https://example.com/draft-edit-1", draftContent, { mockDrafts: true });

    // Click Edit
    await draftBlock.getByRole("button", { name: "Edit" }).click();

    // Textarea should appear with current draft text
    const editTextarea = draftBlock.locator("textarea");
    await expect(editTextarea).toBeVisible();
    await expect(editTextarea).toHaveValue(draftContent);

    // Modify the text
    const editedText = "Modified draft text after editing.";
    await editTextarea.fill(editedText);

    // Intercept save request
    const saveResponse = page.waitForResponse(
      (res) => res.url().includes("/drafts") && res.request().method() === "POST",
      { timeout: 10000 },
    );

    await draftBlock.getByRole("button", { name: "Save" }).click();
    await saveResponse;

    // Textarea should close, edited text should be displayed
    await expect(editTextarea).not.toBeVisible();
    await expect(draftBlock.locator(".draft-text")).toContainText(editedText);

    // "Edited" badge should appear
    await expect(draftBlock.getByText("Edited")).toBeVisible();
  });

  test("edit cancel discards changes", async ({ page }) => {
    const draftContent = "Draft that will not be changed.";
    const { draftBlock } = await setupDraftTest(page, "https://example.com/draft-edit-2", draftContent, { mockDrafts: true });

    // Click Edit
    await draftBlock.getByRole("button", { name: "Edit" }).click();

    // Modify text
    const editTextarea = draftBlock.locator("textarea");
    await editTextarea.fill("This will be discarded");

    // Click Cancel
    await draftBlock.getByRole("button", { name: "Cancel" }).click();

    // Original text should still be displayed
    await expect(draftBlock.locator(".draft-text")).toContainText(draftContent);

    // No "Edited" badge
    await expect(draftBlock.getByText("Edited")).not.toBeVisible();
  });

  test("edit save sends correct data to server", async ({ page }) => {
    const draftContent = "Draft to be edited and saved.";
    const { draftBlock } = await setupDraftTest(page, "https://example.com/draft-edit-3", draftContent, { mockDrafts: true });

    // Edit
    await draftBlock.getByRole("button", { name: "Edit" }).click();
    const editedText = "Edited and saved draft text.";
    await draftBlock.locator("textarea").fill(editedText);

    // Intercept the save request to verify payload
    const saveRequest = page.waitForRequest(
      (req) => req.url().includes("/drafts") && req.method() === "POST",
      { timeout: 10000 },
    );

    await draftBlock.getByRole("button", { name: "Save" }).click();

    const req = await saveRequest;
    const body = req.postDataJSON();
    expect(body.originalText).toBe(draftContent);
    expect(body.editedText).toBe(editedText);
    expect(body.messageId).toBeDefined();

    // Verify the UI reflects the edit
    await expect(draftBlock.locator(".draft-text")).toContainText(editedText);
    await expect(draftBlock.getByText("Edited", { exact: true })).toBeVisible();
  });

  test("show original toggle displays original text after edit", async ({ page }) => {
    const originalDraft = "The original draft before any edits.";
    const { draftBlock } = await setupDraftTest(page, "https://example.com/draft-edit-4", originalDraft, { mockDrafts: true });

    // Edit
    await draftBlock.getByRole("button", { name: "Edit" }).click();
    await draftBlock.locator("textarea").fill("Edited version of the draft.");

    const saveResponse = page.waitForResponse(
      (res) => res.url().includes("/drafts") && res.request().method() === "POST",
      { timeout: 10000 },
    );
    await draftBlock.getByRole("button", { name: "Save" }).click();
    await saveResponse;

    // Click "Show original"
    await draftBlock.getByText("Show original").click();
    await expect(draftBlock.getByText(originalDraft)).toBeVisible();

    // Click "Hide original"
    await draftBlock.getByText("Hide original").click();
    await expect(draftBlock.locator(".draft-text")).toContainText("Edited version of the draft.");
  });

  test("copy button copies edited text when draft has been edited", async ({ page }) => {
    const originalDraft = "Original text that will be edited then copied.";
    const { draftBlock } = await setupDraftTest(page, "https://example.com/draft-edit-copy", originalDraft, { mockDrafts: true });

    // Edit
    await draftBlock.getByRole("button", { name: "Edit" }).click();
    const editedText = "Edited text that should be copied.";
    await draftBlock.locator("textarea").fill(editedText);

    const saveResponse = page.waitForResponse(
      (res) => res.url().includes("/drafts") && res.request().method() === "POST",
      { timeout: 10000 },
    );
    await draftBlock.getByRole("button", { name: "Save" }).click();
    await saveResponse;

    // Copy the edited draft
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await draftBlock.getByRole("button", { name: "Copy" }).click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(editedText);
  });

  test("draft block shows character and word count", async ({ page }) => {
    const draftContent = "Hello world test";
    const { draftBlock } = await setupDraftTest(page, "https://example.com/draft-counts", draftContent);

    await expect(draftBlock.getByText(`${draftContent.length} chars`)).toBeVisible();
    await expect(draftBlock.getByText("3 words")).toBeVisible();
  });
});
