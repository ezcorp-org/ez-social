# Architecture Research: Chat-First AI Reply System

**Domain:** Chat-first AI social reply tool (new components for ez-social)
**Researched:** 2026-02-17
**Confidence:** HIGH (Cloudflare Workers streaming, AI SDK patterns) / MEDIUM (voice calibration feedback loop)

> **Scope:** This document covers NEW components not in the existing `architecture.md`: chat system, voice profile retrieval for prompts, AI prompt chaining, streaming responses on Workers, and data model additions. The existing architecture (SvelteKit on Cloudflare Workers, Drizzle ORM, Neon DB, session auth, personas, voice profiles, post queue, drafts, audit log) is assumed and not repeated.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Frontend (SvelteKit)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  Chat UI     │  │  Voice       │  │  Queue/Draft │                  │
│  │  Component   │  │  Calibration │  │  Views       │                  │
│  │              │  │  UI          │  │  (existing)  │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │ SSE stream       │ REST            │ REST                     │
├─────────┴──────────────────┴────────────────┴──────────────────────────┤
│                        API Layer (SvelteKit +server.ts)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  /api/chat/  │  │  /api/voice/ │  │  /api/queue/ │                  │
│  │  [postId]/   │  │  calibrate/  │  │  (existing)  │                  │
│  │  +server.ts  │  │  +server.ts  │  │              │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                  │                  │                          │
├─────────┴──────────────────┴────────────────┴──────────────────────────┤
│                        Service Layer                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Chat        │  │  Prompt      │  │  Voice       │  │  Draft     │  │
│  │  Service     │  │  Chain       │  │  Service     │  │  Service   │  │
│  │              │  │  Engine      │  │  (enhanced)  │  │  (existing)│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                  │                  │                │         │
├─────────┴──────────────────┴────────────────┴────────────────┴─────────┤
│                        Data Layer                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  chat_       │  │  voice_      │  │  drafts      │                  │
│  │  messages    │  │  calibration │  │  (existing,  │                  │
│  │  (NEW)       │  │  (NEW)       │  │   linked)    │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
│                        Neon DB (PostgreSQL)                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Chat UI** | Renders per-post conversation, handles SSE streaming display, user input | Chat API endpoint (SSE + REST) |
| **Chat Service** | Persists messages, loads conversation history, manages chat lifecycle | DB (chat_messages), Prompt Chain Engine |
| **Prompt Chain Engine** | Assembles multi-step prompts: voice profile + post content + conversation context → AI call | Voice Service, AI SDK, Chat Service |
| **Voice Service** (enhanced) | Extracts voice profiles from samples, stores JSONB, serves profiles for prompt assembly, processes calibration feedback | DB (voice_profiles, voice_calibration) |
| **Voice Calibration UI** | Shows AI-generated samples, collects user feedback (accept/reject/tweak), triggers re-extraction | Voice calibrate API endpoint |
| **Draft Service** (linked) | Creates versioned drafts from chat-generated content, maintains existing draft model | DB (drafts), linked from Chat Service |
| **Streaming API Endpoint** | SvelteKit `+server.ts` returning SSE `ReadableStream` for AI responses | Cloudflare Workers runtime, AI SDK |

## Recommended Project Structure (New Files Only)

