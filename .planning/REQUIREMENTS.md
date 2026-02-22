# Requirements: ez-social

**Defined:** 2025-02-17
**Core Value:** Every generated reply sounds authentically like the user — not generic AI, but their specific voice — and the chat-first interface makes crafting that reply feel like a natural conversation.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: User can register with email and password via Auth.js
- [x] **AUTH-02**: User can log in with email and password
- [x] **AUTH-03**: User session persists across browser refresh
- [x] **AUTH-04**: User can log out from any page

### Personas

- [x] **PERS-01**: User can create a persona with name and description
- [x] **PERS-02**: User can edit an existing persona
- [x] **PERS-03**: User can delete a persona
- [x] **PERS-04**: User can have multiple active personas simultaneously
- [x] **PERS-05**: User can switch active persona through the chat interface
- [x] **PERS-06**: User can create per-platform voice overrides for a persona (optional, defaults to single voice)

### Voice Profiles

- [x] **VOIC-01**: User can paste writing samples (tweets, blogs, emails, curated text) to create a voice profile
- [x] **VOIC-02**: AI extracts structured voice profile (tone, vocabulary, sentence structure, patterns) from pasted samples
- [x] **VOIC-03**: Voice profile is stored as structured JSONB and used in every draft generation
- [x] **VOIC-04**: User can calibrate voice by rating AI-generated sample replies as "sounds like me" or "doesn't sound like me"
- [x] **VOIC-05**: Voice profile refines based on calibration feedback
- [x] **VOIC-06**: System tracks which drafts user accepts, rejects, or edits
- [x] **VOIC-07**: Voice profile improves continuously from draft feedback over time

### Post Queue

- [x] **QUEU-01**: User can add a post to the queue by pasting URL and content
- [x] **QUEU-02**: Posts have status tracking: pending → drafting → drafted → ready → replied
- [x] **QUEU-03**: User can assign a persona to a post
- [x] **QUEU-04**: User can filter and view posts by status
- [x] **QUEU-05**: Platform is detected from pasted URL when possible

### Chat Interface

- [x] **CHAT-01**: Each queued post has a persistent chat conversation that saves full history
- [x] **CHAT-02**: User can discuss the original post with AI to understand it before drafting
- [x] **CHAT-03**: User can request draft generation through the chat, using the assigned persona's voice
- [x] **CHAT-04**: AI-generated drafts appear as special inline messages that are visually distinct and copyable
- [x] **CHAT-05**: User can refine drafts through natural language ("make it shorter", "more casual", "add a joke")
- [x] **CHAT-06**: User can switch persona and manage context through conversation
- [x] **CHAT-07**: AI responses stream in real-time via SSE
- [x] **CHAT-08**: Chat context includes: original post, voice profile, conversation history, and user instructions

### Drafts

- [x] **DRFT-01**: Every draft generation creates a new version (never overwrites previous)
- [x] **DRFT-02**: User can copy any draft to clipboard with one click
- [x] **DRFT-03**: User can edit a draft inline before copying
- [x] **DRFT-04**: When a user edits a draft, both original and edited versions are stored with the diff logged for voice training data

### Dashboard

- [x] **DASH-01**: Dashboard shows queue overview with status counts (pending, drafting, drafted, ready, replied)
- [x] **DASH-02**: Dashboard has a quick-add form to paste URL + content and add to queue

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Desktop App

- **DESK-01**: Tauri desktop app wrapping the SvelteKit frontend
- **DESK-02**: Secure token storage via Tauri secure store
- **DESK-03**: API communication via Bearer token auth

### Scraping

- **SCRP-01**: Auto-fetch post content from URL via scraping service
- **SCRP-02**: Platform-specific DOM parsing for major social platforms

### Browser Extension

- **BEXT-01**: Browser extension to quick-add posts from the social platform page
- **BEXT-02**: Auto-fill post content from the current page

### Analytics

- **ANAL-01**: Internal stats: posts replied per week, average drafts per post, time from queue to replied
- **ANAL-02**: Voice profile quality metrics (calibration score, improvement rate)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Direct posting to social platforms | OAuth API integration is massive scope; APIs change constantly; copy-to-clipboard is sufficient |
| Scheduled/auto posting | Requires OAuth + cron jobs; changes product from reply assistant to scheduler |
| Real-time collaboration / team features | Multi-user collaboration is massive complexity; this is a personal tool |
| Bulk import (CSV of posts) | Undermines chat-first per-post UX differentiator; batch quality drops |
| Content calendar / visual scheduling | Wrong mental model — replies are reactive, not planned content |
| Template library / viral tweet database | Opposite of personal voice; undermines core value proposition |
| Platform analytics / engagement tracking | Requires OAuth; outside core scope of writing great replies |
| Image/video generation | Separate AI pipeline; replies are primarily text |
| OAuth / social login | Email/password via Auth.js is sufficient for v1 |
| Mobile native app | Responsive web is sufficient for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| PERS-01 | Phase 2 | Complete |
| PERS-02 | Phase 2 | Complete |
| PERS-03 | Phase 2 | Complete |
| PERS-04 | Phase 2 | Complete |
| PERS-05 | Phase 4 | Complete |
| PERS-06 | Phase 5 | Complete |
| VOIC-01 | Phase 2 | Complete |
| VOIC-02 | Phase 2 | Complete |
| VOIC-03 | Phase 2 | Complete |
| VOIC-04 | Phase 5 | Complete |
| VOIC-05 | Phase 5 | Complete |
| VOIC-06 | Phase 5 | Complete |
| VOIC-07 | Phase 5 | Complete |
| QUEU-01 | Phase 3 | Complete |
| QUEU-02 | Phase 3 | Complete |
| QUEU-03 | Phase 3 | Complete |
| QUEU-04 | Phase 3 | Complete |
| QUEU-05 | Phase 3 | Complete |
| CHAT-01 | Phase 4 | Complete |
| CHAT-02 | Phase 4 | Complete |
| CHAT-03 | Phase 4 | Complete |
| CHAT-04 | Phase 4 | Complete |
| CHAT-05 | Phase 4 | Complete |
| CHAT-06 | Phase 4 | Complete |
| CHAT-07 | Phase 4 | Complete |
| CHAT-08 | Phase 4 | Complete |
| DRFT-01 | Phase 4 | Complete |
| DRFT-02 | Phase 4 | Complete |
| DRFT-03 | Phase 4 | Complete |
| DRFT-04 | Phase 4 | Complete |
| DASH-01 | Phase 3 | Complete |
| DASH-02 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0

---
*Requirements defined: 2025-02-17*
*Last updated: 2026-02-17 after roadmap creation*
