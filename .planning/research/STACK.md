# Stack Research

**Domain:** AI-powered chat-first social media reply tool
**Researched:** 2026-02-17
**Confidence:** HIGH (core stack verified via npm registry and official docs)

## Core Stack (Decided — Not Negotiable)

These are locked in. Research validates compatibility and documents current versions.

| Technology | Latest Version | Purpose | Verified |
|------------|---------------|---------|----------|
| SvelteKit | 2.52.0 | Full-stack framework (SSR + API routes) | npm registry |
| Svelte | 5.51.3 | UI framework (runes: `$state`, `$derived`, `$effect`) | npm registry |
| TypeScript | ~5.8.3 | Type safety | peer dep in SvelteKit |
| Tailwind CSS | 4.1.18 | Utility-first CSS | npm registry (`@tailwindcss/vite`) |
| Drizzle ORM | latest (0.44+) | Database ORM | npm registry |
| Drizzle Kit | 0.31.9 | Migration tooling | npm registry |
| PostgreSQL (Neon DB) | `@neondatabase/serverless` 1.0.2 | Serverless PostgreSQL | npm registry |
| Cloudflare Workers | `wrangler` 4.66.0 | Edge deployment runtime | npm registry |
| `@sveltejs/adapter-cloudflare` | 7.2.7 | SvelteKit → Workers adapter | npm registry |
| Bun | 1.x | Package manager and runtime | project config |

## Recommended Supporting Stack

### AI / Chat Streaming

**Use: Vercel AI SDK (`ai` + `@ai-sdk/svelte`)** — Confidence: HIGH

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `ai` | 6.0.90 | Core AI SDK — `streamText`, `generateText`, `generateObject`, message types | The standard for AI streaming in JS. Works on Cloudflare Workers (edge-compatible). Handles SSE streaming, message protocol, and structured output. The `ai` package is provider-agnostic and works with 50+ model providers. |
| `@ai-sdk/svelte` | 4.0.90 | Svelte bindings — `Chat` class | Official Svelte integration. Uses Svelte 5 classes (not hooks). Provides `messages`, `sendMessage`, `status`, `stop`, `regenerate` — everything needed for a chat UI. Requires `svelte ^5.31.0`. |
| `@ai-sdk/anthropic` | 3.0.45 | Anthropic provider (Claude models) | First-party provider. Use as default model for voice matching — Claude excels at style matching/creative writing. Supports tool calling, structured output, streaming. |
| `@ai-sdk/openai` | 3.0.29 | OpenAI provider (GPT models) | First-party provider. Good fallback. Supports all AI SDK features. |

**CRITICAL FINDING — "OpenCode SDK" Clarification:**

The architecture doc references "OpenCode SDK" as the AI layer. Investigation reveals:
- `opencode-ai` (npm) is a **CLI tool** (binary), not a library SDK
- `ai-sdk-provider-opencode-sdk` is a community provider that requires a **running OpenCode CLI server** — it proxies to Anthropic/OpenAI/Google through a local server process
- This **CANNOT run on Cloudflare Workers** (requires a persistent Node.js server process)
- Tool calling is **NOT SUPPORTED** through the OpenCode provider

**Recommendation:** Use the AI SDK (`ai` package) directly with first-party providers (`@ai-sdk/anthropic`, `@ai-sdk/openai`). This gives:
- Direct API access (no proxy server needed)
- Full tool calling support
- Native streaming support on Workers
- Provider switching via config (not code changes)

If the project requires a unified API key across providers, use `@ai-sdk/gateway` (Vercel AI Gateway) which ships with the `ai` package.

#### Chat Streaming Pattern for SvelteKit + Workers

The AI SDK's `@ai-sdk/svelte` provides the `Chat` class (Svelte 5 replacement for `useChat` hook):

```typescript
// Server: src/routes/api/chat/[postId]/+server.ts
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function POST({ request, locals, params }) {
  const { messages }: { messages: UIMessage[] } = await request.json();
  
  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    system: buildSystemPrompt(voiceProfile, postContent),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onFinish: ({ messages }) => {
      // Persist messages to DB
      saveChatMessages(params.postId, messages);
    },
  });
}
```

```svelte
<!-- Client: Chat component -->
<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';

  let { postId, initialMessages } = $props();
  
  const chat = new Chat({
    get id() { return postId; },  // reactive — must use getter
    messages: initialMessages,
  });
</script>
```