```
src/
├── lib/
│   ├── server/
│   │   ├── services/
│   │   │   ├── chat.ts              # Chat message CRUD, conversation loading
│   │   │   ├── prompt-chain.ts      # Prompt assembly: voice + post + context → messages
│   │   │   ├── voice.ts             # ENHANCED: add calibration feedback processing
│   │   │   ├── ai.ts                # AI SDK wrapper (replaces opencode.ts)
│   │   │   └── draft.ts             # ENHANCED: link draft creation from chat
│   │   └── db/
│   │       └── schema.ts            # ADD: chat_messages, voice_calibration tables
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatContainer.svelte  # Per-post chat wrapper (loads history, manages SSE)
│   │   │   ├── MessageList.svelte    # Renders conversation messages
│   │   │   ├── MessageBubble.svelte  # Individual message (user/assistant/system/draft)
│   │   │   ├── ChatInput.svelte      # Text input with send button
│   │   │   ├── StreamingText.svelte  # Displays in-progress streaming text
│   │   │   └── DraftCard.svelte      # Inline draft preview within chat
│   │   └── voice/
│   │       ├── CalibrationPanel.svelte   # Side panel for voice calibration
│   │       └── VoiceSampleCard.svelte    # Shows generated sample with accept/reject
│   └── stores/
│       └── chat.ts                   # Client-side chat state (messages, streaming status)
├── routes/
│   ├── queue/
│   │   └── [id]/
│   │       ├── +page.svelte          # ENHANCED: now hosts ChatContainer
│   │       └── +page.server.ts       # ENHANCED: loads chat history + post data
│   └── api/
│       ├── chat/
│       │   └── [postId]/
│       │       ├── +server.ts         # POST: send message + stream AI response (SSE)
│       │       └── history/
│       │           └── +server.ts     # GET: load conversation history
│       └── voice-profiles/
│           └── [id]/
│               └── calibrate/
│                   └── +server.ts     # POST: submit calibration feedback
```

### Structure Rationale

- **`services/chat.ts` separate from `services/draft.ts`:** Chat is the new primary interaction model; drafts are outputs of chat conversations. Clear separation lets chat service focus on message persistence and context assembly while draft service handles versioning.
- **`services/prompt-chain.ts` as its own module:** Prompt assembly is the core intelligence — it needs its own file because it involves complex template logic, context window management, and message format conversion. This is the most iterated-on code.
- **`services/ai.ts` replacing `opencode.ts`:** The architecture mentions "OpenCode SDK" — use the Vercel AI SDK with the OpenCode community provider (`@ai-sdk/opencode` or via OpenAI-compatible API). AI SDK provides `streamText`, SSE protocols, and Svelte bindings out of the box.
- **`components/chat/` folder:** Chat is a complex feature with multiple sub-components. Co-locating them prevents cluttering the main components folder.
- **API route `[postId]` nesting:** Every chat conversation is scoped to a post. This makes the URL structure RESTful and enforces the 1:1 post-to-chat relationship.

## Architectural Patterns

### Pattern 1: SSE Streaming on Cloudflare Workers via AI SDK

**What:** Use the Vercel AI SDK's `streamText` + `toTextStreamResponse()` to stream AI responses from SvelteKit `+server.ts` endpoints running on Cloudflare Workers. The AI SDK handles the `ReadableStream` creation, SSE formatting, and backpressure management.

**When to use:** Every AI response in the chat — draft generation, voice sample generation, general discussion.

**Trade-offs:**
- PRO: AI SDK handles all streaming complexity, works on Workers out of the box
- PRO: `@ai-sdk/svelte` `Chat` class provides client-side message management, streaming status
- CON: AI SDK is a meaningful dependency (~adds to bundle size, but tree-shakeable)
- CON: Need `nodejs_compat` flag on Workers (already configured in wrangler.jsonc)

**Confidence:** HIGH — Verified via AI SDK official Svelte quickstart and Cloudflare Workers streaming docs. Workers natively support `ReadableStream` responses with no duration limit for HTTP requests (only CPU time limits apply, default 30s paid plan).

