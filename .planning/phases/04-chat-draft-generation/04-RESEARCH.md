# Phase 4: Chat & Draft Generation - Research

**Researched:** 2026-02-18
**Domain:** AI chat interface with Vercel AI SDK v6 + SvelteKit + Drizzle ORM
**Confidence:** HIGH

## Summary

Phase 4 implements a per-post persistent chat interface where users discuss queued posts with AI and generate voice-matched draft replies. The core technical challenge is integrating the `@ai-sdk/svelte` Chat class (v4.0.91) with a SvelteKit streaming API endpoint, persisting conversation history in PostgreSQL via Drizzle, and managing post status transitions through the chat lifecycle.

The AI SDK v6 introduces a parts-based `UIMessage` model (not the older `content: string` model). The Chat class from `@ai-sdk/svelte` wraps Svelte 5 `$state` runes internally, making messages reactive. The server endpoint must return `toUIMessageStreamResponse()` (not the `toTextStreamResponse()` used in Phase 2's voice extraction). The client `DefaultChatTransport` POSTs `{ id, messages }` as JSON to the API endpoint, which must convert UI messages to model messages via `convertToModelMessages()` before passing to `streamText()`.

The database needs two new tables: `chat_messages` for persistent conversation history and `draft_edits` for tracking inline edits to AI-generated drafts. The existing `postQueue.status` field needs a new `updateStatus` method on the queue service to handle transitions: `new` → `in_progress` → `draft_ready`.

**Primary recommendation:** Use `@ai-sdk/svelte` Chat class with `DefaultChatTransport` pointed at a SvelteKit `+server.ts` endpoint that uses `streamText` + `toUIMessageStreamResponse()`. Persist messages in `onFinish` callback (server-side on the `toUIMessageStreamResponse` options, not `streamText`'s `onFinish`). Load persisted messages on page load and pass as initial `messages` to Chat constructor.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Chat conversation flow
- Opening a post's chat shows the original post content at the top as a pinned context card (not a chat message — always visible)
- Chat starts with a short AI greeting that acknowledges the post and persona: "Ready to help you draft a reply to [author]'s post as [persona]. What angle do you want to take?"
- No rigid "discuss then draft" flow — user can request a draft immediately or discuss first; the AI should be responsive to either
- Requesting a draft is natural language ("draft a reply", "write something", "give me a response") — no special buttons or modes
- When the AI generates a draft, it wraps the actual reply text in a visually distinct "draft block" within the chat message
- Post status transitions: `new` → `in_progress` (on first message sent), `in_progress` → `draft_ready` (when first draft is generated)

#### Draft display & interaction
- Drafts appear inline in the chat as part of the AI's message, rendered in a distinct card/block with a slightly different background (not a separate panel)
- Each draft block has: the draft text, a copy button (top-right), and a character/word count
- Copy button uses clipboard API, shows brief "Copied!" confirmation
- Inline editing: user clicks an "Edit" button on the draft block, text becomes editable in-place, save/cancel buttons appear
- Edited versions are stored separately (manualEdits pattern from Phase 2) — original AI version preserved
- Version history: each refinement ("make it shorter") creates a new draft block in the chat flow — the conversation IS the version history
- No separate version panel or dropdown — scroll up to see previous drafts in context of the conversation that produced them

#### Context & persona in chat
- Original post displayed as a fixed/pinned card above the chat scroll area (always visible, not scrolled away)
- Post card shows: author name, platform badge, post content (truncated with expand), URL link
- Active persona shown in a subtle bar or badge near the chat input: "Replying as [Persona name]"
- Persona switching: user can type "switch to [persona]" or use a persona dropdown near the input — switching adds a system-style message to chat noting the change
- AI context includes: full original post content, active persona's voice profile (extractedProfile + manualEdits merged), and full conversation history
- System prompt instructs AI to match the persona's voice characteristics when generating drafts but to converse naturally when discussing

#### Chat navigation & history
- Chat lives on the existing `/queue/[id]` page — replaces the Phase 4 placeholder
- Full conversation persists in the database (chat_messages table with role, content, metadata)
- Returning to a post's chat loads full history (no pagination for now — conversations are typically short)
- Queue table rows on dashboard link directly to `/queue/[id]` which is the chat (no separate "chat" route)
- Back navigation from chat returns to dashboard with scroll position preserved (browser default)
- No separate "chats" listing — posts ARE the entry point to chats

#### Streaming implementation
- Use `@ai-sdk/svelte` Chat class for the chat interface (first real usage — Phase 2 used raw fetch)
- Server endpoint uses `streamText` with `toUIMessageStreamResponse()` (not toTextStreamResponse used in Phase 2)
- Chat class reactive getters pattern (use `chat.messages`, not destructured — per documented Svelte 5 gotcha)
- SSE streaming for real-time token display
- `onFinish` callback on server side to persist the complete AI message to the database

### Claude's Discretion
- Exact system prompt wording and structure for the AI chat
- Chat message bubble styling (colors, spacing, alignment)
- Loading/typing indicator design during streaming
- How to detect "draft request" intent vs general discussion in the AI prompt
- Error states and retry UX for failed AI requests
- Empty chat state design (before first message)
- Mobile responsive layout adjustments for chat
- Character count display format and positioning
- How many tokens of conversation history to include in context window

### Deferred Ideas (OUT OF SCOPE)
None specified — all items are either locked decisions or Claude's discretion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | Each queued post has a persistent chat conversation that saves full history | `chat_messages` table schema with postId FK; server-side `onFinish` callback persists messages; page load fetches history from DB |
| CHAT-02 | User can discuss the original post with AI to understand it before drafting | System prompt instructs AI to discuss naturally; post content included in system prompt context |
| CHAT-03 | User can request draft generation through the chat, using the assigned persona's voice | System prompt includes persona's merged voice profile; AI responds to natural language draft requests |
| CHAT-04 | AI-generated drafts appear as special inline messages that are visually distinct and copyable | AI wraps drafts in `<draft>` markers; client-side rendering parses and displays as draft blocks with copy button |
| CHAT-05 | User can refine drafts through natural language | Full conversation history in context; AI sees prior drafts and refinement requests naturally |
| CHAT-06 | User can switch persona and manage context through conversation | Persona dropdown near input; switching sends extra body param; server rebuilds system prompt with new persona |
| CHAT-07 | AI responses stream in real-time via SSE | `@ai-sdk/svelte` Chat class + `toUIMessageStreamResponse()` provides SSE streaming |
| CHAT-08 | Chat context includes: original post, voice profile, conversation history, and user instructions | `system` prompt built server-side from post + persona + voice profile; `messages` from Chat class carry conversation history |
| DRFT-01 | Every draft generation creates a new version (never overwrites previous) | Each AI message with a draft is a new chat message; drafts extracted and stored in `draft_edits` when edited |
| DRFT-02 | User can copy any draft to clipboard with one click | Copy button on each draft block using `navigator.clipboard.writeText()` |
| DRFT-03 | User can edit a draft inline before copying | Edit button toggles contenteditable/textarea on draft block; save/cancel controls |
| DRFT-04 | When a user edits a draft, both original and edited versions are stored with diff logged | `draft_edits` table stores messageId, original text, edited text, and a computed diff |
| PERS-05 | User can switch active persona through the chat interface | Persona dropdown widget near chat input; change triggers `updatePersona` on queue service + system message in chat |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | 6.0.91 | Server-side `streamText`, `convertToModelMessages`, `toUIMessageStreamResponse` | Vercel's official AI SDK, locked by prior decision |
| `@ai-sdk/svelte` | 4.0.91 | `Chat` class with Svelte 5 reactive state | Official Svelte adapter for AI SDK v6 |
| `@ai-sdk/anthropic` | 3.0.45 | Anthropic provider for Claude models | Already used in Phase 2 voice extraction |
| `drizzle-orm` | 0.45.1 | ORM for chat_messages + draft_edits tables | Already used throughout codebase |
| `zod` | 3.x | Input validation for chat API endpoint | Already used for all API validation |
| `svelte` | 5.51.3 | Svelte 5 runes (`$state`, `$derived`) | Already used throughout |

### Supporting (No New Dependencies Needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@neondatabase/serverless` | Installed | Neon HTTP driver for production | Already used via `getDb()` factory |
| `pg` | 8.x (dev) | Local dev PostgreSQL driver | Already used via `getDb()` factory |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `toUIMessageStreamResponse()` | `toTextStreamResponse()` | Text stream is simpler but doesn't support the Chat class UI message protocol — Chat class requires UIMessage stream format |
| `DefaultChatTransport` | Custom `TextStreamChatTransport` | Text stream transport exists but loses structured message parts (tool calls, metadata). Default is correct for this use case |
| New `draft_edits` table | JSONB column on `chat_messages` | Separate table is cleaner for querying edits for voice training (DRFT-04); follows existing `manualEdits` pattern |

**Installation:**
```bash
# No new packages needed — all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── server/
│   │   ├── services/
│   │   │   ├── chat.ts              # createChatService(db) — CRUD for chat_messages
│   │   │   ├── draft.ts             # createDraftService(db) — draft edit storage
│   │   │   └── queue.ts             # Add updateStatus() method
│   │   └── db/
│   │       └── schema.ts            # Add chatMessages + draftEdits tables
│   ├── components/
│   │   └── chat/
│   │       ├── ChatInterface.svelte  # Main chat container (Chat class, message list, input)
│   │       ├── ChatMessage.svelte    # Single message bubble (handles text + draft blocks)
│   │       ├── DraftBlock.svelte     # Draft display with copy/edit/count
│   │       ├── PostContextCard.svelte # Pinned post card above chat
│   │       └── PersonaSelector.svelte # Persona badge/dropdown near input
│   └── schemas/
│       └── chat.ts                   # Zod schemas for chat API input
├── routes/
│   └── (app)/
│       └── queue/
│           └── [id]/
│               ├── +page.svelte      # Rewrite: chat interface replaces placeholder
│               ├── +page.server.ts   # Load post + persona + voice profile + chat history
│               └── chat/
│                   └── +server.ts    # POST: streaming chat endpoint
```

### Pattern 1: Chat Class Initialization with Persisted Messages
**What:** Initialize the `Chat` class with messages loaded from the database, configure transport to point at the per-post chat endpoint.
**When to use:** On every `/queue/[id]` page load.
**Example:**
```typescript
// In +page.svelte
import { Chat } from '@ai-sdk/svelte';

let { data } = $props();

const chat = new Chat({
  id: data.post.id, // Use post ID as chat ID for persistence
  messages: data.chatMessages, // Pre-loaded from DB via +page.server.ts
  transport: new DefaultChatTransport({
    api: `/queue/${data.post.id}/chat`,
    body: {
      personaId: data.persona?.id,
    },
  }),
  onFinish: ({ message }) => {
    // Client-side: could update UI state after stream completes
  },
  onError: (error) => {
    // Handle streaming errors
  },
});
```

**Critical Svelte 5 gotcha:** Access `chat.messages` and `chat.status` directly as getters — do NOT destructure them. The Chat class uses `$state` internally, and destructuring breaks reactivity.

```svelte
<!-- CORRECT -->
{#each chat.messages as message (message.id)}

<!-- WRONG — loses reactivity -->
{@const { messages } = chat}
{#each messages as message (message.id)}
```

### Pattern 2: Server Streaming Endpoint with Persistence
**What:** SvelteKit `+server.ts` endpoint that receives messages from Chat transport, builds system prompt with context, streams response, and persists on finish.
**When to use:** The chat API endpoint.
**Example:**
```typescript
// src/routes/(app)/queue/[id]/chat/+server.ts
import { streamText, convertToModelMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

export const POST: RequestHandler = async ({ request, params, locals, platform }) => {
  const session = await locals.auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const { messages, id: chatId } = await request.json();

  // Load post, persona, voice profile from DB
  const post = await queueService.getById(session.user.id, params.id);
  const voiceProfile = await voiceService.getActiveVersion(post.personaId);

  // Build system prompt with full context
  const systemPrompt = buildChatSystemPrompt(post, voiceProfile);

  // Convert UI messages to model messages
  const modelMessages = await convertToModelMessages(messages);

  const anthropic = createAnthropic({ apiKey });

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages: modelMessages,
  });

  // Persist user message (last one) + AI response on finish
  return result.toUIMessageStreamResponse({
    onFinish: async ({ messages: allMessages, responseMessage }) => {
      // Persist the new user message and AI response to chat_messages table
      await chatService.persistMessages(params.id, messages, responseMessage);

      // Update post status if needed
      await handleStatusTransition(params.id, session.user.id, responseMessage);
    },
  });
};
```

### Pattern 3: Draft Block Detection via Markers
**What:** AI wraps draft text in `<draft>...</draft>` markers. Client-side parsing extracts these and renders as DraftBlock components.
**When to use:** Every time an AI message is rendered.
**Example:**
```typescript
// Parsing function
function parseDraftBlocks(text: string): Array<{ type: 'text' | 'draft'; content: string }> {
  const parts: Array<{ type: 'text' | 'draft'; content: string }> = [];
  const regex = /<draft>([\s\S]*?)<\/draft>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'draft', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}
```

### Pattern 4: Service Factory (Existing Codebase Pattern)
**What:** All services follow `createXService(db)` pattern returning an object of async methods.
**When to use:** For both `chatService` and `draftService`.
**Example:**
```typescript
// src/lib/server/services/chat.ts
export function createChatService(db: Db) {
  return {
    async getMessages(postId: string): Promise<ChatMessage[]> { ... },
    async persistMessages(postId: string, ...): Promise<void> { ... },
    async persistUserMessage(postId: string, ...): Promise<void> { ... },
  };
}
```

### Pattern 5: Body Parameters for Context Switching
**What:** The Chat transport's `body` option sends additional data (like `personaId`) alongside messages. Use the `Resolvable` pattern (function that returns the value) to make it dynamic.
**When to use:** When persona can change during a chat session.
**Example:**
```typescript
// Dynamic body — function is called on each request
const chat = new Chat({
  transport: new DefaultChatTransport({
    api: `/queue/${data.post.id}/chat`,
    body: () => ({
      personaId: currentPersonaId,  // Reactive value
    }),
  }),
});
```

### Anti-Patterns to Avoid
- **Destructuring Chat class properties:** `const { messages, status } = chat` breaks Svelte 5 reactivity. Always use `chat.messages`, `chat.status` directly.
- **Using `toTextStreamResponse()` with Chat class:** The Chat class expects UIMessage stream format. `toTextStreamResponse()` sends raw text chunks that the Chat transport can't parse into UIMessage parts.
- **Persisting in `streamText`'s `onFinish`:** The `streamText` `onFinish` fires with `text` and `steps`, not with `UIMessage` objects. Use `toUIMessageStreamResponse`'s `onFinish` instead — it provides the complete `responseMessage` as a `UIMessage`.
- **Module-scope DB connections:** The codebase uses per-request DB initialization via `getDb()`. Don't create module-level service instances.
- **Storing full conversation in a single JSON column:** Use a proper `chat_messages` table with individual rows for each message. This enables querying, indexing, and future analytics.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE streaming protocol | Custom SSE encoder/decoder | `toUIMessageStreamResponse()` + `DefaultChatTransport` | SSE format, reconnection, chunk parsing are complex; SDK handles it |
| Chat state management | Custom Svelte stores for messages | `@ai-sdk/svelte` Chat class | Handles optimistic updates, streaming state, abort, error recovery |
| UI → Model message conversion | Manual role/content mapping | `convertToModelMessages()` | Handles parts-based UIMessage format, tool calls, files correctly |
| Clipboard API | Custom clipboard fallback | `navigator.clipboard.writeText()` | Modern browsers all support it; the codebase targets modern browsers |
| Draft text extraction from AI | Complex NLP intent detection | Simple `<draft>` XML markers in system prompt | AI reliably follows formatting instructions; regex parsing is trivial |

**Key insight:** The AI SDK v6 Chat + streamText pipeline handles the entire streaming lifecycle — state management, SSE transport, message format conversion, error handling, abort. Trying to hand-roll any piece (like Phase 2 did with raw fetch) would break the integrated protocol.

## Common Pitfalls

### Pitfall 1: Svelte 5 Reactivity Loss with Chat Class
**What goes wrong:** Destructuring `chat.messages` or `chat.status` into local variables causes the UI to stop updating when messages stream in.
**Why it happens:** The Chat class stores state using Svelte 5 `$state` runes internally. Destructuring creates a snapshot, not a reactive binding.
**How to avoid:** Always reference `chat.messages`, `chat.status`, `chat.error` directly. In templates: `{#each chat.messages as msg}`. In derived: `const isStreaming = $derived(chat.status === 'streaming')`.
**Warning signs:** Chat appears to send messages but the UI doesn't update, or only shows the first chunk.

### Pitfall 2: Wrong onFinish Callback for Persistence
**What goes wrong:** Using `streamText`'s `onFinish` to persist messages but getting raw text instead of UIMessage objects.
**Why it happens:** `streamText.onFinish` fires with `{ text, steps, usage }` — it's for the model layer. `toUIMessageStreamResponse`'s `onFinish` fires with `{ messages, responseMessage }` — it's for the UI layer.
**How to avoid:** Pass `onFinish` to `toUIMessageStreamResponse()` options, not to `streamText()`. The UIMessage-level callback provides the properly formatted message for database persistence.
**Warning signs:** Persisted messages have raw text without proper part structure; reloaded conversations look different from streamed ones.

### Pitfall 3: Chat ID Mismatch Between Client and Server
**What goes wrong:** Messages don't persist correctly or load for wrong conversations.
**Why it happens:** The Chat class sends `id` (the chat ID) in the request body. If the server uses `params.id` (the post ID) independently, there's no issue — but if you try to use the body `id` for persistence, it might be auto-generated instead of the post ID.
**How to avoid:** Always use `params.id` (the URL parameter) as the authoritative post/chat identifier on the server. Set `id: data.post.id` in the Chat constructor so the client and server agree.
**Warning signs:** Messages save but don't load on page refresh; wrong messages appear in a chat.

### Pitfall 4: System Prompt Not Updating on Persona Switch
**What goes wrong:** After switching persona, the AI still responds in the old persona's voice.
**Why it happens:** The system prompt is built server-side on each request, but if `personaId` isn't sent in the request body, the server uses the post's stored persona.
**How to avoid:** Send `personaId` in the Chat transport's `body` (as a dynamic function). On the server, use the body's `personaId` if present, falling back to the post's `personaId`. Update the post's `personaId` in the database when the user switches.
**Warning signs:** Persona badge changes but AI voice doesn't change.

### Pitfall 5: Message Format Mismatch on Reload
**What goes wrong:** Messages loaded from the database don't match the UIMessage format, causing Chat class errors.
**Why it happens:** UIMessages have `{ id, role, parts: [{ type: 'text', text: '...' }] }` — not `{ role, content }`. If you store simplified messages, they won't reload correctly.
**How to avoid:** Store the full UIMessage structure (id, role, parts as JSONB) in the database. On load, reconstruct the exact UIMessage objects.
**Warning signs:** Page crashes on load for posts with existing chat history; empty messages appear.

### Pitfall 6: Cloudflare Workers Timeout on Long Responses
**What goes wrong:** Streaming cuts off mid-response for long AI generations.
**Why it happens:** Workers have a 30-second CPU time limit, but streaming keeps the connection alive. The actual risk is the AI model taking too long on first token or the response being extremely long.
**How to avoid:** Use `claude-sonnet-4-20250514` (fast) rather than Opus. Set reasonable `maxTokens` (1024-2048 for drafts). The streaming itself doesn't count against CPU time once started.
**Warning signs:** Responses cut off abruptly; 524 timeout errors.

### Pitfall 7: Race Condition on Status Transition
**What goes wrong:** Post status gets set to `in_progress` then immediately to `draft_ready` in the same response, or two concurrent requests cause inconsistent state.
**Why it happens:** If the AI generates a draft on the very first message, both transitions happen in the same `onFinish` callback.
**How to avoid:** Handle both transitions in a single `onFinish` — check current status and set the correct final state. `new` → `in_progress` always; then if draft detected, `in_progress` → `draft_ready`.
**Warning signs:** Posts stuck in "new" status after chatting; posts showing "draft_ready" before any conversation.

## Code Examples

Verified patterns from actual installed packages:

### Chat Class Initialization (Svelte 5)
```typescript
// Source: @ai-sdk/svelte@4.0.91 dist/chat.svelte.js + ai@6.0.91 types
import { Chat, type UIMessage } from '@ai-sdk/svelte';
import { DefaultChatTransport } from 'ai';

const chat = new Chat({
  id: postId,
  messages: initialMessages, // UIMessage[] from DB
  transport: new DefaultChatTransport({
    api: `/queue/${postId}/chat`,
    body: () => ({ personaId: activePersonaId }),
  }),
  onError: (error) => {
    console.error('Chat error:', error);
  },
  onFinish: ({ message }) => {
    // Client-side callback after stream completes
  },
});

// Send a message
await chat.sendMessage({ text: 'Draft a reply to this post' });

// Access reactive state (DO NOT destructure)
// chat.messages — UIMessage[]
// chat.status — 'ready' | 'submitted' | 'streaming' | 'error'
// chat.error — Error | undefined
```

### Server Endpoint with toUIMessageStreamResponse
```typescript
// Source: ai@6.0.91 types — streamText().toUIMessageStreamResponse()
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals, platform }) => {
  const session = await locals.auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const body = await request.json();
  const { messages, personaId } = body as { messages: UIMessage[]; personaId?: string };

  // ... load post, persona, voice profile ...

  const modelMessages = await convertToModelMessages(messages);

  const anthropic = createAnthropic({ apiKey });

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages: modelMessages,
    maxTokens: 2048,
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      // Persist the AI's response message
      await chatService.saveMessage(params.id, responseMessage);

      // Check for draft content and update status
      const hasDraft = responseMessage.parts.some(
        p => p.type === 'text' && p.text.includes('<draft>')
      );
      if (hasDraft) {
        await queueService.updateStatus(session.user.id, params.id, 'draft_ready');
      }
    },
  });
};
```

### UIMessage Structure (Parts-Based)
```typescript
// Source: ai@6.0.91 — UIMessage interface
// The Chat class sends and receives messages in this format:
interface UIMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  parts: Array<
    | { type: 'text'; text: string; state?: 'streaming' | 'done' }
    | { type: 'reasoning'; text: string }
    | { type: 'file'; data: string; mediaType: string }
    // ... other part types
  >;
  metadata?: unknown;
}

// Creating a user message:
const userMsg: UIMessage = {
  id: crypto.randomUUID(),
  role: 'user',
  parts: [{ type: 'text', text: 'Draft a reply to this post' }],
};
```

### Database Schema for Chat Messages
```typescript
// Drizzle schema following existing patterns (uuid PK, timestamps, JSONB)
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => postQueue.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
    parts: jsonb('parts').notNull(), // UIMessage.parts array
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('chat_messages_post_id_idx').on(table.postId),
    index('chat_messages_post_id_created_at_idx').on(table.postId, table.createdAt),
  ],
);

export const draftEdits = pgTable(
  'draft_edits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => postQueue.id, { onDelete: 'cascade' }),
    originalText: text('original_text').notNull(),
    editedText: text('edited_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('draft_edits_message_id_idx').on(table.messageId),
    index('draft_edits_post_id_idx').on(table.postId),
  ],
);
```

### DefaultChatTransport Request Body Format
```typescript
// Source: ai@6.0.91 dist/index.mjs HttpChatTransport.sendMessages
// The transport sends this JSON body to the endpoint:
{
  id: 'chat-id',           // From Chat constructor
  messages: UIMessage[],    // Full message history
  trigger: 'submit-message' | 'regenerate-message',
  messageId: string | undefined,
  ...body                   // Spread from transport.body option (e.g., { personaId })
}
```

### Persisting User Message Before AI Response
```typescript
// The Chat transport sends ALL messages (including the new user message).
// On the server, persist the user message that isn't yet in the DB:
async function persistNewUserMessage(
  postId: string,
  messages: UIMessage[],
  existingMessageIds: Set<string>,
) {
  const newMessages = messages.filter(m => !existingMessageIds.has(m.id));
  for (const msg of newMessages) {
    if (msg.role === 'user') {
      await db.insert(chatMessages).values({
        id: msg.id,
        postId,
        role: msg.role,
        parts: msg.parts,
      });
    }
  }
}
```

## State of the Art

| Old Approach (AI SDK v3) | Current Approach (AI SDK v6) | When Changed | Impact |
|--------------------------|------------------------------|--------------|--------|
| `useChat()` hook returning `{ messages, input, handleSubmit }` | `Chat` class with `sendMessage()`, `messages` getter | AI SDK v4+ | Class-based, no hook; Svelte adapter wraps with `$state` |
| `content: string` on messages | `parts: UIMessagePart[]` on messages | AI SDK v4+ | Messages have structured parts (text, reasoning, tools, files) |
| `StreamingTextResponse` | `toUIMessageStreamResponse()` | AI SDK v4+ | Structured SSE stream with message parts, not raw text |
| Manual message format conversion | `convertToModelMessages()` | AI SDK v4+ | Handles UIMessage → ModelMessage conversion automatically |
| `useChat({ api, body })` options | `new DefaultChatTransport({ api, body })` | AI SDK v6 | Transport layer is now separate, composable, testable |

**Deprecated/outdated:**
- `useChat` hook: Replaced by `Chat` class in v6 (hook pattern was React-oriented)
- `StreamingTextResponse`: Replaced by `toUIMessageStreamResponse()` (or `toTextStreamResponse()` for simple cases)
- `Message` type with `content: string`: Replaced by `UIMessage` with `parts: UIMessagePart[]`

## Open Questions

1. **User message persistence timing**
   - What we know: The server receives all messages (including the new user message) in each request. `toUIMessageStreamResponse.onFinish` provides the response message.
   - What's unclear: Should we persist the user message at the start of the request (before streaming) or in `onFinish` alongside the AI response? If the stream fails, should the user message still be persisted?
   - Recommendation: Persist user message at the start of the request handler (before `streamText`). This ensures the message is saved even if streaming fails. Persist AI response in `onFinish`. This also provides a natural "sent" state for the UI.

2. **Initial AI greeting message**
   - What we know: The decision specifies an AI greeting on first visit. This isn't a real AI call — it's a canned message.
   - What's unclear: Should this be a real AI-generated message (costs tokens) or a pre-built template message inserted into the DB?
   - Recommendation: Use a pre-built template message. Insert it into `chat_messages` when the chat is first opened (first page load with zero messages). Format: `"Ready to help you draft a reply to {author}'s post as {persona}. What angle do you want to take?"`. Save as a real assistant message so it appears in history on reload.

3. **Token budget for conversation context**
   - What we know: Claude Sonnet has a 200K context window. Conversations are typically short.
   - What's unclear: Should we limit conversation history sent to the model, or send everything?
   - Recommendation: Send all messages for now (decision says "no pagination, conversations are typically short"). Add a safety check: if total messages exceed ~50, truncate older messages from the middle (keep first 5 + last 20). Log a warning. This is a future concern, not a blocker.

4. **Draft detection in streaming text**
   - What we know: AI will use `<draft>` markers. During streaming, partial `<draft>` tags may appear.
   - What's unclear: How to handle rendering of partially streamed draft markers?
   - Recommendation: During streaming (when the text part has `state: 'streaming'`), render text as-is including partial tags. When the text part reaches `state: 'done'`, parse the `<draft>` markers and render DraftBlock components. This avoids complex partial-tag parsing during streaming.

## Sources

### Primary (HIGH confidence)
- `node_modules/ai/dist/index.d.mts` — AI SDK v6.0.91 type definitions, verified `UIMessage`, `Chat`, `streamText`, `toUIMessageStreamResponse`, `convertToModelMessages`, `DefaultChatTransport` APIs
- `node_modules/@ai-sdk/svelte/dist/chat.svelte.js` — Svelte Chat class implementation, verified `$state` usage for reactivity
- `node_modules/@ai-sdk/svelte/dist/chat.svelte.d.ts` — Chat class types extending `AbstractChat`
- `node_modules/ai/dist/index.mjs:12310-12370` — `HttpChatTransport.sendMessages` implementation, verified request body format `{ id, messages, trigger, messageId, ...body }`
- `src/lib/server/db/schema.ts` — Current schema (verified tables: users, accounts, sessions, verificationTokens, personas, writingSamples, voiceProfileVersions, postQueue)
- `src/routes/(app)/queue/[id]/+page.svelte:141-144` — Existing Phase 4 placeholder to replace
- `src/routes/(app)/personas/[id]/voice/+server.ts` — Phase 2 streaming pattern (streamText + toTextStreamResponse + onFinish)
- `src/lib/server/services/voice.ts` — Service factory pattern, `getActiveVersion()` for loading voice profiles
- `src/lib/server/services/queue.ts` — Queue service (no `updateStatus` method exists yet)
- `src/lib/components/persona/VoiceProfileDisplay.svelte` — Manual edits merge pattern (extractedProfile + manualEdits)
- `src/lib/schemas/voice-profile.ts` — VoiceProfile Zod schema structure
- `src/auth.ts` — Auth.js setup with JWT strategy, `locals.auth()` pattern
- `package.json` — Confirmed installed versions: ai@6.0.91, @ai-sdk/svelte@4.0.91, @ai-sdk/anthropic@3.0.45
- `wrangler.jsonc` — Cloudflare Workers config with nodejs_compat

### Secondary (MEDIUM confidence)
- `architecture.md` — System architecture reference (some sections describe planned features not yet implemented, e.g., `drafts` table in architecture.md is not in actual schema)

### Tertiary (LOW confidence)
- None — all findings verified against installed package code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All packages already installed, APIs verified from actual dist type definitions
- Architecture: HIGH — Patterns verified against existing codebase (service factory, per-request DB, streaming endpoint), new code follows same conventions
- Pitfalls: HIGH — Svelte 5 reactivity gotcha verified from Chat class source code; UIMessage format verified from types; transport body format verified from implementation source

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable — AI SDK v6 is well-established, no major breaking changes expected)