**Key patterns verified from official docs:**
- Classes, not hooks (Svelte 5 pattern)
- Must use getters for reactive props (Svelte classes aren't reactive by default)
- Cannot destructure class properties (disconnects from reactivity)
- `Chat` syncs instances with same `id` via `createAIContext()`
- Message persistence via `onFinish` callback in `toUIMessageStreamResponse()`
- `consumeStream()` prevents broken state on client disconnect

### Validation

**Use: Zod + drizzle-zod** — Confidence: HIGH

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `zod` | 3.25.x | Runtime validation, API input schemas, AI SDK tool schemas | Required peer dependency of `ai` (^3.25.76). The AI SDK uses Zod for tool `inputSchema` definitions. Single validation library for everything. |
| `drizzle-zod` | 0.8.3 | Generate Zod schemas from Drizzle table definitions | Eliminates manual schema duplication. `createInsertSchema(table)` generates validated insert schemas directly from your Drizzle schema. Supports Zod 3.25+ and 4.x. |

**Important version note:** The AI SDK v6 requires `zod ^3.25.76 || ^4.1.8`. Use Zod 3.25.x (not Zod 4.x) for now because drizzle-zod's Zod 4 support is newer and less battle-tested.

#### Validation Pattern

```typescript
// $lib/types/schemas.ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { postQueue, personas, chatMessages } from '$lib/server/db/schema';
import { z } from 'zod';

// Auto-generated from Drizzle schema with overrides
export const insertPostSchema = createInsertSchema(postQueue, {
  url: z.string().url(),
  description: z.string().max(2000).optional(),
}).omit({ id: true, userId: true, createdAt: true, updatedAt: true });

// API endpoint validation
export const sendChatMessageSchema = z.object({
  text: z.string().min(1).max(10000),
  postId: z.string().uuid(),
});
```

### Authentication

**Use: `@node-rs/argon2` for password hashing** — Confidence: HIGH

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@node-rs/argon2` | 2.0.2 | Argon2id password hashing | WASM build (`@node-rs/argon2-wasm32-wasi`) runs on Cloudflare Workers via `nodejs_compat`. Pure Rust compiled to WASM — no native Node.js addons needed. The architecture doc already specifies this. |

**Workers compatibility verified:** The package includes `@node-rs/argon2-wasm32-wasi@2.0.2` with browser support (`argon2.wasi-browser.js`). Combined with Workers' `nodejs_compat` flag, this works on Cloudflare.

### Testing

**Use: Vitest + Playwright** — Confidence: HIGH

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `vitest` | 4.0.18 | Unit and integration tests | Ships with SvelteKit. Vite-native — shares config with SvelteKit. Supports Workers-like environments via `@edge-runtime/vm`. Node >=20 required. |
| `@playwright/test` | 1.58.2 | E2E tests | Standard for SvelteKit E2E. Runs real browser tests. |
| `@testing-library/svelte` | 5.x | Component testing | Test Svelte components in jsdom/happy-dom without browser. |
| `@sveltejs/kit/testing` | (built-in) | SvelteKit-specific test utilities | Provided by SvelteKit for load function and endpoint testing. |

#### Testing Strategy for Workers

```typescript
// vitest.config.ts — Unit tests (no Workers env needed)
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',  // for component tests
    // OR 'node' for service/utility tests
  },
});
```

**Workers-specific testing:** Don't try to emulate the Workers runtime for unit tests. Instead:
1. **Unit tests (Vitest + node):** Test services, validation schemas, prompt building — no Workers env needed
2. **Integration tests (Vitest + Docker PostgreSQL):** Test DB operations with real PostgreSQL
3. **E2E tests (Playwright):** Test full user flows against `wrangler dev` or `bun run dev`

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `wrangler` | 4.66.0 | Cloudflare Workers CLI (dev, deploy, secrets) | `wrangler dev` for local Workers emulation. `wrangler secret put` for secrets. Required peer dep of adapter-cloudflare. |
| `@cloudflare/workers-types` | ^4.20250507.0 | TypeScript types for Workers APIs | Included via adapter-cloudflare. Add to `tsconfig.json` `compilerOptions.types`. |
| `drizzle-kit` | 0.31.9 | Schema migrations, studio UI | `bunx drizzle-kit push` (dev), `bunx drizzle-kit generate` (production migrations) |
| `svelte-check` | 4.x | Svelte type checking | Run via `bun run check` — catches template type errors Vitest misses |
| `eslint` + `eslint-plugin-svelte` | 9.x / 3.x | Linting | Flat config format. Svelte plugin parses `.svelte` files. |
| `prettier` + `prettier-plugin-svelte` | 3.x / 3.x | Code formatting | Formats Svelte files correctly (script, template, style sections). |

### UI Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bits-ui` | latest | Headless Svelte component primitives | Use for accessible dropdowns, dialogs, popovers, command palettes. Svelte 5 native. Unstyled — pair with Tailwind. |
| `clsx` | 2.1.1 | Conditional CSS class merging | Already a dependency of Svelte 5. Use for conditional Tailwind classes. |
| `lucide-svelte` | latest | Icon library | Tree-shakeable SVG icons. Consistent style. |
| `svelte-sonner` | latest | Toast notifications | Minimal, accessible toast component for Svelte. |

