---
phase: 05-voice-calibration-continuous-learning
plan: 02
subsystem: api, ui, voice
tags: [calibration, voice-learning, streaming, svelte, anthropic]

# Dependency graph
requires:
  - phase: 05-voice-calibration-continuous-learning
    provides: draftFeedback table, getFeedbackForPersona service method
provides:
  - Calibration API endpoint generating sample replies using persona voice profile
  - Calibration UI with 3-step flow (generate, rate, refine)
  - Voice re-extraction endpoint enhanced with calibration ratings and draft feedback context
  - saveCalibrationRatings voice service method
  - Recalibrate mode on voice extraction (no new samples required)
affects: [05-voice-calibration-continuous-learning]

# Tech tracking
tech-stack:
  added: []
  patterns: [streaming JSON parse for sample generation, cumulative feedback in AI prompts, recalibrate mode]

key-files:
  created:
    - src/routes/(app)/personas/[id]/calibrate/+server.ts
    - src/routes/(app)/personas/[id]/calibrate/+page.server.ts
    - src/routes/(app)/personas/[id]/calibrate/+page.svelte
  modified:
    - src/routes/(app)/personas/[id]/voice/+server.ts
    - src/routes/(app)/personas/[id]/+page.svelte

key-decisions:
  - "Calibration ratings stored in calibrationFeedback jsonb column on voiceProfileVersions"
  - "Voice re-extraction includes both calibration ratings and draft usage feedback as cumulative AI context"
  - "Recalibrate mode bypasses sample validation — re-extracts from existing samples with feedback"
  - "PUT handler on calibrate endpoint saves ratings separately from sample generation POST"

patterns-established:
  - "Cumulative feedback prompting: calibration + draft feedback sections appended to AI system prompt"
  - "Recalibrate mode: endpoint flag bypasses input validation for re-extraction with existing data"

requirements-completed: [VOIC-04, VOIC-05, VOIC-07]

# Metrics
duration: 6min
completed: 2026-02-18
---

# Phase 5 Plan 2: Voice Calibration Flow Summary

**Calibration UI with sample generation, rating, and voice re-extraction incorporating both calibration ratings and draft usage feedback for continuous voice improvement**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-18T22:28:26Z
- **Completed:** 2026-02-18T22:35:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Calibration API endpoint generates AI sample replies using persona's merged voice profile
- 3-step calibration UI: generate samples → rate each as "sounds like me" / "doesn't" → refine voice
- Voice re-extraction now includes calibration feedback and draft usage history in AI prompt
- Recalibrate mode enables re-extraction without new writing samples
- Persona detail page links to calibration when voice profile exists

## Task Commits

Each task was committed atomically:

1. **Task 1: Create calibration API endpoint and extend voice extraction with feedback** - `38cf2cf` (feat)
2. **Task 2: Build calibration UI page with sample rating and re-extraction trigger** - `a1ea11e` (feat)

## Files Created/Modified
- `src/routes/(app)/personas/[id]/calibrate/+server.ts` — POST generates sample replies, PUT saves calibration ratings
- `src/routes/(app)/personas/[id]/calibrate/+page.server.ts` — Page load with persona and active voice profile
- `src/routes/(app)/personas/[id]/calibrate/+page.svelte` — Full calibration flow UI with streaming sample display
- `src/routes/(app)/personas/[id]/voice/+server.ts` — Enhanced with feedback context sections and recalibrate mode
- `src/routes/(app)/personas/[id]/+page.svelte` — Added "Calibrate Voice" link in voice profile section

## Decisions Made
- Calibration ratings stored in `calibrationFeedback` jsonb column on voiceProfileVersions (clean separation from manualEdits)
- Voice re-extraction includes both calibration ratings AND draft usage feedback as cumulative AI context
- Recalibrate mode (`{ recalibrate: true }`) bypasses sample validation — re-extracts from existing samples with feedback
- PUT handler on calibrate endpoint saves ratings separately from sample generation POST
- Draft feedback limited to 10 most recent accepted/edited per category to avoid prompt bloat

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Voice calibration flow complete — users can rate AI samples and refine their voice profile
- The feedback loop is now closed: extract → use in drafts → track feedback → calibrate → re-extract with context
- Ready for Plan 03 (platform voice overrides)

## Self-Check: PASSED

All 5 files verified on disk. Both commit hashes (38cf2cf, a1ea11e) found in git log.

---
*Phase: 05-voice-calibration-continuous-learning*
*Completed: 2026-02-18*
