# Project Research Summary

**Project:** ez-social
**Domain:** AI-powered chat-first social media reply tool with voice matching
**Researched:** 2026-02-17
**Confidence:** HIGH (stack, architecture, pitfalls) / MEDIUM (features, voice calibration)

## Executive Summary

ez-social is a chat-first AI writing assistant that helps users craft social media replies in their own voice. The product sits in an unclaimed niche: the intersection of personal voice matching (from enterprise tools like Jasper/Copy.ai) and reply-focused workflow (which no tool serves well). The recommended approach is to build on SvelteKit deployed to Cloudflare Workers, using the Vercel AI SDK (`ai` + `@ai-sdk/svelte`) for streaming chat, Drizzle ORM with Neon's serverless HTTP driver for persistence, and prompt-engineered voice extraction (no NLP libraries). The core stack is verified, version-compatible, and Workers-ready.

The primary technical risks are Cloudflare Workers constraints (128MB memory, no interactive DB transactions, `platform.env` instead of `process.env`) and AI cost control (unbounded token usage without rate limiting). These are well-understood and preventable with proper patterns established in Phase 1. The primary product risk is voice profile quality — garbage-in-garbage-out from insufficient writing samples. This requires quality gates and minimum sample thresholds baked into the extraction pipeline.

The MVP should validate one hypothesis: "Chat-first voice-matched reply generation is better than generic AI or form-based tools." This means auth, single persona with voice extraction, post queue, per-post chat with streaming AI drafts, and copy-to-clipboard. Multi-persona, voice calibration, platform-specific voice overrides, and the Tauri desktop app are v1.x/v2+ features that should be deferred until the core is validated.

## Key Findings

### Recommended Stack

The core stack (SvelteKit, Svelte 5, TypeScript, Tailwind v4, Drizzle ORM, Neon DB, Cloudflare Workers) is locked in and validated. The key addition is the Vercel AI SDK ecosystem for chat streaming. **Critical finding:** The "OpenCode SDK" referenced in the original architecture cannot run on Cloudflare Workers (requires a persistent Node.js server process) and lacks tool calling support. Use first-party AI SDK providers instead.

**Core technologies:**
- **Vercel AI SDK (`ai` + `@ai-sdk/svelte`):** Streaming chat with Svelte 5 `Chat` class — handles SSE, message protocol, structured output. Provider-agnostic.
- **`@ai-sdk/anthropic`:** Primary AI provider — Claude excels at style matching and creative writing (ideal for voice replication).
- **Zod 3.25.x + `drizzle-zod`:** Unified validation — required peer dep of AI SDK, generates schemas from Drizzle tables. Use 3.25.x (not 4.x) for stability.
- **`@node-rs/argon2`:** Password hashing via WASM on Workers — verified compatible with `nodejs_compat` flag.
- **`bits-ui`:** Headless Svelte 5 component primitives — avoid shadcn-svelte, Skeleton UI, Flowbite (all have Svelte 4 or Tailwind v3 issues).

### Expected Features

**Must have (table stakes):**
- User auth (register/login/session) — gate access, persist data
- Post queue with status tracking (pending → drafting → drafted → ready → replied)
- AI draft generation using voice profile — the core product
- Per-post persistent chat interface — THE differentiator UX
- Chat-based draft refinement ("make it shorter," "more casual")
- Draft versioning (never overwrite) — every generation preserved
- Copy-to-clipboard — get drafts out of the app
- Persona CRUD (single persona minimum for MVP)
- Voice profile extraction from pasted writing samples
- Manual post content input (URL + paste)

**Should have (competitive advantage, v1.x):**
- Voice calibration through sample rating ("sounds like me" / "doesn't")
- Multiple personas with distinct voice profiles
- Per-platform voice overrides (Twitter vs LinkedIn voice)
- Continuous voice improvement from draft accept/reject feedback

**Defer (v2+):**
- Direct posting via platform APIs (massive scope, expensive APIs)
- Browser extension for quick-add
- Auto-scraping service (Playwright, separate deployment)
- Tauri desktop app (validate web first)
- Analytics/engagement tracking (requires platform OAuth)
- Scheduled/auto posting (different product category)

### Architecture Approach

The system adds three new layers to the existing SvelteKit architecture: a chat subsystem (message persistence + SSE streaming endpoints), a prompt chain engine (voice profile + post content + conversation context → AI call), and a voice calibration feedback loop. Chat messages are stored in a dedicated `chat_messages` table (not JSONB on post_queue), drafts created via chat are linked back to the originating assistant message via tool calling, and voice profiles are injected as system prompt context. Streaming uses AI SDK's `toUIMessageStreamResponse()` over SSE — no WebSockets needed.

