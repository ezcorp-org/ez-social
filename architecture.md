# ez-social Architecture

## Overview

ez-social is a local-first, open-source application that helps users respond to social media posts using AI-generated drafts tailored to their personal writing style (voice). Users create personas with distinct voices, queue social posts to respond to, and use OpenCode SDK to generate thoughtful replies.

The application runs in two modes:

- **Web** — Full SvelteKit app deployed on Cloudflare Workers with Neon DB (serverless PostgreSQL).
- **Desktop** — Tauri wraps the SvelteKit frontend as a static SPA that communicates with the same Cloudflare-hosted API (or a self-hosted instance).

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | SvelteKit + TypeScript | Shared between web and desktop |
| Desktop Shell | Tauri v2 | Rust only for native APIs (no business logic) |
| Backend / API | SvelteKit API routes (`+server.ts`) | TypeScript, runs on Cloudflare Workers |
| Database | PostgreSQL | Neon DB (production), Docker (local dev) |
| ORM | Drizzle ORM | `drizzle-orm/neon-http` (Workers), `drizzle-orm/node-postgres` (local) |
| Styling | Tailwind CSS v4 | With PostCSS |
| Browser Scraping | Playwright | Runs on a separate Node.js service (not on Workers) |
| AI / SDK | OpenCode SDK | Via `OPENCODE_API_KEY` env var |
| Auth | Lucia patterns (session-based) | Sessions stored in PostgreSQL |
| Package Manager | Bun | For all JS/TS tooling |

## System Architecture

```
                         ┌──────────────────────────┐
                         │   Cloudflare Workers      │
                         │   (SvelteKit SSR + API)   │
                         │                          │
                         │  adapter-cloudflare       │
                         │  ┌────────────────────┐  │
                         │  │  +page.server.ts   │  │
                         │  │  +server.ts (API)  │  │
                         │  │  hooks.server.ts   │  │
                         │  └────────────────────┘  │
                         │           │              │
                         │           ▼              │
                         │  ┌────────────────────┐  │
                         │  │  Drizzle ORM       │  │
                         │  │  (neon-http)        │  │
                         │  └────────────────────┘  │
                         └───────────┬──────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
           ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐     ┌──────────────────┐
│  Web Browser     │    │  Tauri Desktop   │     │  Neon DB         │
│  (Full SSR)      │    │  (Static SPA)    │     │  (PostgreSQL)    │
│                  │    │                  │     │                  │
│  Rendered by     │    │  adapter-static  │     │  Serverless      │
│  Workers         │    │  → calls API     │     │  connection      │
└──────────────────┘    │    endpoints     │     │  via HTTP        │
                        └──────────────────┘     └──────────────────┘

           ┌──────────────────────────────────┐
           │  Scraping Service (separate)     │
           │  Node.js + Playwright            │
           │  Runs on VPS / Docker / Fly.io   │
           │  Exposes REST API                │
           └──────────────────────────────────┘
```

### Dual-Build Strategy

SvelteKit supports multiple adapters, but only one per build. We use **two build targets**:

| Target | Adapter | SSR | API Routes | Use Case |
|---|---|---|---|---|
| Web (Cloudflare) | `@sveltejs/adapter-cloudflare` | Yes | Yes (server-side) | Production web app |
| Desktop (Tauri) | `@sveltejs/adapter-static` | No (`ssr = false`) | No (calls remote API) | Tauri desktop app |

The frontend code is shared. Environment detection determines API base URL:

```typescript
// $lib/config.ts
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// In Tauri builds, VITE_API_BASE points to the deployed Cloudflare URL.
// In web builds, it's empty (same-origin).
```

## Project Structure

