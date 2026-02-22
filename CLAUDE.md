# Project Rules

## E2E Tests: NEVER Make Real AI API Calls

**All E2E tests (Playwright) MUST use mocked AI responses. No exceptions.**

The dev server runs with `MOCK_AI=true` (set in `playwright.config.ts`), which swaps real Anthropic calls for canned responses via `src/lib/server/ai.ts:getAIModel()`.

### Rules for writing E2E tests

1. **Server-side mock is always active**: `MOCK_AI=true` is set in `playwright.config.ts` webServer command. The `getAIModel()` factory in `src/lib/server/ai.ts` returns a mock model that produces canned responses for voice extraction, calibration, and chat.

2. **Browser-level mocks for chat tests**: Any test that sends a chat message or triggers `autoGenerate` MUST also call `interceptChatWithDraft()` from `e2e/mocks/ai.ts` before navigating to the page. This gives fine-grained control over response content and avoids server-side DB side-effects.

3. **Import from shared helpers**: Use `e2e/mocks/ai.ts` for all AI mock utilities (`buildAIStreamSSE`, `interceptChatWithDraft`, `interceptDraftsEndpoint`). Never duplicate these helpers inline.

4. **Voice/calibrate routes**: These use `toTextStreamResponse()` which works cleanly with the server-side mock. No browser-level mock needed unless the test requires specific response content (like `prompt-refine-voice.spec.ts` does for preview).

5. **Timeouts**: With mocked AI, voice extraction completes in <1s. Never set timeouts above 30s for AI responses. If you need 60s+ timeouts, something is wrong.

### Quick reference

```ts
// In any test that triggers chat or autoGenerate:
import { interceptChatWithDraft } from "./mocks/ai";

test("my test", async ({ page }) => {
  await interceptChatWithDraft(page, "My mock reply content.");
  // ... navigate to page that triggers AI ...
});
```

### Architecture

- `src/lib/server/ai.ts` — `getAIModel(apiKey, modelId)` returns mock when `MOCK_AI=true`
- `playwright.config.ts` — webServer command includes `MOCK_AI=true`
- `e2e/mocks/ai.ts` — shared browser-level mock helpers for Playwright `page.route()`
- Three server routes use `getAIModel()`: chat, voice, calibrate
