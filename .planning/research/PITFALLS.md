# Pitfalls Research

**Domain:** AI-powered social media reply tool (SvelteKit + Cloudflare Workers + Neon DB)
**Researched:** 2026-02-17
**Confidence:** HIGH (most findings verified via official docs)

## Critical Pitfalls

### Pitfall 1: Neon DB Cold Starts Kill First-Request UX

**What goes wrong:**
Neon serverless computes auto-suspend after a period of inactivity (default 5 minutes on free tier). The first request after suspension triggers a "cold start" that adds 500ms-3s of latency while the compute wakes up. For a chat app where users expect instant responses, this creates a jarring experience — the user pastes a URL, clicks "Generate Draft," and waits 2-3 seconds just for the database to wake up before the AI generation even begins.

**Why it happens:**
Neon's serverless model suspends idle computes to save costs. The HTTP driver (`neon-http`) used on Workers doesn't maintain persistent connections, so every request after a cold period pays this penalty. Developers often test with warm databases and never experience this during development.

**How to avoid:**
- Use Neon's `scale_to_zero: false` option on production projects (paid plan feature) to keep the compute always warm.
- On free tier: implement a cron-based "keepalive" — a Cloudflare Workers Cron Trigger that pings the database every 4 minutes with `SELECT 1`.
- Show a loading skeleton immediately on the client before the database responds.
- Cache frequently-accessed data (user session, persona list) in Cloudflare KV to avoid DB hits on common reads.

**Warning signs:**
- P50 latency is fine but P99 is 10x higher — classic cold-start distribution.
- Users report "first action is slow, then everything is fast."
- Monitoring shows database connection times spiking at regular intervals.

**Phase to address:**
Phase 1 (Foundation) — set up the cron keepalive from day one. Don't wait until users complain.

---

### Pitfall 2: Cloudflare Workers 128MB Memory Limit With AI Response Buffering

**What goes wrong:**
Workers have a hard 128MB memory limit per isolate. When generating AI drafts, if the response is buffered entirely in memory (common with SDK wrappers that return full response strings), combined with the voice profile JSONB data, prompt construction, and concurrent requests sharing an isolate, you can exceed this limit. The Worker returns a cryptic "Error 1102: Worker exceeded resource limits" with no indication it was a memory issue.

**Why it happens:**
Developers build and test locally where memory is unlimited. The 128MB limit is per-isolate (shared across concurrent requests on the same isolate), not per-request. Large voice profile JSONB objects (potentially 50-100KB each) multiplied by concurrent users can stack up fast.

**How to avoid:**
- Stream AI responses using `TransformStream` or `ReadableStream` — never buffer the full AI response before sending to client.
- Keep voice profiles lean: store only extracted patterns (tone keywords, sentence structure rules, vocabulary), not raw sample texts. The `sampleTexts` field in the schema should be capped.
- Set explicit limits on `extractedStyle` JSONB size (max 20KB).
- Monitor memory usage via Cloudflare DevTools profiling before deployment.

**Warning signs:**
- Sporadic "Error 1102" in Cloudflare dashboard under Invocation Statuses > Exceeded Memory.
- Errors correlate with peak traffic (more concurrent requests per isolate).
- Large voice profiles work fine in dev but fail in production.

**Phase to address:**
Phase 2 (AI Integration) — design the streaming architecture and voice profile size constraints before building the draft generation pipeline.

---

### Pitfall 3: Drizzle ORM neon-http Driver Cannot Do Interactive Transactions

