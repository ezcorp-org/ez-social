# Phase 3: Post Queue & Dashboard - Research

**Researched:** 2026-02-18
**Domain:** Post queue management, dashboard UI, URL scraping integration, Drizzle ORM schema extension
**Confidence:** HIGH

## Summary

Phase 3 adds the core queue management system — users paste URLs, content is scraped automatically, posts are tracked through statuses, and a combined dashboard/queue page shows everything. The implementation is well-constrained: we're extending an established SvelteKit + Drizzle codebase with proven patterns (service factory, per-request DB, form actions, Svelte 5 runes).

The main technical work is: (1) adding a `postQueue` table + `archivedAt` column to the schema, (2) creating a queue service following the `createPersonaService` pattern, (3) building a URL-detection + scraper-client layer, (4) building the combined dashboard/queue page with status tabs, search, and quick-add form. No new libraries are needed — everything uses existing dependencies (Drizzle, Zod, Tailwind v4, SvelteKit form actions).

**Primary recommendation:** Build on existing patterns exactly. Service factory for queue CRUD, SvelteKit form actions + `use:enhance` for mutations, `+page.server.ts` for data loading, Zod schemas for validation. The scraper service doesn't exist yet — build a client with graceful fallback to manual content entry.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Queue entry flow
- Primary input is **URL only** — app scrapes the post content automatically via the scraping service
- If scraping fails, retry automatically; if it keeps failing, fall back to manual content paste by the user
- Persona is **auto-assigned based on the platform** detected from the URL (e.g., Twitter URL → Twitter persona), unless the user selects a different one
- After adding a post, user **stays on the dashboard/queue page** — no navigation away, can add more posts immediately

#### Post statuses & workflow
- Four statuses: **New → In Progress → Draft Ready → Complete**
- Statuses are **auto-tracked only** — no manual status overrides:
  - `New`: post just added to queue
  - `In Progress`: user has started a chat on this post (Phase 4 triggers this)
  - `Draft Ready`: a draft has been generated in the chat (Phase 4 triggers this)
  - `Complete`: user copies the final draft (Phase 4 triggers this)
- Posts can be **archived** (removed from active queue but recoverable) — no hard delete for active posts
- No skipped/dismissed status — archive serves that purpose

#### Queue display & filtering
- **Compact table layout** — dense rows, more posts visible at once
- Table columns: platform icon, post snippet (~100 chars), status badge, persona name, date added
- Filtering: **status tabs** (All | New | In Progress | Draft Ready | Complete) + **search box** for finding specific posts
- Clicking a table row **navigates to the post's chat page** (Phase 4 route, placeholder for now)
- Archived posts are hidden from default view

#### Dashboard layout & quick-add
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUEU-01 | User can add a post to the queue by pasting URL and content | Queue service `addPost()`, quick-add form action, scraper client with fallback to manual paste |
| QUEU-02 | Posts have status tracking | `status` column on `postQueue` table with enum values `new`, `in_progress`, `draft_ready`, `complete`; auto-tracked only (Phase 4 triggers transitions) |
| QUEU-03 | User can assign a persona to a post | `personaId` FK on `postQueue`, auto-assignment from platform detection, manual override via form |
| QUEU-04 | User can filter and view posts by status | Status tab filtering in `+page.server.ts` load function via URL search params, client-side search |
| QUEU-05 | Platform is detected from pasted URL when possible | `detectPlatform(url)` utility using URL hostname matching patterns |
| DASH-01 | Dashboard shows queue overview with status counts | Aggregation query `SELECT status, COUNT(*)` in queue service, rendered as stat cards |
| DASH-02 | Dashboard has a quick-add form to paste URL + content and add to queue | Always-visible form at top of combined page, SvelteKit form action with `use:enhance` |

</phase_requirements>

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0 (0.44.x) | Database schema + queries for postQueue table | Already used throughout; service factory pattern established |
| zod | ^3 | Validation for queue input schemas (URL, personaId) | Already used for persona + auth schemas |
| @sveltejs/kit | ^2 | Form actions, load functions, routing | Already the foundation of the app |
| tailwindcss | ^4 | Styling for dashboard, table, status badges | Already configured with @tailwindcss/vite |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @neondatabase/serverless | ^0 | Production DB driver (via getDb factory) | All DB operations in production |
| pg | ^8.18.0 | Local dev DB driver (via getDb factory) | Local development |

