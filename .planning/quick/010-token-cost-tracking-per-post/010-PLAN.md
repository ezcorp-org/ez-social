# Quick Task 010: Token Cost Tracking Per Post

## Goal
Track token input/output for every AI interaction (including system prompt) and show the cost per post so users can see exactly what each post costs them.

## Context
- 3 AI call sites: chat (`/queue/[id]/chat`), voice extraction (`/personas/[id]/voice`), calibration (`/personas/[id]/calibrate`)
- All use Vercel AI SDK `streamText()` which exposes `usage` in `onFinish` callback with `inputTokens`, `outputTokens`, `totalTokens`
- System prompts are included in `inputTokens` by the provider (Anthropic counts them as input)
- Only Anthropic models used currently — 5 models available
- Chat messages stored in `chatMessages` table with `metadata` JSONB column (already exists, currently stores personaId)
- No token tracking exists anywhere currently

## Model Pricing (per million tokens, as of Feb 2026)

| Model ID | Label | Input $/MTok | Output $/MTok |
|----------|-------|-------------|--------------|
| claude-opus-4-6 | Claude Opus 4.6 | $5.00 | $25.00 |
| claude-sonnet-4-6 | Claude Sonnet 4.6 | $3.00 | $15.00 |
| claude-sonnet-4-20250514 | Claude Sonnet 4 | $3.00 | $15.00 |
| claude-haiku-4-5-20251001 | Claude Haiku 4.5 | $1.00 | $5.00 |
| claude-opus-4-20250514 | Claude Opus 4 | $15.00 | $75.00 |

## Architecture

### Approach: Store usage on each assistant message in metadata JSONB

The `chatMessages.metadata` column already exists as JSONB. We'll extend it to include token usage and cost per AI response. This avoids a new table and keeps cost tightly coupled with the message that generated it.

For voice extraction and calibration (non-chat AI calls), we'll create a lightweight `ai_usage_log` table since those don't produce chat messages.

### Data Flow

```
streamText() → onFinish({ usage }) → persist { inputTokens, outputTokens, model, cost } into chatMessages.metadata
```

For per-post cost: `SUM(metadata->>'cost')` across all assistant messages for that post.

## Plans

### Plan 1: Model pricing config + usage tracking on chat messages (Wave 1)

**Files modified:**
- `src/lib/server/models.ts` — Add pricing map
- `src/routes/(app)/queue/[id]/chat/+server.ts` — Capture usage in onFinish
- `src/lib/server/services/chat.ts` — Add method to get total usage/cost for a post

**Tasks:**

1. Add `MODEL_PRICING` map to `src/lib/server/models.ts`:
   ```ts
   export const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
     "claude-opus-4-6": { inputPerMTok: 15, outputPerMTok: 75 },
     "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
     "claude-sonnet-4-20250514": { inputPerMTok: 3, outputPerMTok: 15 },
     "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
     "claude-opus-4-20250514": { inputPerMTok: 15, outputPerMTok: 75 },
   };

   export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
     const pricing = MODEL_PRICING[modelId];
     if (!pricing) return 0;
     return (inputTokens / 1_000_000) * pricing.inputPerMTok + (outputTokens / 1_000_000) * pricing.outputPerMTok;
   }
   ```

2. Update chat `+server.ts` onFinish to capture usage:
   - The `onFinish` in `toUIMessageStreamResponse` only gets `responseMessage`
   - Use `result.usage` promise (available on streamText result) to get token counts
   - After persisting the message, update its metadata with usage info:
     ```ts
     const usage = await result.usage;
     // update chatMessage metadata with { inputTokens, outputTokens, model, cost }
     ```
   - Actually, `streamText` `onFinish` callback does receive `usage` — but `toUIMessageStreamResponse`'s `onFinish` only gets `responseMessage`. So we need to capture usage separately via the result object or use `streamText`'s own `onFinish`.
   - **Strategy:** Add `onFinish` to `streamText()` call to capture usage, store it, then reference it in the response `onFinish`.

