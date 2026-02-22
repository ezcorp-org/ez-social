# Phase 2: Personas & Voice Profiles - Research

**Researched:** 2026-02-18
**Domain:** SvelteKit CRUD + Vercel AI SDK streaming structured data + Drizzle ORM schema evolution + Cloudflare Workers
**Confidence:** HIGH

## Summary

Phase 2 delivers persona management (CRUD with soft delete) and AI-powered voice profile extraction from user-provided writing samples. The core technical challenges are: (1) evolving the existing Drizzle schema to add personas and voice profiles tables with versioning support, (2) integrating the Vercel AI SDK (`ai` + `@ai-sdk/svelte`) for streaming structured object generation on Cloudflare Workers, and (3) building a progressive streaming UX where extracted voice traits appear in real-time as the AI processes writing samples.

The existing codebase from Phase 1 provides a solid foundation: Auth.js with JWT sessions, Drizzle ORM with dual-driver factory (pg locally, neon HTTP on Workers), SvelteKit form actions with `use:enhance`, Tailwind CSS v4, and a route group pattern `(app)/` for protected pages. The architecture.md already defines the personas and voice_profiles schema — but it needs modifications to support the user's decisions: soft delete (archived_at column), voice profile versioning (multiple versions per persona, not per-platform uniqueness), and writing sample metadata (platform type, word count).

The Vercel AI SDK v6 with `@ai-sdk/svelte` provides the `Chat` class and `experimental_useObject` (available for Svelte) for streaming structured data. For voice extraction, we'll use `streamText` with `Output.object()` on the server to stream a structured voice profile schema, and consume the partial stream on the client for the progressive "traits appearing" UX. The `@ai-sdk/anthropic` provider works on Cloudflare Workers (uses standard `fetch`, no Node.js-specific APIs).

**Primary recommendation:** Install `ai`, `@ai-sdk/svelte`, and `@ai-sdk/anthropic`. Use `streamText` + `Output.object()` for voice extraction with a Zod schema defining the voice profile structure. Store the full extracted profile as JSONB in a versioned `voice_profile_versions` table. Build persona CRUD using SvelteKit form actions (consistent with Phase 1 auth patterns). Use the `experimental_useObject` hook from `@ai-sdk/svelte` (or raw fetch + stream consumption) for the progressive streaming UX on the client.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Persona Management Flow
- Quick create — name only to start, low friction entry. Details added later.
- Personas live on a dedicated `/personas` page (not sidebar), linked from main nav.
- List view shows: name, description, and a brief voice summary (e.g., "Casual, witty, uses analogies").
- Deletion is soft delete (archive) — persona is hidden but data preserved, can be restored.

#### Writing Sample Input
- Single text area — user pastes all writing samples into one box at once.
- User selects platform/type via dropdown or tags (Twitter, LinkedIn, blog, etc.) to indicate where the writing came from.
- Users can add more samples later and re-extract to refine the voice profile.
- Each extraction creates a new version of the voice profile — users can revert to any previous version.
- Extraction UX is streaming — voice traits appear progressively as the AI processes, giving real-time feedback.

#### Voice Profile Display
- Both a natural language summary at top and structured traits below (Tone, Vocabulary, Patterns, Quirks with bullet points/tags).
- User can manually edit individual traits (e.g., change "formal" to "semi-formal", remove a detected pattern).
- Version selector — dropdown or list showing each version with date, user can switch between them.
- Show source stats — display what the profile was built from: sample count, types, and word count.

#### Multi-Persona Workflow
- Default persona exists — one persona is marked as default and pre-selected where a persona is needed.
- No practical limit on persona count — design for scalable lists (search/filter may be needed).
- Personas can exist without a voice profile, but UI nudges user to complete setup (banner, call-to-action).
- Persona is a voice identity that can span platforms — not locked to a single platform.
- Visual identity: each persona shows the color and icon of its associated social platform (Twitter icon + colors, LinkedIn icon + blue, etc.) for quick visual distinction.
- Platform association is for visual identification, not a constraint on usage.

### Claude's Discretion
- Exact page layout and component structure
- Writing sample minimum length guidance (how much text is "enough")
- Voice profile JSONB schema structure
- Search/filter UI for persona lists (if needed at scale)
- Loading states and error handling
- Exact streaming implementation for extraction

