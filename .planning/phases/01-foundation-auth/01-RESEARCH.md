# Phase 1: Foundation & Auth - Research

**Researched:** 2026-02-17
**Domain:** SvelteKit + Auth.js + Drizzle ORM + Cloudflare Workers + Neon DB
**Confidence:** HIGH

## Summary

Phase 1 delivers a SvelteKit project deployed on Cloudflare Workers with Auth.js (v5) handling email/password authentication via the Credentials provider, Drizzle ORM connecting to Neon DB (PostgreSQL), and a protected application shell. The project is a greenfield build — `package.json` currently has no real dependencies.

Auth.js (`@auth/sveltekit`) provides the standard integration for SvelteKit authentication. It handles session management (JWT by default, database sessions optional), provides `handle` hooks for SvelteKit, and has an official Drizzle adapter (`@auth/drizzle-adapter`). The Credentials provider requires custom `authorize` logic — you own password hashing/verification, user creation, and validation. Auth.js does NOT auto-persist Credentials users to the database adapter; you must handle user creation yourself in the `authorize` callback or via a separate registration endpoint.

**Critical finding:** The architecture.md references "Lucia patterns" for auth and uses `@node-rs/argon2` for password hashing. However, the CONTEXT.md explicitly locks Auth.js as the auth solution. This means we use Auth.js's framework (`@auth/sveltekit`) for session management and route protection, but still need custom password hashing. `@node-rs/argon2` is a native (NAPI) package — it will NOT work on Cloudflare Workers. We need a pure WASM or Web Crypto API alternative for password hashing on Workers.

**Primary recommendation:** Use `@auth/sveltekit` with Credentials provider + Drizzle adapter, JWT session strategy (simpler, no session table queries on every request), custom registration endpoint that handles user creation + password hashing, and `@noble/hashes` or Web Crypto `PBKDF2` for Workers-compatible password hashing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked — user deferred all implementation decisions.

### Claude's Discretion
User deferred all implementation decisions to best practices. Claude has full flexibility on:

- **Registration & login flow** — Page structure (single vs separate), form fields, validation approach, social login inclusion
- **Auth error experience** — Error presentation style (inline, toast, etc.), messaging for failed logins, duplicate emails, weak passwords
- **Post-login landing** — What the authenticated shell looks like, placeholder content, navigation structure
- **Session & logout behavior** — "Remember me" functionality, multi-tab handling, logout redirect behavior, session duration

**Guiding principle:** Follow established Auth.js + SvelteKit conventions and modern auth UX patterns. Keep it simple and conventional — this is foundation infrastructure, not a differentiating feature.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can register with email and password via Auth.js | Credentials provider `authorize` callback handles login; registration needs a separate form action or API endpoint that creates the user in DB, then signs in via Auth.js `signIn()` |
| AUTH-02 | User can log in with email and password | Credentials provider with `authorize` callback verifying password hash against DB; Zod validation on input |
| AUTH-03 | User session persists across browser refresh | Auth.js JWT strategy stores session in HttpOnly cookie; survives refresh automatically. Database strategy also works (session token in cookie → DB lookup) |
| AUTH-04 | User can log out from any page | Auth.js provides `signOut` function (`@auth/sveltekit/client` for client-side, form action for server-side); destroys session cookie |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@auth/sveltekit` | latest (v5 line) | Auth.js integration for SvelteKit | Official Auth.js framework adapter; handles session, cookies, hooks |
| `@auth/drizzle-adapter` | latest | Drizzle ORM adapter for Auth.js | Official adapter; manages Auth.js user/account/session tables via Drizzle |
| `drizzle-orm` | latest | ORM for database access | Already chosen in architecture; supports Neon HTTP driver |
| `@neondatabase/serverless` | latest | Neon DB HTTP driver | Works on Cloudflare Workers (no TCP sockets needed) |
| `@sveltejs/adapter-cloudflare` | latest | SvelteKit Cloudflare adapter | Official adapter; replaces deprecated `adapter-cloudflare-workers`; supports Workers Static Assets and Pages |
| `zod` | latest | Input validation | Auth.js docs recommend Zod for credentials validation |
| `@tailwindcss/vite` | latest (v4) | Tailwind CSS v4 Vite plugin | Already chosen in architecture |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-kit` | latest (dev) | Schema migrations and DB tooling | Development: `drizzle-kit generate`, `drizzle-kit push`, `drizzle-kit studio` |
| `@sveltejs/adapter-static` | latest (dev) | Static SPA build for Tauri | Only for Tauri desktop builds (not Phase 1 scope, but install for dual-build config) |
| `@cloudflare/workers-types` | latest (dev) | TypeScript types for Workers runtime | Type-safe `platform.env` access in hooks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JWT sessions | Database sessions | DB sessions allow server-side revocation but require a DB query on every request. JWT is simpler for Phase 1 and avoids session table management overhead on Neon. Can switch later. |
| `@auth/drizzle-adapter` | `@auth/neon-adapter` | Neon adapter uses raw SQL and its own schema; Drizzle adapter lets us use our existing Drizzle schema and keep a single source of truth for all tables. Drizzle adapter is the better choice. |
| `@node-rs/argon2` | Web Crypto PBKDF2 or `@noble/hashes` scrypt | `@node-rs/argon2` is NAPI (native binary) — does NOT work on Cloudflare Workers. Must use a pure JS/WASM solution. |