**What goes wrong:**
The `neon-http` driver (used on Workers because TCP isn't available) does NOT support interactive/session-based transactions. You can do single queries and Neon's `transaction()` function for batched non-interactive transactions, but you cannot do `BEGIN; ... multiple dependent queries ... COMMIT;` where later queries depend on earlier results. This breaks patterns like "read current max draft version, then insert version+1" if done naively.

**Why it happens:**
HTTP is stateless. Each `neon()` call is an independent HTTP request. There's no persistent connection to maintain transaction state. The Neon docs explicitly state: "HTTP is faster for single, non-interactive transactions" and "If you require session or interactive transaction support, use WebSockets." But WebSockets require a persistent connection that Workers can't maintain across requests.

**How to avoid:**
- Use PostgreSQL's `INSERT ... SELECT` patterns to make operations atomic in a single statement: `INSERT INTO drafts (post_id, version, content) SELECT post_id, COALESCE(MAX(version), 0) + 1, $content FROM drafts WHERE post_id = $postId`.
- Use Neon's `sql.transaction()` for non-interactive batched operations (multiple independent queries in one HTTP round-trip).
- For truly complex multi-step operations, use database functions (stored procedures) called via a single query.
- Use `UNIQUE` constraints and `ON CONFLICT` clauses defensively — the schema already has `uniqueIndex('drafts_post_id_version_idx')` which is good.

**Warning signs:**
- Race conditions in draft versioning (two concurrent generates produce same version number).
- Code that looks like `const maxVersion = await db.select()...` followed by `await db.insert({ version: maxVersion + 1 })` — this is a TOCTOU bug.
- Tests pass locally with `node-postgres` (which supports transactions) but fail in production.

**Phase to address:**
Phase 1 (Foundation) — establish the data access patterns and atomic query strategies before building any feature logic.

---

### Pitfall 4: AI Token Costs Spiral Without Rate Limiting and Prompt Size Controls

**What goes wrong:**
Without per-user rate limits on draft generation, a single user (or abuse) can trigger hundreds of AI generations, each consuming tokens. Voice profiles that include full sample texts get stuffed into every prompt, bloating token counts. A voice profile with 50 sample tweets (say 5,000 tokens) + the original post (500 tokens) + system prompt (500 tokens) = 6,000 tokens per request. At 100 regenerations/day across 50 users, that's 30M input tokens/month — potentially hundreds of dollars.

**Why it happens:**
Developers focus on "does it work" not "what does it cost." The regenerate button is easy to spam. Voice profiles have no size caps in the schema (JSONB has no inherent limit). Prompt engineering happens after MVP, by which time bad patterns are baked in.

**How to avoid:**
- Implement per-user, per-day generation limits from Phase 1 (e.g., 50 generations/day).
- Store rate limit counters in Cloudflare KV (not in-memory — Workers are stateless).
- Cap voice profile prompt contribution to ~2,000 tokens. Store a "prompt-ready" summary separate from raw extracted data.
- Log token usage per generation in the `drafts` table (add `tokens_used` column).
- Set hard `max_tokens` on the AI API call (e.g., 500 tokens for a social reply).
- Show estimated cost/remaining quota to users in the UI.

**Warning signs:**
- AI API bill spikes without corresponding user growth.
- Single users with 50+ drafts per post.
- Average prompt size exceeds 3,000 tokens.

**Phase to address:**
Phase 2 (AI Integration) — bake rate limiting and prompt size controls into the initial AI integration, not as an afterthought.

---

### Pitfall 5: Session Auth on Stateless Workers — Session Validation Queries on Every Request

**What goes wrong:**
The architecture calls `validateSession(token)` in `hooks.server.ts` for every single request. This means every page load, every API call, every asset request that hits the Worker performs a database round-trip to check the session. With Neon HTTP driver, each session check is a separate HTTP request to Neon, adding 20-50ms latency to every request. For a page that loads data from 3 endpoints, that's 3 redundant session checks.

**Why it happens:**
Cloudflare Workers have no in-memory state between requests (isolates can be reused but you can't depend on it). Traditional session auth relies on in-memory caches (Redis, process memory) — none available on Workers. The Lucia pattern shown in the architecture validates against the DB every time.

**How to avoid:**
- Use Cloudflare KV as a session cache: on first validation, write `session:token → userId` to KV with a TTL matching session expiry. Check KV first, fall back to DB. KV reads are ~5ms vs ~30ms for Neon HTTP.
- Use short-lived JWTs (15-min expiry) alongside DB sessions for stateless validation. The JWT contains the userId — no DB check needed unless the JWT is expired, at which point you check the DB session and issue a new JWT.
- Ensure `hooks.server.ts` skips session validation for static assets and public routes (`/api/health`, `/login`, `/register`).
- The session sliding window update (extending expiry on use) should NOT happen on every request — batch it or only update if >50% through the window.

**Warning signs:**
- Neon dashboard shows the most frequent query is `SELECT ... FROM sessions JOIN users`.
- P50 response time is 60-80ms higher than expected.
- DB connection count scales linearly with page views, not users.

**Phase to address:**
Phase 1 (Foundation) — implement KV-backed session caching or JWT hybrid from the start. Retrofitting auth is painful.

---

### Pitfall 6: SvelteKit adapter-cloudflare `platform.env` Access Pattern Confusion

**What goes wrong:**
On Cloudflare Workers, environment variables (secrets) are NOT available via `process.env` — they're on `event.platform.env`. Developers write code that works in local dev (where `process.env` is available) but breaks in production. The architecture doc shows the correct pattern (`event.platform?.env?.DATABASE_URL ?? process.env.DATABASE_URL`) but this pattern must be consistently applied everywhere, and it's easy to miss one spot.

**Why it happens:**
SvelteKit's `$env/static/private` and `$env/dynamic/private` modules abstract this correctly, but only for values known at build time or configured in the adapter. For runtime secrets like `DATABASE_URL` that come from `wrangler secret`, you must use `event.platform.env`. The `nodejs_compat` flag doesn't make `process.env` work for Wrangler secrets.

**How to avoid:**
- Use SvelteKit's `$env/dynamic/private` for environment variables wherever possible — it handles the platform abstraction.
- For database connections: initialize the DB client in `hooks.server.ts` using `event.platform.env` and pass it via `event.locals` (the architecture already does this correctly — maintain this pattern rigorously).
- Never import `process.env.DATABASE_URL` directly in any `$lib/server/` module.
- Add a CI check that greps for `process.env.DATABASE_URL` in server code (should only appear in drizzle.config.ts and local-only files).
- Test with `wrangler dev` (not just `bun run dev`) before deploying.

**Warning signs:**
- Works with `bun run dev`, fails with `wrangler dev` or after `wrangler deploy`.
- Error: "DATABASE_URL is undefined" in production logs.
- Some endpoints work, others don't (inconsistent `platform.env` usage).

**Phase to address:**
Phase 1 (Foundation) — establish the env access pattern in hooks.server.ts once and enforce it. The architecture doc has the right pattern — don't deviate.

---

## Moderate Pitfalls

### Pitfall 7: Tailwind CSS v4 Breaking Changes From v3 Muscle Memory

**What goes wrong:**
Tailwind v4 has significant breaking changes that catch developers with v3 experience. The most impactful for this project: (1) `@tailwind base/components/utilities` directives are replaced by `@import "tailwindcss"`. (2) Default border color changed from `gray-200` to `currentColor` — every `border` utility without an explicit color will look different. (3) `shadow-sm` is now `shadow-xs`, `rounded-sm` is now `rounded-xs`, `ring` is now `ring-3`. (4) `@apply` in Svelte `<style>` blocks requires `@reference` import. (5) `outline-none` renamed to `outline-hidden`.

**How to avoid:**
- The architecture already shows the correct v4 setup (`@import 'tailwindcss'` in app.css, `@tailwindcss/vite` plugin). Start fresh with v4 patterns — don't port v3 code.
- Always specify border colors explicitly: `border border-gray-200` not just `border`.
- Use the v4 utility names from the start. Keep the [upgrade guide](https://tailwindcss.com/docs/upgrade-guide) bookmarked.
- For any `@apply` usage in Svelte component `<style>` blocks, add `@reference "../../app.css"` at the top — or better, avoid `@apply` entirely and use utility classes in templates.

**Warning signs:**
- Borders appearing as black lines instead of light gray.
- Shadows/rounded corners looking different than expected.
- `@apply` not working in component `<style>` blocks.

**Phase to address:**
Phase 1 (Foundation) — set up the CSS foundation correctly. Run `npx @tailwindcss/upgrade` if importing any v3 component libraries.

---

### Pitfall 8: Voice Profile Extraction Garbage-In-Garbage-Out

**What goes wrong:**
Voice profile quality is entirely dependent on the quality and quantity of input samples. Users who provide 3 short tweets get a useless voice profile that produces generic AI-sounding drafts. Users who provide samples from different contexts (formal blog posts mixed with casual tweets) get a confused profile. The AI extraction may hallucinate patterns that don't exist in small sample sets.

**How to avoid:**
- Set minimum sample requirements: at least 10 samples, at least 500 total words for a platform voice profile.
- Validate sample quality before extraction: detect if samples are too short, too similar (copy-paste), or mixed-language.
- Platform-separate voice profiles (the schema already supports this with `voiceProfiles` per platform) — enforce that Twitter samples don't mix with LinkedIn samples.
- Show users a "voice confidence score" after extraction — surface when the profile is weak.
- Allow iterative refinement: let users add more samples and re-extract to improve the profile.
- Store extraction metadata: sample count, average length, confidence scores in the `extractedStyle` JSONB.

**Warning signs:**
- Users report "drafts don't sound like me."
- Voice profiles with fewer than 10 samples.
- Extracted style JSONB is mostly empty/generic.

**Phase to address:**
Phase 3 (Voice System) — design the extraction pipeline with quality gates from the start.

---

### Pitfall 9: Chat Message Storage Unbounded Growth

**What goes wrong:**
The `drafts` table stores every draft version ever generated, with the full `content` text and `promptUsed` text. The `promptUsed` column stores the full prompt (which includes the voice profile + post content + system prompt) — potentially 5-10KB per draft. With active users generating 5-10 drafts per post across 50 posts, a single user can generate 500KB-5MB of draft data. The `audit_log` table also grows unbounded. Query performance degrades as the drafts table grows, especially for `SELECT * FROM drafts WHERE post_id = $id ORDER BY version`.

**How to avoid:**
- Don't store the full prompt in `promptUsed`. Store a prompt template ID + variable references instead, or store it compressed, or store only the diff from the template.
- Add a `max_drafts_per_post` limit (e.g., 20 versions). Either prevent generation beyond the limit or auto-delete the oldest draft.
- Add a data retention policy for `audit_log`: auto-delete entries older than 90 days via a scheduled Worker.
- Index the `drafts` table query path: the existing `drafts_post_id_idx` is good, but consider a covering index if selecting specific columns frequently.
- For the `post_queue` table: add an `archived` status and filter archived posts from default queries.

**Warning signs:**
- `SELECT pg_total_relation_size('drafts')` growing faster than user count.
- Average query time for draft listing increasing over months.
- Neon storage usage approaching plan limits.

**Phase to address:**
Phase 2 (Chat/Draft System) — implement retention policies alongside draft versioning. Don't bolt them on later.

---

### Pitfall 10: Cloudflare Workers CPU Time Limit on AI SDK Calls

**What goes wrong:**
Workers have a 30-second default CPU time limit (on paid plan). CPU time excludes network wait time — but JSON parsing large AI responses, constructing prompts with large voice profiles, and Argon2 password hashing all consume CPU. Argon2 is particularly dangerous: the architecture specifies `memoryCost: 19456, timeCost: 2` which is reasonable but still consumes significant CPU time on Workers. If a request both hashes a password AND queries the database, it could approach limits.

**How to avoid:**
- Profile CPU time using Cloudflare DevTools. Typical SSR request should be <10ms CPU time.
- For Argon2: the `@node-rs/argon2` WASM implementation works on Workers but measure actual CPU time. Consider reducing `memoryCost` to 4096 for Workers deployment if CPU time is tight (still secure for password hashing).
- Set `limits.cpu_ms` in `wrangler.jsonc` explicitly to 60000ms (60s) to give headroom.
- Never do CPU-intensive work synchronously in the request path. If prompt construction involves complex text processing, pre-compute and cache the "prompt-ready" voice profile.

**Warning signs:**
- "Error 1102" with "Exceeded CPU Time Limits" in Cloudflare dashboard.
- Login/register requests failing intermittently (Argon2 is CPU-heavy).
- Errors correlate with larger voice profiles or longer posts.

**Phase to address:**
Phase 1 (Auth) — benchmark Argon2 CPU time on Workers during auth implementation. Phase 2 (AI) — benchmark prompt construction CPU time.

---

### Pitfall 11: Workers Cannot Initiate Outbound WebSocket Connections Reliably

**What goes wrong:**
The architecture mentions "WebSocket drafting: Stream draft generation in real-time via Neon WebSocket driver" as a future consideration. This is problematic: while Workers CAN make outbound WebSocket connections, they count against the 6 simultaneous connection limit, and the connection cannot outlive the request. You can't maintain a persistent WebSocket pool to Neon. Using the `neon-serverless` WebSocket driver on Workers requires creating and closing the connection within each request — adding latency and connection overhead.

**How to avoid:**
- Stick with `neon-http` driver for Workers. It's faster for the one-shot queries this app needs.
- For real-time draft streaming TO the client: use Server-Sent Events (SSE) from the Worker, not WebSockets. The AI SDK sends chunks via SSE, and SvelteKit can proxy this as a streaming response using `ReadableStream`.
- If interactive transactions are truly needed later, consider a Durable Object as a stateful proxy that maintains the WebSocket connection to Neon.

**Warning signs:**
- Attempting to use `Pool` from `@neondatabase/serverless` on Workers — it won't work as expected.
- Code that creates a WebSocket connection but never calls `pool.end()`.
- "Response closed due to connection limit" errors.

**Phase to address:**
Phase 2 (AI Integration) — design the streaming architecture using SSE from the start. Don't plan for WebSocket-based DB connections on Workers.

---

## Minor Pitfalls

### Pitfall 12: Dual-Build Adapter Swap Complexity

**What goes wrong:**
The project has two build targets: `adapter-cloudflare` for web and `adapter-static` for Tauri. Switching adapters requires modifying `svelte.config.js`, and developers forget to switch back. CI/CD pipelines that build both targets can have race conditions or stale config.

**How to avoid:**
- Use environment variable or build script to select the adapter: `const adapter = process.env.BUILD_TARGET === 'tauri' ? adapterStatic() : adapterCloudflare()`.
- Have separate build commands: `bun run build:web` and `bun run build:tauri`.
- CI builds both targets independently.

**Warning signs:**
- Deploying to Workers with `adapter-static` (SSR won't work).
- Tauri build failing because it's trying to use `adapter-cloudflare`.

**Phase to address:**
Phase 1 (Foundation) — set up the dual-build configuration cleanly from the start.

---

### Pitfall 13: Neon PgBouncer Transaction Mode Surprises

**What goes wrong:**
If using a pooled connection string (with `-pooler` suffix) to Neon, PgBouncer runs in transaction mode. This means `SET` statements, `LISTEN/NOTIFY`, temp tables, and session-level advisory locks don't persist between queries. This can silently break features that depend on session state.

**How to avoid:**
- Use the direct (non-pooled) connection string for the HTTP driver. The HTTP driver doesn't use PgBouncer anyway — it goes directly through Neon's HTTP API.
- Use the pooled connection string ONLY if switching to WebSocket driver with `Pool`.
- For migrations (`drizzle-kit`), always use a direct connection string.
- Specify schema explicitly in queries rather than relying on `search_path`.

**Warning signs:**
- `SET search_path` not persisting between queries.
- Migrations failing with pooled connection strings.
- Intermittent "prepared statement does not exist" errors.

**Phase to address:**
Phase 1 (Foundation) — use the correct connection string type from the start.

---

### Pitfall 14: Worker Bundle Size Exceeding 10MB Limit

**What goes wrong:**
SvelteKit compiles into a single `_worker.js` file. Including heavy dependencies (AI SDKs, Argon2 WASM, Zod) can push the compressed bundle beyond the 10MB limit on Workers paid plan (3MB free). The `@node-rs/argon2` package includes WASM binaries that contribute significantly.

**How to avoid:**
- Run `wrangler deploy --outdir bundled/ --dry-run` regularly to check bundle size.
- Dynamically import heavy dependencies only when needed.
- If the AI SDK is large, consider making AI calls via `fetch()` to an external API endpoint rather than bundling the SDK.
- Use tree-shaking-friendly imports: `import { eq } from 'drizzle-orm'` not `import * as drizzle from 'drizzle-orm'`.

**Warning signs:**
- Wrangler deploy fails with size limit errors.
- Deploy times increasing significantly.
- Bundle size exceeds 5MB compressed.

**Phase to address:**
Phase 1 (Foundation) — check bundle size after initial setup, before adding heavy dependencies.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing full prompts in `promptUsed` column | Easy debugging, full auditability | Storage bloat, 5-10KB per draft | MVP only. Replace with template refs by Phase 3 |
| No rate limiting on draft generation | Faster development, simpler code | Cost explosion, potential abuse | Never — implement from Phase 2 |
| Session validation on every request without caching | Simple auth implementation | 20-50ms latency penalty on every request | Acceptable for MVP with <100 users. Must fix by Phase 3 |
| `process.env` fallback pattern | Works in local dev | Risk of production bugs if pattern is inconsistent | Acceptable as long as rigorously applied via hooks.server.ts |
| No voice profile size limits | Users can upload unlimited samples | Memory issues on Workers, token cost bloat | MVP only. Add limits by Phase 3 |
| Audit log without retention policy | Complete history | Unbounded table growth | Acceptable for first 6 months. Must add cleanup by Phase 4 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Neon HTTP driver | Using `db.transaction()` expecting interactive semantics | Use atomic single-statement patterns or `sql.transaction()` for batched non-interactive queries |
| Cloudflare Workers secrets | Reading `process.env.DATABASE_URL` in server code | Access via `event.platform.env.DATABASE_URL` in hooks, pass via `event.locals` |
| OpenCode SDK on Workers | Buffering full AI response in memory | Stream response via `ReadableStream`/`TransformStream` |
| Drizzle + Neon | Using `drizzle-orm/node-postgres` driver on Workers | Use `drizzle-orm/neon-http` for Workers. `node-postgres` for local dev only |
| Tailwind v4 + Svelte | Using `@apply` in `<style>` blocks without `@reference` | Add `@reference "../../app.css"` or avoid `@apply` entirely in component styles |
| Argon2 on Workers | Using default high memory cost settings | Benchmark actual CPU time; reduce `memoryCost` if needed for Workers constraints |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Session validation per-request DB query | High P50 latency, DB query count ≫ user count | KV session cache or JWT hybrid | Immediately visible, but acceptable until ~100 concurrent users |
| Unbounded draft history queries | Slow post detail page load | Paginate drafts, limit per-post versions | At ~50 drafts per post |
| Large voice profile in every prompt | High AI API costs, slow prompt construction | Pre-compute "prompt-ready" voice summary | At ~20 tokens per sample × 100 samples |
| Neon cold starts | Intermittent 2-3s first-request latency | Keepalive cron, scale-to-zero=false | Every time the DB is idle >5 minutes |
| JSONB queries on voice profiles | Full table scans on `extractedStyle` | Index specific JSONB paths if querying by voice attributes | At ~1000 voice profiles |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing OpenCode API key in `$env/static/private` instead of Wrangler secrets | Key exposed in built Worker bundle | Use `wrangler secret put OPENCODE_API_KEY`; access via `platform.env` |
| No per-user data isolation in queries | User A sees User B's personas/drafts | Every query MUST filter by `userId` from validated session. Add integration tests. |
| Session token in URL parameters (Tauri deep links) | Token leakage in logs, referrer headers | Always use `Authorization: Bearer` header or `HttpOnly` cookie, never query params |
| Rate limit counters in Worker memory | No actual rate limiting (memory lost between requests) | Store rate limits in Cloudflare KV with TTL |
| No input sanitization on scraped content | XSS if rendering scraped HTML in drafts | Sanitize all scraped content before storing. Render with text-only escaping. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state during AI generation (2-10s) | User thinks app is broken, clicks generate again | Show streaming response, typing indicator, or progress bar |
| Voice profile extraction with no progress feedback | User uploads 100 tweets, sees nothing for 30s | Show progress: "Analyzing tweet 34/100..." |
| Draft regenerate replaces visible draft | User loses the version they were editing | Always append new version, keep previous visible. Architecture already does this correctly. |
| No indication of voice profile quality | User with 3 samples wonders why drafts are bad | Show confidence score: "Weak voice profile — add more samples for better results" |
| Cold start delay without explanation | First interaction feels sluggish | Show a subtle "Connecting..." state on first load |

## "Looks Done But Isn't" Checklist

- [ ] **Auth:** Session cleanup cron — expired sessions pile up in DB without scheduled deletion. Verify expired session pruning exists.
- [ ] **Auth:** Tauri `Authorization: Bearer` flow — works in dev with cookies but Tauri needs explicit header injection. Verify the `apiFetch` wrapper correctly retrieves and sends tokens.
- [ ] **Draft Generation:** Error handling for AI API failures — the happy path works but what happens when the AI API returns 429 (rate limit) or 500? Verify retry logic with exponential backoff exists.
- [ ] **Draft Generation:** Streaming response cancellation — user navigates away mid-generation. Verify the stream is properly cancelled and partial drafts are handled.
- [ ] **Voice Profiles:** Empty/null handling — what if extraction returns empty `extractedStyle`? Verify the prompt builder handles missing voice data gracefully.
- [ ] **Scraping:** Fallback for blocked URLs — scrapers get blocked. Verify the manual paste fallback is prominently shown, not buried.
- [ ] **Deployment:** Wrangler secrets set — `DATABASE_URL` and `OPENCODE_API_KEY` must be set via `wrangler secret put`. Verify CI/CD doesn't deploy without secrets validation.
- [ ] **Tailwind v4:** Border colors — verify every `border-*` utility has an explicit color. Default changed from gray-200 to currentColor.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Neon cold start killing UX | LOW | Add keepalive cron (5 min fix). Consider upgrading to always-on compute. |
| Memory limit exceeded on Workers | MEDIUM | Refactor to streaming responses. Reduce voice profile size. May need to rewrite draft generation endpoint. |
| Interactive transaction bugs (race conditions) | HIGH | Rewrite all multi-step DB operations to use atomic SQL patterns. Audit every `INSERT` that depends on a prior `SELECT`. |
| Token cost spiral | MEDIUM | Add rate limits retroactively. Reduce prompt size. Add `tokens_used` tracking column. Review and cap existing voice profiles. |
| Session auth latency | MEDIUM | Add KV caching layer. Requires changes to hooks.server.ts and session management. ~1 day of work. |
| Bundle size exceeding limit | HIGH | Identify heavy dependencies. May need to externalize AI SDK calls to a separate service. Significant architecture change. |
| Data storage growth | LOW | Add retention policies. One-time migration to compress/trim existing data. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Neon cold starts | Phase 1 (Foundation) | Measure P99 latency after idle period. Should be <500ms with keepalive. |
| Workers memory limit | Phase 2 (AI Integration) | Load test with 5 concurrent draft generations. Monitor memory in Cloudflare dashboard. |
| No interactive transactions | Phase 1 (Foundation) | Code review all DB operations for TOCTOU bugs. Run concurrent draft generation test. |
| Token cost spiral | Phase 2 (AI Integration) | Track tokens_used per generation. Set alerts at $X/day threshold. |
| Session auth latency | Phase 1 (Foundation) | Benchmark session validation latency. Should be <10ms with KV cache. |
| Platform.env confusion | Phase 1 (Foundation) | Deploy to Workers after foundation phase. Verify all env vars work in production. |
| Tailwind v4 changes | Phase 1 (Foundation) | Visual review of all components after initial build. Check border colors specifically. |
| Voice profile quality | Phase 3 (Voice System) | Test with 3-sample, 10-sample, and 50-sample profiles. Compare output quality. |
| Draft storage growth | Phase 2 (Chat/Drafts) | Set up monitoring on table sizes. Verify retention policy works. |
| CPU time limits | Phase 1 (Auth) + Phase 2 (AI) | Benchmark Argon2 and AI prompt construction CPU time on Workers. |
| WebSocket misconception | Phase 2 (AI Integration) | Verify streaming uses SSE not WebSockets. Document decision for future developers. |
| Dual-build adapter | Phase 1 (Foundation) | Build both targets in CI. Verify neither breaks the other. |
| PgBouncer transaction mode | Phase 1 (Foundation) | Verify using direct (non-pooled) connection string with HTTP driver. |
| Worker bundle size | Phase 1 (Foundation) | Check compressed size with `wrangler deploy --dry-run`. Alert if >5MB. |

## Sources

- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/ (HIGH confidence — official docs, verified 2026-02-17)
- Neon Serverless Driver: https://neon.tech/docs/serverless/serverless-driver (HIGH confidence — official docs)
- Neon Connection Pooling: https://neon.tech/docs/connect/connection-pooling (HIGH confidence — official docs)
- SvelteKit adapter-cloudflare: https://svelte.dev/docs/kit/adapter-cloudflare (HIGH confidence — official docs)
- Drizzle ORM + Neon: https://orm.drizzle.team/docs/connect-neon (HIGH confidence — official docs)
- Tailwind CSS v4 Upgrade Guide: https://tailwindcss.com/docs/upgrade-guide (HIGH confidence — official docs)
- Project architecture.md: local file (HIGH confidence — project source of truth)

---
*Pitfalls research for: ez-social AI-powered social media reply tool*
*Researched: 2026-02-17*
