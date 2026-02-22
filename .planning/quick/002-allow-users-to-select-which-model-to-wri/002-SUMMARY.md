---
phase: quick-002
plan: 01
subsystem: settings
tags: [ai-models, user-preferences, anthropic]
completed: 2026-02-19
duration: "2 min"
tasks_completed: 2
tasks_total: 2
tech-stack:
  added: []
  patterns: ["user preference persistence", "model selector UI"]
key-files:
  created:
    - src/lib/server/models.ts
    - src/routes/(app)/settings/model/+server.ts
  modified:
    - src/lib/server/db/schema.ts
    - src/routes/(app)/+layout.server.ts
    - src/routes/(app)/+layout.svelte
    - src/routes/(app)/queue/[id]/chat/+server.ts
    - src/routes/(app)/personas/[id]/voice/+server.ts
    - src/routes/(app)/personas/[id]/calibrate/+server.ts
---

# Quick Task 002: Allow Users to Select Which Model to Write With

User-facing model selector in nav bar with DB-persisted preference, wired to all 3 AI endpoints (chat, voice extraction, calibration).

## What Was Done

### Task 1: DB Schema, Model Constants, and Settings Endpoint
- Added `preferredModel` varchar column to `users` table (nullable, null = default)
- Created `src/lib/server/models.ts` with `AVAILABLE_MODELS` constant (Sonnet 4, Haiku 4, Opus 4), `DEFAULT_MODEL`, `resolveModel()`, and `getUserPreferredModel()` DRY helper
- Created `PUT /settings/model` endpoint with auth check and model validation
- Commit: `3f5170d`

### Task 2: Nav Selector and Endpoint Wiring
- Updated layout.server.ts to query user's `preferredModel` from DB and pass it plus `availableModels` to client
- Added `<select>` model dropdown in both desktop and mobile nav sections with optimistic UI and toast feedback
- Updated all 3 AI endpoints to use `getUserPreferredModel(db, userId)` instead of hardcoded model string
- Verified zero hardcoded model strings remain in endpoint files
- Commit: `ad29fef`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| DRY `getUserPreferredModel` helper in models.ts | Avoids repeating DB query + resolve logic in each of 3 endpoints |
| Nullable `preferredModel` column (null = default) | Avoids migration issues for existing users, clean semantics |
| Optimistic UI for model switch | No page reload needed, instant feedback with toast |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] `bun run build` compiles successfully
- [x] No hardcoded model strings remain in endpoint files (grep verified)
- [x] Model selector present in both desktop and mobile nav
- [x] All 3 AI endpoints use `getUserPreferredModel`
- [x] Default model is `claude-sonnet-4-20250514` for users with no preference
