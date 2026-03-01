# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Every generated reply sounds authentically like the user — not generic AI, but their specific voice — and the chat-first interface makes crafting that reply feel like a natural conversation.
**Current focus:** Phase 5: Voice Calibration & Continuous Learning

## Current Position

Phase: 5 of 5 (Voice Calibration & Continuous Learning)
Plan: 3 of 3 in current phase ✓
Status: Complete
Last activity: 2026-03-01 — Completed quick task 012: Humanize button for drafts

Progress: [████████████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 14
- Average duration: 6 min
- Total execution time: 1.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-auth | 2/2 | 41 min | 20 min |
| 02-personas-voice-profiles | 2/2 | 12 min | 6 min |
| 03-post-queue-dashboard | 3/3 | 8 min | 2 min |
| 04-chat-draft-generation | 4/4 | 9 min | 2 min |
| 05-voice-calibration | 3/3 | 9 min | 3 min |

**Recent Trend:**
- Last 5 plans: 3 min, 2 min, 2 min, 2 min, 5 min
- Trend: fast

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Auth uses Auth.js (not custom Lucia pattern)
- [Roadmap]: AI uses Vercel AI SDK (ai v6 + @ai-sdk/svelte), NOT OpenCode SDK (incompatible with Workers)
- [Roadmap]: Voice calibration deferred to Phase 5 — validate core chat loop first
- [Roadmap]: Dashboard bundled with post queue (Phase 3) — both are queue-centric views
- [01-01]: Used Web Crypto PBKDF2 for password hashing (Argon2 NAPI incompatible with Workers)
- [01-01]: Used $env/dynamic/private for local dev DB URL, platform.env for Workers
- [01-01]: Local PostgreSQL on port 5433 to avoid conflicts
- [01-02]: Auto-sign-in after registration via Object.create event proxy for Auth.js signIn
- [01-02]: Dual DB driver factory — getDb() uses pg locally, neon HTTP on Workers
- [01-02]: Function constructor dynamic import hides pg from Workers bundler
- [02-01]: InferSelectModel + explicit typing for Drizzle dual-driver DB union type inference
- [02-01]: Split list query into two queries instead of leftJoin for dual-driver type safety
- [02-02]: Raw fetch + ReadableStream for client streaming (not experimental_useObject)
- [02-02]: onFinish callback text parsing for server-side profile saving
- [02-02]: Manual edits stored separately, merged at display time
- [03-01]: personaId FK uses onDelete 'set null' — archived persona shouldn't cascade-delete posts
- [03-01]: Scraper client returns null on all failures — never blocks queue add
- [03-01]: findPersonaByPlatform prefers isDefault persona for auto-assignment
- [03-02]: Client-side search via $derived filter instead of server-side for queue
- [03-02]: Status tabs use goto() with replaceState for no-reload tab switching
- [03-02]: Table rows use <a> wrappers per cell for full-row clickability
- [03-03]: Inline persona dropdown uses requestSubmit() on change for seamless form submission
- [03-03]: Archive/unarchive buttons use CSS hover-reveal (group + opacity transition)
- [03-03]: archivedCount loaded separately since archived posts excluded from statusCounts
- [04-01]: chatMessages.id accepts external AI SDK UIMessage IDs — idempotent saves via onConflictDoNothing
- [04-01]: parts stored as jsonb matching AI SDK v6 UIMessage.parts format
- [04-01]: getMessageIds returns Set<string> for O(1) diffing of new messages
- [04-02]: crypto.randomUUID() instead of Node crypto import for Workers compatibility
- [04-02]: maxOutputTokens (AI SDK v6 naming) set to 2048 for draft generation
- [04-02]: Greeting message persisted to DB on first load for consistent chat history
- [04-03]: Cast server message parts as UIMessage[] — DB stores type:string but Chat class needs discriminated union
- [04-03]: Parse draft blocks only when part.state !== 'streaming' to avoid partial-tag glitches
- [04-03]: Typing indicator shown during both 'submitted' and 'streaming' status
- [04-04]: Textarea for inline draft editing (not contenteditable) — more reliable cross-browser
- [04-04]: Transient persona switch notification (3s fade) instead of persistent system message
- [04-04]: Draft edits matched by originalText to find saved edits for DraftBlock display
- [Phase 05-01]: Fire-and-forget feedback tracking — copy feedback uses .catch(() => {}) to avoid blocking UI
- [Phase 05-01]: Edit flow does dual write — saves draftEdit AND draftFeedback in single endpoint call
- [Phase 05-01]: Type-discriminated endpoint — body.type routes between feedback-only and edit+feedback flows
- [Phase 05-02]: Calibration ratings stored in calibrationFeedback jsonb column on voiceProfileVersions
- [Phase 05-02]: Voice re-extraction includes both calibration ratings and draft usage feedback as cumulative AI context
- [Phase 05-02]: Recalibrate mode bypasses sample validation — re-extracts from existing samples with feedback
- [Phase 05-03]: Platform override with default fallback — getActiveVersionForPlatform tries platform-specific first, then default
- [Phase 05-03]: Per-platform version numbering — platform overrides have independent version sequences
- [Phase 05-03]: platformFilter-only extraction skips sample validation — re-extracts from stored samples
- [quick-003]: BrowserWorker type from @cloudflare/puppeteer instead of Fetcher — workers-types not in tsconfig types

### Pending Todos

None.

### Blockers/Concerns

- [Research]: Voice profile schema needs experimentation — plan for 2-3 schema revisions in Phase 2
- ~~[Research]: Argon2 WASM performance on Workers needs benchmarking in Phase 1~~ — Resolved: using PBKDF2 instead
- [Research]: AI SDK Chat class + Svelte 5 runes has gotchas (use getters, no destructuring)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Auto-generate reply on paste with optional prompt | 2026-02-19 | 96cfe77 | [001-auto-generate-reply-on-paste-with-option](./quick/001-auto-generate-reply-on-paste-with-option/) |
| 002 | Allow users to select which model to write with | 2026-02-19 | 0bab2e3 | [002-allow-users-to-select-which-model-to-wri](./quick/002-allow-users-to-select-which-model-to-wri/) |
| 003 | Implement scraper with Cloudflare Puppeteer | 2026-02-19 | 9e064d3 | [003-implement-scraper-with-cloudflare-puppeteer](./quick/003-implement-scraper-with-cloudflare-puppeteer/) |
| 004 | Fix copy button and manual status with tests | 2026-02-19 | c5b8f41 | [004-fix-copy-button-and-manual-status-with-t](./quick/004-fix-copy-button-and-manual-status-with-t/) |
| 005 | Add prompt-based voice profile refinement | 2026-02-19 | 2fbab02 | [005-add-ability-for-users-to-write-a-prompt-](./quick/005-add-ability-for-users-to-write-a-prompt-/) |
| 006 | Refine prompt dedicated page with diff | 2026-02-20 | f74804c | [006-refine-prompt-dedicated-page-with-diff](./quick/006-refine-prompt-dedicated-page-with-diff/) |
| 007 | Add hotkey navigation for app | 2026-02-21 | 7338c3a | [007-add-hotkey-navigation-for-app](./quick/007-add-hotkey-navigation-for-app/) |
| 008 | Toast error notifications for QuickAdd | 2026-02-21 | 6b13a77 | [008-toast-error-notifications-quickadd](./quick/008-toast-error-notifications-quickadd/) |
| 009 | Settings page with Integrations tab and theme | 2026-02-21 | 973458f | [009-settings-page-integrations-tab-theme](./quick/009-settings-page-integrations-tab-theme/) |
| 010 | Token cost tracking per post | 2026-02-22 | 93045d9 | [010-token-cost-tracking-per-post](./quick/010-token-cost-tracking-per-post/) |
| 011 | Allow users to manually edit their voice profile | 2026-02-26 | d5d1f00 | [011-allow-users-to-manually-edit-their-perso](./quick/011-allow-users-to-manually-edit-their-perso/) |
| 012 | Humanize button for drafts | 2026-03-01 | c64405d | [012-humanize-button-for-drafts](./quick/012-humanize-button-for-drafts/) |

## Session Continuity

Last session: 2026-03-01
Stopped at: Completed quick task 012: Humanize button for drafts
Resume file: None
