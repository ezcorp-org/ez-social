---
phase: quick
plan: 005
subsystem: voice-profile
tags: [voice, prompt, refinement, ui]
dependency-graph:
  requires: [phase-05]
  provides: [user-prompt-voice-refinement]
  affects: []
tech-stack:
  added: []
  patterns: [stream-consumption, transient-notification]
key-files:
  created: []
  modified:
    - src/routes/(app)/personas/[id]/voice/+server.ts
    - src/routes/(app)/personas/[id]/+page.svelte
decisions:
  - id: quick-005-skip-sample
    description: "userPrompt mode skips new sample validation like recalibrate/platformFilter"
  - id: quick-005-mutual-toggle
    description: "Prompt refine and sample extractor sections are mutually exclusive toggles"
metrics:
  duration: "1 min"
  completed: "2026-02-19"
---

# Quick Task 005: Add Prompt-Based Voice Profile Refinement

Free-form prompt textarea on persona detail page that triggers voice re-extraction with user instructions as additional AI context.

## What Was Done

### Task 1: Add userPrompt support to voice extraction endpoint
- Added `userPrompt?: string` to POST body type
- Included `userPrompt` in `skipNewSample` check (re-extracts from existing samples)
- Appends "User Refinement Instructions" feedback section to AI context when prompt is provided
- Commit: c34aa60

### Task 2: Add prompt refinement UI to persona detail page
- Added "Refine with Prompt" toggle link next to "Calibrate Voice" in action links
- Textarea with placeholder and description for free-form instructions
- Submit button with loading spinner (animate-spin pattern)
- Success notification with 3-second auto-clear
- Mutually exclusive toggle with the sample extractor section
- Commit: 2fbab02

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `bun run check` passes with 0 errors
- userPrompt in body type, skipNewSample logic, and feedbackSections confirmed
- UI renders Refine with Prompt link, textarea, submit button with loading state
