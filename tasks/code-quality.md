# Code Quality Review

Date: 2026-02-22

---

## 1. DRY Violations

### 1.1 DATABASE_URL Resolution Pattern (Critical)

The same 3-line pattern for resolving the database URL is copy-pasted across **17+ locations**:

```typescript
const databaseUrl =
  event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
const db = await getDb(databaseUrl);
```

Files with this pattern:
- `/home/dev/work/ez-social/src/auth.ts` (line 18)
- `/home/dev/work/ez-social/src/routes/(app)/+layout.server.ts` (lines 14-16)
- `/home/dev/work/ez-social/src/routes/(app)/personas/+page.server.ts` (lines 11-12)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/+page.server.ts` (lines 13-14)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/calibrate/+page.server.ts` (lines 13-14)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/calibrate/+server.ts` (lines 134-135, 223-224)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/refine/+page.server.ts` (lines 13-14)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/voice/+server.ts` (lines 149-150, 324-325)
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/+page.server.ts` (lines 14-16)
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/chat/+server.ts` (lines 41-43)
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/drafts/+server.ts` (lines 29-30)
- `/home/dev/work/ez-social/src/routes/(app)/settings/model/+server.ts` (lines 27-28)
- `/home/dev/work/ez-social/src/routes/(auth)/register/+page.server.ts` (lines 40-42)
- `/home/dev/work/ez-social/src/routes/(app)/personas/new/+page.server.ts` (lines 26-28)
- `/home/dev/work/ez-social/src/lib/server/services/index.ts` (lines 10-12)

The centralized `getServices()` barrel in `/home/dev/work/ez-social/src/lib/server/services/index.ts` already encapsulates this, but most routes bypass it and do the resolution manually.

**Recommendation**: Consolidate all routes to use `getServices()` from the barrel, or extract a `resolveDb(event)` helper.

### 1.2 ANTHROPIC_API_KEY Resolution (Moderate)

Same pattern repeated in 3 `+server.ts` files:

```typescript
const apiKey =
  platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
if (!apiKey) {
  return new Response(
    JSON.stringify({ error: "AI features are not available..." }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}
```

Files:
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/chat/+server.ts` (lines 135-142)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/voice/+server.ts` (lines 138-145)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/calibrate/+server.ts` (lines 124-131)

**Recommendation**: Extract into `getServices()` or a dedicated `getAnthropicKey(event)` helper.

### 1.3 `deepMerge` Duplicated Across Files (High)

The exact same `deepMerge` function is defined in two files:
- `/home/dev/work/ez-social/src/lib/server/chat-prompt.ts` (lines 28-53)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/calibrate/+server.ts` (lines 17-42)

Both are identical recursive object mergers.

**Recommendation**: Extract to `$lib/utils/object.ts` and import from both locations.

### 1.4 `SIGNAL_LABEL` and Voice Formatting Duplicated (High)

The `SIGNAL_LABEL` map and related voice profile formatting functions are duplicated:
- `/home/dev/work/ez-social/src/lib/server/chat-prompt.ts` (lines 55-59, 62-68, 71-119)
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/calibrate/+server.ts` (lines 44-57, 60-94)

While the formatting differs slightly (one includes `(${p.evidence})`, the other does not), both share the same `SIGNAL_LABEL` and structural approach.

**Recommendation**: Extract `SIGNAL_LABEL` and the base formatting logic into `$lib/server/voice-format.ts`.

### 1.5 Local `getServices()` Functions (Moderate)

Two route files define their own local `getServices()` functions instead of using the barrel:
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/+page.server.ts` (lines 9-19) -- returns persona + voice
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/+page.server.ts` (lines 11-24) -- returns queue + persona + voice + chat + draft

These duplicate the DB resolution pattern and service creation from the central barrel.

### 1.6 `validStatuses` Array Duplicated (Low)

The status validation array is defined identically in two places:
- `/home/dev/work/ez-social/src/routes/(app)/+page.server.ts` (line 143)
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/+page.server.ts` (line 139)

Both: `const validStatuses = ["new", "in_progress", "draft_ready", "complete"];`

**Recommendation**: Define in `$lib/schemas/queue.ts` as a constant and import.

### 1.7 `updateContent` and `updateStatus` Action Duplication (Moderate)