### New Dependencies: NONE

No new packages are required. Everything is achievable with the existing stack.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SvelteKit form actions | Client-side fetch to API routes | Form actions are the established pattern; API routes could be added later for Tauri but aren't needed now |
| Client-side search | Server-side search via URL params | Client-side is simpler for small-medium datasets; server-side needed if queue exceeds ~500 posts. **Recommendation: client-side for search, server-side for status filtering** |
| Custom scraper client | Existing npm scraper library | Scraper is an external service (Playwright on VPS); we only need a fetch client. No library needed |

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/
├── lib/
│   ├── server/
│   │   └── services/
│   │       └── queue.ts              # Queue CRUD service (createQueueService pattern)
│   ├── schemas/
│   │   └── queue.ts                  # Zod schemas for queue inputs
│   ├── utils/
│   │   └── platform.ts              # EXTEND with detectPlatform(url) function
│   └── components/
│       └── queue/
│           ├── QuickAdd.svelte       # URL input + submit form
│           ├── QueueTable.svelte     # Compact table with rows
│           ├── StatusTabs.svelte     # All | New | In Progress | Draft Ready | Complete
│           └── DashboardStats.svelte # Status counts + action prompts
├── routes/
│   └── (app)/
│       ├── +page.svelte             # REPLACE: Dashboard + Queue combined page
│       ├── +page.server.ts          # NEW: Load queue data + handle form actions
│       └── queue/
│           └── [id]/
│               └── +page.svelte     # NEW: Placeholder for Phase 4 chat page
```

### Pattern 1: Service Factory (EXISTING — follow exactly)

**What:** Each service is a factory function that receives a `Db` instance and returns an object of async methods.
**When to use:** All server-side data operations.
**Example:** (from existing `src/lib/server/services/persona.ts:11`)

```typescript
import { eq, and, isNull, desc, sql, type InferSelectModel } from "drizzle-orm";
import type { getDb } from "$lib/server/db";
import { postQueue, personas } from "$lib/server/db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;

export function createQueueService(db: Db) {
  return {
    async addPost(userId: string, data: { url: string; platform: string | null; personaId: string | null }) {
      const [post] = await db
        .insert(postQueue)
        .values({
          userId,
          url: data.url,
          platform: data.platform,
          personaId: data.personaId,
          status: "new",
        })
        .returning();
      return post;
    },

    async list(userId: string, status?: string) {
      let query = db
        .select()
        .from(postQueue)
        .where(
          and(
            eq(postQueue.userId, userId),
            isNull(postQueue.archivedAt),
            ...(status && status !== "all" ? [eq(postQueue.status, status)] : []),
          ),
        )
        .orderBy(desc(postQueue.createdAt));
      return query;
    },

    async getStatusCounts(userId: string) {
      return db
        .select({
          status: postQueue.status,
          count: sql<number>`count(*)::int`,
        })
        .from(postQueue)
        .where(
          and(eq(postQueue.userId, userId), isNull(postQueue.archivedAt)),
        )
        .groupBy(postQueue.status);
    },

    async archive(userId: string, postId: string) {
      const [updated] = await db
        .update(postQueue)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(postQueue.id, postId), eq(postQueue.userId, userId)))
        .returning();
      return updated ?? null;
    },
  };
}
```

### Pattern 2: SvelteKit Form Actions for Mutations (EXISTING)

**What:** Server-side form actions handle mutations, `use:enhance` provides progressive enhancement.
**When to use:** All queue mutations (add post, archive, assign persona).
**Example:** (from existing `src/routes/(app)/personas/[id]/+page.server.ts:56`)

```typescript
// +page.server.ts
export const actions: Actions = {
  addPost: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const url = formData.get("url") as string;
    // Validate with Zod, create via service, return result
  },
};
```

```svelte
<!-- +page.svelte -->
<form method="POST" action="?/addPost" use:enhance={() => {
  // Reset form, show toast on success
  return async ({ update }) => {
    await update();
  };
}}>
  <input type="url" name="url" required />
  <button type="submit">Add</button>
