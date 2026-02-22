---
phase: 04-chat-draft-generation
plan: 02
subsystem: api, ai
tags: [ai-sdk-v6, anthropic, streaming, sse, chat, system-prompt, sveltekit-api]

# Dependency graph
requires:
  - phase: 04-chat-draft-generation
    provides: chatMessages and draftEdits tables, createChatService, createDraftService, updateStatus
provides:
  - POST /queue/[id]/chat streaming endpoint with auth, message persistence, AI streaming
  - buildChatSystemPrompt for assembling AI context from post + voice profile
  - Enhanced page load with chatMessages, voiceProfile, personas, draftEdits
  - Initial greeting message generation for new chat sessions
affects: [04-03, 04-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [toUIMessageStreamResponse for SSE streaming, convertToModelMessages for UIMessage conversion, deep-merge for voice profile overlays]

key-files:
  created:
    - src/lib/server/chat-prompt.ts
    - src/routes/(app)/queue/[id]/chat/+server.ts
  modified:
    - src/routes/(app)/queue/[id]/+page.server.ts

key-decisions:
  - "crypto.randomUUID() instead of Node crypto import for Workers compatibility"
  - "maxOutputTokens (AI SDK v6 naming) set to 2048 for draft generation"
  - "Greeting message persisted to DB on first load for consistent chat history"

patterns-established:
  - "Streaming chat endpoint: auth → load context → persist user msgs → stream → persist AI response via onFinish"
  - "System prompt builder: pure function assembling role + post context + voice profile + draft format instructions"

requirements-completed: [CHAT-02, CHAT-03, CHAT-07, CHAT-08]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 4 Plan 2: Streaming Chat API Endpoint Summary

**Streaming chat endpoint with system prompt builder, message persistence, status transitions, and enhanced page load returning chat history + voice data + personas**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T21:00:11Z
- **Completed:** 2026-02-18T21:03:54Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- System prompt builder that merges voice profile (extractedProfile + manualEdits) for AI context
- Streaming POST endpoint at /queue/[id]/chat with full lifecycle: auth, context loading, user message persistence, AI streaming, response persistence
- Post status transitions: new → in_progress on first message, in_progress → draft_ready when AI generates a `<draft>` block
- Page server load enhanced with chatMessages, voiceProfile, personas list, and draftEdits
- Initial greeting message auto-generated and persisted for new chat sessions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create system prompt builder** - `4b0691d` (feat)
2. **Task 2: Create streaming chat endpoint and update page server load** - `74bc34a` (feat)

## Files Created/Modified
- `src/lib/server/chat-prompt.ts` - System prompt builder with voice profile deep-merge and draft format instructions
- `src/routes/(app)/queue/[id]/chat/+server.ts` - Streaming chat POST endpoint using AI SDK v6 streamText + toUIMessageStreamResponse
- `src/routes/(app)/queue/[id]/+page.server.ts` - Enhanced page load with chat history, voice profile, personas, draft edits, and greeting generation

## Decisions Made
- Used `crypto.randomUUID()` (global) instead of `import { randomUUID } from "crypto"` for Cloudflare Workers compatibility
- AI SDK v6 uses `maxOutputTokens` (not `maxTokens`) — corrected during implementation
- Greeting message is persisted to the DB immediately so it appears in chat history across page reloads

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed maxTokens → maxOutputTokens for AI SDK v6**
- **Found during:** Task 2 (streaming endpoint)
- **Issue:** Plan specified `maxTokens` but AI SDK v6 renamed this to `maxOutputTokens`
- **Fix:** Changed to `maxOutputTokens: 2048`
- **Files modified:** src/routes/(app)/queue/[id]/chat/+server.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 74bc34a (Task 2 commit)

**2. [Rule 1 - Bug] Fixed crypto.randomUUID import for Workers compatibility**
- **Found during:** Task 2 (page server load)
- **Issue:** `import { randomUUID } from "crypto"` may not resolve in Cloudflare Workers
- **Fix:** Used global `crypto.randomUUID()` which is available in both Node and Workers
- **Files modified:** src/routes/(app)/queue/[id]/+page.server.ts
- **Verification:** TypeScript compilation passes, dev server starts without errors
- **Committed in:** 74bc34a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chat API backbone complete, ready for 04-03 (Chat UI components)
- Page load provides all data needed for the Chat class and UI rendering
- Streaming endpoint follows same patterns as voice extraction endpoint (familiar codebase pattern)

## Self-Check: PASSED

All created files verified on disk. All commit hashes verified in git history.

---
*Phase: 04-chat-draft-generation*
*Completed: 2026-02-18*