**Example (API endpoint):**
```typescript
// src/routes/api/chat/[postId]/+server.ts
import { streamText, convertToModelMessages } from 'ai';
import type { RequestHandler } from './$types';
import { loadConversation, saveMessage } from '$lib/server/services/chat';
import { buildPromptMessages } from '$lib/server/services/prompt-chain';
import { getAIModel } from '$lib/server/services/ai';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const { message } = await request.json();
  const postId = params.postId;

  // 1. Save user message
  await saveMessage({ postId, role: 'user', content: message, userId: locals.user.id });

  // 2. Load full conversation + build prompt
  const conversation = await loadConversation(postId);
  const promptMessages = await buildPromptMessages(postId, conversation);

  // 3. Stream AI response
  const result = streamText({
    model: getAIModel(locals),
    messages: convertToModelMessages(promptMessages),
  });

  // 4. Save assistant message on completion
  result.then(async (final) => {
    await saveMessage({
      postId,
      role: 'assistant',
      content: await final.text,
      userId: locals.user.id,
      metadata: { model: final.response?.modelId, usage: final.usage },
    });
  });

  return result.toTextStreamResponse();
};
```

**Example (Svelte client):**
```svelte
<!-- ChatContainer.svelte -->
<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';

  let { postId, initialMessages } = $props();
  let input = $state('');

  const chat = new Chat({
    get id() { return postId; },
    get messages() { return initialMessages; },
    api: `/api/chat/${postId}`,
  });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (input.trim()) {
      chat.sendMessage({ text: input });
      input = '';
    }
  }
</script>

{#each chat.messages as message}
  <MessageBubble {message} />
{/each}

{#if chat.status === 'streaming'}
  <StreamingText />
{/if}

<form onsubmit={handleSubmit}>
  <ChatInput bind:value={input} disabled={chat.status !== 'ready'} />
</form>
```

### Pattern 2: Prompt Chain Assembly (Voice + Post + Context → Draft)

**What:** A multi-layer prompt construction that assembles system prompt (with voice profile), post context, conversation history, and user's current instruction into a messages array for the AI.

**When to use:** Every AI call in the chat system.

**Trade-offs:**
- PRO: Separating prompt assembly from AI calling makes testing and iteration easy
- PRO: Voice profile is injected as system prompt context, not user message — keeps it stable
- CON: Must manage context window limits (truncate old messages)

