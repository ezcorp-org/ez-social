import { test, expect } from "@playwright/test";
import { authenticate, addPost, gotoDashboard } from "./helpers";

/**
 * Build an SSE response body matching AI SDK v6 UIMessageStream format.
 */
function buildAIStreamSSE(text: string): string {
  const messageId = crypto.randomUUID();
  const textPartId = crypto.randomUUID();

  const parts = [
    { type: "start", messageId },
    { type: "start-step" },
    { type: "text-start", id: textPartId },
    { type: "text-delta", id: textPartId, delta: text },
    { type: "text-end", id: textPartId },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];

  return parts.map((p) => `data: ${JSON.stringify(p)}\n\n`).join("") + "data: [DONE]\n\n";
}

test.describe("Token cost tracking", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  test("chat interface renders with mocked AI response", async ({ page }) => {
    const postId = await addPost(page, "https://x.com/test/status/cost1");

    // Mock the chat endpoint with AI stream response
    await page.route("**/queue/*/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Vercel-AI-UI-Message-Stream": "v1",
        },
        body: buildAIStreamSSE("Here is a test reply for cost tracking."),
      });
    });

    // Navigate to post and send message
    await page.goto(`/queue/${postId}`);
    const chatInput = page.getByRole("textbox", { name: "Chat message" });
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill("Draft a reply");
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for AI response to appear
    await expect(page.getByText("Here is a test reply for cost tracking.")).toBeVisible({ timeout: 10000 });
  });

  test("shows cost column in queue table", async ({ page }) => {
    // Set viewport before navigating so the Cost column is visible
    await page.setViewportSize({ width: 1024, height: 768 });

    await addPost(page, "https://x.com/test/status/cost2");

    // Navigate to dashboard with retry
    await gotoDashboard(page);

    // Verify the Cost header exists in the table
    const costHeader = page.locator("th", { hasText: "Cost" });
    await expect(costHeader).toBeVisible({ timeout: 5000 });

    // Verify cost cells exist (will show '--' for posts with no usage)
    const costCells = page.locator('[data-testid="post-cost"]');
    await expect(costCells.first()).toBeVisible({ timeout: 5000 });
    await expect(costCells.first()).toContainText("--");
  });
});