### Deferred Ideas (OUT OF SCOPE)
- Per-platform voice overrides (different voice for Twitter vs LinkedIn) — Phase 5
- Voice calibration feedback ("sounds like me" / "doesn't sound like me") — Phase 5
- Assigning personas to queued posts — Phase 3
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERS-01 | User can create a persona with name and description | SvelteKit form actions with Zod validation; Drizzle insert into personas table; quick-create flow (name only, description optional) |
| PERS-02 | User can edit an existing persona | SvelteKit form action on `/personas/[id]`; Drizzle update with ownership check (userId match) |
| PERS-03 | User can delete a persona | Soft delete via `archivedAt` timestamp column; Drizzle update sets archivedAt; all queries filter `WHERE archivedAt IS NULL`; restore action clears archivedAt |
| PERS-04 | User can have multiple active personas simultaneously | List page at `/personas` loads all non-archived personas for user; `isDefault` boolean with DB-enforced single-default constraint |
| VOIC-01 | User can paste writing samples to create a voice profile | Single textarea + platform dropdown; samples stored in `writing_samples` table or as part of voice_profile_versions; minimum guidance: ~500 words recommended |
| VOIC-02 | AI extracts structured voice profile from pasted samples | Vercel AI SDK `streamText` + `Output.object()` with Zod schema for voice profile; Anthropic provider on Workers; streaming response consumed on client |
| VOIC-03 | Voice profile stored as structured JSONB and available for draft generation | `voice_profile_versions` table with JSONB `extractedProfile` column; version number auto-incremented; `activeVersionId` on persona points to current version |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | v6 (latest) | Vercel AI SDK core — `streamText`, `Output.object()`, `generateText` | Official SDK for AI integration; works on edge/Workers; decided in prior phases |
| `@ai-sdk/svelte` | latest | Svelte bindings — `Chat` class, `experimental_useObject` | Official Svelte adapter for AI SDK; provides streaming object consumption |
| `@ai-sdk/anthropic` | latest | Anthropic Claude provider | Works on Workers (standard fetch); supports structured output, streaming |
| `drizzle-orm` | (already installed) | ORM for database access | Already in project; schema evolution via new tables |
| `zod` | (already installed) | Schema validation | Already in project; used for form validation AND AI SDK output schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-kit` | (already installed) | Schema migrations | `drizzle-kit generate` after schema changes, `drizzle-kit push` for dev |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@ai-sdk/anthropic` | `@ai-sdk/openai` or AI Gateway | Anthropic is direct, simpler config. Gateway adds indirection. Can swap provider later since AI SDK abstracts it. |
| `experimental_useObject` | Raw `fetch` + manual stream parsing | `useObject` handles partial JSON, loading states, errors automatically. Manual approach gives more control but more code. Recommend `useObject` for simplicity. |
| Versioned voice profiles table | Single voice profile with JSON history | Separate versions table is cleaner for querying, reverting, and displaying version lists. Worth the extra table. |

**Installation:**
```bash
bun add ai @ai-sdk/svelte @ai-sdk/anthropic
```

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)
```
src/
├── lib/
│   ├── server/
│   │   ├── db/
│   │   │   └── schema.ts              # + personas, writingSamples, voiceProfileVersions tables
│   │   └── services/
│   │       ├── persona.ts             # Persona CRUD operations
│   │       └── voice.ts               # Voice extraction + profile management
│   ├── schemas/
│   │   ├── auth.ts                    # (existing)
│   │   ├── persona.ts                 # Zod schemas for persona forms
│   │   └── voice-profile.ts           # Zod schema for AI-extracted voice profile structure
│   └── components/
│       └── persona/
│           ├── PersonaList.svelte     # List with name, description, voice summary
│           ├── PersonaCard.svelte     # Individual persona card in list
│           ├── PersonaForm.svelte     # Create/edit form
│           ├── VoiceExtractor.svelte  # Writing sample input + streaming extraction
│           ├── VoiceProfile.svelte    # Profile display (summary + structured traits)
│           └── VersionSelector.svelte # Version dropdown/list
├── routes/
│   └── (app)/
│       └── personas/
│           ├── +page.svelte           # List all personas
│           ├── +page.server.ts        # Load personas (filtered non-archived)
│           ├── new/
│           │   ├── +page.svelte       # Quick create form
│           │   └── +page.server.ts    # Create persona action
│           └── [id]/
│               ├── +page.svelte       # Edit persona + voice profile management
│               ├── +page.server.ts    # Load persona, handle updates
│               └── voice/
│                   └── +server.ts     # API endpoint for voice extraction (streaming)
```