```
ez-social/
├── src/
│   ├── lib/
│   │   ├── server/              # Server-only code (never sent to client)
│   │   │   ├── db/
│   │   │   │   ├── index.ts     # Drizzle client factory
│   │   │   │   ├── schema.ts    # All Drizzle table definitions
│   │   │   │   └── migrate.ts   # Migration runner
│   │   │   ├── auth/
│   │   │   │   ├── session.ts   # Session creation, validation, invalidation
│   │   │   │   └── password.ts  # Argon2 hashing utilities
│   │   │   ├── services/
│   │   │   │   ├── persona.ts   # Persona CRUD
│   │   │   │   ├── voice.ts     # Voice profile extraction + storage
│   │   │   │   ├── queue.ts     # Post queue management
│   │   │   │   ├── draft.ts     # Draft generation via OpenCode SDK
│   │   │   │   └── scraper.ts   # Client for external scraping service
│   │   │   └── opencode.ts      # OpenCode SDK wrapper
│   │   ├── components/          # Shared Svelte components
│   │   │   ├── ui/              # Primitives (Button, Input, Card, etc.)
│   │   │   ├── persona/         # Persona-related components
│   │   │   ├── queue/           # Queue-related components
│   │   │   └── layout/          # Shell, nav, sidebar
│   │   ├── stores/              # Svelte stores for client state
│   │   │   └── toast.ts         # Toast notification store
│   │   ├── types/               # Shared TypeScript types
│   │   │   └── index.ts
│   │   ├── config.ts            # Environment config (API_BASE, etc.)
│   │   └── utils.ts             # Shared utility functions
│   ├── routes/
│   │   ├── +layout.svelte       # Root layout (nav, sidebar)
│   │   ├── +layout.server.ts    # Auth guard (loads session)
│   │   ├── +layout.ts           # Client layout (ssr toggle for Tauri)
│   │   ├── +page.svelte         # Dashboard
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── +page.svelte
│   │   │   └── register/
│   │   │       └── +page.svelte
│   │   ├── personas/
│   │   │   ├── +page.svelte            # List personas
│   │   │   ├── +page.server.ts         # Load personas
│   │   │   ├── [id]/
│   │   │   │   ├── +page.svelte        # Edit persona
│   │   │   │   └── +page.server.ts     # Load/update persona
│   │   │   └── new/
│   │   │       └── +page.svelte        # Create persona
│   │   ├── queue/
│   │   │   ├── +page.svelte            # Post queue list
│   │   │   ├── +page.server.ts
│   │   │   └── [id]/
│   │   │       ├── +page.svelte        # Post detail + draft review
│   │   │       └── +page.server.ts
│   │   ├── settings/
│   │   │   └── +page.svelte
│   │   └── api/                         # REST API endpoints
│   │       ├── auth/
│   │       │   ├── login/+server.ts
│   │       │   ├── register/+server.ts
│   │       │   └── logout/+server.ts
│   │       ├── personas/
│   │       │   ├── +server.ts           # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       └── +server.ts       # GET, PATCH, DELETE
│   │       ├── voice-profiles/
│   │       │   ├── +server.ts
│   │       │   └── [id]/+server.ts
│   │       ├── queue/
│   │       │   ├── +server.ts           # GET (list), POST (add)
│   │       │   └── [id]/
│   │       │       ├── +server.ts       # GET, PATCH, DELETE
│   │       │       └── draft/+server.ts # POST (generate), GET (list drafts)
│   │       └── health/+server.ts        # Health check
│   ├── hooks.server.ts                  # Auth middleware, DB setup
│   └── app.d.ts                         # SvelteKit type augmentation
├── src-tauri/                           # Tauri v2 Rust project
│   ├── src/
│   │   └── lib.rs                       # Minimal — only native APIs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
├── drizzle/                             # Generated migration files
│   └── 0000_initial.sql
├── static/                              # Static assets
├── docker-compose.yml                   # Local PostgreSQL
├── drizzle.config.ts
├── svelte.config.js
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── wrangler.jsonc                       # Cloudflare Workers config
├── .env.example
├── .env                                 # Local (gitignored)
├── package.json
└── bun.lock
```

## Core Components

### 1. Dashboard (`/`)
- Overview of queued posts requiring responses
- Quick stats: pending, drafting, drafted, ready, replied counts
- Recent activity feed (last 10 actions)
- Quick-add post URL form

### 2. Persona Manager (`/personas`)
- Create, edit, delete personas
- Each persona has:
  - Name and description
  - One or more voice profiles (per platform)
  - Linked platform accounts (for display purposes)
  - Default flag (one persona can be default)
- Inline voice profile management

### 3. Post Queue (`/queue`)
- List all queued posts with status filters
- Status flow: `pending` → `drafting` → `drafted` → `ready` → `replied`
- Add description/prompt enhancer per post
- Assign persona per post
- View draft history (multiple drafts per post)

