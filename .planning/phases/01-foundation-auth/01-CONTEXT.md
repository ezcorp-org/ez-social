# Phase 1: Foundation & Auth - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

SvelteKit project deployed on Cloudflare Workers with PostgreSQL (Neon DB), Auth.js authentication, and session management. Users can register with email/password, log in, maintain sessions across refreshes, and log out. This phase delivers the protected application shell — no business features yet.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all implementation decisions to best practices. Claude has full flexibility on:

- **Registration & login flow** — Page structure (single vs separate), form fields, validation approach, social login inclusion
- **Auth error experience** — Error presentation style (inline, toast, etc.), messaging for failed logins, duplicate emails, weak passwords
- **Post-login landing** — What the authenticated shell looks like, placeholder content, navigation structure
- **Session & logout behavior** — "Remember me" functionality, multi-tab handling, logout redirect behavior, session duration

**Guiding principle:** Follow established Auth.js + SvelteKit conventions and modern auth UX patterns. Keep it simple and conventional — this is foundation infrastructure, not a differentiating feature.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

Key constraints from project decisions:
- Auth uses Auth.js (not custom Lucia pattern) — per roadmap decision
- Argon2 WASM performance on Workers needs benchmarking — per research concern
- Two build targets: adapter-cloudflare (web) and adapter-static (Tauri)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation-auth*
*Context gathered: 2026-02-17*