### Pattern 1: SvelteKit Form Actions for CRUD (consistent with Phase 1)
**What:** Use SvelteKit form actions with `use:enhance` for all persona mutations
**When to use:** Create, edit, delete (archive), restore, set-default
**Example:**
```typescript
// src/routes/(app)/personas/new/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createPersonaSchema } from '$lib/schemas/persona';
import { getDb } from '$lib/server/db';
import { personas } from '$lib/server/db/schema';
import { env } from '$env/dynamic/private';

export const actions: Actions = {
  default: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: 'Unauthorized' });

    const formData = await event.request.formData();
    const result = createPersonaSchema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return fail(400, { errors: result.error.flatten().fieldErrors });
    }

    const databaseUrl = event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? '';
    const db = await getDb(databaseUrl);

    const [persona] = await db.insert(personas).values({
      userId: session.user.id,
      name: result.data.name,
      description: result.data.description ?? null,
    }).returning();

    throw redirect(303, `/personas/${persona.id}`);
  },
};
```

### Pattern 2: Streaming Voice Extraction via API Endpoint
**What:** Dedicated `+server.ts` endpoint that uses AI SDK `streamText` + `Output.object()` to stream structured voice profile
**When to use:** Voice extraction from writing samples
**Example:**
```typescript
// src/routes/(app)/personas/[id]/voice/+server.ts
import { streamText, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { voiceProfileSchema } from '$lib/schemas/voice-profile';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals, platform }) => {
  const session = await locals.auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { samples, platform: samplePlatform } = await request.json();

  const apiKey = platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic({ apiKey });

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    output: Output.object({ schema: voiceProfileSchema }),
    system: `You are an expert writing style analyst. Analyze the provided writing samples and extract a detailed voice profile. Be specific and concrete — cite actual patterns, phrases, and tendencies from the samples.`,
    prompt: `Analyze these writing samples from ${samplePlatform} and extract a structured voice profile:\n\n${samples}`,
  });

  return result.toTextStreamResponse();
};
```

### Pattern 3: Client-Side Streaming Consumption
**What:** Use `experimental_useObject` from `@ai-sdk/svelte` OR manual fetch + stream parsing for progressive trait display
**When to use:** Voice extraction UI where traits appear progressively
**Example (using raw fetch for more control in Svelte):**
```svelte
<script lang="ts">
  import { voiceProfileSchema } from '$lib/schemas/voice-profile';

  let extracting = $state(false);
  let partialProfile = $state<Partial<VoiceProfile> | null>(null);
  let error = $state<string | null>(null);

  async function extractVoice(samples: string, platform: string) {
    extracting = true;
    error = null;

    const response = await fetch(`/personas/${personaId}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples, platform }),
    });

    if (!response.ok) {
      error = 'Extraction failed';
      extracting = false;
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      try {
        partialProfile = JSON.parse(accumulated);
      } catch {
        // Partial JSON — wait for more data
      }
    }

    extracting = false;
  }
</script>
```

### Pattern 4: Soft Delete with Archive
**What:** Add `archivedAt` timestamp column; all queries filter `isNull(archivedAt)`
**When to use:** Persona deletion — never hard delete, always archive
**Example:**
```typescript
// Archive (soft delete)
await db.update(personas)
  .set({ archivedAt: new Date() })
  .where(and(eq(personas.id, id), eq(personas.userId, userId)));

// Restore
await db.update(personas)
  .set({ archivedAt: null })
  .where(and(eq(personas.id, id), eq(personas.userId, userId)));

// List active (always filter)
const activePersonas = await db.select().from(personas)
  .where(and(eq(personas.userId, userId), isNull(personas.archivedAt)))
  .orderBy(desc(personas.updatedAt));
```

### Pattern 5: Single-Default Persona Enforcement
**What:** When setting a persona as default, first unset all others for that user
**When to use:** Any time `isDefault` is set to true
**Example:**
```typescript
// Within a transaction (or sequential queries on Workers)
await db.update(personas)
  .set({ isDefault: false })
  .where(and(eq(personas.userId, userId), eq(personas.isDefault, true)));

