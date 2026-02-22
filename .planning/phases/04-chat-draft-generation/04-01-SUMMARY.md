---
phase: 04-chat-draft-generation
plan: 01
subsystem: database, api
tags: [drizzle, postgres, chat, draft-edits, service-factory]

# Dependency graph
requires:
  - phase: 03-post-queue-dashboard
    provides: postQueue table and createQueueService factory
provides:
  - chatMessages table for persisting AI SDK chat conversations
  - draftEdits table for tracking inline user edits to AI drafts
  - createChatService factory (getMessages, saveMessage, getMessageIds)
  - createDraftService factory (saveEdit, getEditsForPost, getEditsForMessage)
  - queue.updateStatus() method for post status transitions
affects: [04-02, 04-03, 04-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [onConflictDoNothing for idempotent message saves, Set-based ID diffing for new message detection]

key-files:
  created:
    - src/lib/server/services/chat.ts
    - src/lib/server/services/draft.ts
  modified:
    - src/lib/server/db/schema.ts
    - src/lib/server/services/queue.ts

key-decisions:
  - "chatMessages.id accepts external IDs from AI SDK UIMessage — enables idempotent saves via onConflictDoNothing"
  - "parts stored as jsonb array matching AI SDK v6 UIMessage.parts format"
  - "getMessageIds returns Set<string> for O(1) diffing when persisting new messages"

patterns-established:
  - "Idempotent message save: insert with onConflictDoNothing for chat persistence"
  - "Set-based ID diffing: getMessageIds returns Set for efficient new message detection"

requirements-completed: [CHAT-01, CHAT-08]

# Metrics
duration: 1min
completed: 2026-02-18
---

# Phase 4 Plan 1: Chat & Draft Data Layer Summary

**chatMessages and draftEdits tables with typed service factories for chat persistence, draft edit tracking, and post status updates**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-18T20:56:34Z
- **Completed:** 2026-02-18T20:58:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- chatMessages table with jsonb parts column for AI SDK v6 UIMessage format
- draftEdits table linking inline edits to specific messages and posts
- createChatService with idempotent saveMessage (onConflictDoNothing) and Set-based getMessageIds
- createDraftService with saveEdit, getEditsForPost, getEditsForMessage
- updateStatus method added to queue service for post status transitions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add chatMessages and draftEdits tables to schema** - `e504d70` (feat)
2. **Task 2: Create chat and draft services, add updateStatus to queue** - `c3eae91` (feat)

## Files Created/Modified
- `src/lib/server/db/schema.ts` - Added chatMessages, draftEdits tables + relations
- `src/lib/server/services/chat.ts` - New: createChatService factory (getMessages, saveMessage, getMessageIds)
- `src/lib/server/services/draft.ts` - New: createDraftService factory (saveEdit, getEditsForPost, getEditsForMessage)
- `src/lib/server/services/queue.ts` - Added updateStatus method for post status transitions

## Decisions Made
- chatMessages.id accepts external IDs (from AI SDK UIMessage.id) rather than auto-generating — enables idempotent saves via onConflictDoNothing
- parts column uses jsonb to store the AI SDK v6 parts-based message format directly
- getMessageIds returns a Set<string> for O(1) lookup when determining which messages are new

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data layer complete, ready for 04-02 (AI chat API endpoint)
- All tables pushed to local database
- Service factories follow established patterns, ready for route handler integration

---
*Phase: 04-chat-draft-generation*
*Completed: 2026-02-18*
