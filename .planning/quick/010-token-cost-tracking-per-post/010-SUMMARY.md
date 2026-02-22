# Quick Task 010: Token Cost Tracking Per Post - Summary

## One-liner
Token usage tracking per AI call with MODEL_PRICING map, ai_usage_log table, and cost display in chat footer, queue table, and dashboard stats.

## What was built

### Plan 1: Model pricing + usage tracking on chat messages
- Added `MODEL_PRICING` map and `calculateCost()` to `src/lib/server/models.ts` - calculates cost in microcents (1/10000 of a cent) for precision
- Updated chat `+server.ts` to capture usage via `streamText`'s `onFinish` callback and persist as message metadata
- Added `getPostUsage()`, `getPostCosts()`, and `logUsage()` to chat service

### Plan 2: ai_usage_log table + voice/calibration tracking
- Added `ai_usage_log` table to schema with userId, postId, personaId, type, model, tokens, and cost columns
- Ran DB migration via `drizzle-kit push`
- Added usage logging to voice extraction endpoint (`/personas/[id]/voice`)
- Added usage logging to calibration endpoint (`/personas/[id]/calibrate`)
- Chat also logs to `ai_usage_log` for unified querying

### Plan 3: UI display
- Created `formatCost()` and `formatTokens()` utilities in `src/lib/utils/format.ts`
- Added cost footer to `ChatInterface.svelte` showing token counts and cost
- Added "Cost" column to `QueueTable.svelte` (hidden on small screens)
- Added total AI cost to `DashboardStats.svelte`
- Updated page loaders to fetch and pass cost data

### Tests
- **Unit tests**: calculateCost (7 cases), formatCost (4 cases), formatTokens (2 cases), chat service methods (5 cases)
- **E2E tests**: Chat interface with mocked AI response, cost column in queue table
- All 229 vitest tests pass, 2 playwright tests pass

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 8bb257d | feat | Token cost tracking backend - pricing map, usage capture, ai_usage_log |
| 1d07d2b | feat | Cost display in chat footer, queue table, dashboard |
| 349ec4c | test | Unit, integration, and e2e tests |

## Key files

### Created
- `src/lib/utils/format.ts` - Cost and token formatting utilities
- `src/lib/utils/format.test.ts` - Format utility tests
- `src/lib/server/services/chat.test.ts` - Chat service tests
- `e2e/token-cost.spec.ts` - E2E tests for cost display

### Modified
- `src/lib/server/models.ts` - MODEL_PRICING map and calculateCost()
- `src/lib/server/db/schema.ts` - ai_usage_log table
- `src/lib/server/services/chat.ts` - getPostUsage, getPostCosts, logUsage
- `src/routes/(app)/queue/[id]/chat/+server.ts` - Usage capture in onFinish
- `src/routes/(app)/personas/[id]/voice/+server.ts` - Usage logging
- `src/routes/(app)/personas/[id]/calibrate/+server.ts` - Usage logging
- `src/routes/(app)/queue/[id]/+page.server.ts` - Load usage data
- `src/routes/(app)/queue/[id]/+page.svelte` - Pass usage to ChatInterface
- `src/lib/components/chat/ChatInterface.svelte` - Cost footer
- `src/lib/components/queue/QueueTable.svelte` - Cost column
- `src/lib/components/queue/DashboardStats.svelte` - Total cost
- `src/routes/(app)/+page.server.ts` - Load post costs
- `src/routes/(app)/+page.svelte` - Pass costs to components
- `src/routes/(app)/server.test.ts` - Updated mocks

## Decisions Made

- **Microcents for cost storage**: Used integer microcents (1/10000 of a cent) to avoid floating point precision issues in aggregation
- **ai_usage_log for unified tracking**: Separate table instead of only metadata on chat messages, enabling querying across all AI call types (chat, voice, calibration)
- **streamText onFinish for usage capture**: Used streamText's own onFinish callback (not toUIMessageStreamResponse's) because it provides usage data
- **Direct imports for dashboard page**: Used direct createChatService import in +page.server.ts instead of extending getServices, to avoid breaking existing test mocks

## Deviations from Plan

None - plan executed as written.

## Duration
~10 minutes