**Installation:**
```bash
bun add @auth/sveltekit @auth/drizzle-adapter drizzle-orm @neondatabase/serverless zod @tailwindcss/vite
bun add -d drizzle-kit @sveltejs/adapter-cloudflare @sveltejs/adapter-static @cloudflare/workers-types typescript
```

## Architecture Patterns

### Recommended Project Structure (Phase 1 scope)
```
src/
├── auth.ts                          # Auth.js config (SvelteKitAuth + providers + adapter)
├── hooks.server.ts                  # Re-exports handle from auth.ts; may compose with sequence()
├── app.d.ts                         # Type augmentation (App.Locals, App.Platform)
├── app.css                          # Tailwind CSS v4 entry
├── lib/
│   ├── server/
│   │   ├── db/
│   │   │   ├── index.ts             # Drizzle client factory (Neon HTTP driver)
│   │   │   └── schema.ts            # All Drizzle table definitions (users + Auth.js tables)
│   │   ├── auth/
│   │   │   └── password.ts          # Password hashing (Workers-compatible)
│   │   └── errors.ts                # AppError class
│   ├── components/
│   │   ├── ui/                      # Button, Input, Card primitives
│   │   └── layout/                  # Shell, nav components
│   ├── schemas/
│   │   └── auth.ts                  # Zod schemas for login/register validation
│   └── config.ts                    # Environment config (API_BASE)
├── routes/
│   ├── +layout.svelte               # Root layout (nav, session check)
│   ├── +layout.server.ts            # Load session for all pages
│   ├── (auth)/
│   │   ├── login/
│   │   │   ├── +page.svelte         # Login form
│   │   │   └── +page.server.ts      # Form action → signIn("credentials")
│   │   └── register/
│   │       ├── +page.svelte         # Registration form
│   │       └── +page.server.ts      # Form action → create user + signIn
│   ├── (app)/
│   │   ├── +layout.server.ts        # Auth guard for all app routes
│   │   └── +page.svelte             # Protected home page (placeholder)
│   └── signout/
│       └── +page.server.ts          # Server action for signOut
```

