# Phase 3: Post Queue & Dashboard - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Queue management with status tracking, dashboard overview, and quick-add. Users can add posts to a queue by pasting a URL (content scraped automatically), track post status, assign personas, and see an action-oriented dashboard. The queue and dashboard are a single combined page.

This phase does NOT include: the chat interface (Phase 4), draft generation (Phase 4), or voice calibration (Phase 5). Clicking a queued post navigates to a chat page that will be built in Phase 4 — this phase creates the placeholder route.

</domain>

<decisions>
## Implementation Decisions

### Queue entry flow
- Primary input is **URL only** — app scrapes the post content automatically via the scraping service
- If scraping fails, retry automatically; if it keeps failing, fall back to manual content paste by the user
- Persona is **auto-assigned based on the platform** detected from the URL (e.g., Twitter URL → Twitter persona), unless the user selects a different one
- After adding a post, user **stays on the dashboard/queue page** — no navigation away, can add more posts immediately

### Post statuses & workflow
- Four statuses: **New → In Progress → Draft Ready → Complete**
- Statuses are **auto-tracked only** — no manual status overrides:
  - `New`: post just added to queue
  - `In Progress`: user has started a chat on this post (Phase 4 triggers this)
  - `Draft Ready`: a draft has been generated in the chat (Phase 4 triggers this)
  - `Complete`: user copies the final draft (Phase 4 triggers this)
- Posts can be **archived** (removed from active queue but recoverable) — no hard delete for active posts
- No skipped/dismissed status — archive serves that purpose

### Queue display & filtering
- **Compact table layout** — dense rows, more posts visible at once
- Table columns: platform icon, post snippet (~100 chars), status badge, persona name, date added
- Filtering: **status tabs** (All | New | In Progress | Draft Ready | Complete) + **search box** for finding specific posts
- Clicking a table row **navigates to the post's chat page** (Phase 4 route, placeholder for now)
- Archived posts are hidden from default view

### Dashboard layout & quick-add
- **Combined single page** — dashboard stats + quick-add at top, full queue table below
- Quick-add form is **always visible at the top** — URL input field, paste and go
- Dashboard stats shown: **status counts** (per-status breakdown), **posts needing action** (highlighted count of New posts), **recent activity** (last few status changes)
- Action-oriented design — emphasize what needs attention, not just overview

### Claude's Discretion
- Exact table styling and responsive behavior
- Search implementation details (client-side vs server-side)
- Status badge colors and styling
- Loading states and skeleton UI
- Archive UI (how to access archived posts)
- Error toast/notification design
- Platform icon set and detection regex patterns

</decisions>

<specifics>
## Specific Ideas

- Platform auto-detection from URL patterns (twitter.com, x.com → Twitter; linkedin.com → LinkedIn; etc.)
- Persona-to-platform mapping: each persona can have a "default platform" association, so pasting a Twitter URL auto-assigns the user's Twitter persona
- Scraping service runs separately (Playwright-based, per AGENTS.md note) — the queue API calls it and handles the async result
- Status counts should feel like actionable badges, not just numbers — "3 posts need replies" is better than "New: 3"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-post-queue-dashboard*
*Context gathered: 2026-02-18*