### 4. Voice Builder (within Persona Manager)
- User uploads exported data (tweets, posts, comments) as text/CSV/JSON
- Server sends to OpenCode SDK for analysis
- Extracts: tone, vocabulary, sentence structure, common phrases, platform-specific style
- Stores structured voice profile as JSONB
- Manual tweaks via form fields

### 5. Scraping Service (External)
- **Not deployed on Cloudflare Workers** — requires Playwright and a real browser
- Runs as a separate Docker container or VPS service
- Simple REST API: `POST /scrape` with `{ url }` → returns `{ content, platform, author, timestamp }`
- Rate-limited, respects `robots.txt`
- ez-social calls it from `$lib/server/services/scraper.ts`
- Optional: users can skip scraping and paste post content manually

### 6. Prompt Engine (`$lib/server/services/draft.ts`)
- Combines: original post content + persona voice profile + user description/notes
- Sends structured prompt to OpenCode SDK
- Returns drafted response
- Stores each generation as a new draft version (never overwrites)
- Prompt template stored as a configurable constant

### 7. Database Layer (`$lib/server/db/`)
- Drizzle ORM as the sole data access layer
- Two driver modes (same schema, different connection):
  - **Production/Workers**: `drizzle-orm/neon-http` with `@neondatabase/serverless`
  - **Local dev**: `drizzle-orm/node-postgres` with `pg`
- Connection factory pattern selects driver based on environment
- Migrations managed by `drizzle-kit`

## API Design

All API routes live under `src/routes/api/` and follow REST conventions.

### Authentication
All API routes (except `/api/auth/*` and `/api/health`) require a valid session. The session token is sent as:
- **Web**: `HttpOnly` cookie (set by `hooks.server.ts`)
- **Tauri**: `Authorization: Bearer <token>` header (stored in Tauri secure storage)

`hooks.server.ts` checks both and populates `event.locals.user`.

### Endpoint Conventions

```typescript
// src/routes/api/queue/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { postQueue } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const status = url.searchParams.get('status');
  const posts = await db
    .select()
    .from(postQueue)
    .where(eq(postQueue.userId, locals.user.id));

  return json({ data: posts });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const body = await request.json();
  // Validate with Zod schema
  const parsed = createPostSchema.parse(body);

  const [post] = await db.insert(postQueue).values({
    userId: locals.user.id,
    ...parsed,
  }).returning();

  return json({ data: post }, { status: 201 });
};
```

### Input Validation

All API inputs validated with **Zod** schemas:

```typescript
// $lib/types/index.ts
import { z } from 'zod';

export const createPostSchema = z.object({
  url: z.string().url(),
  personaId: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
});

export const createPersonaSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;
```

### Error Responses

Consistent error shape across all endpoints:

```typescript
// $lib/server/errors.ts
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export function handleApiError(err: unknown): Response {
  if (err instanceof AppError) {
    return json(
      { error: { code: err.code, message: err.message, retryable: err.retryable } },
      { status: err.status },
    );
  }
  console.error('Unhandled error:', err);
  return json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', retryable: false } },
    { status: 500 },
  );
}
```

## Data Model (Drizzle ORM)

### Schema Definition