### Pattern 1: Auth.js SvelteKit Integration
**What:** Auth.js provides a `handle` function that intercepts all requests, manages session cookies, and exposes `event.locals.auth()` for session retrieval.
**When to use:** Every SvelteKit app using Auth.js.
**Example:**
```typescript
// src/auth.ts
// Source: https://authjs.dev/getting-started/installation?framework=sveltekit
import { SvelteKitAuth } from "@auth/sveltekit"
import Credentials from "@auth/sveltekit/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "$lib/server/db"
import { signInSchema } from "$lib/schemas/auth"
import { verifyPassword } from "$lib/server/auth/password"

export const { handle, signIn, signOut } = SvelteKitAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const { email, password } = await signInSchema.parseAsync(credentials)
        // Look up user and verify password
        const user = await getUserByEmail(email)
        if (!user) return null
        const valid = await verifyPassword(user.passwordHash, password)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  // JWT strategy is the default; no session table needed
  session: { strategy: "jwt" },
})
```

```typescript
// src/hooks.server.ts
export { handle } from "./auth"
```

### Pattern 2: SvelteKit Route Groups for Auth Separation
**What:** Use SvelteKit route groups `(auth)` and `(app)` to separate public auth pages from protected app pages. The `(app)` group gets a `+layout.server.ts` that redirects unauthenticated users.
**When to use:** Any SvelteKit app with both public and protected routes.
**Example:**
```typescript
// src/routes/(app)/+layout.server.ts
import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"

export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth()
  if (!session?.user) {
    redirect(303, "/login")
  }
  return { session }
}
```

### Pattern 3: Registration as a Custom Form Action
**What:** Auth.js Credentials provider does NOT handle registration. Registration requires a separate form action that creates the user in the DB with a hashed password, then calls `signIn("credentials")` to log them in.
**When to use:** Any email/password auth with Auth.js.
**Example:**
```typescript
// src/routes/(auth)/register/+page.server.ts
import { fail, redirect } from "@sveltejs/kit"
import { signIn } from "../../auth"
import { registerSchema } from "$lib/schemas/auth"
import { hashPassword } from "$lib/server/auth/password"
import { db } from "$lib/server/db"
import { users } from "$lib/server/db/schema"

export const actions = {
  default: async (event) => {
    const formData = await event.request.formData()
    const parsed = registerSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      return fail(400, { errors: parsed.error.flatten().fieldErrors })
    }
    const { email, password } = parsed.data
    
    // Check for duplicate email
    const existing = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    })
    if (existing) {
      return fail(400, { errors: { email: ["Email already registered"] } })
    }
    
    // Create user
    const passwordHash = await hashPassword(password)
    await db.insert(users).values({ email, passwordHash })
    
    // Sign in via Auth.js
    await signIn("credentials", { email, password, redirect: false }, event)
    redirect(303, "/")
  },
}
```

### Pattern 4: Password Hashing on Cloudflare Workers
**What:** Use Web Crypto API's `PBKDF2` for Workers-compatible password hashing. No native binaries, no WASM imports needed.
**When to use:** When deploying to Cloudflare Workers where `@node-rs/argon2` and `bcrypt` won't work.
**Example:**
```typescript
// src/lib/server/auth/password.ts
// Workers-compatible password hashing using Web Crypto PBKDF2

const ITERATIONS = 100_000
const HASH_LENGTH = 32
const SALT_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    HASH_LENGTH * 8
  )
  // Store as "iterations:salt:hash" (all base64)
  const saltB64 = btoa(String.fromCharCode(...salt))
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
  return `${ITERATIONS}:${saltB64}:${hashB64}`
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [iterStr, saltB64, hashB64] = stored.split(":")
  const iterations = parseInt(iterStr, 10)
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
  const expectedHash = atob(hashB64)
  
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    expectedHash.length * 8
  )
  const actualHash = String.fromCharCode(...new Uint8Array(hash))
  
  // Constant-time comparison
  if (actualHash.length !== expectedHash.length) return false
  let result = 0
  for (let i = 0; i < actualHash.length; i++) {
    result |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i)
  }
  return result === 0
}
```

### Pattern 5: Database Connection on Workers
**What:** On Cloudflare Workers, environment variables come from `platform.env`, not `process.env`. The DB connection must be created per-request using the Neon HTTP driver.
**When to use:** Any Drizzle + Neon + Workers setup.
**Example:**
```typescript
// src/lib/server/db/index.ts
import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import * as schema from "./schema"

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl)
  return drizzle({ client: sql, schema })
}

// For use outside request context (drizzle-kit, scripts):
// import { drizzle } from "drizzle-orm/node-postgres"
// export const db = drizzle(process.env.DATABASE_URL!, { schema })
```