await db.update(personas)
  .set({ isDefault: true })
  .where(and(eq(personas.id, personaId), eq(personas.userId, userId)));
```

### Anti-Patterns to Avoid
- **Module-scope DB singletons:** The project uses per-request `getDb(databaseUrl)` factory. Never create a module-level `db` instance — Workers re-use isolates but `platform.env` varies per request.
- **Hard deleting personas:** User decision is soft delete. Never use `db.delete()` on personas.
- **Unique index per persona+platform on voice profiles:** The architecture.md schema has this, but user decided personas span platforms. Voice profile versioning replaces the per-platform uniqueness constraint.
- **Blocking AI calls:** Never `await generateText()` and return full result. Always stream for extraction UX.
- **Importing `pg` at module scope:** The dual-driver pattern uses dynamic import via Function constructor to hide `pg` from the Workers bundler. Don't break this pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming structured JSON from AI | Custom JSON stream parser | AI SDK `streamText` + `Output.object()` | Handles partial JSON, schema validation, backpressure, error handling |
| Streaming UI consumption | Manual ReadableStream parsing | `@ai-sdk/svelte` `experimental_useObject` or AI SDK stream helpers | Partial object state management, loading/error states built in |
| Voice profile schema validation | Manual JSON shape checking | Zod schema shared between AI extraction and storage | Type safety, runtime validation, AI SDK integration |
| Form validation | Manual if/else checking | Zod `.safeParse()` with `fail()` | Consistent with Phase 1 pattern, type inference, error formatting |
| UUID generation | Custom ID generators | Drizzle `uuid('id').defaultRandom()` | PostgreSQL handles it; consistent with existing schema |

**Key insight:** The Vercel AI SDK handles the hardest part — streaming partial structured JSON objects from the LLM to the client. Building this manually requires handling incomplete JSON parsing, backpressure, error recovery, and partial state updates. Use the SDK.

## Common Pitfalls

### Pitfall 1: Schema Drift Between architecture.md and Actual Implementation
**What goes wrong:** The architecture.md defines a `voiceProfiles` table with `uniqueIndex('voice_profiles_persona_platform_idx')` — but the user decided voice profiles version independently (not per-platform). Implementing the architecture.md schema as-is would break version history.
**Why it happens:** architecture.md was written before user decisions in CONTEXT.md.
**How to avoid:** Treat CONTEXT.md decisions as authoritative. Create a `voiceProfileVersions` table (not the architecture.md `voiceProfiles` table) with a version number, no per-platform uniqueness constraint, and proper versioning support.
**Warning signs:** If you see `uniqueIndex` on `(personaId, platform)` for voice profiles, the schema doesn't match user requirements.

### Pitfall 2: AI SDK Provider API Key Access on Workers
**What goes wrong:** `process.env.ANTHROPIC_API_KEY` is undefined on Cloudflare Workers. The key lives in `platform.env`.
**Why it happens:** Workers don't have `process.env`. Phase 1 solved this with `$env/dynamic/private` for local dev and `platform.env` for Workers.
**How to avoid:** In API route handlers, access the key from `platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY` (same pattern as DATABASE_URL). Use `createAnthropic({ apiKey })` to pass it explicitly rather than relying on env auto-detection.
**Warning signs:** "ANTHROPIC_API_KEY not found" errors only in production/Workers but working locally.

### Pitfall 3: DB Instance per Request (Not Module Scope)
**What goes wrong:** Creating a Drizzle instance at module scope causes stale connections or wrong credentials on Workers.
**Why it happens:** Cloudflare Workers reuse V8 isolates. Module-scope code runs once but `platform.env` differs per request.
**How to avoid:** Always call `getDb(databaseUrl)` inside request handlers, passing the URL from `platform.env` or `$env/dynamic/private`. Never `export const db = ...` at module scope.
**Warning signs:** Intermittent DB errors in production, tests passing locally.

### Pitfall 4: Forgetting Auth Check in API Endpoints
**What goes wrong:** The streaming voice extraction endpoint (`+server.ts`) doesn't have the automatic auth guard from the `(app)/+layout.server.ts` — that only applies to page loads, not API routes.
**Why it happens:** SvelteKit layout load functions only run for page navigations, not for `+server.ts` API handlers.
**How to avoid:** Every `+server.ts` handler must manually check `await locals.auth()` and return 401 if no session. Extract this into a helper function.
**Warning signs:** API endpoints accessible without authentication.

### Pitfall 5: Not Handling Streaming Errors Gracefully
**What goes wrong:** AI SDK `streamText` starts immediately and errors become part of the stream. If not handled, the client shows a partial/broken result.
**Why it happens:** `streamText` is designed to never throw — errors are streamed. The `onError` callback is the intended error handling mechanism.
**How to avoid:** Always set `onError` on `streamText`. On the client, handle error states in the streaming consumption (check response status before reading stream, handle JSON parse failures for partial objects).
**Warning signs:** Silent failures during extraction, partial profiles saved without error indication.

### Pitfall 6: Large Writing Samples Exceeding Context Window
**What goes wrong:** User pastes a very long document (50K+ words) that exceeds the model's context window.
**Why it happens:** No input validation on writing sample length.
**How to avoid:** Add a reasonable maximum length (e.g., 50,000 characters ~10K words). Show word count to user. If samples are very long, truncate with a warning or suggest splitting. Claude Sonnet has 200K token context, so ~150K characters is the hard limit, but extraction quality degrades with too much text.
**Warning signs:** AI SDK errors about context length, very slow extractions, degraded extraction quality.

## Code Examples

### Voice Profile Zod Schema (shared between AI extraction and storage)
```typescript
// src/lib/schemas/voice-profile.ts
import { z } from 'zod';