```typescript
// $lib/server/db/schema.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Users ───────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Sessions ────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(), // Random token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_expires_at_idx').on(table.expiresAt),
]);

// ─── Personas ────────────────────────────────────────────────────
export const personas = pgTable('personas', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('personas_user_id_idx').on(table.userId),
]);

// ─── Voice Profiles ──────────────────────────────────────────────
export const voiceProfiles = pgTable('voice_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 50 }).notNull(),
  extractedStyle: jsonb('extracted_style').notNull(),
  manualTweaks: jsonb('manual_tweaks').default({}).notNull(),
  sampleTexts: text('sample_texts').array().default([]),
  lastExtractedAt: timestamp('last_extracted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('voice_profiles_persona_platform_idx').on(table.personaId, table.platform),
]);

// ─── Platform Accounts ──────────────────────────────────────────
export const platformAccounts = pgTable('platform_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 50 }).notNull(),
  userHandle: varchar('user_handle', { length: 255 }),
  displayName: varchar('display_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('platform_accounts_persona_id_idx').on(table.personaId),
]);

// ─── Post Queue ─────────────────────────────────────────────────
export const postQueue = pgTable('post_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  personaId: uuid('persona_id').references(() => personas.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  platform: varchar('platform', { length: 50 }),
  postContent: text('post_content'),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  userNotes: text('user_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
}, (table) => [
  index('post_queue_user_id_status_idx').on(table.userId, table.status),
  index('post_queue_user_id_created_at_idx').on(table.userId, table.createdAt),
]);

// ─── Drafts (versioned, one-to-many with post_queue) ─────────────
export const drafts = pgTable('drafts', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => postQueue.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  promptUsed: text('prompt_used'),
  modelId: varchar('model_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('drafts_post_id_idx').on(table.postId),
  uniqueIndex('drafts_post_id_version_idx').on(table.postId, table.version),
]);

// ─── Audit Log ──────────────────────────────────────────────────
export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: uuid('resource_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_log_user_id_idx').on(table.userId),
  index('audit_log_created_at_idx').on(table.createdAt),
]);

// ─── Relations ──────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  personas: many(personas),
  sessions: many(sessions),
  postQueue: many(postQueue),
}));

export const personasRelations = relations(personas, ({ one, many }) => ({
  user: one(users, { fields: [personas.userId], references: [users.id] }),
  voiceProfiles: many(voiceProfiles),
  platformAccounts: many(platformAccounts),
}));

export const voiceProfilesRelations = relations(voiceProfiles, ({ one }) => ({
  persona: one(personas, { fields: [voiceProfiles.personaId], references: [personas.id] }),
}));

export const postQueueRelations = relations(postQueue, ({ one, many }) => ({
  user: one(users, { fields: [postQueue.userId], references: [users.id] }),
  persona: one(personas, { fields: [postQueue.personaId], references: [personas.id] }),
  drafts: many(drafts),
}));

export const draftsRelations = relations(drafts, ({ one }) => ({
  post: one(postQueue, { fields: [drafts.postId], references: [postQueue.id] }),
}));
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Separate `drafts` table | Draft versioning — regenerating never overwrites previous drafts |
| `sessions` table | Lucia-pattern session auth, revocable, works on Workers |
| `audit_log` table | Provides `request_id`-level tracing for debugging |
| Composite indexes on `post_queue` | Optimizes the most common query: "my posts filtered by status" |
| `uniqueIndex` on voice_profiles(persona, platform) | Enforces one voice profile per platform per persona |
| `jsonb` for extracted_style and manual_tweaks | Flexible schema for AI-extracted voice data |
| No `platform_user_id` on platform_accounts | Removed — no OAuth, so no platform-side IDs to store |

## Database Connection Factory

```typescript
// $lib/server/db/index.ts
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// On Cloudflare Workers, DATABASE_URL comes from platform.env (wrangler secret).
// In local dev, it comes from process.env.
export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzleNeon({ client: sql, schema });
}

// For local development with node-postgres (used by drizzle-kit and scripts):
// import { drizzle } from 'drizzle-orm/node-postgres';
// import { Pool } from 'pg';
// const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// export const db = drizzle({ client: pool, schema });
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/lib/server/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Migration Workflow

```bash
# Generate migration from schema changes
bunx drizzle-kit generate

# Apply migrations to local database
bunx drizzle-kit migrate

# Push schema directly (dev only, no migration file)
bunx drizzle-kit push

# Open Drizzle Studio (visual DB browser)
bunx drizzle-kit studio
```

Migrations are committed to `drizzle/` and applied in CI/CD before deployment.

## Authentication

### Session-Based Auth (Lucia Patterns)