**What NOT to use for UI:**

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| shadcn-svelte | Heavy abstraction layer, adds build complexity, locks you into their component patterns | `bits-ui` (headless) + custom Tailwind styling |
| Skeleton UI | Svelte 4 focused, large bundle, opinionated styling conflicts with Tailwind v4 | Custom components with `bits-ui` primitives |
| Flowbite Svelte | Tailwind v3 based, not compatible with Tailwind v4's CSS-first config | Custom components |
| DaisyUI | Theme-based approach conflicts with Tailwind v4, adds CSS weight | Direct Tailwind utility classes |

### Real-time UI Patterns on Workers

**Use: SSE (Server-Sent Events) via AI SDK streaming** — Confidence: HIGH

Cloudflare Workers supports `ReadableStream` responses natively. The AI SDK's `toUIMessageStreamResponse()` uses this under the hood — it returns a streaming `Response` with `Content-Type: text/event-stream`.

**WebSockets on Workers:** Cloudflare Workers supports WebSockets via Durable Objects, but this is overkill for chat. The AI SDK's streaming protocol handles the bi-directional-like pattern: client sends `POST` request → server streams response via SSE → client sends next message as new `POST`.

**Svelte Reactivity Pattern:**

```svelte
<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';
  
  const chat = new Chat({ id: postId });
  
  // Reactive derivations from chat state
  let isStreaming = $derived(chat.status === 'streaming');
  let lastDraft = $derived(
    chat.messages
      .filter(m => m.role === 'assistant')
      .flatMap(m => m.parts.filter(p => p.type === 'text'))
      .at(-1)?.text
  );
</script>
```

**No additional real-time libraries needed.** SvelteKit's built-in stores + AI SDK Chat class + Svelte 5 runes cover all real-time UI needs for this app.

### Voice Profile & NLP

**Approach: Prompt engineering via AI SDK — no NLP libraries needed** — Confidence: MEDIUM

Voice extraction and style matching are best handled as AI prompts, not traditional NLP:

1. **Voice Extraction:** `generateObject()` with a Zod schema to extract structured voice profile
2. **Draft Generation:** `streamText()` with voice profile injected into system prompt
3. **Voice Calibration:** Present sample outputs, user rates them, feed ratings back as context

```typescript
// Voice profile extraction with structured output
import { generateObject } from 'ai';
import { z } from 'zod';

const voiceProfileSchema = z.object({
  tone: z.enum(['casual', 'professional', 'witty', 'academic', 'empathetic']),
  formality: z.number().min(1).max(10),
  averageSentenceLength: z.enum(['short', 'medium', 'long']),
  vocabulary: z.array(z.string()).describe('Characteristic words/phrases'),
  patterns: z.array(z.string()).describe('Recurring structural patterns'),
  avoids: z.array(z.string()).describe('Things this writer never does'),
  exampleSignatures: z.array(z.string()).describe('Typical opening/closing patterns'),
});

const { object: profile } = await generateObject({
  model: anthropic('claude-sonnet-4-5'),
  schema: voiceProfileSchema,
  prompt: `Analyze this writing sample and extract the author's voice profile:\n\n${sampleText}`,
});
```

**Why NOT use NLP libraries:**
- `natural`, `compromise`, `wink-nlp` etc. are Node.js libraries — many won't work on Workers
- AI models are far better at nuanced style analysis than rule-based NLP
- Voice matching is a generative task, not an analytical one
- Keeps the dependency tree lean for Workers deployment

**LOW confidence note:** The exact voice profile schema and prompting strategy will need iterative refinement during implementation. The schema above is a starting point — real-world testing will determine what attributes actually differentiate voices effectively.

## Full Installation

```bash
# Core framework
bun add @sveltejs/kit svelte @sveltejs/adapter-cloudflare @sveltejs/vite-plugin-svelte vite