**Major components:**
1. **Chat Service + Streaming API** — Message CRUD, SSE streaming via AI SDK `streamText()`, per-post conversation scoping
2. **Prompt Chain Engine** — Assembles system prompt (voice profile + post content + platform context), manages context window (50-message cap), separated from AI calling for testability
3. **Voice Service (enhanced)** — Extracts voice profiles via `generateObject()` with Zod schema, processes calibration feedback, stores structured profiles as JSONB
4. **Chat-to-Draft Bridge** — AI SDK tool calling (`saveDraft` tool) automatically creates versioned draft records when AI generates reply content

### Critical Pitfalls

1. **Neon DB cold starts (500ms-3s latency)** — Implement keepalive cron from day one; use `scale_to_zero: false` on paid plan. Show loading skeletons.
2. **Workers 128MB memory limit** — Never buffer full AI responses; stream everything via `ReadableStream`. Cap voice profile JSONB at 20KB. Test with concurrent requests.
3. **No interactive DB transactions on HTTP driver** — Use atomic single-statement patterns (`INSERT ... SELECT`), `UNIQUE` constraints with `ON CONFLICT`. Never do `SELECT max(version)` then `INSERT version+1`.
4. **AI token cost spiral** — Implement per-user daily generation limits (50/day) in Cloudflare KV from Phase 2. Cap voice profile prompt contribution to ~2,000 tokens. Set `max_tokens` on AI calls.
5. **Session auth hitting DB on every request** — Cache sessions in Cloudflare KV (5ms reads vs 30ms Neon). Skip validation for static assets and public routes.
6. **`platform.env` vs `process.env`** — Workers secrets are NOT on `process.env`. Access via `event.platform.env` in hooks, pass via `locals`. Test with `wrangler dev` before deploying.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation & Auth
**Rationale:** Everything depends on auth, database patterns, and Workers-compatible env access. Architecture research shows `platform.env` confusion and transaction limitations must be solved first. Pitfalls research identifies 7 issues that must be addressed in this phase.
**Delivers:** Working SvelteKit app on Workers with auth, session management (KV-cached), database access patterns, dual-build adapter config, Tailwind v4 setup, keepalive cron.
**Addresses features:** User auth, session management, responsive web foundation.
**Avoids pitfalls:** #1 (cold starts), #3 (transaction patterns), #5 (session latency), #6 (platform.env), #7 (Tailwind v4), #12 (dual-build), #13 (PgBouncer), #14 (bundle size).

### Phase 2: Persona & Voice Profile System
**Rationale:** Voice profiles are a prerequisite for meaningful chat-based draft generation. Architecture dependency graph shows chat requires voice profiles. Feature research identifies voice extraction as a core differentiator that must exist before the chat system can deliver value.
**Delivers:** Persona CRUD, voice profile extraction from writing samples, structured JSONB storage, AI SDK integration (`ai.ts` wrapper, provider config), `generateObject()` for structured extraction.
**Addresses features:** Persona CRUD, voice profile extraction from pasted samples.
**Avoids pitfalls:** #2 (memory limit — profile size caps), #4 (token costs — prompt size controls), #8 (voice quality — minimum sample requirements), #10 (CPU limits — benchmark Argon2 + AI).

### Phase 3: Post Queue & Core Chat
**Rationale:** This is the critical path. Architecture research shows the chat system is the most complex new component (7 sub-phases in the build order). Feature research identifies per-post chat as THE core differentiator. Must have voice profiles (Phase 2) and auth (Phase 1) before chat can work.
**Delivers:** Post queue management, manual post input, per-post persistent chat with streaming AI responses, prompt chain engine, `chat_messages` table, chat-to-draft bridge with tool calling, draft versioning, copy-to-clipboard.
**Addresses features:** Post queue with status tracking, manual post input, per-post chat, AI draft generation, chat-based refinement, draft versioning, copy-to-clipboard.
**Avoids pitfalls:** #2 (stream don't buffer), #4 (rate limiting), #9 (storage growth — retention policies), #11 (SSE not WebSockets).

### Phase 4: Dashboard & Polish
**Rationale:** Feature research shows dashboard is a read-only aggregation that depends on queue and personas existing. Architecture shows it doesn't block core features. This phase integrates everything into a cohesive UX.
**Delivers:** Dashboard overview, queue filtering/sorting, mobile-responsive layouts, UX polish (loading states, streaming indicators, error handling).
**Addresses features:** Basic dashboard, responsive web design, draft editing/manual refinement.
**Avoids pitfalls:** UX pitfalls (loading states during AI generation, cold start explanation, voice profile confidence display).

### Phase 5: Voice Calibration & Multi-Persona
**Rationale:** Architecture research explicitly notes voice calibration is independent of the chat system and can be built after AI integration. Feature research classifies these as v1.x "add after validation" features. Only build once core is working and users confirm value.
**Delivers:** Voice calibration through sample rating, multiple personas, per-platform voice overrides, chat-based persona switching, continuous voice improvement from draft feedback.
**Addresses features:** All v1.x "should have" features.
**Uses:** `voice_calibration` table, `generateText()` for sample generation, calibration feedback loop pattern.

