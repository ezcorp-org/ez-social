# Lessons Learned

## 2026-02-22: E2E tests must NEVER make real AI API calls

**Problem**: Two E2E test files (`prompt-refine-voice.spec.ts`, `auto-generate.spec.ts`) were making real Anthropic API calls, burning tokens on every test run. The voice extraction test needed a 120s timeout.

**Root cause**: No server-side AI abstraction existed. Tests either hit the real API or required browser-level `page.route()` mocking — but `page.route()` can't handle server-side DB writes (like voice profile saving in `onFinish`).

**Fix**: Introduced `src/lib/server/ai.ts` with `getAIModel()` that returns a mock model when `MOCK_AI=true`. Set `MOCK_AI=true` in `playwright.config.ts` webServer command. Added browser-level `interceptChatWithDraft()` as a second layer for chat tests.

**Rule**: Every new E2E test that touches AI endpoints must use `interceptChatWithDraft()` from `e2e/mocks/ai.ts` and rely on `MOCK_AI=true` for server-side routes. Document this in `CLAUDE.md` project rules.
