---
phase: quick
plan: 006
subsystem: voice-refinement
tags: [svelte, voice-profile, diff, preview-mode]
dependency-graph:
  requires: [quick-005]
  provides: [dedicated-refine-page, preview-mode-endpoint, voice-diff-component]
  affects: []
tech-stack:
  added: []
  patterns: [preview-before-save, three-phase-ui-flow]
key-files:
  created:
    - src/routes/(app)/personas/[id]/refine/+page.server.ts
    - src/routes/(app)/personas/[id]/refine/+page.svelte
    - src/lib/components/persona/VoiceProfileDiff.svelte
  modified:
    - src/routes/(app)/personas/[id]/voice/+server.ts
    - src/routes/(app)/personas/[id]/+page.svelte
decisions:
  - "PUT handler for accepting previewed profiles instead of re-running AI extraction"
  - "response.text() to buffer full stream since diff only needs final result"
  - "Count-only display for contentModes and inconsistencies (too complex to meaningfully diff)"
metrics:
  duration: 4 min
  completed: 2026-02-20
---

# Quick Task 006: Refine Prompt Dedicated Page with Diff Summary

Dedicated /refine page with preview-before-save flow using VoiceProfileDiff component for before/after comparison.

## What Was Built

### Task 1: Preview mode and PUT handler on voice endpoint
- Added `preview: true` flag to POST — streams profile without persisting
- Added PUT handler that accepts a validated profile and saves it as a new version
- Extracted `getSampleStats()` helper to share between POST and PUT

### Task 2: VoiceProfileDiff component
- Two-column before/after comparison with green (added) and red (removed) highlighting
- Sections: Voice DNA items, dimension pattern counts with detail expansion, consistency score, recommendations
- Count-only display for contentModes and inconsistencies

### Task 3: Dedicated /refine route
- Page server loads persona and current profile, redirects if no profile exists
- Three-phase UI: input → loading (with skeleton) → diff with accept/discard
- Preview calls POST with `preview: true`, accept calls PUT with parsed profile
- Client-side validation with voiceProfileSchema

### Task 4: Replaced inline refine UI
- Removed all inline refine state (showPromptRefine, userPrompt, refiningWithPrompt, promptRefineSuccess)
- Removed handlePromptRefine function and success notification block
- Replaced toggle button with simple navigation link to /personas/[id]/refine

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 197979e | feat(quick-006): add preview mode and PUT handler to voice endpoint |
| 2 | dcb8a05 | feat(quick-006): create VoiceProfileDiff component |
| 3 | e38fa66 | feat(quick-006): create dedicated /refine route with diff flow |
| 4 | 89c5229 | refactor(quick-006): replace inline refine UI with link to dedicated page |