</form>
```

### Pattern 3: Load Function with URL Search Params (EXISTING PATTERN)

**What:** Use URL search params for server-side filtering (status tabs), client-side state for search.
**When to use:** Status tab filtering on the queue.
**Example:**

```typescript
// +page.server.ts
export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.id) return { posts: [], statusCounts: {} };

  const status = event.url.searchParams.get("status") ?? "all";

  const databaseUrl = event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const queueService = createQueueService(db);

  const [posts, statusCounts] = await Promise.all([
    queueService.list(session.user.id, status),
    queueService.getStatusCounts(session.user.id),
  ]);

  return { posts, statusCounts, activeStatus: status };
};
```

### Pattern 4: Per-Request DB Initialization (EXISTING — CRITICAL)

**What:** DB is created per-request using `getDb(databaseUrl)`. Never module-scope.
**When to use:** Every `+page.server.ts` and `+server.ts` handler.
**Why:** Workers reuse isolates; platform.env access is request-scoped.

```typescript
const databaseUrl = event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
const db = await getDb(databaseUrl);
```

### Pattern 5: Platform Detection from URL

**What:** Extract platform from URL hostname, used for auto-assigning persona.
**When to use:** When user pastes a URL in quick-add.

```typescript
// Extend src/lib/utils/platform.ts
const PLATFORM_URL_PATTERNS: Record<string, RegExp[]> = {
  twitter: [/(?:twitter\.com|x\.com)/i],
  linkedin: [/linkedin\.com/i],
  reddit: [/(?:reddit\.com|old\.reddit\.com)/i],
  // Add more as needed
};

export function detectPlatform(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    for (const [platform, patterns] of Object.entries(PLATFORM_URL_PATTERNS)) {
      if (patterns.some(p => p.test(hostname))) return platform;
    }
  } catch {
    // Invalid URL
  }
  return null;
}
```

### Anti-Patterns to Avoid

- **Module-scope DB imports:** Never `const db = createDb(...)` at module level. Always per-request via `getDb()`.
- **Manual status changes in Phase 3:** Statuses are auto-tracked. Phase 3 only sets `new` on creation. Phase 4 transitions to `in_progress`, `draft_ready`, `complete`.
- **Hard deletes:** Always soft-delete with `archivedAt`. The schema supports this, the UI hides archived posts.
- **Client-side fetch for mutations:** Use SvelteKit form actions + `use:enhance`, not client-side fetch. This is the established pattern.
- **Separate dashboard and queue pages:** CONTEXT.md says combined single page. Don't create a `/queue` route — the root `(app)/+page.svelte` IS the dashboard+queue.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL validation | Custom regex | `z.string().url()` (Zod) | Handles edge cases (protocols, IDN, etc.) |
| Form handling | Custom form state management | SvelteKit form actions + `use:enhance` | Handles progressive enhancement, CSRF, redirect |
| DB queries | Raw SQL | Drizzle ORM query builder | Type-safe, parameterized, works with dual-driver |
| Date formatting | Custom date code | `Intl.DateTimeFormat` or `date.toLocaleDateString()` | Native browser API, no library needed |
| Toast notifications | Custom notification system | Simple Svelte store (if needed) | Small scope; can be a `$state` rune in layout |

**Key insight:** The codebase already has all the patterns needed. Phase 3 is an extension, not a new paradigm. Follow existing code in `persona.ts` and the persona routes almost exactly.

## Common Pitfalls

### Pitfall 1: Schema Mismatch Between architecture.md and Actual Schema

**What goes wrong:** The `architecture.md` describes a `postQueue` table with statuses `pending → drafting → drafted → ready → replied`, but CONTEXT.md decisions changed statuses to `new → in_progress → draft_ready → complete`. The actual `schema.ts` has NO queue table yet.
**Why it happens:** Architecture doc was written before user decisions.
**How to avoid:** Use CONTEXT.md status names (`new`, `in_progress`, `draft_ready`, `complete`), NOT architecture.md names. Add `archivedAt` column (soft delete). Schema must be added to the existing `schema.ts`.
**Warning signs:** If you see `pending`, `drafting`, `drafted`, `ready`, `replied` in code, you're using the old names.

### Pitfall 2: Scraper Service Doesn't Exist Yet

**What goes wrong:** Trying to call a scraper service that hasn't been built.
**Why it happens:** Architecture mentions it as a separate service; no env var, no service code exists yet.
**How to avoid:** Build a scraper client (`src/lib/server/services/scraper.ts`) with graceful degradation. When `SCRAPER_SERVICE_URL` env var is missing OR the service returns an error, the post is created with `postContent: null` and the user is shown a manual content paste fallback UI. The queue still works without scraping.
**Warning signs:** If adding a post fails when scraper is unavailable, the fallback isn't working.

### Pitfall 3: Persona Auto-Assignment Missing Edge Cases

**What goes wrong:** Platform is detected from URL, but user has no persona for that platform, or has multiple.
**Why it happens:** Not all platform values on personas map cleanly to URL-detected platforms.
**How to avoid:** Logic should be: (1) detect platform from URL, (2) find user's persona where `persona.platform === detectedPlatform`, (3) if none found or multiple found, use the user's default persona, (4) if no default persona, leave `personaId` as null. The user can always manually change persona.
**Warning signs:** Null pointer errors when looking up personas by platform.

### Pitfall 4: Dual-Driver Type Issues with Aggregation Queries

**What goes wrong:** `count(*)` and `groupBy` queries may have different return types between pg and neon-http drivers.
**Why it happens:** Prior decision [02-01] documented this: "Split list query into two queries instead of leftJoin for dual-driver type safety."
**How to avoid:** Use `sql<number>\`count(*)::int\`` to explicitly cast. Keep aggregation queries simple (no complex joins). Test both drivers.
**Warning signs:** Type errors in `getStatusCounts` when switching between local and production.

