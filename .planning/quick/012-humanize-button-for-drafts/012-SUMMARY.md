# Quick Task 012: Humanize Button for Drafts - Summary

**One-liner:** Non-streaming humanize endpoint using imported prompt markdown as system prompt, with DraftBlock button and draft edit persistence

**Duration:** ~3 min
**Completed:** 2026-03-01

## What Was Built

Added a "Humanize" button to draft blocks that sends draft text to an AI endpoint using the humanizer prompt as the system prompt. The endpoint performs a single-shot `generateText()` rewrite and persists the result as a draft edit.

### Key Files

| File | Action | Purpose |
|------|--------|---------|
| `src/routes/(app)/queue/[id]/humanize/+server.ts` | Created | POST endpoint for humanizing drafts |
| `src/lib/components/chat/DraftBlock.svelte` | Modified | Added Humanize button + loading/error states |
| `src/lib/server/ai.ts` | Modified | Added humanizer mock response branch |
| `src/prompts/humanizer.prompt.md` | Added | Humanizer system prompt (imported via ?raw) |
| `e2e/mocks/ai.ts` | Modified | Added `interceptHumanizeEndpoint()` helper |
| `e2e/humanize-draft.spec.ts` | Created | 4 E2E tests for humanize flow |

## Implementation Decisions

1. **Non-streaming `generateText()`** -- Humanization is a one-shot rewrite, not a conversation. Streaming adds complexity for little UX gain on short text.
2. **`?raw` Vite import** -- The humanizer prompt markdown is imported as a raw string with frontmatter stripped at module load time.
3. **Reuse `draftService.saveEdit()`** -- Humanized text persists as a draft edit, no schema changes needed. "Show original" toggle works automatically.
4. **Token usage logging** -- Humanize calls are tracked in `ai_usage_log` with type "humanize" for cost visibility.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- [x] Humanize button appears on draft blocks (between Edit and Copy)
- [x] Clicking humanize calls the API and updates the draft text
- [x] Humanized text persists (saved as draft edit)
- [x] "Show original" shows the pre-humanized text
- [x] E2E tests pass with MOCK_AI=true (4/4 passing)
- [x] No real API calls in tests
- [x] Existing copy-draft tests still pass (no regressions)

## Commits

- `c64405d`: feat(quick-012): add humanize button for drafts