Following the [Lucia v3 guide](https://lucia-auth.com/) for SvelteKit:

```typescript
// $lib/server/auth/password.ts
import { hash, verify } from '@node-rs/argon2';

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return verify(hash, password);
}
```

```typescript
// $lib/server/auth/session.ts
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { generateRandomString } from '$lib/utils';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string) {
  const token = generateRandomString(64);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({ id: token, userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSession(token: string) {
  const [session] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())));

  if (!session) return null;

  // Extend session if more than halfway expired
  const halfLife = SESSION_DURATION_MS / 2;
  if (session.session.expiresAt.getTime() - Date.now() < halfLife) {
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
    await db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, token));
  }

  return { user: session.user, session: session.session };
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, token));
}
```

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth/session';
import { createDb } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
  // Initialize DB with the correct connection string
  const databaseUrl = event.platform?.env?.DATABASE_URL ?? process.env.DATABASE_URL;
  if (databaseUrl) {
    event.locals.db = createDb(databaseUrl);
  }

  // Extract session token from cookie or Authorization header
  const cookieToken = event.cookies.get('session');
  const authHeader = event.request.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken ?? bearerToken;

  if (token) {
    const result = await validateSession(token);
    if (result) {
      event.locals.user = result.user;
      event.locals.session = result.session;
    }
  }

  return resolve(event);
};
```

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      db: ReturnType<typeof import('$lib/server/db').createDb>;
      user: typeof import('$lib/server/db/schema').users.$inferSelect | null;
      session: typeof import('$lib/server/db/schema').sessions.$inferSelect | null;
    }
    interface Platform {
      env?: {
        DATABASE_URL: string;
        OPENCODE_API_KEY: string;
        SCRAPER_SERVICE_URL?: string;
      };
    }
  }
}

export {};
```

### Auth in Tauri vs Web

| Concern | Web (Cloudflare) | Desktop (Tauri) |
|---|---|---|
| Session storage | `HttpOnly` cookie, `SameSite=Lax`, `Secure` | `Authorization: Bearer` header, token in Tauri secure store |
| Login flow | Form action → sets cookie | API call → stores token via `@tauri-apps/plugin-store` |
| CSRF protection | SvelteKit built-in (origin check in `hooks.server.ts`) | Not needed (no cookies = no CSRF) |
| Session expiry | Cookie `Max-Age` + DB expiry | DB expiry only, client clears on 401 |

## Frontend Architecture

### State Management

SvelteKit's built-in patterns cover most needs:

- **Server data**: `+page.server.ts` load functions → passed as `data` prop
- **Form mutations**: SvelteKit form actions with `use:enhance` for progressive enhancement
- **Client state**: Svelte stores (`$lib/stores/`) for UI state (toasts, modals, filters)
- **API calls from Tauri**: `fetch` wrapper in `$lib/api.ts` that adds auth headers

```typescript
// $lib/api.ts — Used in Tauri mode (and optionally in web for client-side fetches)
import { API_BASE } from '$lib/config';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getSessionToken(); // from Tauri secure store or cookie

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new ApiError(res.status, error.error);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
```

### Tailwind CSS Setup

Tailwind v4 with the Vite plugin:

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
});
```

```css
/* src/app.css */
@import 'tailwindcss';
```

### Component Conventions

- **Atomic components** in `$lib/components/ui/` — Button, Input, Card, Badge, etc.
- **Feature components** in `$lib/components/{feature}/` — composed from atomic components
- **Pages** are thin — load data in `+page.server.ts`, render in `+page.svelte`, delegate to feature components
- Props use TypeScript interfaces, not `any`
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`) for component reactivity

## Error Handling

### Server-Side Errors

```typescript
// $lib/server/errors.ts
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(400, code, message);
  }
  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static notFound(resource = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }
  static rateLimit(retryAfterSeconds: number) {
    return new AppError(429, 'RATE_LIMITED', `Rate limited. Retry after ${retryAfterSeconds}s`, true);
  }
  static internal(message = 'Internal server error') {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}
```

### Retry Logic

```typescript
// $lib/server/utils/retry.ts
export async function withRetry<T>(
  operation: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 1000 } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
```

### Client-Side Error Handling

```svelte
<!-- Global error boundary in +layout.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import Toast from '$lib/components/ui/Toast.svelte';
</script>

{#if $page.error}
  <div class="error-page">
    <h1>{$page.status}</h1>
    <p>{$page.error.message}</p>
  </div>
{:else}
  <slot />
{/if}

<Toast />
```

## User Workflow

### 1. First-Time Setup
1. User registers with username/password at `/register`
2. Session created, cookie set (or token returned for Tauri)
3. User creates first persona at `/personas/new`
4. User uploads exported social data (text/CSV/JSON file)
5. Server sends data to OpenCode SDK → extracts voice profile
6. Voice profile saved to `voice_profiles` table

