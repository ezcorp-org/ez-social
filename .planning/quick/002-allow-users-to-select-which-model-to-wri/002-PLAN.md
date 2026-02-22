---
phase: quick-002
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/server/db/schema.ts
  - src/lib/server/models.ts
  - src/routes/(app)/+layout.server.ts
  - src/routes/(app)/+layout.svelte
  - src/routes/(app)/settings/model/+server.ts
  - src/routes/(app)/personas/[id]/voice/+server.ts
  - src/routes/(app)/personas/[id]/calibrate/+server.ts
  - src/routes/(app)/queue/[id]/chat/+server.ts
autonomous: true

must_haves:
  truths:
    - "User can select which AI model to use from a dropdown in the nav"
    - "Selected model persists across sessions (stored in DB)"
    - "All AI features (voice extraction, calibration, chat) use the selected model"
    - "Default model is claude-sonnet-4-20250514 if no preference set"
  artifacts:
    - path: "src/lib/server/models.ts"
      provides: "Model list constant and helper to resolve user model"
    - path: "src/routes/(app)/settings/model/+server.ts"
      provides: "PUT endpoint to save model preference"
  key_links:
    - from: "src/routes/(app)/+layout.svelte"
      to: "/settings/model"
      via: "fetch PUT on dropdown change"
      pattern: "fetch.*settings/model"
    - from: "src/routes/(app)/queue/[id]/chat/+server.ts"
      to: "src/lib/server/models.ts"
      via: "import getUserModel"
      pattern: "getUserModel|getModelForUser"
---

<objective>
Allow users to select which Anthropic model to use for all AI features (voice extraction, calibration, chat draft generation).