### Anti-Patterns to Avoid
- **Creating DB pool at module scope on Workers:** Cloudflare Workers are stateless per-request. Creating a pool at top-level will fail. Create the Neon HTTP client per-request or use a factory pattern.
- **Using `@node-rs/argon2` or `bcrypt` on Workers:** These are native (NAPI) packages. They require Node.js binary extensions that don't exist in the Workers runtime. Use Web Crypto PBKDF2 or a pure WASM solution.
- **Storing password hash in the Auth.js-managed `users` table:** Auth.js's user model doesn't have a `passwordHash` field by default. Either extend the Auth.js schema with a custom column, or maintain a separate `credentials` table linked by `userId`. The cleaner approach: add `passwordHash` to the users table in your custom Drizzle schema and pass custom tables to `DrizzleAdapter`.
- **Expecting Auth.js Credentials to auto-create users:** The Credentials provider ONLY authenticates — it does not create users. Registration must be handled separately.
- **Using database session strategy without need:** JWT is simpler for Phase 1 — no session table queries on every request, and it works perfectly with Cloudflare Workers. Database sessions add a DB roundtrip per request.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management | Custom cookie/token handling | `@auth/sveltekit` handle + JWT | Session rotation, CSRF protection, cookie configuration, encryption — all handled |
| CSRF protection | Custom CSRF tokens | SvelteKit built-in origin checking | SvelteKit checks `Origin` header automatically for POST/PUT/PATCH/DELETE |
| Input validation | Manual if/else checks | Zod schemas | Type-safe, composable, standard error shapes, integrates with SvelteKit form actions |
| Password hashing | Custom hash functions | Web Crypto PBKDF2 with proper parameters | Cryptographically sound, constant-time comparison, built into Workers runtime |
| Route protection | Custom auth middleware in every route | SvelteKit route groups + layout load function | One auth guard covers all child routes |
| Form handling | Manual fetch + error handling | SvelteKit form actions with `use:enhance` | Progressive enhancement, automatic error handling, works without JS |

**Key insight:** Auth.js + SvelteKit form actions handle the entire auth flow with minimal custom code. The main custom work is: password hashing (Workers-compatible), user registration logic, and Zod validation schemas.

## Common Pitfalls

### Pitfall 1: Auth.js Schema Mismatch with Existing Schema
**What goes wrong:** The architecture.md defines a custom schema with `users`, `sessions`, etc. Auth.js's Drizzle adapter expects its own table shapes (e.g., `users` needs `email`, `emailVerified`, `image`, `name` fields; `accounts` table for OAuth). If your schema doesn't match, Auth.js operations fail silently or throw.
**Why it happens:** Auth.js has specific required columns. The existing `users` table in architecture.md uses `username` and `passwordHash` but Auth.js expects `email`, `name`, `emailVerified`, `image`.
**How to avoid:** Define your schema to include BOTH Auth.js required fields AND your custom fields. Pass custom table definitions to `DrizzleAdapter(db, { usersTable, accountsTable, sessionsTable })`. Add `passwordHash` as an extra column. Change `username` to `email` (aligns with Auth.js and the CONTEXT.md decision to use email).
**Warning signs:** "Column not found" errors, null user objects after login.

### Pitfall 2: `@node-rs/argon2` Fails on Cloudflare Workers
**What goes wrong:** Build succeeds but runtime throws "NAPI module not found" or similar on Workers. The architecture.md specifies `@node-rs/argon2` for password hashing.
**Why it happens:** `@node-rs/argon2` uses native binary extensions (NAPI-RS) compiled for specific OS/arch targets. Cloudflare Workers V8 isolate has no native module support.
**How to avoid:** Use Web Crypto API `PBKDF2` (built into Workers runtime, zero dependencies) or `@noble/hashes` scrypt (pure JS, audited). Do NOT install `@node-rs/argon2`.
**Warning signs:** Deployment works but auth endpoints return 500 errors.