# Tailwind CSS v4
bun add @tailwindcss/vite tailwindcss

# Database
bun add drizzle-orm @neondatabase/serverless
bun add -d drizzle-kit

# AI / Chat
bun add ai @ai-sdk/svelte @ai-sdk/anthropic @ai-sdk/openai

# Validation
bun add zod drizzle-zod

# Auth
bun add @node-rs/argon2

# UI utilities
bun add bits-ui clsx lucide-svelte svelte-sonner

# Dev dependencies
bun add -d typescript svelte-check vitest @playwright/test @testing-library/svelte
bun add -d eslint eslint-plugin-svelte prettier prettier-plugin-svelte
bun add -d wrangler @cloudflare/workers-types @types/node
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `ai` (Vercel AI SDK) | `openai` npm package (direct OpenAI client) | If you ONLY need OpenAI and want lower-level control. But AI SDK provides streaming UI integration, provider switching, and structured output — all needed here. |
| `@ai-sdk/anthropic` | OpenCode SDK provider | If you're building a local desktop-only app that can run OpenCode CLI as a sidecar. Not viable for Workers deployment. |
| `drizzle-zod` | Manual Zod schemas | If you need very custom validation logic that doesn't map 1:1 to table columns. Can combine both approaches. |
| `bits-ui` | `melt-ui` | `melt-ui` is the lower-level builder pattern; `bits-ui` wraps it with better DX. Use `melt-ui` only if `bits-ui` is too opinionated. |
| `@node-rs/argon2` | `bcrypt` via `bcryptjs` | If you can't get argon2 WASM working on Workers. `bcryptjs` is pure JS but slower and less secure than argon2. Try argon2 first. |
| Vitest 4.x | Vitest 3.x | If Node 18 support is needed (Vitest 4 requires Node >=20). But Workers and SvelteKit both target Node >=18 — should be fine with Node 20+. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `openai` npm package | Provides only OpenAI models. No streaming UI integration. No structured output helpers. Duplicates what AI SDK provides. | `ai` + `@ai-sdk/openai` |
| `langchain` | Massive dependency tree, over-abstracted for this use case. You need chat streaming and structured output — AI SDK does both with far less complexity. | `ai` (Vercel AI SDK) |
| `socket.io` / `ws` | WebSocket libraries don't work on Workers (no TCP sockets). SSE via AI SDK streaming handles real-time chat perfectly. | AI SDK's `toUIMessageStreamResponse()` |
| `express` / `fastify` | SvelteKit IS the server. Adding another framework creates routing conflicts and doubles the attack surface. | SvelteKit API routes (`+server.ts`) |
| `prisma` | Doesn't run on Cloudflare Workers without workarounds. Drizzle is the decided ORM and works natively with Neon HTTP. | `drizzle-orm` |
| `pino` / `winston` | Node.js logging libraries that use streams/filesystem. Won't work on Workers. | `console.log` with structured JSON (as in architecture doc) |
| NLP libraries (`natural`, `compromise`) | Node.js native modules that won't work on Workers. AI models do voice analysis better anyway. | AI-powered extraction via `generateObject()` |
| Zod 4.x | While supported by AI SDK and drizzle-zod, it's very new (released mid-2025). Zod 3.25.x is more battle-tested and has identical API for this use case. | `zod@^3.25.76` |
| `ai-sdk-provider-opencode-sdk` | Requires running OpenCode CLI server process — cannot work on Cloudflare Workers. No tool calling support. | `@ai-sdk/anthropic` or `@ai-sdk/openai` (first-party providers) |

