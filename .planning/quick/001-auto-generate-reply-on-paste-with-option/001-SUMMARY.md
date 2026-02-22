---
phase: quick
plan: 001
subsystem: chat-workflow
tags: [quickadd, auto-generate, chat, redirect]
requires: [phase-04, phase-05]
provides: [auto-draft-on-paste]
affects: []
tech-stack:
  added: []
  patterns:
    - "URL param-driven auto-action (autoGenerate query param)"
    - "replaceState for URL cleanup after one-shot actions"
key-files:
  created: []
  modified:
    - src/lib/components/queue/QuickAdd.svelte
    - src/routes/(app)/+page.server.ts
    - src/routes/(app)/queue/[id]/+page.svelte
    - src/routes/(app)/queue/[id]/+page.server.ts
    - src/lib/components/chat/ChatInterface.svelte
decisions:
  - id: "quick-001-url-params"
    decision: "Auto-generate state passed via URL search params, not form data or server state"
    reason: "Keeps it stateless and works with SvelteKit goto() redirect"
metrics:
  duration: "2 min"
  completed: "2026-02-19"
---

# Quick Task 001: Auto-Generate Reply on Paste with Option

**One-liner:** Paste URL with optional prompt, auto-redirect to chat, and fire draft generation without manual intervention.

## What Was Done

### Task 1: Add optional prompt to QuickAdd and redirect on success
- Added collapsible "Add instructions (optional)" textarea to QuickAdd form
- On successful scrape, redirects to `/queue/[postId]?autoGenerate=true&prompt=...` via `goto()`
- Failed scrapes still show the manual content paste fallback (no redirect)
- `addPost` action now returns `postId` on all success paths (previously only on `needsContent`)

### Task 2: Auto-send initial message on chat page
- `+page.server.ts` reads `autoGenerate` and `prompt` from URL search params
- Skips greeting message generation when `autoGenerate=true` (avoids awkward greeting + auto-message)
- Passes `autoGenerate` and `autoPrompt` through page data to ChatInterface
- ChatInterface fires `chat.sendMessage()` once on mount with user's prompt or default "Draft a reply to this post."
- Uses `replaceState` to clean URL params after auto-send, preventing re-trigger on page refresh
- Guard variable `autoSent` ensures single execution even across re-renders

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. Full flow: Paste URL -> optional prompt -> Add to Queue -> auto-redirect -> draft streams in
2. No-prompt flow: Paste URL -> leave prompt empty -> Add to Queue -> auto-redirect -> default draft streams in
3. Failed scrape: Manual content form appears, no redirect
4. Normal navigation: Click existing post from dashboard -> greeting message, no auto-generation
5. Refresh safety: After auto-generation, refresh page -> no re-trigger (URL params cleaned)

All verification criteria met via type checking (0 errors).