### Pitfall 5: Combined Page Route Collision

**What goes wrong:** Creating both `(app)/+page.svelte` (dashboard) and `(app)/queue/+page.svelte` (queue) as separate pages when they should be one.
**Why it happens:** Architecture.md shows separate routes; CONTEXT.md says combined single page.
**How to avoid:** The root `(app)/+page.svelte` IS the combined dashboard+queue. A `/queue/[id]` route exists only as a placeholder for Phase 4's chat page. No `/queue` list page.
**Warning signs:** Navigation leaves the dashboard when it shouldn't.

### Pitfall 6: Status Tab Navigation Causes Full Page Reload

**What goes wrong:** Status tabs use `<a href="?status=new">` which triggers full server roundtrip.
**Why it happens:** Default link behavior in SvelteKit.
**How to avoid:** Use `goto()` with `replaceState` from `$app/navigation`, or use `use:enhance` on a form with hidden status input. SvelteKit will do a client-side navigation + server load function without full reload.
**Warning signs:** Page flickers when switching status tabs.

## Code Examples

### Schema Extension for postQueue

```typescript
// Add to src/lib/server/db/schema.ts
// Source: follows existing patterns in persona.ts and architecture.md

export const postQueue = pgTable(
  "post_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id")
      .references(() => personas.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    platform: varchar("platform", { length: 50 }),
    postContent: text("post_content"),         // Scraped or manually entered
    postAuthor: varchar("post_author", { length: 255 }),
    status: varchar("status", { length: 50 }).default("new").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("post_queue_user_id_status_idx").on(table.userId, table.status),
    index("post_queue_user_id_created_at_idx").on(table.userId, table.createdAt),
  ],
);
```

### Zod Schema for Queue Input

```typescript
// src/lib/schemas/queue.ts
import { z } from "zod";

export const addPostSchema = z.object({
  url: z.string().trim().url("Please enter a valid URL"),
  personaId: z.string().uuid().optional().nullable(),
});

export type AddPostInput = z.infer<typeof addPostSchema>;

// Status type for type safety
export const postStatusEnum = z.enum(["new", "in_progress", "draft_ready", "complete"]);
export type PostStatus = z.infer<typeof postStatusEnum>;
```

### Scraper Client with Graceful Fallback