**Example:**
```typescript
// src/lib/server/services/prompt-chain.ts
import { getVoiceProfileForPost } from '$lib/server/services/voice';
import { getPostWithContent } from '$lib/server/services/queue';
import type { ChatMessage } from '$lib/server/db/schema';

interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MAX_CONTEXT_MESSAGES = 50; // Prevent token overflow

export async function buildPromptMessages(
  postId: string,
  conversationHistory: ChatMessage[],
): Promise<PromptMessage[]> {
  const post = await getPostWithContent(postId);
  const voiceProfile = await getVoiceProfileForPost(postId);

  const messages: PromptMessage[] = [];

  // 1. System prompt with voice profile
  messages.push({
    role: 'system',
    content: buildSystemPrompt(voiceProfile, post),
  });

  // 2. Conversation history (truncated to fit context window)
  const recentHistory = conversationHistory.slice(-MAX_CONTEXT_MESSAGES);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  return messages;
}

function buildSystemPrompt(voiceProfile: VoiceProfile | null, post: Post): string {
  const parts: string[] = [];

  parts.push(`You are a writing assistant helping draft a reply to a social media post.`);

  if (post.postContent) {
    parts.push(`\n## Original Post\n${post.postContent}`);
    if (post.platform) parts.push(`Platform: ${post.platform}`);
  }

  if (voiceProfile) {
    parts.push(`\n## Writing Voice\nMatch this style when generating drafts:`);
    parts.push(`Tone: ${voiceProfile.extractedStyle.tone}`);
    parts.push(`Vocabulary: ${voiceProfile.extractedStyle.vocabulary}`);
    parts.push(`Sentence structure: ${voiceProfile.extractedStyle.sentenceStructure}`);
    if (voiceProfile.extractedStyle.commonPhrases?.length) {
      parts.push(`Common phrases: ${voiceProfile.extractedStyle.commonPhrases.join(', ')}`);
    }
    if (voiceProfile.manualTweaks && Object.keys(voiceProfile.manualTweaks).length > 0) {
      parts.push(`Additional style notes: ${JSON.stringify(voiceProfile.manualTweaks)}`);
    }
  }

  parts.push(`\n## Instructions`);
  parts.push(`- When asked to generate a draft, produce a reply that matches the voice profile`);
  parts.push(`- When asked to refine, modify the most recent draft based on feedback`);
  parts.push(`- You can discuss the post, suggest angles, or answer questions about it`);
  parts.push(`- Keep drafts concise and appropriate for the platform`);

  return parts.join('\n');
}
```

### Pattern 3: Chat-to-Draft Bridge (Message Metadata for Draft Extraction)

**What:** When the AI generates a draft within the chat, the assistant message is tagged with metadata (`isDraft: true`). The system detects this and automatically creates a versioned draft record in the `drafts` table, linking it back to both the chat message and the post.

**When to use:** When the user asks the AI to "generate a draft", "write a reply", "try again", etc. The prompt chain instructs the AI to signal draft content.

**Trade-offs:**
- PRO: Drafts live in both the chat (visible in conversation) and the drafts table (for the existing queue workflow)
- PRO: Draft versioning preserved — each "try again" creates a new draft version
- CON: Need heuristic or AI tool-call to detect "this is a draft" vs "this is discussion"

**Implementation approach:** Use AI SDK tool calling. Define a `generateDraft` tool that the AI calls when producing a draft. The tool's server-side execution saves to the `drafts` table and returns the draft content to the chat.

```typescript
// Within the streamText call
tools: {
  saveDraft: tool({
    description: 'Save a generated draft reply to the drafts system',
    parameters: z.object({
      content: z.string().describe('The draft reply text'),
    }),
    execute: async ({ content }) => {
      const version = await getNextDraftVersion(postId);
      const [draft] = await db.insert(drafts).values({
        postId,
        version,
        content,
        promptUsed: systemPromptSummary,
        chatMessageId: currentMessageId,  // link back to chat
      }).returning();
      return { draftId: draft.id, version: draft.version, content };
    },
  }),
}
```

### Pattern 4: Voice Calibration Feedback Loop

**What:** After initial voice extraction, generate sample outputs and let users rate them. Store ratings in `voice_calibration` table. Use calibration data to refine the voice profile's `manualTweaks` JSONB field.

**When to use:** During initial persona setup and whenever the user feels drafts don't match their voice.

**Trade-offs:**
- PRO: Voice profiles improve over time based on real feedback
- PRO: Calibration data is structured (not just "good/bad" — captures what was wrong)
- CON: Requires multiple AI calls for sample generation
- CON: Re-extraction logic is complex

**Confidence:** MEDIUM — The feedback loop pattern is well-established in ML systems, but the specific implementation of "use calibration feedback to modify JSONB voice profile" needs experimentation during development. The exact prompt for re-extraction will need iteration.

## Data Flow

### Chat Message Flow (Primary)

```
User types message in ChatInput
    ↓
ChatContainer calls POST /api/chat/[postId]
    ↓
API endpoint:
  1. Save user message → chat_messages table
  2. Load full conversation from chat_messages
  3. Load voice profile from voice_profiles (via post → persona)
  4. Load post content from post_queue
  5. Build prompt messages (prompt-chain.ts)
  6. Call AI SDK streamText()
    ↓
SSE stream flows back to client
    ↓
Chat class (AI SDK Svelte) receives stream, updates messages reactively
    ↓
On stream complete:
  - Save assistant message → chat_messages table
  - If AI called saveDraft tool → insert into drafts table
  - Update post status if needed (pending → drafting)
```

### Voice Calibration Flow

```
User navigates to persona voice calibration
    ↓
Frontend requests sample generation: POST /api/voice-profiles/[id]/calibrate
    ↓
Server:
  1. Load current voice profile (extractedStyle JSONB)
  2. Generate 3 sample replies using voice profile + test prompts
  3. Return samples to client
    ↓
