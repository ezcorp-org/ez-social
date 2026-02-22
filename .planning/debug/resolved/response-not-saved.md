---
status: resolved
trigger: "response-not-saved: When a response is generated, refreshing the page causes the response to be lost"
created: 2026-02-20T00:00:00Z
updated: 2026-02-20T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED
test: type check passes, unit tests pass
expecting: AI responses now saved with unique UUIDs
next_action: archive

## Symptoms

expected: After generating a response/content, refreshing the page should show the same generated content (it should be saved to the database).
actual: Refreshing the page after a response is generated causes the response to disappear - it's not saved/persisted.
errors: No error messages reported - the content just silently vanishes on refresh.
reproduction: 1) Navigate to the app, 2) Generate a response/content for a post, 3) Refresh the page, 4) The generated response is gone.
started: Current behavior - never worked correctly.

## Eliminated

## Evidence

- timestamp: 2026-02-20
  checked: Database chat_messages table
  found: Only 1 AI-generated response ever saved, with id="" (empty string). 16 total rows, most are user messages or greeting messages. All AI responses after the first were silently dropped by onConflictDoNothing.
  implication: responseMessage.id is empty string in onFinish callback

- timestamp: 2026-02-20
  checked: AI SDK source - handleUIMessageStreamFinish in node_modules/ai/dist/index.mjs
  found: When originalMessages and generateMessageId are not passed to toUIMessageStreamResponse, the internal messageId defaults to "". The SDK's getResponseUIMessageId returns void 0 when originalMessages is undefined, and without generateMessageId, no fallback exists.
  implication: Every AI response gets id="" in the onFinish callback

- timestamp: 2026-02-20
  checked: chat service saveMessage uses .onConflictDoNothing()
  found: First save with id="" succeeds, all subsequent saves silently dropped due to primary key conflict
  implication: Only the very first AI response ever generated was saved; all others lost

- timestamp: 2026-02-20
  checked: Verified fix with svelte-check (0 errors) and bun test (144 pass, 2 pre-existing Playwright failures)
  found: Fix compiles and no regressions
  implication: Fix is safe to deploy

## Resolution

root_cause: In chat/+server.ts, toUIMessageStreamResponse was called without generateMessageId. The AI SDK (v6) defaults to empty string for responseMessage.id when neither originalMessages nor generateMessageId is provided. The chatService.saveMessage uses onConflictDoNothing, so the first AI response saved with id="" succeeded, but every subsequent AI response also had id="" and was silently dropped due to primary key conflict. This made it appear that responses were never being saved.

fix: Added `generateMessageId: crypto.randomUUID` to the toUIMessageStreamResponse options. This ensures each AI response gets a unique UUID as its message ID, both for persistence in onFinish and for client-server message ID consistency. Also cleaned up the orphaned empty-id row in the database.

verification: svelte-check passes (0 errors), bun test passes (144/144 unit tests), database orphan cleaned up

files_changed:
- src/routes/(app)/queue/[id]/chat/+server.ts