```typescript
// src/lib/server/services/scraper.ts
interface ScrapeResult {
  content: string;
  author?: string;
  platform?: string;
}

export async function scrapeUrl(
  scraperUrl: string,
  targetUrl: string,
): Promise<ScrapeResult | null> {
  try {
    const res = await fetch(`${scraperUrl}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

### Enhanced use:enhance with Toast Feedback

```svelte
<script lang="ts">
  import { enhance } from "$app/forms";

  let submitting = $state(false);
  let errorMessage = $state("");

  function handleSubmit() {
    submitting = true;
    errorMessage = "";
    return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
      submitting = false;
      if (result.type === "failure") {
        errorMessage = result.data?.error ?? "Something went wrong";
      } else {
        await update();
        // Form resets on success via SvelteKit default behavior
      }
    };
  }
</script>

<form method="POST" action="?/addPost" use:enhance={handleSubmit}>
  <input type="url" name="url" required disabled={submitting} placeholder="Paste a post URL..." />
  <button type="submit" disabled={submitting}>
    {submitting ? "Adding..." : "Add to queue"}
  </button>
</form>
{#if errorMessage}
  <p class="text-sm text-red-600">{errorMessage}</p>
{/if}
```

### Status Tabs with Client-Side Navigation

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  type StatusTab = { key: string; label: string; count: number };
  let { tabs, active }: { tabs: StatusTab[]; active: string } = $props();

  function selectTab(key: string) {
    const params = new URLSearchParams($page.url.searchParams);
    if (key === "all") {
      params.delete("status");
    } else {
      params.set("status", key);
    }
    goto(`?${params.toString()}`, { replaceState: true, noScroll: true });
  }
</script>

<div class="flex gap-1 border-b border-gray-200">
  {#each tabs as tab (tab.key)}
    <button
      onclick={() => selectTab(tab.key)}
      class="px-3 py-2 text-sm font-medium {active === tab.key
        ? 'border-b-2 border-gray-900 text-gray-900'
        : 'text-gray-500 hover:text-gray-700'}"
    >
      {tab.label}
      <span class="ml-1 text-xs text-gray-400">{tab.count}</span>
    </button>
  {/each}
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Svelte 4 stores (`writable`) | Svelte 5 runes (`$state`, `$derived`, `$effect`) | Svelte 5 (2024) | All components use runes; codebase already does this |
| SvelteKit `export let data` | `let { data } = $props()` | Svelte 5 (2024) | Props destructuring pattern; codebase already does this |
| Separate config file for Tailwind | `@tailwindcss/vite` plugin + CSS `@import` | Tailwind v4 (2025) | No `tailwind.config.ts` needed; codebase already uses this |
| `use:enhance` with custom `onResult` | `use:enhance` returning async callback | SvelteKit 2.x | Established pattern in codebase |

**Deprecated/outdated:**
- Architecture.md status names (`pending`, `drafting`, `drafted`, `ready`, `replied`): Replaced by user-decided names (`new`, `in_progress`, `draft_ready`, `complete`)
- Architecture.md separate `/queue` list page: Replaced by combined dashboard+queue on root `(app)` page

## Discretion Recommendations

These are areas where CONTEXT.md gave Claude's discretion. Here are research-backed recommendations:

### Table Styling and Responsive Behavior
**Recommendation:** Use a standard HTML `<table>` with Tailwind classes for the compact layout. On mobile (< 640px), switch to a card layout using a `hidden sm:table-cell` pattern on lower-priority columns (date, persona). Platform icon and status badge are always visible.
**Confidence:** HIGH — standard Tailwind responsive table pattern.

### Search Implementation
**Recommendation:** Client-side filtering with `$derived` for the search box. Posts are already loaded by the server load function. Filter on `postContent` and `url` fields. For large queues (>200 posts), consider adding a `search` URL param for server-side search, but start simple.
**Confidence:** HIGH — matches SvelteKit data flow.

### Status Badge Colors
**Recommendation:**
- `new`: `bg-blue-100 text-blue-700` — attention, action needed
- `in_progress`: `bg-amber-100 text-amber-700` — work happening
- `draft_ready`: `bg-green-100 text-green-700` — positive, ready for review
- `complete`: `bg-gray-100 text-gray-500` — done, de-emphasized
**Confidence:** HIGH — standard semantic color associations.