Purpose: Different models have different cost/quality tradeoffs. Users should be able to choose.
Output: Model selector in nav, persisted preference in DB, all 3 AI endpoints respect the choice.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/server/db/schema.ts
@src/routes/(app)/+layout.server.ts
@src/routes/(app)/+layout.svelte
@src/routes/(app)/queue/[id]/chat/+server.ts
@src/routes/(app)/personas/[id]/voice/+server.ts
@src/routes/(app)/personas/[id]/calibrate/+server.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add model preference to DB schema, create model constants, and settings endpoint</name>
  <files>
    src/lib/server/db/schema.ts
    src/lib/server/models.ts
    src/routes/(app)/settings/model/+server.ts
  </files>
  <action>
    1. In `src/lib/server/db/schema.ts`, add a `preferredModel` column to the `users` table:
       - `preferredModel: varchar("preferred_model", { length: 100 })`
       - Nullable — null means "use default"

    2. Run `bunx drizzle-kit push` to apply the schema change.

    3. Create `src/lib/server/models.ts` with:
       - `AVAILABLE_MODELS` array of `{ id: string, label: string }` objects:
         - `{ id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }`
         - `{ id: "claude-haiku-4-20250514", label: "Claude Haiku 4" }`
         - `{ id: "claude-opus-4-20250514", label: "Claude Opus 4" }`
       - `DEFAULT_MODEL = "claude-sonnet-4-20250514"`
       - `resolveModel(preferred: string | null): string` — returns preferred if it's in AVAILABLE_MODELS, otherwise DEFAULT_MODEL

    4. Create `src/routes/(app)/settings/model/+server.ts` with a PUT handler:
       - Auth check (same pattern as other endpoints)
       - Parse body `{ model: string }`
       - Validate model is in AVAILABLE_MODELS (return 400 if not)
       - Update `users` table: `db.update(users).set({ preferredModel: model }).where(eq(users.id, userId))`
       - Return 200 with `{ model }`
  </action>
  <verify>
    `bunx drizzle-kit push` succeeds. `bun run build` compiles without errors.
  </verify>
  <done>
    Users table has `preferred_model` column. Model constants and resolver exist. Settings PUT endpoint accepts and persists model choice.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add model selector to nav and update all AI endpoints to use user's preferred model</name>
  <files>
    src/routes/(app)/+layout.server.ts
    src/routes/(app)/+layout.svelte
    src/routes/(app)/queue/[id]/chat/+server.ts
    src/routes/(app)/personas/[id]/voice/+server.ts
    src/routes/(app)/personas/[id]/calibrate/+server.ts
  </files>
  <action>
    1. Update `src/routes/(app)/+layout.server.ts`:
       - Import `getDb`, `users`, `eq` from drizzle
       - Import `AVAILABLE_MODELS`, `DEFAULT_MODEL` from `$lib/server/models`
       - After session check, query user's `preferredModel` from DB
       - Return `{ session, preferredModel: user.preferredModel ?? DEFAULT_MODEL, availableModels: AVAILABLE_MODELS }`
       - Use the same DB access pattern as other endpoints: `platform?.env?.DATABASE_URL ?? env.DATABASE_URL`
         Note: layout server load uses `event` not destructured `platform` — access via `event.platform?.env?.DATABASE_URL`

    2. Update `src/routes/(app)/+layout.svelte`:
       - Add a model selector `<select>` in the nav bar, between the nav links and the user email
       - Bind to `data.preferredModel`, populate options from `data.availableModels`
       - On change, fire `fetch("/settings/model", { method: "PUT", body: JSON.stringify({ model: selectedModel }) })`
       - Style: small select matching existing nav text style (`text-sm text-gray-600`), compact width
       - Show in both desktop and mobile menu sections
       - Use optimistic UI: update local state immediately, no page reload needed
       - Import `toasts` from `$lib/stores/toast` and show a brief success toast on save

    3. Update all 3 AI server endpoints to read user's preferred model from DB instead of hardcoding:
       - In each endpoint, after the existing DB setup and auth check, query the user's `preferredModel`:
         `const userRow = await db.select({ preferredModel: users.preferredModel }).from(users).where(eq(users.id, session.user.id)).then(r => r[0]);`
       - Import `resolveModel` from `$lib/server/models`
       - Replace `anthropic("claude-sonnet-4-20250514")` with `anthropic(resolveModel(userRow?.preferredModel ?? null))`
       - Files to update:
         - `src/routes/(app)/queue/[id]/chat/+server.ts` (line 144)
         - `src/routes/(app)/personas/[id]/voice/+server.ts` (line 230)
         - `src/routes/(app)/personas/[id]/calibrate/+server.ts` (line 155)

    To keep it DRY, consider adding a small helper in `src/lib/server/models.ts`:
    ```ts
    export async function getUserPreferredModel(db: DbType, userId: string): Promise<string> {
      const row = await db.select({ preferredModel: users.preferredModel }).from(users).where(eq(users.id, userId)).then(r => r[0]);
      return resolveModel(row?.preferredModel ?? null);
    }
    ```
    Then each endpoint just calls `const modelId = await getUserPreferredModel(db, session.user.id)` and uses `anthropic(modelId)`.

    Note on DB type: The project uses a dual-driver DB pattern (pg locally, neon on Workers). The `getDb()` return type is a union. Use the same typing approach as existing services — accept the db parameter with the same type used in service factories (check `createVoiceService` etc. for the pattern).
  </action>
  <verify>
    `bun run build` compiles. Manually test: load dashboard, see model selector in nav, change model, refresh page — selection persists. Start a chat — it uses the selected model (check server logs or response headers).
  </verify>
  <done>
    Model selector visible in nav. Changing model persists to DB. All 3 AI endpoints (chat, voice extraction, calibration) use the user's preferred model instead of hardcoded claude-sonnet-4-20250514.
  </done>
</task>

</tasks>

<verification>
- Model selector appears in nav bar on all app pages
- Selecting a different model and refreshing the page shows the same selection
- Voice extraction uses selected model (test on persona page)
- Chat draft generation uses selected model (test on queue item chat)
- Calibration uses selected model (test calibration flow)
- Default model is claude-sonnet-4-20250514 for users who haven't changed it
</verification>

<success_criteria>
- Users can select from 3 Anthropic models (Haiku 4, Sonnet 4, Opus 4)
- Selection persists in the database across sessions
- All AI-powered features respect the user's model choice
- No hardcoded model strings remain in endpoint files
</success_criteria>

<output>
After completion, create `.planning/quick/002-allow-users-to-select-which-model-to-wri/002-SUMMARY.md`
</output>
