# Quick Task 007: Add Hotkey Navigation for App

**One-liner:** Keyboard shortcuts 'n' for QuickAdd modal and 'l' for latest post navigation in app layout

## What Was Done

### Task 1: Load personas and latestPostId in layout server
- Added `getServices` import to `+layout.server.ts`
- Layout load now fetches personas and posts via `Promise.all`
- Returns `personas` array and `latestPostId` (first post ID or null) to all app routes

### Task 2: Hotkey listener and QuickAdd modal
- Added `svelte:window onkeydown` handler with input/modifier suppression
- 'n' opens a centered modal overlay with the existing QuickAdd component
- 'l' navigates to `/queue/{latestPostId}` if a post exists
- Escape key and backdrop click close the modal
- Modal uses fixed positioning with `bg-black/50` backdrop and surface card styling

## Key Files

| File | Change |
|------|--------|
| `src/routes/(app)/+layout.server.ts` | Added personas + latestPostId to layout data |
| `src/routes/(app)/+layout.svelte` | Added hotkey handler, QuickAdd import, modal overlay |

## Commits

| Hash | Message |
|------|---------|
| e362adc | feat(quick-007): load personas and latestPostId in app layout server |
| f09bc9a | feat(quick-007): add hotkey navigation and QuickAdd modal to app layout |

## Deviations from Plan

None - plan executed exactly as written.

## Duration

~2 minutes