export const voiceProfileSchema = z.object({
  summary: z.string().describe('A 2-3 sentence natural language summary of the writing voice'),
  tone: z.object({
    primary: z.string().describe('The dominant tone (e.g., casual, formal, witty, earnest)'),
    secondary: z.string().optional().describe('A secondary tone that colors the writing'),
    formality: z.enum(['very-informal', 'informal', 'neutral', 'formal', 'very-formal']),
  }),
  vocabulary: z.object({
    level: z.enum(['simple', 'moderate', 'advanced', 'technical']),
    favorites: z.array(z.string()).describe('Frequently used words or phrases'),
    avoids: z.array(z.string()).describe('Words or patterns conspicuously absent'),
    jargon: z.array(z.string()).describe('Domain-specific terms used naturally'),
  }),
  sentenceStructure: z.object({
    averageLength: z.enum(['short', 'medium', 'long', 'varied']),
    complexity: z.enum(['simple', 'compound', 'complex', 'varied']),
    patterns: z.array(z.string()).describe('Notable sentence patterns (e.g., "Opens with questions", "Uses em-dashes frequently")'),
  }),
  quirks: z.array(z.string()).describe('Distinctive writing habits, tics, or signatures (e.g., "Never uses exclamation marks", "Starts paragraphs with And/But")'),
  rhetoric: z.object({
    persuasionStyle: z.string().describe('How the writer convinces (data, emotion, analogy, humor)'),
    transitions: z.array(z.string()).describe('Common transition patterns'),
    openingStyle: z.string().describe('How they typically start pieces'),
    closingStyle: z.string().describe('How they typically end pieces'),
  }),
});

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;
```

### Database Schema Changes (Drizzle)
```typescript
// Additions to src/lib/server/db/schema.ts

// ─── Personas ────────────────────────────────────────────────────
export const personas = pgTable('personas', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  platform: varchar('platform', { length: 50 }),  // For visual identity (icon/color)
  isDefault: boolean('is_default').default(false).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),  // Soft delete
  activeVoiceVersionId: uuid('active_voice_version_id'),  // Points to current active version
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('personas_user_id_idx').on(table.userId),
]);