User rates each sample: accept / reject / tweak (with notes)
    ↓
POST /api/voice-profiles/[id]/calibrate with ratings
    ↓
Server:
  1. Save ratings → voice_calibration table
  2. If enough feedback (e.g., 3+ ratings):
     - Load all calibration entries for this profile
     - Build meta-prompt: "Given this voice profile and this feedback, refine the profile"
     - AI generates updated extractedStyle JSONB
     - Update voice_profiles.extractedStyle
     - Mark voice_profiles.updatedAt
```

### Context Assembly Flow (How Prompt Chain Works)

```
buildPromptMessages(postId, conversationHistory)
    ↓
┌─── Parallel fetches ──────────────────────────────┐
│  getPostWithContent(postId) → post content, URL    │
│  getVoiceProfileForPost(postId) → JSONB profile    │
└────────────────────────────────────────────────────┘
    ↓
Assemble system prompt:
  [Voice profile instructions]
  [Original post content]
  [Platform context]
  [Draft generation rules]
    ↓
Append conversation history (truncated to MAX_CONTEXT_MESSAGES)
    ↓
Return PromptMessage[] → passed to AI SDK streamText()
```

## Data Model Additions

### New Table: `chat_messages`

```typescript
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => postQueue.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),           // model, token usage, tool calls
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('chat_messages_post_id_created_at_idx').on(table.postId, table.createdAt),
  index('chat_messages_user_id_idx').on(table.userId),
]);
```

**Key decisions:**
- **1:N relationship with `post_queue`**: Each post has one conversation (many messages). No separate "conversation" table needed — the post IS the conversation anchor.
- **No separate conversation ID**: Simplicity. If a user wants to "restart" a conversation, we can add a `clearedAt` field later rather than a join table now.
- **`metadata` as JSONB**: Stores model ID, token usage, tool call results — varies per message, JSONB is ideal.
- **Composite index on (postId, createdAt)**: The primary query is "load all messages for this post in order."

### New Table: `voice_calibration`

```typescript
export const voiceCalibration = pgTable('voice_calibration', {
  id: uuid('id').defaultRandom().primaryKey(),
  voiceProfileId: uuid('voice_profile_id').notNull()
    .references(() => voiceProfiles.id, { onDelete: 'cascade' }),
  sampleContent: text('sample_content').notNull(),     // The AI-generated sample
  samplePrompt: text('sample_prompt'),                 // What prompt generated the sample
  rating: varchar('rating', { length: 20 }).notNull(), // 'accepted' | 'rejected' | 'tweaked'
  feedback: text('feedback'),                          // User's notes on what to change
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('voice_calibration_profile_id_idx').on(table.voiceProfileId),
]);
```

### Modified Table: `drafts` (add chat linkage)

```typescript
// Add to existing drafts table:
chatMessageId: uuid('chat_message_id').references(() => chatMessages.id, { onDelete: 'set null' }),
```

This links drafts created via chat back to the specific assistant message that generated them. Nullable because existing drafts (and any future non-chat drafts) won't have a chat message.

### New Relations

```typescript
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  post: one(postQueue, { fields: [chatMessages.postId], references: [postQueue.id] }),
  user: one(users, { fields: [chatMessages.userId], references: [users.id] }),
}));

export const voiceCalibrationRelations = relations(voiceCalibration, ({ one }) => ({
  voiceProfile: one(voiceProfiles, {
    fields: [voiceCalibration.voiceProfileId],
    references: [voiceProfiles.id],
  }),
}));

// Update existing postQueueRelations:
export const postQueueRelations = relations(postQueue, ({ one, many }) => ({
  user: one(users, { fields: [postQueue.userId], references: [users.id] }),
  persona: one(personas, { fields: [postQueue.personaId], references: [personas.id] }),
  drafts: many(drafts),
  chatMessages: many(chatMessages),  // NEW
}));
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Full Conversation in Single JSONB Column

