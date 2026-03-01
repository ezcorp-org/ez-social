import type { Page } from "@playwright/test";

/**
 * Build an SSE response body matching AI SDK v6 UIMessageStream format.
 * Each line is `data: <JSON>\n\n` terminated with `data: [DONE]\n\n`.
 */
export function buildAIStreamSSE(draftText: string): string {
  const messageId = crypto.randomUUID();
  const textPartId = crypto.randomUUID();
  const fullText = `Here's a draft reply for you:\n\n<draft>${draftText}</draft>`;

  const parts = [
    { type: "start", messageId },
    { type: "start-step" },
    { type: "text-start", id: textPartId },
    { type: "text-delta", id: textPartId, delta: fullText },
    { type: "text-end", id: textPartId },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];

  return parts.map((p) => `data: ${JSON.stringify(p)}\n\n`).join("") + "data: [DONE]\n\n";
}

/**
 * Intercept the chat endpoint and return a mocked AI draft response.
 */
export async function interceptChatWithDraft(page: Page, draftText: string) {
  await page.route("**/queue/*/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Vercel-AI-UI-Message-Stream": "v1",
      },
      body: buildAIStreamSSE(draftText),
    });
  });
}

/**
 * Mock the humanize endpoint to return a canned humanized text.
 */
export async function interceptHumanizeEndpoint(
  page: Page,
  humanizedText = "This is a humanized version of the draft. The AI patterns have been removed and it reads more naturally now.",
) {
  await page.route("**/queue/*/humanize", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ humanizedText }),
    });
  });
}

/**
 * Mock the drafts endpoint so edit/feedback requests succeed
 * even when the chat message doesn't exist in the DB.
 */
export async function interceptDraftsEndpoint(page: Page) {
  await page.route("**/queue/*/drafts", async (route) => {
    await route.fulfill({
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, edit: { id: crypto.randomUUID() } }),
    });
  });
}