## Version Compatibility Matrix

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `ai@6.0.x` | `@ai-sdk/svelte@4.0.x` | Must match major versions. Both at v6/v4 generation. |
| `ai@6.0.x` | `zod@^3.25.76 \|\| ^4.1.8` | Peer dependency. Use 3.25.x for stability. |
| `@ai-sdk/svelte@4.0.x` | `svelte@^5.31.0` | Requires Svelte 5 runes. |
| `@sveltejs/kit@2.52.x` | `svelte@^4.0.0 \|\| ^5.0.0` | Supports both Svelte 4 and 5. Use 5. |
| `@sveltejs/kit@2.52.x` | `vite@^5.0.3 \|\| ^6.0.0 \|\| ^7.0.0-beta` | Use Vite 6.x for stability with Tailwind v4. |
| `@sveltejs/adapter-cloudflare@7.2.x` | `wrangler@^4.0.0` | Requires Wrangler v4. |
| `@sveltejs/adapter-cloudflare@7.2.x` | `@sveltejs/kit@^2.0.0` | Kit v2 only. |
| `drizzle-zod@0.8.x` | `drizzle-orm@>=0.36.0` | Drizzle ORM must be 0.36+. |
| `drizzle-zod@0.8.x` | `zod@^3.25.0 \|\| ^4.0.0` | Compatible with both Zod 3 and 4. |
| `@tailwindcss/vite@4.1.x` | `vite@^5.2.0 \|\| ^6 \|\| ^7` | Works with Vite 6 (SvelteKit default). |
| `vitest@4.0.x` | `node@>=20.0.0` | Requires Node 20+. If using Node 18, downgrade to Vitest 3.x. |

## Stack Patterns by Variant

**If using Anthropic Claude as primary model:**
- Use `@ai-sdk/anthropic` as the default provider
- Claude excels at style matching and creative writing (ideal for voice replication)
- Enable `sendReasoning: true` in `toUIMessageStreamResponse()` for chain-of-thought drafting

**If using OpenAI as primary model:**
- Use `@ai-sdk/openai` as the default provider
- GPT models have strong structured output (`generateObject()`) for voice profile extraction
- Better for high-throughput scenarios (faster inference)

**If supporting multiple providers (recommended):**
- Create a provider factory that reads `MODEL_PROVIDER` from env
- Use `@ai-sdk/gateway` (included in `ai` package) for unified API key management
- Switch providers without code changes

```typescript
// $lib/server/ai/provider.ts
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

const providers = { anthropic, openai } as const;

export function getModel(env: App.Platform['env']) {
  const [provider, model] = (env?.AI_MODEL ?? 'anthropic/claude-sonnet-4-5').split('/');
  return providers[provider as keyof typeof providers](model);
}
```

## Sources

- AI SDK Svelte quickstart — https://sdk.vercel.ai/docs/getting-started/svelte (verified 2026-02-17) — HIGH confidence
- AI SDK chatbot guide — https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot (verified 2026-02-17) — HIGH confidence
- AI SDK message persistence — https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence (verified 2026-02-17) — HIGH confidence
- AI SDK providers list — https://sdk.vercel.ai/providers/ai-sdk-providers (verified 2026-02-17) — HIGH confidence
- OpenCode SDK community provider — https://sdk.vercel.ai/providers/community-providers/opencode-sdk (verified 2026-02-17) — HIGH confidence
- `ai@6.0.90` — npm registry (verified 2026-02-17)
- `@ai-sdk/svelte@4.0.90` — npm registry (verified 2026-02-17)
- `@ai-sdk/anthropic@3.0.45` — npm registry (verified 2026-02-17)
- `@ai-sdk/openai@3.0.29` — npm registry (verified 2026-02-17)
- `zod@3.25.76` (AI SDK peer dep) / `zod@4.3.6` (latest) — npm registry
- `drizzle-zod@0.8.3` — npm registry (verified 2026-02-17)
- `@neondatabase/serverless@1.0.2` — npm registry (verified 2026-02-17)
- `@node-rs/argon2@2.0.2` / `@node-rs/argon2-wasm32-wasi@2.0.2` — npm registry (verified 2026-02-17)
- `vitest@4.0.18` — npm registry (verified 2026-02-17)
- `@playwright/test@1.58.2` — npm registry (verified 2026-02-17)
- `@sveltejs/adapter-cloudflare@7.2.7` — npm registry (verified 2026-02-17)
- `wrangler@4.66.0` — npm registry (verified 2026-02-17)
- `@tailwindcss/vite@4.1.18` — npm registry (verified 2026-02-17)
- `@sveltejs/kit@2.52.0` — npm registry (verified 2026-02-17)
- `svelte@5.51.3` — npm registry (verified 2026-02-17)
- `drizzle-kit@0.31.9` — npm registry (verified 2026-02-17)
- Cloudflare Workers Streams API — https://developers.cloudflare.com/workers/runtime-apis/streams/ — HIGH confidence

---
*Stack research for: ez-social (AI-powered chat-first social reply tool)*
*Researched: 2026-02-17*