**What people do:** Store entire chat history as a JSON array in a single column on `post_queue`.
**Why it's wrong:** Can't query individual messages, no indexing, grows unbounded, concurrent write conflicts, harder to paginate.
**Do this instead:** Separate `chat_messages` table with proper indexing. Each message is a row. Conversation is reconstructed via query.

### Anti-Pattern 2: Unbounded Context Window

**What people do:** Send entire conversation history to the AI on every message.
**Why it's wrong:** Token limits exceeded, costs skyrocket, responses degrade with too much context.
**Do this instead:** Cap conversation history at ~50 messages in prompt assembly. Summarize older context if needed (future optimization). The `MAX_CONTEXT_MESSAGES` constant in `prompt-chain.ts` handles this.

### Anti-Pattern 3: Client-Side Message Persistence

**What people do:** Use AI SDK's client-side message management as source of truth, sync to server later.
**Why it's wrong:** Lost on page refresh, inconsistent between devices, race conditions.
**Do this instead:** Server-first persistence. Save user message to DB before calling AI. Save assistant message after stream completes. Client loads from server on mount. The `Chat` class's `initialMessages` prop handles hydration.

### Anti-Pattern 4: Blocking AI Response to Save Message

**What people do:** `await saveMessage()` before returning the stream response.
**Why it's wrong on Workers:** Adds latency before streaming starts. The user waits for DB write + AI response start.
**Do this instead:** Save user message synchronously (fast, ~5ms on Neon HTTP), then start streaming. Save assistant message in the `onFinish` callback or via `waitUntil()`.

### Anti-Pattern 5: Manual SSE Implementation

**What people do:** Hand-craft `text/event-stream` responses with `TransformStream` and manual `data:` line formatting.
**Why it's wrong:** Error-prone, missing edge cases (reconnection, backpressure, cleanup), duplicates what AI SDK provides.
**Do this instead:** Use AI SDK's `streamText().toTextStreamResponse()` or `toUIMessageStreamResponse()`. These handle SSE formatting, backpressure, error propagation, and produce streams compatible with `@ai-sdk/svelte`'s `Chat` class.

## Scaling Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|-------------|-------------|-------------|
| Chat message storage | Single Neon DB, no issues | Index on (postId, createdAt) handles it | Consider partitioning chat_messages by date, or archiving old conversations |
| AI streaming concurrency | Cloudflare Workers auto-scales | Workers handles this natively (no connection pooling issues with Neon HTTP) | May need AI provider rate limiting, consider queue-based generation |
| Context window assembly | Simple query + in-memory assembly | Same — 50 messages per conversation is bounded | Same — bounded by MAX_CONTEXT_MESSAGES constant |
| Voice profile loading | Cache in memory (per-request) | Same — profile is small JSONB | Consider Cloudflare KV cache for hot profiles |

### Scaling Priorities

1. **First bottleneck: AI provider rate limits.** At ~50-100 concurrent chat users, you'll hit AI API rate limits before any infrastructure bottleneck. Mitigation: implement per-user rate limiting in chat endpoint, queue-based generation for bulk operations.
2. **Second bottleneck: Neon DB connection overhead.** Neon HTTP driver is stateless (no connection pooling needed on Workers), but at high concurrency, Neon's compute needs to scale. Mitigation: Neon auto-scales on paid plans; consider caching post content and voice profiles in Cloudflare KV.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| AI Provider (via AI SDK) | `streamText()` with provider model | Use `@ai-sdk/anthropic`, `@ai-sdk/openai`, or OpenCode community provider. Provider-agnostic via AI SDK abstraction. Configured via env var. |
| Neon DB | HTTP driver (`@neondatabase/serverless`) | Same as existing architecture. Chat messages use same connection factory. |
| Scraping Service | Existing REST client | Chat may trigger re-scrape if post content missing. No change needed. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Chat UI ↔ Chat API | SSE stream (AI responses) + REST (history load, message send) | Single POST endpoint handles both send + stream. GET endpoint for history. |
| Chat Service ↔ Draft Service | Direct function call | When AI calls `saveDraft` tool, chat service calls draft service to persist. No HTTP boundary — same server process. |
| Chat Service ↔ Voice Service | Direct function call | Prompt chain loads voice profile via voice service. Same process. |
| Voice Calibration ↔ AI | `generateText()` (non-streaming) | Sample generation and profile refinement use non-streaming `generateText()` since results are discrete, not conversational. |
| Queue page ↔ Chat | Component composition | `queue/[id]/+page.svelte` renders `ChatContainer` as primary UI. Chat is embedded in the existing page, not a separate route. |

