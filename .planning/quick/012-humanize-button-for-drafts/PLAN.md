# Quick Task 012: Humanize Button for Drafts

## Goal

Add a "Humanize" button to DraftBlock that sends the draft text to an AI endpoint using the humanizer prompt as the system prompt, then replaces the displayed draft with the humanized version.

## Implementation

### 1. New API endpoint: `src/routes/(app)/queue/[id]/humanize/+server.ts`

**POST** `/queue/[id]/humanize`

- Auth check + ownership check (same pattern as `drafts/+server.ts`)
- Accepts `{ messageId: string, draftText: string }`
- Reads `src/prompts/humanizer.prompt.md` content at build time (import as raw string)
- Calls `generateText()` (non-streaming — humanization is a one-shot rewrite, not a conversation)
- System prompt: the humanizer prompt content from the markdown file (strip frontmatter)
- User prompt: the draft text to humanize
- Returns `{ humanizedText: string }`
- Saves the result as a draft edit via `draftService.saveEdit()` so it persists across page reloads
- Uses the user's API key + model from settings (same as chat endpoint)

**Key decisions:**
- Non-streaming `generateText()` — the humanizer does a single rewrite, streaming adds complexity for little UX gain on short text
- Reuse `draftService.saveEdit()` to persist — no schema changes needed
- Import the prompt markdown as a raw string via `?raw` Vite import

### 2. Update `DraftBlock.svelte`

Add to existing button bar (alongside Edit and Copy):

- New state: `isHumanizing = $state(false)`, `humanizeError = $state<string | null>(null)`
- "Humanize" button — shown when `!isEditing && !isHumanizing`
- On click: POST to `/queue/${postId}/humanize` with `{ messageId, draftText: displayText }`
- While waiting: button shows "Humanizing…" with disabled state
- On success: set `localEditText` to the returned `humanizedText`, set `hasBeenEdited = true`
- On error: set `humanizeError` with message, show briefly then clear
- The existing "Show original" toggle will automatically work since `localEditText` overrides `text`

Button placement: between Edit and Copy buttons.

### 3. Mock support for E2E tests

In `src/lib/server/ai.ts`, add a humanizer detection branch in `pickMockResponse()`:
- If the system prompt contains "humanize" or "ai writing patterns", return a canned humanized text
- Something like: `"This is a humanized version of the draft for testing."`

### 4. E2E test: `e2e/humanize-draft.spec.ts`

- Navigate to a chat page with an existing draft
- Click the "Humanize" button
- Assert the draft text updates
- Assert "Edited" badge appears
- Assert "Show original" toggle works

## Files Modified

1. `src/routes/(app)/queue/[id]/humanize/+server.ts` — **NEW** endpoint
2. `src/lib/components/chat/DraftBlock.svelte` — add Humanize button + state
3. `src/lib/server/ai.ts` — add humanizer mock response branch
4. `e2e/humanize-draft.spec.ts` — **NEW** E2E test

## Files Read (not modified)

- `src/prompts/humanizer.prompt.md` — imported as system prompt via `?raw`
- `src/routes/(app)/queue/[id]/drafts/+server.ts` — reference for auth/ownership pattern
- `src/lib/server/services/draft.ts` — `saveEdit()` reuse

## Verification

- [ ] Humanize button appears on draft blocks
- [ ] Clicking humanize calls the API and updates the draft text
- [ ] Humanized text persists (saved as draft edit)
- [ ] "Show original" shows the pre-humanized text
- [ ] E2E test passes with MOCK_AI=true
- [ ] No real API calls in tests