### 2. Adding Post to Queue
1. User pastes social post URL at `/queue` (or dashboard quick-add)
2. Server sends URL to scraping service → returns post content
3. If scraping fails, user can paste content manually
4. User adds optional description/enhancement notes
5. User selects persona (or uses default)
6. Post enters queue as `pending`

### 3. Generating Draft
1. User clicks "Generate Draft" on a pending post
2. Server fetches: post content + persona voice profile for that platform
3. Server builds prompt from template + user description
4. OpenCode SDK generates draft text
5. New row inserted in `drafts` table (version = previous max + 1)
6. Post status updated to `drafted`
7. Draft displayed to user

### 4. Review and Post
1. User reviews draft at `/queue/[id]`
2. User can edit the draft text inline
3. User can regenerate (creates new draft version, preserving old)
4. User marks as `ready` when satisfied
5. User copies draft and posts manually on the platform
6. User marks as `replied` (records `replied_at` timestamp)

## Security

| Concern | Approach |
|---|---|
| Password hashing | Argon2id via `@node-rs/argon2` (WASM, works on Workers) |
| Session tokens | 64-char random string, stored in DB, validated per request |
| Session expiry | 30-day sliding window, extended on use |
| Cookie security | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` |
| CSRF | SvelteKit's built-in origin checking in `hooks.server.ts` |
| Input validation | Zod schemas on all API inputs |
| SQL injection | Drizzle ORM parameterized queries (never raw SQL) |
| Secrets | Environment variables only — `DATABASE_URL`, `OPENCODE_API_KEY` |
| Tauri | Minimal Rust surface — only native APIs exposed via capabilities |
| Rate limiting | Per-user rate limits on draft generation (stored in-memory or KV) |

**Note on RLS**: Row-level security is not used. User isolation is enforced at the application layer — all queries filter by `userId` from the validated session. This is simpler and works identically across Neon and local PostgreSQL.

## Testing

### Test Pyramid

```
       ┌─────────────┐
       │     E2E     │  Few, critical user paths
       │   Tests     │
      ┌──────────────┐
      │ Integration  │  API endpoints + DB
      │    Tests     │
     ┌───────────────┐
     │   Unit Tests  │  Services, utils, validation
     └───────────────┘
```

### Unit Tests (Vitest)

```typescript
// src/lib/server/services/draft.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildPrompt } from './draft';

describe('buildPrompt', () => {
  it('combines post content with voice profile', () => {
    const prompt = buildPrompt({
      postContent: 'What do you think about TypeScript?',
      voiceProfile: { tone: 'casual', vocabulary: 'technical' },
      userDescription: 'Be concise',
    });

    expect(prompt).toContain('What do you think about TypeScript?');
    expect(prompt).toContain('casual');
    expect(prompt).toContain('Be concise');
  });
});
```

### Integration Tests (Vitest + Docker PostgreSQL)

```typescript
// src/lib/server/services/persona.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb } from '$lib/server/db';
import { personas } from '$lib/server/db/schema';

// Uses testcontainers or the docker-compose PostgreSQL
const db = createDb(process.env.TEST_DATABASE_URL!);

describe('PersonaService', () => {
  it('creates and retrieves a persona', async () => {
    const [created] = await db.insert(personas).values({
      userId: testUserId,
      name: 'Test Persona',
    }).returning();

    expect(created.name).toBe('Test Persona');
  });
});
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/workflow.spec.ts
import { test, expect } from '@playwright/test';

test('full workflow: register → create persona → add post → generate draft', async ({ page }) => {
  await page.goto('/register');
  await page.fill('[name="username"]', 'testuser');
  await page.fill('[name="password"]', 'testpassword123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/');

  await page.click('a[href="/personas/new"]');
  await page.fill('[name="name"]', 'My Persona');
  await page.click('button[type="submit"]');

  // ... continue workflow
});
```

### Test Organization

```
src/
├── lib/server/services/
│   ├── persona.ts
│   ├── persona.test.ts              # Unit test (co-located)
│   └── persona.integration.test.ts  # Integration test (co-located)
tests/
├── e2e/
│   ├── auth.spec.ts
│   └── workflow.spec.ts
├── setup.ts                          # Test DB setup/teardown
└── playwright.config.ts
```

### Test Commands

```bash
bun run test              # Unit tests (Vitest)
bun run test:integration  # Integration tests (requires Docker PostgreSQL)
bun run test:e2e          # E2E tests (Playwright)
bun run test:coverage     # Unit + integration with coverage
```

## Logging

### Structured Logging

Since we're on Cloudflare Workers (no `pino` or `winston`), use `console` with structured JSON:

```typescript
// $lib/server/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