### Phase 6: Desktop & Extensions
**Rationale:** Feature research explicitly defers Tauri desktop and browser extension to v2+. Architecture already supports dual-build (adapter-static for Tauri). Only pursue after web product is validated.
**Delivers:** Tauri desktop app, browser extension for quick-add, auto-scraping service.
**Addresses features:** All v2+ future consideration features.

### Phase Ordering Rationale

- **Phase 1 → 2 → 3 is strict dependency order:** Auth enables personas, personas enable voice profiles, voice profiles enable meaningful chat-based drafting. Skipping ahead produces a chat system that generates generic AI content (indistinguishable from ChatGPT).
- **Phase 4 can partially overlap with Phase 3:** Dashboard and polish work can begin once the post queue exists, even before chat is complete.
- **Phase 5 is deliberately after Phase 4:** Voice calibration is a refinement feature. Users need to experience the basic system before calibration adds value. Building it too early wastes effort if the core hypothesis fails.
- **Phase 6 is gated on product validation:** Desktop and extensions multiply deployment complexity without validating the core value proposition.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Voice Profile System):** Voice extraction schema and prompting strategy need iterative refinement — STACK.md rates this MEDIUM confidence. The exact attributes that differentiate voices effectively will require experimentation.
- **Phase 3 (Chat System):** AI SDK `Chat` class integration with Svelte 5 runes has specific gotchas (must use getters for reactive props, cannot destructure). Draft detection via tool calling needs careful prompt engineering.
- **Phase 5 (Voice Calibration):** ARCHITECTURE.md rates the calibration feedback loop as MEDIUM confidence — "implementation details will need experimentation." The re-extraction logic (using calibration feedback to modify JSONB profile) has no established pattern.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented patterns for SvelteKit + Workers + Drizzle + session auth. Pitfalls are known and preventable.
- **Phase 4 (Dashboard):** Standard CRUD UI, read-only aggregation. No novel technical challenges.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry. Compatibility matrix confirmed. AI SDK Svelte 5 integration documented with official quickstart. |
| Features | MEDIUM | Based on competitor marketing pages, not user research. Feature priorities are informed inference, not validated with real users. Competitive positioning is sound but untested. |
| Architecture | HIGH/MEDIUM | HIGH for streaming on Workers, chat persistence, prompt assembly. MEDIUM for voice calibration feedback loop — needs experimentation. |
| Pitfalls | HIGH | All critical pitfalls verified via official Cloudflare/Neon/SvelteKit docs. Prevention strategies are concrete and actionable. |

**Overall confidence:** HIGH — The technical approach is well-validated. The product hypothesis (chat-first voice-matched replies) is the main uncertainty, and that's a business risk, not a technical one.

### Gaps to Address

- **Voice profile schema design:** The exact Zod schema for `extractedStyle` needs experimentation. Starting schema provided but will need iteration based on output quality. Plan for 2-3 schema revisions during Phase 2.
- **AI provider cost modeling:** No concrete cost estimates per user per month. Need to measure actual token usage during Phase 2/3 development and model pricing tiers.
- **Voice calibration re-extraction logic:** No established pattern for "use user feedback to modify JSONB profile via AI." This is novel and needs a research spike during Phase 5 planning.
- **Argon2 CPU time on Workers:** Needs benchmarking during Phase 1. May require reducing `memoryCost` parameter. Fallback to `bcryptjs` if WASM performance is unacceptable.
- **Worker bundle size:** Multiple heavy dependencies (AI SDK, Argon2 WASM, Zod, Drizzle). Need to verify compressed bundle stays under 10MB after Phase 2 setup.

## Sources

### Primary (HIGH confidence)
- AI SDK official docs (Svelte quickstart, chatbot guide, message persistence, stream protocol, providers) — verified 2026-02-17
- npm registry (all package versions verified) — 2026-02-17
- Cloudflare Workers docs (Streams API, Limits, Secrets) — verified 2026-02-17
- Neon DB docs (serverless driver, connection pooling) — verified 2026-02-17
- SvelteKit docs (adapter-cloudflare, server-only modules) — verified 2026-02-17
- Tailwind CSS v4 upgrade guide — verified 2026-02-17
- Drizzle ORM + Neon integration docs — verified 2026-02-17

### Secondary (MEDIUM confidence)
- Competitor product pages (Buffer, Jasper, Copy.ai, Tweet Hunter, Hypefury, Lately.ai, Sprout Social) — marketing claims, actual capabilities may differ
- AI SDK community provider docs (OpenCode SDK) — confirmed incompatible with Workers

### Tertiary (LOW confidence)
- Voice profile extraction effectiveness — no empirical data, based on AI capability inference
- Pricing assumptions ($10-30/mo positioning) — no market validation
- Competitor feature depth — based on marketing pages, not hands-on testing

---
*Research completed: 2026-02-17*
*Ready for roadmap: yes*