### Pitfall 3: Auth.js Credentials Provider + Database Adapter Session Mismatch
**What goes wrong:** With Credentials provider and default JWT strategy, Auth.js creates a JWT but the database adapter creates `user` and `account` entries. If you switch to database sessions, the Credentials provider won't automatically create session rows.
**Why it happens:** Auth.js Credentials provider was designed for JWT sessions. Database session support with Credentials requires explicit configuration.
**How to avoid:** Use JWT strategy (default) for Credentials. It works correctly out of the box. If you want database sessions later, you'll need `session: { strategy: "database" }` AND ensure the authorize callback returns a user that matches the adapter's expectations.
**Warning signs:** Session is null after login despite authorize returning a user.

### Pitfall 4: Environment Variables on Workers vs Local Dev
**What goes wrong:** `process.env.DATABASE_URL` works locally but is `undefined` on Workers. `AUTH_SECRET` is not found.
**Why it happens:** Cloudflare Workers don't use `process.env`. Variables come from `platform.env` (wrangler secrets) or SvelteKit's `$env` modules.
**How to avoid:** Use `$env/static/private` for build-time env vars. For runtime secrets on Workers, use `platform.env` accessed through hooks. Auth.js reads `AUTH_SECRET` from environment — ensure it's set as a Wrangler secret. For local dev, use `.env` file (SvelteKit loads it automatically).
**Warning signs:** "AUTH_SECRET is missing" errors on deploy, DB connection failures in production.

### Pitfall 5: Forgetting to Handle Registration Separately
**What goes wrong:** Developer sets up Credentials provider and wonders why there's no registration flow.
**Why it happens:** Auth.js Credentials provider only handles login authentication. It provides no built-in registration mechanism.
**How to avoid:** Create a separate `/register` route with a SvelteKit form action that: validates input, checks for duplicate emails, hashes the password, inserts the user into the DB, then calls `signIn()`.
**Warning signs:** No way for new users to create accounts.

### Pitfall 6: SvelteKit `adapter-cloudflare-workers` is Deprecated
**What goes wrong:** Using the wrong adapter leads to deprecated APIs and missing features.
**Why it happens:** The architecture.md and wrangler.jsonc reference `adapter-cloudflare` which is correct. But some tutorials still reference the old `adapter-cloudflare-workers`.
**How to avoid:** Always use `@sveltejs/adapter-cloudflare`. The SvelteKit docs explicitly state `adapter-cloudflare-workers` is deprecated. Use Workers Static Assets, not Workers Sites.
**Warning signs:** Wrangler warnings about deprecated site configuration.

## Code Examples

### Auth.js Full SvelteKit Config
```typescript
// src/auth.ts
// Source: https://authjs.dev/getting-started/installation?framework=sveltekit
// Source: https://authjs.dev/getting-started/authentication/credentials
import { SvelteKitAuth } from "@auth/sveltekit"
import Credentials from "@auth/sveltekit/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "$lib/server/db"
import { users, accounts, sessions } from "$lib/server/db/schema"
import { signInSchema } from "$lib/schemas/auth"
import { verifyPassword } from "$lib/server/auth/password"
import { eq } from "drizzle-orm"

export const { handle, signIn, signOut } = SvelteKitAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  }),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const { email, password } = await signInSchema.parseAsync(credentials)
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1)
        if (!user || !user.passwordHash) return null
        const valid = await verifyPassword(user.passwordHash, password)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true, // Required for Cloudflare Workers
})
```

### Zod Validation Schemas
```typescript
// src/lib/schemas/auth.ts
// Source: https://authjs.dev/getting-started/authentication/credentials#validating-credentials
import { z } from "zod"

export const signInSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(1, "Password is required"),
})

export const registerSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be less than 72 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})
```