The `updateContent` form action handler is nearly identical in:
- `/home/dev/work/ez-social/src/routes/(app)/+page.server.ts` (lines 69-85)
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/+page.server.ts` (lines 111-127)

The `updateStatus` action is similarly duplicated between the same two files.

### 1.8 `(app)/+layout.server.ts` Double DB Init (Minor)

`/home/dev/work/ez-social/src/routes/(app)/+layout.server.ts` calls both `getDb()` directly (line 16) AND `getServices(event)` (line 18), resulting in two separate DB connections per request:

```typescript
const db = await getDb(databaseUrl);       // connection 1
const { queue, persona } = await getServices(event);  // connection 2 (inside getServices)
```

The `db` instance is used to query `users.preferredModel`, while `getServices` creates its own DB for queue/persona.

---

## 2. Type Safety Issues

### 2.1 `(db as any)` Cast in models.ts (High)

`/home/dev/work/ez-social/src/lib/server/models.ts`, line 48:

```typescript
export async function getUserPreferredModel(
  db: { select: Function },   // line 45: loose `Function` type
  userId: string,
): Promise<ModelId> {
  const row = await (db as any)  // line 48: explicit any cast
    .select({ preferredModel: users.preferredModel })
    .from(users)
    .where(eq(users.id, userId))
    .then((r: { preferredModel: string | null }[]) => r[0]);
```

The `db` parameter uses the loose `Function` type for its `select` property (line 45), then casts to `any` to chain Drizzle methods. This is the only production `as any` in the codebase.

**Recommendation**: Use the proper Drizzle DB type: `type Db = Awaited<ReturnType<typeof getDb>>;` (the same pattern used in all service files).

### 2.2 `new Function()` Constructor in db/index.ts (Intentional but Fragile)

`/home/dev/work/ez-social/src/lib/server/db/index.ts`, line 22:

```typescript
const dynamicImport = new Function("mod", "return import(mod)");
```

This uses `new Function()` to hide dynamic imports from Cloudflare's bundler. While documented with a comment explaining why, it:
- Bypasses TypeScript type checking entirely
- Could break with CSP policies
- Returns `any` from the dynamic imports (lines 23-25)

### 2.3 Loose `unknown` for Voice Profiles (Moderate)

Throughout the codebase, voice profiles are typed as `unknown` and cast inline:

- `/home/dev/work/ez-social/src/lib/server/services/persona.ts` line 66: `let voiceProfile: unknown = null;`
- `/home/dev/work/ez-social/src/lib/server/chat-prompt.ts` lines 183-185: `(activeVoice.extractedProfile as Record<string, unknown>)`
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/calibrate/+server.ts` lines 147-150: cast to `Record<string, unknown>`

A `VoiceProfile` type exists in `$lib/schemas/voice-profile.ts` but is not used at the DB layer or service return types.

### 2.4 `as any` in Test Files (Low - Acceptable)

Multiple `as any` casts in test files for mocking purposes:
- `/home/dev/work/ez-social/src/lib/server/services/queue.test.ts` (lines 168-169, 279-285, etc.)
- `/home/dev/work/ez-social/src/lib/server/services/chat.test.ts` (line 38)
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/drafts/server.test.ts` (line 55)
- `/home/dev/work/ez-social/src/routes/(app)/server.test.ts` (line 62)

These are typical for mock objects and acceptable, though typed mock factories would be cleaner.

---

## 3. Error Handling Inconsistencies

### 3.1 `new Response()` vs SvelteKit `error()` / `fail()` (High)

The codebase uses two incompatible error response patterns:

**Pattern A - SvelteKit `error()` / `fail()` (page server files):**

Used in `+page.server.ts` files:
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/+page.server.ts` line 28: `error(401, "Unauthorized")`
- Same file line 34: `error(404, "Post not found")`
- All `+page.server.ts` actions use `fail(401, { error: "Unauthorized" })`

**Pattern B - Raw `new Response()` (API server files):**

Used in `+server.ts` files:
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/chat/+server.ts` line 23: `new Response("Unauthorized", { status: 401 })`
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/drafts/+server.ts` lines 16, 24, 47, etc.
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/voice/+server.ts` lines 88, 103, etc.
- `/home/dev/work/ez-social/src/routes/(app)/personas/[id]/calibrate/+server.ts` lines 104, 111, etc.
- `/home/dev/work/ez-social/src/routes/(app)/settings/model/+server.ts` lines 13, 20, 24

Some `+server.ts` endpoints return plain text errors (`new Response("Unauthorized")`), others return JSON (`Response.json({ success: true })`), and the API key checks return JSON-serialized error objects with `Content-Type` headers. There is no consistent error envelope.

**Specific inconsistencies:**
- Auth errors: plain text "Unauthorized" in server routes, `fail(401, { error: "Unauthorized" })` in page actions
- Validation errors: some return plain text, some return JSON
- The `architecture.md` documents an `AppError` class and `handleApiError()` function that do not exist in the codebase
- The 503 API-key error returns JSON with `Content-Type` header but other errors return plain text with no content type

### 3.2 Missing Error Handling for `getDb` Failures

No route handler wraps `await getDb(databaseUrl)` in a try-catch. If the database URL is empty string (the `?? ""` fallback), the neon driver will throw at connection time with an opaque error rather than a clean 503.

### 3.3 Fire-and-Forget Async Errors

Several places use fire-and-forget patterns that silently swallow errors:
- `/home/dev/work/ez-social/src/routes/(app)/queue/[id]/drafts/+server.ts` line 70-71: `queueService.updateStatus(...).catch(...)`
- Same file line 113-122: `draftService.saveFeedback(...).catch(...)`

These are logged but could silently fail to update status or save feedback.

---

## 4. Dead Code and Stale References

### 4.1 Tauri / `src-tauri` References (Stale)

The `src-tauri/` directory does not exist, yet it is referenced extensively:

- `/home/dev/work/ez-social/architecture.md`: lines 9-10 (Tauri described as active build target), lines 75-76, 165-169 (`src-tauri/` in project tree), lines 689-693, 1119, 1179-1190
- `/home/dev/work/ez-social/AGENTS.md`: line 17 (`bun run tauri dev`/`bun run tauri build`), line 41 (`src-tauri/` listed), line 50 (adapter-static for Tauri)

No `tauri` scripts exist in `package.json`. No `@tauri-apps/*` dependencies are installed. The Tauri desktop build target has been fully removed but documentation references remain.

### 4.2 `src/routes/api/` Directory Reference (Stale)

`architecture.md` (lines 145-162) documents an extensive REST API under `src/routes/api/` with endpoints for auth, personas, voice-profiles, queue, and health. This directory does not exist. The actual API routes live under `src/routes/(app)/` as SvelteKit server files (`+server.ts`).

`AGENTS.md` line 40 also references `src/routes/api/` as "REST API endpoints."

### 4.3 Referenced Files That Don't Exist

Architecture doc references these files/patterns that don't exist:
- `$lib/config.ts` (line 80-85) -- no such file
- `$lib/server/errors.ts` with `AppError` class (lines 772-799) -- no such file
- `$lib/server/utils/retry.ts` with `withRetry` (lines 806-825) -- no such file
- `$lib/server/logger.ts` (lines 1017-1042) -- no such file
- `$lib/api.ts` (lines 707-737) -- no such file
- `$lib/utils.ts` (line 118) -- utilities are split across `$lib/utils/format.ts`, `$lib/utils/platform.ts`, `$lib/utils/draft.ts`
- `$lib/types/index.ts` (line 116) -- no such file
- `src/hooks.server.ts` as documented (lines 633-661) -- the actual hook is in `src/auth.ts` using Auth.js
- `src/lib/server/db/migrate.ts` (line 97) -- no such file
- `$lib/server/opencode.ts` (line 107) -- no such file; the app uses `@ai-sdk/anthropic` directly

### 4.4 Schema Drift: Architecture vs Actual

The architecture doc's schema (lines 350-472) describes:
- `voiceProfiles` table -- actual table is `voiceProfileVersions`
- `platformAccounts` table -- does not exist in actual schema
- `drafts` table -- does not exist; replaced by `chatMessages` + `draftEdits` + `draftFeedback`
- `auditLog` table -- does not exist; replaced by `aiUsageLog`
- No `writingSamples` table -- exists in actual schema but not documented
- No `chatMessages` table -- exists in actual schema but not documented
- No `draftEdits` table -- exists in actual schema but not documented
- No `draftFeedback` table -- exists in actual schema but not documented
- No `aiUsageLog` table -- exists in actual schema but not documented

The `users` table schema also differs: the actual schema uses Auth.js fields (`email`, `emailVerified`, `image`, `preferredModel`) while the doc shows the old Lucia pattern (`username`, `passwordHash` only).

### 4.5 Auth System Drift

Architecture describes custom Lucia-pattern session auth with manual session management. The actual codebase uses `@auth/sveltekit` (Auth.js) with JWT strategy, Drizzle adapter, and Credentials provider. The sessions table schema differs (architecture: `id` PK with `expiresAt`; actual: `session_token` PK with `expires`).

### 4.6 OpenCode SDK References

Architecture mentions "OpenCode SDK" throughout (13+ references). The actual codebase uses `@ai-sdk/anthropic` (Vercel AI SDK) with no `opencode` dependency.

### 4.7 Unused Import: `error` in `+page.server.ts`

`/home/dev/work/ez-social/src/routes/(app)/queue/[id]/+page.server.ts` line 1 imports `error` from `@sveltejs/kit`, but it is the only route file using SvelteKit's `error()` throw in load functions. This is not dead code per se, but highlights inconsistency -- all other routes use `redirect` for auth failures instead of `error(401)`.

---

## 5. Test Coverage Gaps

### 5.1 Service Files vs Test Files

| Service File | Test File | Status |
|---|---|---|
| `services/queue.ts` | `services/queue.test.ts` | Covered |
| `services/persona.ts` | `services/persona.test.ts` | Covered |
| `services/chat.ts` | `services/chat.test.ts` | Covered |
| `services/draft.ts` | `services/draft.test.ts` | Covered |
| `services/scraper.ts` | `services/scraper.test.ts` | Covered |
| `services/voice.ts` | `services/voice.test.ts` | Covered |

All service files have co-located unit tests.

### 5.2 Route Handler Coverage

| Route | Test File | Status |
|---|---|---|
| `(app)/+page.server.ts` | `(app)/server.test.ts` | Partial (covers dashboard load + addPost) |
| `(app)/queue/[id]/drafts/+server.ts` | `queue/[id]/drafts/server.test.ts` | Covered |
| `(app)/queue/[id]/chat/+server.ts` | None | **Missing** |
| `(app)/queue/[id]/+page.server.ts` | None | **Missing** |
| `(app)/personas/[id]/voice/+server.ts` | None | **Missing** |
| `(app)/personas/[id]/calibrate/+server.ts` | None | **Missing** |
| `(app)/personas/[id]/+page.server.ts` | None | **Missing** |
| `(app)/personas/+page.server.ts` | None | **Missing** |
| `(app)/personas/new/+page.server.ts` | None | **Missing** |
| `(app)/settings/model/+server.ts` | None | **Missing** |
| `(app)/share/+page.server.ts` | None | **Missing** |
| `(auth)/register/+page.server.ts` | None | **Missing** |
| `(auth)/login/+page.server.ts` | None | **Missing** |

**10 out of 13 route handlers have no unit tests.** Only the dashboard and drafts routes have test files.

### 5.3 Other Coverage

| Module | Test | Status |
|---|---|---|
| `server/chat-prompt.ts` | `server/chat-prompt.test.ts` | Covered |
| `server/models.ts` | `server/models.test.ts` | Covered |
| `schemas/persona.ts` | `schemas/persona.test.ts` | Covered |
| `schemas/voice-profile.ts` | `schemas/voice-profile.test.ts` | Covered |
| `utils/format.ts` | `utils/format.test.ts` | Covered |
| `utils/draft.ts` | `utils/draft.test.ts` | Covered |
| `stores/toast.ts` | `stores/toast.test.ts` | Covered |
| `utils/platform.ts` | None | **Missing** |
| `stores/theme.ts` | None | **Missing** |
| `server/auth/password.ts` | None | **Missing** |
| `auth.ts` (Auth.js config) | None | **Missing** |

### 5.4 E2E Tests

8 E2E spec files exist in `/home/dev/work/ez-social/e2e/`:
- `dark-mode.spec.ts`
- `token-cost.spec.ts`
- `prompt-refine-voice.spec.ts`
- `auto-generate.spec.ts`
- `quick-add-toast.spec.ts`
- `quick-add-persona.spec.ts`
- `copy-draft.spec.ts`
- `hotkeys.spec.ts`

No E2E test for registration, login, persona CRUD, or the complete voice extraction flow.

---

## 6. Architecture Doc Drift

`/home/dev/work/ez-social/architecture.md` is severely out of date. Key discrepancies:

### 6.1 Major Structural Changes Not Reflected

| Area | Architecture Says | Reality |
|---|---|---|
| Auth system | Custom Lucia session auth | Auth.js with JWT + Credentials provider |
| AI SDK | "OpenCode SDK" | Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) |
| Desktop | Tauri v2 dual-build strategy | Tauri removed entirely |
| API routes | REST under `src/routes/api/` | SvelteKit form actions + `+server.ts` under `(app)/` |
| Draft system | Separate `drafts` table with versions | Chat-based (`chatMessages` + `draftEdits` + `draftFeedback`) |
| Schema | 7 tables | 11 tables (completely different set) |
| Scraping | External Node.js/Playwright service | Cloudflare Puppeteer (`@cloudflare/puppeteer`) + Twitter API |
| Error handling | `AppError` class + `handleApiError()` | None -- raw `new Response()` |
| Logging | Structured `$lib/server/logger.ts` | Raw `console.error()` calls |

### 6.2 Files Referenced But Missing

See section 4.3 above. At least 10 files referenced in the architecture doc do not exist.

### 6.3 Recommendation

The architecture doc needs a complete rewrite. It describes a substantially different application from what exists. It is more misleading than helpful for a new contributor.

---

## 7. Svelte 5 Patterns

### 7.1 Runes Usage (Good)

All components consistently use Svelte 5 runes:
- `$props()` for component inputs (every component checked)
- `$state()` for local reactive state
- `$derived()` for computed values
- `$effect()` used sparingly and appropriately (auto-scroll in ChatInterface, persona field sync)
- `$derived.by()` used for complex derivations (VoiceProfileDisplay line 28)

No Svelte 4 legacy patterns (`export let`, `$:` reactive statements) were found in `.svelte` files.

### 7.2 Snippet Pattern for Children (Good)

Layout components correctly use `Snippet` type for children:
- `/home/dev/work/ez-social/src/routes/(app)/+layout.svelte` line 10: `children: Snippet`
- `/home/dev/work/ez-social/src/routes/(auth)/+layout.svelte` line 5: `children: Snippet`
- Root layout uses `{@render children()}` pattern

### 7.3 Legacy Store Usage (Minor)

Two stores use Svelte 4 `writable()` from `svelte/store`:
- `/home/dev/work/ez-social/src/lib/stores/toast.ts` -- writable store pattern
- `/home/dev/work/ez-social/src/lib/stores/theme.ts` -- writable store with `subscribe`

These are global singleton stores. While `writable` still works in Svelte 5, they could be migrated to `$state` rune-based stores for consistency. The theme store's `subscribe` pattern (line 42) is particularly non-idiomatic for Svelte 5.

### 7.4 `$page` Store Usage in Error Page (Acceptable)

`/home/dev/work/ez-social/src/routes/+error.svelte` uses `$page` from `$app/stores` (Svelte 4 pattern). This is the standard SvelteKit error page pattern and is acceptable.

### 7.5 Component Structure Quality (Good)

Components follow good patterns:
- Props are typed with inline TypeScript interfaces
- Components are organized by feature (`chat/`, `persona/`, `queue/`)
- Pages are thin -- they delegate to feature components
- `{#key}` used correctly for forced remounting (`queue/[id]/+page.svelte` line 106)

### 7.6 Accessibility Issues (Minor)

- `/home/dev/work/ez-social/src/routes/(app)/+layout.svelte` line 133: `<!-- svelte-ignore a11y_no_static_element_interactions -->` suppresses an accessibility warning on the modal backdrop `<div>`. The `onkeydown={() => {}}` on line 139 is a no-op handler added solely to satisfy the linter, which is a code smell.

---

## Summary of Priority Actions

| Priority | Issue | Impact |
|---|---|---|
| **P0** | Architecture doc completely stale | Misleading for contributors |
| **P0** | DATABASE_URL resolution duplicated 17x | DRY violation, maintenance burden |
| **P1** | `deepMerge` + `SIGNAL_LABEL` duplicated | DRY violation, divergence risk |
| **P1** | `(db as any)` + `Function` type in models.ts | Type safety hole |
| **P1** | Inconsistent error responses (text vs JSON) | API contract unclear |
| **P1** | 10/13 route handlers untested | Coverage gap |
| **P2** | ANTHROPIC_API_KEY resolution duplicated 3x | DRY violation |
| **P2** | `validStatuses` duplicated | DRY violation, divergence risk |
| **P2** | Tauri references in AGENTS.md | Stale documentation |
| **P2** | Local `getServices()` functions in route files | Inconsistent patterns |
| **P2** | Double DB connection in `(app)/+layout.server.ts` | Wasted resources |
| **P3** | Legacy writable stores | Svelte 5 migration incomplete |
| **P3** | Missing tests for platform.ts, theme.ts, password.ts | Low-risk gaps |
| **P3** | No-op keydown handler on modal | Accessibility code smell |