3. Add `getPostUsage(postId)` to chat service:
   ```ts
   // Sum inputTokens, outputTokens, cost from all assistant messages for a post
   // Returns { inputTokens: number, outputTokens: number, totalCost: number }
   ```

### Plan 2: Usage tracking for voice/calibration + ai_usage_log table (Wave 1, parallel)

**Files modified:**
- `src/lib/server/db/schema.ts` — Add `ai_usage_log` table
- `src/routes/(app)/personas/[id]/voice/+server.ts` — Capture usage
- `src/routes/(app)/personas/[id]/calibrate/+server.ts` — Capture usage
- DB migration

**Tasks:**

1. Add `ai_usage_log` table to schema:
   ```ts
   export const aiUsageLog = pgTable("ai_usage_log", {
     id: uuid("id").defaultRandom().primaryKey(),
     userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
     postId: uuid("post_id").references(() => postQueue.id, { onDelete: "set null" }),
     personaId: uuid("persona_id").references(() => personas.id, { onDelete: "set null" }),
     type: varchar("type", { length: 30 }).notNull(), // 'chat' | 'voice_extraction' | 'calibration'
     model: varchar("model", { length: 100 }).notNull(),
     inputTokens: integer("input_tokens").notNull(),
     outputTokens: integer("output_tokens").notNull(),
     cost: integer("cost_microcents").notNull(), // cost in microcents (1/10000 of a cent) for precision
     createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
   });
   ```

2. Run migration: `bunx drizzle-kit generate && bunx drizzle-kit push`

3. Update voice extraction `onFinish` to log usage to `ai_usage_log`

4. Update calibration `onFinish` to log usage to `ai_usage_log`

5. Also log chat usage to `ai_usage_log` (in addition to metadata) for unified querying

### Plan 3: UI — Show cost per post in chat footer + queue table (Wave 2)

**Depends on:** Plans 1 & 2

**Files modified:**
- `src/routes/(app)/queue/[id]/+page.server.ts` — Load usage data for post
- `src/routes/(app)/queue/[id]/+page.svelte` — Pass usage to ChatInterface
- `src/lib/components/chat/ChatInterface.svelte` — Display cost footer
- `src/lib/components/queue/QueueTable.svelte` — Add cost column
- `src/routes/(app)/+page.server.ts` — Load costs for all posts in queue
- `src/lib/utils/format.ts` — Cost formatting utility

**Tasks:**

1. Add `formatCost(microcents: number): string` utility:
   - `$0.00` for zero
   - `< $0.01` for very small amounts
   - `$0.03` for normal amounts
   - `$1.24` for larger amounts

2. Add `getPostCosts(postIds: string[])` to chat service — batch query for queue table

3. Update post detail `+page.server.ts` to load and return usage summary for the post

4. Add cost footer to `ChatInterface.svelte`:
   - Small text below the chat input showing: `Tokens: 1,234 in / 567 out · Cost: $0.03`
   - Updates when new messages come in (reactive to data)

5. Add "Cost" column to `QueueTable.svelte`:
   - Shows cost per post (e.g., `$0.03`)
   - Hidden on small screens like Persona/Added columns

6. Add total cost to `DashboardStats.svelte`:
   - New row: "Total AI cost: $1.24"

## Verification

- [ ] Send a chat message → assistant response metadata contains inputTokens, outputTokens, model, cost
- [ ] Check ai_usage_log has an entry for the chat interaction
- [ ] Voice extraction → ai_usage_log has entry with type='voice_extraction'
- [ ] Post detail page shows token count and cost in chat footer
- [ ] Queue table shows cost column for each post
- [ ] Dashboard shows total cost
- [ ] Cost calculation matches expected: e.g., 1000 input + 500 output on claude-sonnet-4 = (1000/1M * $3) + (500/1M * $15) = $0.003 + $0.0075 = $0.0105

## must_haves
- Token usage (input + output) captured for every AI call including system prompt
- Cost calculated using correct model pricing
- Cost visible per-post in the chat UI
- Cost visible in the queue table for all posts