### Loading States
**Recommendation:** Use a simple "Loading..." text or a subtle pulse animation on the table area during status tab switches. SvelteKit's navigation loading is fast enough that skeleton UI is overkill. Use `$navigating` store from `$app/stores` to detect loading.
**Confidence:** MEDIUM — depends on actual DB query speed.

### Archive UI
**Recommendation:** Add a small "Show archived" toggle at the bottom of the queue table (or an "Archived" tab after "Complete"). Archived posts display in a muted style with an "Unarchive" action. Archive action on each row available via a small "..." overflow menu or swipe-to-archive on mobile.
**Confidence:** MEDIUM — user interaction pattern is discretionary.

### Error/Toast Notifications
**Recommendation:** Inline error messages near the quick-add form (not toasts) for form validation errors. For scraper failures, show an inline "Scraping failed — paste content manually" message with an expandable textarea. No separate toast system needed for Phase 3.
**Confidence:** HIGH — simpler is better; codebase has no toast system yet.

### Platform Icons and Detection
**Recommendation:** Use simple colored circles (existing `platformStyles` pattern in `src/lib/utils/platform.ts`) rather than SVG icons. Detection patterns:
- `twitter.com`, `x.com` → twitter
- `linkedin.com` → linkedin
- `reddit.com`, `old.reddit.com` → reddit
- Everything else → null (no platform)
**Confidence:** HIGH — extends existing pattern.

## Open Questions

1. **Scraper service availability**
   - What we know: Architecture says it runs separately (Playwright + Node.js), exposes REST API. No code or env var exists yet.
   - What's unclear: Will the scraper service be built before/during/after Phase 3?
   - Recommendation: Build the scraper client with graceful fallback. If `SCRAPER_SERVICE_URL` is not set, skip scraping entirely and let the user paste content. This means Phase 3 works standalone.

2. **Post content storage for scraper retry**
   - What we know: CONTEXT.md says "retry automatically; if it keeps failing, fall back to manual."
   - What's unclear: Should retry be synchronous (during form submission) or asynchronous (background job)?
   - Recommendation: Synchronous with a single retry. On first failure, retry once. If still failing, create the post with `postContent: null` and show manual paste UI in the queue table row. Background retry would need a job system that doesn't exist.

3. **Recent activity data for dashboard**
   - What we know: Dashboard should show "last few status changes."
   - What's unclear: There's no audit log or activity table in the current schema. The `updatedAt` column exists but doesn't capture what changed.
   - Recommendation: For Phase 3, derive "recent activity" from the queue itself: recently added posts (sorted by `createdAt`). True status-change history would need an activity log table — defer that to Phase 4 when statuses actually start changing. Show "Recently added" as the activity feed.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** — `src/lib/server/services/persona.ts`, `src/lib/server/services/voice.ts` (service factory patterns)
- **Existing codebase** — `src/lib/server/db/schema.ts` (current schema, no postQueue table yet)
- **Existing codebase** — `src/routes/(app)/personas/[id]/+page.server.ts` (form actions pattern)
- **Existing codebase** — `src/lib/utils/platform.ts` (platform styles, to be extended with URL detection)
- **Existing codebase** — `src/lib/schemas/persona.ts` (Zod validation pattern)
- **Existing codebase** — `src/auth.ts` (Auth.js session pattern via `event.locals.auth()`)
- **Architecture document** — `architecture.md` (planned postQueue schema, scraper service design)

### Secondary (MEDIUM confidence)
- **CONTEXT.md decisions** — Status names, queue flow, dashboard layout (user decisions, locked)
- **Prior decisions** — Dual DB driver, InferSelectModel typing, per-request DB factory

### Tertiary (LOW confidence)
- None — all findings are based on direct codebase investigation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all patterns established in codebase
- Architecture: HIGH — direct extension of existing service factory + form action patterns
- Schema: HIGH — follows existing Drizzle patterns, only adds one new table
- Pitfalls: HIGH — identified from actual codebase discrepancies (schema vs architecture.md)
- Scraper integration: MEDIUM — scraper service doesn't exist yet, but fallback pattern is clear

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable — no fast-moving dependencies)