function log(entry: LogEntry) {
  const output = { ...entry, timestamp: new Date().toISOString() };
  switch (entry.level) {
    case 'error': console.error(JSON.stringify(output)); break;
    case 'warn':  console.warn(JSON.stringify(output)); break;
    case 'debug': console.debug(JSON.stringify(output)); break;
    default:      console.log(JSON.stringify(output)); break;
  }
}

export const logger = {
  info:  (message: string, meta?: Record<string, unknown>) => log({ level: 'info', message, ...meta }),
  warn:  (message: string, meta?: Record<string, unknown>) => log({ level: 'warn', message, ...meta }),
  error: (message: string, meta?: Record<string, unknown>) => log({ level: 'error', message, ...meta }),
  debug: (message: string, meta?: Record<string, unknown>) => log({ level: 'debug', message, ...meta }),
};
```

### Log Levels

| Level | When |
|---|---|
| `error` | Failed operations requiring attention (DB errors, API failures) |
| `warn` | Handled gracefully but unexpected (rate limits hit, session expired) |
| `info` | Key business events (user registered, draft generated, post replied) |
| `debug` | Detailed debugging (prompt contents, API response times) |

## Local Development

### Docker Compose

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ezsocial
      POSTGRES_PASSWORD: ezsocial
      POSTGRES_DB: ezsocial
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ezsocial']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### Environment Variables

```bash
# .env.example

# Database — local Docker PostgreSQL
DATABASE_URL=postgresql://ezsocial:ezsocial@localhost:5432/ezsocial

# OpenCode SDK
OPENCODE_API_KEY=your_opencode_api_key_here

# Scraping service (optional — users can paste content manually)
SCRAPER_SERVICE_URL=http://localhost:3001

# Tauri builds: set this to your deployed API URL
# VITE_API_BASE=https://ez-social.your-domain.workers.dev
```

### Dev Workflow

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
bun install

# 3. Copy env file
cp .env.example .env

# 4. Run migrations
bunx drizzle-kit push

# 5. Start dev server
bun run dev

# 6. (Optional) Start Tauri dev
bun run tauri dev
```

## Deployment

### Cloudflare Workers (Production)

#### Prerequisites
- Cloudflare account with Workers plan
- Neon DB account (free tier works)
- `wrangler` CLI installed

#### Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "name": "ez-social",
  "main": ".svelte-kit/cloudflare/_worker.js",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": ".svelte-kit/cloudflare"
  }
}
```

#### Deploy Steps

```bash
# 1. Set secrets
wrangler secret put DATABASE_URL    # Neon DB connection string
wrangler secret put OPENCODE_API_KEY

# 2. Build and deploy
bun run build
wrangler deploy
```

#### SvelteKit Config (Web)

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
  },
};

export default config;
```

### Tauri Build

For Tauri, swap to `adapter-static` and build:

```bash
# Build desktop app
bun run tauri build
```

The Tauri build uses a separate SvelteKit config or build script that:
1. Swaps adapter to `@sveltejs/adapter-static`
2. Sets `VITE_API_BASE` to the Cloudflare Workers URL
3. Builds with `ssr = false`

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Future Considerations

- **More platforms**: Instagram, Threads, Bluesky, Mastodon
- **Bulk operations**: Import multiple URLs from CSV/bookmarks
- **Scheduled posting**: Auto-post drafts at optimal times (requires separate Worker cron)
- **Analytics dashboard**: Track response rates, engagement
- **Team/persona sharing**: Multi-user collaboration on shared personas
- **Cloudflare Browser Rendering**: Replace external scraping service with CF's browser API
- **Offline support**: Cache recent data in IndexedDB for Tauri, sync when online
- **WebSocket drafting**: Stream draft generation in real-time via Neon WebSocket driver
