# ez-social

## What This Is

ez-social is a chat-first web application that helps users respond to social media posts using AI-generated drafts tailored to their personal writing style (voice). Users create personas with distinct voices, queue social posts to respond to, and interact with each post through a persistent chat interface where they can discuss the content, generate drafts, refine them through conversation, and manage everything through natural language.

## Core Value

Every generated reply sounds authentically like the user — not generic AI, but their specific voice, tone, and style — and the chat-first interface makes the process of crafting that reply feel like a natural conversation rather than a form-filling exercise.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Multi-user authentication (register, login, session management)
- [ ] Persona management (create, edit, delete multiple personas)
- [ ] Voice profile extraction from pasted writing samples (tweets, blogs, emails, curated examples)
- [ ] Voice calibration through sample rating ("sounds like me" / "doesn't")
- [ ] Continuous voice improvement from draft feedback over time
- [ ] Per-platform voice profile overrides (optional, single voice default)
- [ ] Post queue with status tracking (pending → drafting → drafted → ready → replied)
- [ ] Manual paste for post content (URL + content)
- [ ] Per-post persistent chat interface as the primary interaction model
- [ ] Chat-based post discussion (understand the post before drafting)
- [ ] Chat-based draft generation using selected persona's voice
- [ ] Inline draft display as special chat messages (copyable)
- [ ] Chat-based draft refinement ("make it shorter", "more casual")
- [ ] Chat-based persona switching and context management
- [ ] Dashboard with queue overview and quick-add
- [ ] Draft versioning (every generation preserved, never overwritten)

### Out of Scope

- Scraping service — manual paste is sufficient for v1; auto-fetch deferred
- Tauri desktop app — web-first; desktop build deferred to post-v1
- Scheduled/auto posting — manual copy-paste to platform for v1
- OAuth/social login — email/password auth only
- Real-time collaboration — single-user-per-session model
- Mobile app — responsive web only
- Bulk operations (CSV import) — one-at-a-time for v1

## Context

- **Architecture blueprint**: `architecture.md` in project root defines the full technical architecture, data model, and deployment strategy. It is the source of truth for implementation decisions.
- **Tech stack decided**: SvelteKit + TypeScript + Tailwind CSS v4, Drizzle ORM, PostgreSQL (Neon DB production, Docker local), Cloudflare Workers deployment, OpenCode SDK for AI.
- **Data model defined**: Users, sessions, personas, voice profiles, platform accounts, post queue, drafts, audit log — all defined with Drizzle schema in the architecture doc.
- **Chat is the differentiator**: Unlike typical social media tools that use forms and buttons, ez-social's per-post chat interface is the primary way users interact. The chat persists, supports persona switching, draft generation, refinement, and context management — all through conversation.
- **Voice feedback loop**: Voice profiles aren't just extracted once — they improve through an initial calibration step (rate sample outputs) and continuous learning from how users interact with drafts.
- **New data requirement**: The per-post chat with persistent history requires a `chat_messages` table (not in the current architecture.md schema) to store conversation threads per post.

## Constraints

- **Platform**: Cloudflare Workers — no Node.js runtime features, WASM-compatible dependencies only
- **Database**: Neon DB serverless PostgreSQL via HTTP driver (no persistent connections)
- **AI**: OpenCode SDK — all AI features (voice extraction, draft generation, chat) go through this
- **Auth**: Session-based (Lucia patterns), no OAuth providers in v1
- **Build target**: Web only for v1 (adapter-cloudflare), Tauri deferred
- **Scraping**: None in v1 — users paste post content manually

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web-first, Tauri deferred | Ship faster; desktop adds build complexity without core value | — Pending |
| Chat-first per-post interface | Core UX differentiator; natural conversation > forms | — Pending |
| Manual paste over scraping for v1 | Scraping service is a separate deployment; manual paste works fine | — Pending |
| Voice calibration via sample rating | More natural than sliders/forms; users react to output | — Pending |
| Continuous voice learning from drafts | Voice profiles improve with use rather than one-time setup | — Pending |
| Per-platform voice overrides (optional) | Users write differently per platform, but default to single voice | — Pending |
| Persistent chat history per post | Users come back to posts; context shouldn't be lost | — Pending |
| Plain text paste for voice samples | Simplest input; file upload deferred | — Pending |

---
*Last updated: 2025-02-17 after initialization*