// ─── Writing Samples ─────────────────────────────────────────────
export const writingSamples = pgTable('writing_samples', {
  id: uuid('id').defaultRandom().primaryKey(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  platform: varchar('platform', { length: 50 }),  // twitter, linkedin, blog, etc.
  wordCount: integer('word_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Voice Profile Versions ──────────────────────────────────────
export const voiceProfileVersions = pgTable('voice_profile_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  extractedProfile: jsonb('extracted_profile').notNull(),  // Full VoiceProfile JSON
  manualEdits: jsonb('manual_edits').default({}).notNull(),  // User overrides
  // Source stats
  sampleCount: integer('sample_count').notNull(),
  samplePlatforms: jsonb('sample_platforms').notNull(),  // e.g., ["twitter", "blog"]
  totalWordCount: integer('total_word_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('voice_versions_persona_id_idx').on(table.personaId),
  // Unique version per persona
  // Note: using uniqueIndex here for (personaId, version)
]);
```

### Persona CRUD Service
```typescript
// src/lib/server/services/persona.ts
import { eq, and, isNull, desc } from 'drizzle-orm';
import { personas } from '$lib/server/db/schema';

export function createPersonaService(db: ReturnType<typeof getDb>) {
  return {
    async list(userId: string) {
      return db.select().from(personas)
        .where(and(eq(personas.userId, userId), isNull(personas.archivedAt)))
        .orderBy(desc(personas.isDefault), desc(personas.updatedAt));
    },

    async create(userId: string, data: { name: string; description?: string }) {
      const [persona] = await db.insert(personas)
        .values({ userId, ...data })
        .returning();
      return persona;
    },

    async archive(userId: string, id: string) {
      await db.update(personas)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(personas.id, id), eq(personas.userId, userId)));
    },

    async restore(userId: string, id: string) {
      await db.update(personas)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(and(eq(personas.id, id), eq(personas.userId, userId)));
    },
  };
}
```

### Env Variable Pattern for AI API Key
```typescript
// Access pattern consistent with Phase 1 DATABASE_URL handling
const apiKey = event.platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
const anthropic = createAnthropic({ apiKey });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject` / `streamObject` | `generateText` / `streamText` + `Output.object()` | AI SDK v6 | Legacy functions deprecated; use `Output.*` with text functions |
| `useChat` hook (Svelte) | `Chat` class (Svelte) | AI SDK v6 | Svelte uses class-based API, not hooks; `new Chat({})` |
| `useObject` hook (Svelte) | `experimental_useObject` | AI SDK current | Still experimental in Svelte; available and functional |
| Per-platform voice profiles | Cross-platform persona identity | User decision | architecture.md had unique(persona, platform); user wants personas spanning platforms |
| Hard delete | Soft delete (archive) | User decision | architecture.md didn't specify; user wants archive with restore |
| Single voice profile per persona | Versioned voice profiles | User decision | Each extraction creates a new version; users can revert |

**Deprecated/outdated:**
- `generateObject` and `streamObject` are deprecated in AI SDK v6. Use `generateText`/`streamText` with `Output.object()` instead.
- The `useChat` hook doesn't exist for Svelte — use the `Chat` class instead.
- The `streamProtocol` option is replaced by transport classes (`DefaultChatTransport`, `TextStreamChatTransport`).

## Recommendations for Claude's Discretion Areas

### Writing Sample Minimum Length Guidance
**Recommendation:** Display guidance text suggesting "500+ words recommended for accurate voice extraction" with a live word counter. Set a hard minimum of 100 words (reject with error below this). No hard maximum, but show a warning above 50,000 characters. This gives enough signal for meaningful extraction while preventing trivially short samples.

### Voice Profile JSONB Schema Structure
**Recommendation:** Use the Zod schema defined above in Code Examples. It balances structure (machine-parseable for draft generation) with readability (natural language summary for humans). The schema has clear sections that map to the user's UI decision: summary at top, structured traits below (Tone, Vocabulary, Patterns, Quirks). Store `extractedProfile` (AI output) and `manualEdits` (user overrides) separately — merge them at read time so the original extraction is preserved.

### Search/Filter UI for Persona Lists
**Recommendation:** Skip for now. At typical usage (< 20 personas), a simple list is sufficient. Add a client-side filter input (name search) only if the list exceeds ~10 items. This can be a `$state` variable filtering the loaded array — no server-side search needed.

### Loading States and Error Handling
**Recommendation:**
- **Persona CRUD:** Use SvelteKit `use:enhance` with `$page.form` for error display (consistent with auth pages). Show inline field errors from Zod validation.
- **Voice extraction:** Three states: (1) idle with CTA, (2) extracting with progressive trait display + "Analyzing your writing..." skeleton, (3) complete with full profile. Error state shows retry button.
- **Page loads:** SvelteKit handles loading via server load functions. Use skeleton placeholders in `+page.svelte` if needed for slow DB queries.

### Exact Streaming Implementation
**Recommendation:** Use a dedicated `+server.ts` API endpoint (not a form action) for voice extraction since form actions don't support streaming responses. On the client, use `fetch` with `ReadableStream` consumption rather than `experimental_useObject` — this gives better control over the progressive UX (showing traits as they appear). The `@ai-sdk/svelte` `experimental_useObject` is also viable but has less documentation for Svelte compared to React.

The server endpoint returns `result.toTextStreamResponse()` from `streamText` + `Output.object()`. The client reads the stream and parses partial JSON to progressively render the voice profile.

### Page Layout and Component Structure
**Recommendation:**
- `/personas` — Grid/list of persona cards. Each card shows name, description (truncated), voice summary badge, platform icon/color, default badge. "New persona" button in top-right.
- `/personas/new` — Minimal form: name input (required), description textarea (optional), platform dropdown (optional). Submit creates and redirects to `/personas/[id]`.
- `/personas/[id]` — Full persona view: editable name/description at top, voice profile section below (with extraction UI if no profile exists, or profile display + version selector if profiles exist). Tabs or sections for: Profile, Writing Samples, Settings (archive, set default).

## Open Questions

1. **Manual Edit Merge Strategy**
   - What we know: User can manually edit traits. We store `extractedProfile` and `manualEdits` separately.
   - What's unclear: When user re-extracts (new version), should previous manual edits carry forward to the new version? Or start fresh?
   - Recommendation: Start fresh on new extraction. User's manual edits applied to version N don't automatically transfer to version N+1. The new extraction is a clean slate from new/additional samples. User can always revert to the previous version with their edits.

2. **Platform Visual Identity — Icon/Color Mapping**
   - What we know: User wants platform icon + color for visual distinction. Platform association is for visual identity only.
   - What's unclear: Is platform stored on the persona itself, or is it derived from writing samples?
   - Recommendation: Store `platform` as an optional field on the persona. User sets it during creation or editing. This is purely cosmetic. If not set, use a neutral/generic icon. Platform list: twitter, linkedin, blog, reddit, email, other.

3. **Anthropic API Key Configuration**
   - What we know: Need an Anthropic API key for Claude. Workers use `platform.env`, local uses `$env/dynamic/private`.
   - What's unclear: The `.env.example` currently only has `DATABASE_URL` and `AUTH_SECRET`. Need to add `ANTHROPIC_API_KEY`.
   - Recommendation: Add `ANTHROPIC_API_KEY` to `.env.example` and `wrangler.jsonc` secrets. Also update `app.d.ts` Platform interface.

## Sources

### Primary (HIGH confidence)
- Vercel AI SDK official docs — Svelte quickstart, streamText, generating structured data, object generation, chatbot guide (fetched 2026-02-18)
- Vercel AI SDK Anthropic provider docs (fetched 2026-02-18)
- Vercel AI SDK provider management docs (fetched 2026-02-18)
- Existing codebase: `src/lib/server/db/schema.ts`, `src/auth.ts`, `src/routes/(app)/+layout.server.ts` — Phase 1 patterns (read 2026-02-18)
- `architecture.md` — project architecture reference (read 2026-02-18)

### Secondary (MEDIUM confidence)
- AI SDK v6 API patterns (streamText + Output.object replacing deprecated streamObject) — confirmed via official docs
- `@ai-sdk/svelte` experimental_useObject availability — mentioned in official docs as available for Svelte

### Tertiary (LOW confidence)
- Exact `@ai-sdk/svelte` version number — docs don't specify; install latest and verify compatibility
- Cloudflare Workers streaming response behavior with `toTextStreamResponse()` — should work via standard Web Streams API which Workers support, but not explicitly tested in docs for SvelteKit on Workers

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — AI SDK docs are comprehensive and current; libraries are well-documented
- Architecture: HIGH — Patterns follow directly from Phase 1 established patterns + AI SDK official examples
- Pitfalls: HIGH — Most pitfalls are verified from Phase 1 experience (DB per-request, env access, auth guards) + AI SDK docs (streaming error handling)
- Voice profile schema: MEDIUM — Schema design is a recommendation (Claude's discretion); will need iteration based on extraction quality

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable stack, 30 days)
