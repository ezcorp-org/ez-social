---
phase: quick
plan: 004
subsystem: queue-status
tags: [copy-to-complete, status-selector, queue, svelte]
completed: 2026-02-19
duration: 3 min
dependency-graph:
  requires: [phase-03, phase-05-01]
  provides: [copy-marks-complete, manual-status-change]
  affects: []
tech-stack:
  added: []
  patterns: [inline-form-select, requestSubmit-on-change]
key-files:
  created:
    - src/lib/server/services/queue.test.ts
  modified:
    - src/lib/components/chat/DraftBlock.svelte
    - src/lib/components/queue/QueueTable.svelte
    - src/routes/(app)/queue/[id]/+page.svelte
    - src/routes/(app)/queue/[id]/+page.server.ts
    - src/routes/(app)/queue/[id]/drafts/+server.ts
    - src/routes/(app)/+page.server.ts
decisions: []
---

# Quick Task 004: Fix Copy Button and Manual Status Summary

Copy-to-complete flow via drafts endpoint plus inline status dropdowns on queue table and post detail page.

## What Was Done

### Task 1: Copy marks post complete + status update endpoint
- Drafts endpoint now calls `queue.updateStatus` with "complete" when feedback action is "accepted" (copy)
- Added `updateStatus` form action to both dashboard (`+page.server.ts`) and post detail page server
- Status validation rejects values outside ["new", "in_progress", "draft_ready", "complete"]
- DraftBlock shows "Copied! (marked complete)" feedback text

### Task 2: Manual status selector UI
- Replaced static status badges in QueueTable with inline `<select>` dropdowns
- Added status selector to post detail page header (right-aligned next to back link)
- Color-coded text matches STATUS_BADGES colors per status value
- Auto-submit on change via `requestSubmit()` (same pattern as persona dropdown)

### Task 3: Integration tests
- Created `queue.test.ts` with 4 test cases for `updateStatus`
- Tests cover: correct update, invalid postId, ownership check, updatedAt timestamp

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| d0db941 | feat(quick-004): copy marks post complete + status update endpoints |
| 792c315 | feat(quick-004): manual status selector UI on queue table and post detail |
| e23adc4 | test(quick-004): add integration tests for queue updateStatus |
