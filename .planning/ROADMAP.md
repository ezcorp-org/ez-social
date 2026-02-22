# Roadmap: ez-social

## Overview

ez-social goes from zero to a working chat-first AI reply tool in 5 phases. We start with foundation and auth, then build personas with voice extraction, then the post queue and dashboard, then the core differentiator — per-post persistent chat with streaming AI draft generation — and finally close the voice feedback loop with calibration and continuous learning. Each phase delivers a verifiable capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation & Auth** - SvelteKit project on Cloudflare Workers with database, auth, and session management
- [ ] **Phase 2: Personas & Voice Profiles** - Persona CRUD with AI-powered voice extraction from writing samples
- [ ] **Phase 3: Post Queue & Dashboard** - Queue management with status tracking, dashboard overview, and quick-add
- [ ] **Phase 4: Chat & Draft Generation** - Per-post persistent chat with streaming AI drafts, refinement, and versioning
- [ ] **Phase 5: Voice Calibration & Continuous Learning** - Voice profile improvement through calibration feedback and draft usage tracking

## Phase Details

### Phase 1: Foundation & Auth
**Goal**: Users can register, log in, and access a protected application deployed on Cloudflare Workers
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User can register with email/password and land on a protected home page
  2. User can log in with existing credentials and be redirected to the app
  3. User's session survives a full browser refresh without re-login
  4. User can log out from any page and be redirected to login
  5. The app builds and deploys to Cloudflare Workers with Neon DB connected
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffolding, Drizzle schema, DB factory, password hashing, Auth.js config
- [ ] 01-02-PLAN.md — Auth pages (register/login), protected app shell, logout, end-to-end verification

### Phase 2: Personas & Voice Profiles
**Goal**: Users can create personas and extract structured voice profiles from their writing samples
**Depends on**: Phase 1
**Requirements**: PERS-01, PERS-02, PERS-03, PERS-04, VOIC-01, VOIC-02, VOIC-03
**Success Criteria** (what must be TRUE):
  1. User can create, edit, and delete personas with name and description
  2. User can have multiple personas listed simultaneously and distinguish between them
  3. User can paste writing samples (tweets, blog posts, emails) and trigger voice extraction
  4. AI extracts a structured voice profile (tone, vocabulary, patterns) stored as JSONB
  5. Voice profile is associated with a persona and available for draft generation
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Database schema (personas, writing samples, voice profile versions) + persona CRUD with soft delete, default enforcement, and nav integration
- [ ] 02-02-PLAN.md — AI SDK voice extraction streaming API, extraction UI with progressive trait display, voice profile display/edit/versioning

### Phase 3: Post Queue & Dashboard
**Goal**: Users can add posts to a queue, track their status, and see an overview dashboard
**Depends on**: Phase 2
**Requirements**: QUEU-01, QUEU-02, QUEU-03, QUEU-04, QUEU-05, DASH-01, DASH-02
**Success Criteria** (what must be TRUE):
  1. User can add a post to the queue by pasting a URL and content
  2. Posts display their current status and user can filter the queue by status
  3. User can assign a persona to a queued post
  4. Platform is auto-detected from the pasted URL (Twitter, LinkedIn, etc.)
  5. Dashboard shows status counts and a quick-add form for pasting new posts
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Database schema (postQueue table), queue service, scraper client, platform detection, Zod schemas
- [ ] 03-02-PLAN.md — Combined dashboard + queue page with quick-add form, status tabs, queue table, dashboard stats, nav update
- [ ] 03-03-PLAN.md — Archive/unarchive management, inline persona reassignment, placeholder chat route for Phase 4

### Phase 4: Chat & Draft Generation
**Goal**: Users can interact with each queued post through a persistent chat that generates, displays, and refines voice-matched drafts
**Depends on**: Phase 3
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, CHAT-08, DRFT-01, DRFT-02, DRFT-03, DRFT-04, PERS-05
**Success Criteria** (what must be TRUE):
  1. Each queued post has a persistent chat that preserves full conversation history across sessions
  2. User can discuss the original post with AI and then request a draft reply in their persona's voice
  3. AI-generated drafts appear as visually distinct inline messages that can be copied with one click
  4. User can refine drafts through natural language ("make it shorter", "more casual") and each generation creates a new version
  5. User can edit a draft inline before copying, with both original and edited versions stored
  6. AI responses stream in real-time (SSE) and chat context includes the original post, voice profile, and conversation history
  7. User can switch persona and manage context through the chat conversation
**Plans**: 4 plans

Plans:
- [ ] 04-01-PLAN.md — Database schema (chatMessages + draftEdits tables), chat service, draft service, queue updateStatus
- [ ] 04-02-PLAN.md — Streaming chat endpoint with AI SDK v6, system prompt builder, page server load with chat history + voice profile
- [ ] 04-03-PLAN.md — Chat UI components (PostContextCard, ChatMessage, DraftBlock, PersonaSelector, ChatInterface), page rewrite
- [ ] 04-04-PLAN.md — Draft inline editing with persistence, persona switching integration

### Phase 5: Voice Calibration & Continuous Learning
**Goal**: Voice profiles improve over time through explicit calibration and implicit feedback from draft usage
**Depends on**: Phase 4
**Requirements**: VOIC-04, VOIC-05, VOIC-06, VOIC-07, PERS-06
**Success Criteria** (what must be TRUE):
  1. User can rate AI-generated sample replies as "sounds like me" or "doesn't sound like me"
  2. Voice profile visibly refines based on calibration feedback (re-extraction with feedback context)
  3. System tracks which drafts the user accepts, rejects, or edits for training data
  4. Voice profiles improve continuously — drafts generated after feedback are measurably closer to the user's voice
  5. User can create per-platform voice overrides so their Twitter voice differs from their LinkedIn voice
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — Draft feedback tracking schema + service, DraftBlock wired to track copy/edit actions
- [ ] 05-02-PLAN.md — Voice calibration UI (generate samples, rate, refine), continuous learning from draft feedback in re-extraction
- [ ] 05-03-PLAN.md — Per-platform voice overrides (platform column, platform-aware chat prompt, persona detail UI)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 2/2 | Complete | 2026-02-18 |
| 2. Personas & Voice Profiles | 2/2 | Complete | 2026-02-18 |
| 3. Post Queue & Dashboard | 3/3 | Complete | 2026-02-18 |
| 4. Chat & Draft Generation | 4/4 | Complete | 2026-02-18 |
| 5. Voice Calibration & Continuous Learning | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-17*
*Last updated: 2026-02-18 — Phase 5 plans created*