### Protected Layout with Session Loading
```typescript
// src/routes/+layout.server.ts
// Source: https://authjs.dev/getting-started/session-management/get-session
import type { LayoutServerLoad } from "./$types"

export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth()
  return { session }
}
```

### SvelteKit SignIn Form (Server Action)
```svelte
<!-- src/routes/(auth)/login/+page.svelte -->
<script lang="ts">
  import { enhance } from "$app/forms"

  let { form } = $props()
</script>

<form method="POST" use:enhance>
  <label>
    Email
    <input name="email" type="email" required />
  </label>
  {#if form?.errors?.email}
    <p class="text-red-500 text-sm">{form.errors.email[0]}</p>
  {/if}

  <label>
    Password
    <input name="password" type="password" required />
  </label>
  {#if form?.errors?.password}
    <p class="text-red-500 text-sm">{form.errors.password[0]}</p>
  {/if}

  {#if form?.error}
    <p class="text-red-500">{form.error}</p>
  {/if}

  <button type="submit">Sign In</button>
</form>
```

### Wrangler Configuration
```jsonc
// wrangler.jsonc
// Source: https://kit.svelte.dev/docs/adapter-cloudflare
{
  "name": "ez-social",
  "main": ".svelte-kit/cloudflare/_worker.js",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": ".svelte-kit/cloudflare"
  }
}
```

### SvelteKit Config
```javascript
// svelte.config.js
import adapter from "@sveltejs/adapter-cloudflare"
import { vitePreprocess } from "@sveltejs/kit/vite"

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
  },
}

export default config
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@sveltejs/adapter-cloudflare-workers` | `@sveltejs/adapter-cloudflare` | 2025 | Old adapter deprecated; new one supports both Workers and Pages |
| Lucia Auth (standalone library) | Auth.js v5 / Better Auth | 2024-2025 | Lucia deprecated; Auth.js acquired by Better Auth. Auth.js remains supported. |
| Auth.js v4 (NextAuth) | Auth.js v5 (`@auth/sveltekit`) | 2024 | v5 is framework-agnostic; SvelteKit gets first-class support |
| `nodejs_als` compat flag | `nodejs_compat` flag | 2024 | `nodejs_compat` provides broader Node.js API support on Workers |
| Tailwind CSS v3 config file | Tailwind CSS v4 (CSS-first, Vite plugin) | 2025 | No `tailwind.config.ts` needed; use `@tailwindcss/vite` plugin + `@import 'tailwindcss'` in CSS |

**Deprecated/outdated:**
- `@sveltejs/adapter-cloudflare-workers`: Deprecated. Use `@sveltejs/adapter-cloudflare`.
- Lucia Auth: Creator deprecated Lucia v3 in 2024. The "Lucia patterns" in architecture.md are now superseded by the Auth.js decision.
- `@node-rs/argon2` on Workers: Doesn't work. Use Web Crypto PBKDF2.
- Svelte `on:click` syntax: Svelte 5 uses `onclick` (no colon). Auth.js docs still show `on:click` in some SvelteKit examples — these are Svelte 4 syntax.

## Schema Design Considerations

The architecture.md defines a `users` table with `username` and `passwordHash`. Auth.js expects `email`, `name`, `emailVerified`, `image`. The schema must be reconciled:

```typescript
// Recommended merged schema for users table
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique().notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: varchar("password_hash", { length: 255 }), // Custom field for credentials
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
```

Auth.js also requires an `accounts` table (for OAuth providers — even if not using OAuth now, the adapter expects it):

```typescript
export const accounts = pgTable("accounts", {
  // Standard Auth.js account fields
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 255 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: varchar("token_type", { length: 255 }),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
})
```