## Build Order (Dependencies)

The components have clear dependencies that determine build order:

```
Phase 1: Data Foundation
  ├── chat_messages table + migration
  ├── voice_calibration table + migration
  └── drafts table modification (add chatMessageId)

Phase 2: AI Integration Layer
  ├── ai.ts — AI SDK wrapper (model config, provider setup)
  └── Depends on: env vars (AI_API_KEY), Workers config

Phase 3: Core Chat Backend
  ├── chat.ts — message CRUD service
  ├── prompt-chain.ts — prompt assembly
  └── Depends on: Phase 1 (tables), Phase 2 (AI wrapper)

Phase 4: Streaming API Endpoint
  ├── /api/chat/[postId]/+server.ts — POST with SSE streaming
  ├── /api/chat/[postId]/history/+server.ts — GET conversation
  └── Depends on: Phase 3 (chat + prompt-chain services)

Phase 5: Chat Frontend
  ├── ChatContainer, MessageList, MessageBubble, ChatInput, StreamingText
  ├── Integration with queue/[id] page
  └── Depends on: Phase 4 (API endpoints)

Phase 6: Draft-Chat Bridge
  ├── saveDraft tool definition
  ├── DraftCard component in chat
  ├── Draft versioning from chat
  └── Depends on: Phase 5 (working chat), existing draft system

Phase 7: Voice Calibration
  ├── Calibration API endpoint
  ├── CalibrationPanel + VoiceSampleCard components
  ├── Re-extraction logic
  └── Depends on: Phase 2 (AI wrapper), Phase 1 (calibration table)
```

**Key insight:** Voice calibration (Phase 7) is independent of the chat system (Phases 3-6) and can be built in parallel after Phase 2. The chat system is the critical path.

## Sources

- Cloudflare Workers Streams API: https://developers.cloudflare.com/workers/runtime-apis/streams/ — HIGH confidence (official docs)
- Cloudflare Workers Limits (no duration limit on HTTP, 5min CPU paid): https://developers.cloudflare.com/workers/platform/limits/ — HIGH confidence (official docs)
- AI SDK `streamText` and streaming patterns: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text — HIGH confidence (official docs)
- AI SDK Svelte bindings (`Chat` class, `@ai-sdk/svelte`): https://sdk.vercel.ai/docs/getting-started/svelte — HIGH confidence (official docs)
- AI SDK Chatbot Message Persistence: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence — HIGH confidence (official docs)
- AI SDK Stream Protocols (SSE data stream format): https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol — HIGH confidence (official docs)
- AI SDK Provider ecosystem (OpenCode community provider exists): https://sdk.vercel.ai/providers/ai-sdk-providers — MEDIUM confidence (community provider, not first-party)
- SvelteKit server-only modules: https://svelte.dev/docs/kit/server-only-modules — HIGH confidence (official docs)
- Voice profile calibration feedback loop — MEDIUM confidence (architectural pattern from ML systems, no specific library source; implementation details will need experimentation)

---
*Architecture research for: ez-social chat-first AI reply system*
*Researched: 2026-02-17*