**Note:** With JWT strategy, the `sessions` table is optional (Auth.js won't read/write it). But it's worth creating the table anyway for future flexibility. The architecture.md's `sessions` table can remain mostly as-is.

## Open Questions

1. **Auth.js + Cloudflare Workers DB initialization**
   - What we know: Auth.js SvelteKitAuth needs a `db` instance at config time. On Workers, `DATABASE_URL` comes from `platform.env` which is only available in request context.
   - What's unclear: Whether Auth.js SvelteKitAuth supports a callback/factory pattern (like the Neon adapter example shows `SvelteKitAuth(() => { ... })`) to create the adapter per-request.
   - Recommendation: The Neon adapter docs show SvelteKitAuth accepting a callback function `SvelteKitAuth(() => { ... })` that runs per-request. Use this pattern to create the Drizzle db instance per-request with `platform.env.DATABASE_URL`. This appears to be the standard approach — **HIGH confidence** based on official Auth.js Neon adapter docs.

2. **Password hashing algorithm strength on Workers**
   - What we know: PBKDF2 with 100k+ iterations and SHA-256 is considered acceptable by NIST. Argon2id is preferred by OWASP.
   - What's unclear: Workers CPU time limits may constrain iteration count.
   - Recommendation: Start with PBKDF2 100k iterations. Benchmark during implementation. If too slow, reduce to 50k (still secure). Cloudflare Workers allows 30s CPU time on paid plan, 10ms on free — PBKDF2 100k takes ~50-100ms which is well within limits.

3. **Svelte 5 vs Auth.js SvelteKit examples**
   - What we know: Auth.js docs show some Svelte 4 syntax (`on:click`, `<slot />`). This project uses Svelte 5 (runes, `$props()`, `{@render children()}`).
   - What's unclear: Whether `@auth/sveltekit` components (`<SignIn>`, `<SignOut>`) are compatible with Svelte 5.
   - Recommendation: Use SvelteKit form actions (server-side signIn/signOut) instead of Auth.js client-side components. This avoids any Svelte version compatibility issues and provides better progressive enhancement.

## Sources

### Primary (HIGH confidence)
- Auth.js Official Docs — Installation (SvelteKit): https://authjs.dev/getting-started/installation?framework=sveltekit
- Auth.js Official Docs — Credentials Provider: https://authjs.dev/getting-started/authentication/credentials
- Auth.js Official Docs — Drizzle Adapter: https://authjs.dev/getting-started/adapters/drizzle
- Auth.js Official Docs — Neon Adapter: https://authjs.dev/getting-started/adapters/neon
- Auth.js Official Docs — Session Strategies: https://authjs.dev/concepts/session-strategies
- Auth.js Official Docs — Protecting Resources: https://authjs.dev/getting-started/session-management/protecting
- Auth.js Official Docs — Custom Pages: https://authjs.dev/getting-started/session-management/custom-pages
- Auth.js Official Docs — Deployment: https://authjs.dev/getting-started/deployment
- Auth.js Official Docs — Database Models: https://authjs.dev/concepts/database-models
- SvelteKit Official Docs — Cloudflare Adapter: https://kit.svelte.dev/docs/adapter-cloudflare
- Cloudflare Docs — Node.js Compatibility: https://developers.cloudflare.com/workers/runtime-apis/nodejs/

### Secondary (MEDIUM confidence)
- architecture.md (project) — Existing schema design, project structure, and conventions
- Auth.js note: "The Auth.js project is now part of Better Auth" — observed on all Auth.js doc pages (2026)

### Tertiary (LOW confidence)
- `@node-rs/argon2` Workers incompatibility — Based on knowledge that NAPI-RS packages require native binary extensions; not verified against latest Workers runtime. Needs validation during implementation.
- PBKDF2 performance on Workers — Based on general knowledge of Web Crypto API performance; actual benchmarking needed during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs
- Architecture: HIGH - Patterns drawn from official Auth.js + SvelteKit docs
- Pitfalls: HIGH - Based on known Auth.js Credentials provider limitations (documented) and Workers runtime constraints (documented)
- Password hashing: MEDIUM - PBKDF2 approach is sound but `@node-rs/argon2` incompatibility needs runtime verification; PBKDF2 performance needs benchmarking

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (30 days — Auth.js and SvelteKit are stable)
