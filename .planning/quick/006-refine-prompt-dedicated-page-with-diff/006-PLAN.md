---
phase: quick
plan: 006
type: execute
wave: 1
depends_on: []
files_modified:
  - src/routes/(app)/personas/[id]/voice/+server.ts
  - src/routes/(app)/personas/[id]/refine/+page.server.ts
  - src/routes/(app)/personas/[id]/refine/+page.svelte
  - src/routes/(app)/personas/[id]/+page.svelte
  - src/lib/components/persona/VoiceProfileDiff.svelte
autonomous: true

must_haves:
  truths:
    - "User can navigate to a dedicated refine page from the persona detail page"
    - "User can type refinement instructions and submit them"
    - "After submission, user sees a before/after comparison of old vs new voice profile"
    - "User can accept changes (saves new profile) or decline (discards and returns)"
    - "The inline refine prompt UI is removed from persona detail page"
  artifacts:
    - path: "src/routes/(app)/personas/[id]/refine/+page.svelte"
      provides: "Dedicated refine page with prompt input and diff display"
    - path: "src/routes/(app)/personas/[id]/refine/+page.server.ts"
      provides: "Load function for current voice profile data"
    - path: "src/lib/components/persona/VoiceProfileDiff.svelte"
      provides: "Side-by-side voice profile comparison component"
  key_links:
    - from: "src/routes/(app)/personas/[id]/refine/+page.svelte"
      to: "/personas/[id]/voice"
      via: "fetch with preview=true query param"
      pattern: "fetch.*voice.*preview"
    - from: "src/routes/(app)/personas/[id]/refine/+page.svelte"
      to: "/personas/[id]/voice"
      via: "fetch to accept (save) the previewed profile"
      pattern: "fetch.*voice.*accept"
---

<objective>
Move the "Refine with Prompt" voice profile feature to a dedicated page with a before/after diff flow. Instead of immediately saving refinements, show the user what changed and let them accept or decline.

Purpose: Users currently refine blind -- they submit a prompt and the profile updates without showing what changed. A diff view gives confidence and control over voice profile changes.

Output: New `/personas/[id]/refine` route with prompt input, streaming preview, before/after comparison, and accept/decline actions.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/routes/(app)/personas/[id]/+page.svelte
@src/routes/(app)/personas/[id]/+page.server.ts
@src/routes/(app)/personas/[id]/voice/+server.ts
@src/lib/server/services/voice.ts
@src/lib/schemas/voice-profile.ts
@src/lib/components/persona/VoiceProfileDisplay.svelte
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add preview mode to voice endpoint</name>
  <files>src/routes/(app)/personas/[id]/voice/+server.ts</files>
  <action>
  Modify the POST endpoint to support a `preview: true` flag in the request body. When `preview` is true:

  1. Add `preview?: boolean` to the body type
  2. In the `onFinish` callback, check if `preview` is true -- if so, skip the `voiceService.saveVersion()` call entirely. The streamed text still contains the full JSON profile, but it just does not get persisted.
  3. No other changes to the streaming or AI extraction logic.

  This is the minimal change -- the client receives the same streamed response either way, but preview mode does not create a new version in the DB.

  Also add a new endpoint or extend POST to handle accepting a previewed profile. The cleanest approach: add a PUT handler that accepts `{ profile: VoiceProfile, userPrompt?: string }` and saves it as a new version. This avoids re-running the AI:

  ```typescript
  export const PUT: RequestHandler = async ({ request, params, locals, platform }) => {
    // Auth check
    // Parse body: { profile: VoiceProfile }
    // Validate with voiceProfileSchema.parse(body.profile)
    // Get samples for stats (same as POST does)
    // Call voiceService.saveVersion() with the validated profile
    // Return 200 with { success: true }
  };
  ```

  The PUT handler needs the same DB setup pattern (getDb, createVoiceService) and sample stats calculation as POST. Extract the sample stats logic into a local helper to avoid duplication.
  </action>
  <verify>
  `bun run check` passes with no type errors. The existing POST behavior is unchanged when `preview` is not set (default behavior preserved).
  </verify>
  <done>POST with `preview: true` streams the profile without saving. PUT accepts a profile object and saves it as a new version.</done>
</task>

<task type="auto">
  <name>Task 2: Create VoiceProfileDiff component</name>
  <files>src/lib/components/persona/VoiceProfileDiff.svelte</files>
  <action>
  Create a Svelte 5 component that shows a before/after comparison of two VoiceProfile objects. Props:

  ```typescript
  let { before, after }: {
    before: VoiceProfile;
    after: VoiceProfile;
  } = $props();
  ```

  Layout: Two-column grid (stacks on mobile). Left column = "Current", right column = "Proposed".

  Sections to compare (top to bottom):
  1. **Voice DNA** -- Show both lists. Highlight items that are new in `after` (green-left border), removed from `before` (red-left border / strikethrough in left column), or unchanged (neutral).
  2. **Dimensions** -- For each dimension (structure, grammar, vocabulary, rhetoric), show pattern count change (e.g., "3 patterns -> 5 patterns"). Expand to show individual patterns only if counts differ.
  3. **Consistency Score** -- Show rating badge for both. Highlight if rating changed.
  4. **Recommendations** -- Show leanInto/watchOutFor/develop lists side by side with add/remove highlighting.

  Use simple string comparison for detecting changes (exact match on pattern text). Added items get `border-l-2 border-green-500 bg-green-50`, removed items get `border-l-2 border-red-500 bg-red-50 line-through opacity-60`.

  Keep it focused -- do NOT try to diff contentModes or inconsistencies in detail, just show counts ("2 modes -> 3 modes") since those are hard to meaningfully diff.

  Use Tailwind classes consistent with VoiceProfileDisplay.svelte styling (same text sizes, spacing, section headers).
  </action>
  <verify>`bun run check` passes. Component renders without errors when given two VoiceProfile objects.</verify>
  <done>VoiceProfileDiff component renders a clear before/after comparison highlighting additions, removals, and changes across Voice DNA, dimensions, consistency score, and recommendations.</done>
</task>

<task type="auto">
  <name>Task 3: Create the /refine route (page server + page)</name>
  <files>
    src/routes/(app)/personas/[id]/refine/+page.server.ts
    src/routes/(app)/personas/[id]/refine/+page.svelte
  </files>
  <action>
  **+page.server.ts:**
  Follow the same pattern as `[id]/+page.server.ts` -- auth check, load persona (redirect if not found), load active voice version. Return:
  ```typescript
  return {
    persona: { id, name },
    currentProfile: activeVersion?.extractedProfile ?? null,
  };
  ```
  If no voice profile exists, redirect to the persona page (cannot refine without a profile).

  **+page.svelte:**
  Three-phase UI flow managed by a `phase` state variable: `'input' | 'loading' | 'diff'`.

  Phase 1 -- Input (`phase === 'input'`):
  - Back link to `/personas/{id}` (same style as persona detail page back link)
  - Page title: "Refine Voice Profile" with persona name subtitle
  - Description text: "Describe how you'd like your voice profile updated."
  - Textarea (bind:value={userPrompt}, rows=4, same styling as persona detail page)
  - "Preview Changes" button (disabled when prompt is empty or loading)

  Phase 2 -- Loading (`phase === 'loading'`):
  - Same header
  - Show the prompt the user typed (read-only, gray bg)
  - Spinner + "Generating refined profile..." text
  - Underneath, show a pulsing placeholder mimicking the diff layout

  Phase 3 -- Diff (`phase === 'diff'`):
  - Same header
  - Show the prompt the user typed (read-only, gray bg, smaller)
  - VoiceProfileDiff component with `before={data.currentProfile}` and `after={newProfile}`
  - Two buttons at bottom:
    - "Accept Changes" (primary, bg-gray-900) -- PUTs to `/personas/{id}/voice` with the new profile, then navigates to `/personas/{id}`
    - "Discard" (secondary, border-gray-300) -- navigates back to `/personas/{id}` with no save

  **Streaming logic** (in the submit handler):
  ```typescript
  async function handlePreview() {
    phase = 'loading';
    const response = await fetch(`/personas/${data.persona.id}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPrompt, preview: true }),
    });
    // Consume the full stream to get the complete JSON
    const text = await response.text();
    newProfile = voiceProfileSchema.parse(JSON.parse(text));
    phase = 'diff';
  }
  ```

  Note: The endpoint streams but we just need the final result. Using `response.text()` will buffer the full stream, which is fine since we only show the diff after completion.

  **Accept handler:**
  ```typescript
  async function handleAccept() {
    accepting = true;
    await fetch(`/personas/${data.persona.id}/voice`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: newProfile }),
    });
    goto(`/personas/${data.persona.id}`);
  }
  ```

  Import `voiceProfileSchema` from `$lib/schemas/voice-profile` for client-side parsing of the streamed result. Import `goto` from `$app/navigation`.
  </action>
  <verify>`bun run check` passes. Navigate to `/personas/{id}/refine` -- page loads showing input form. Submit a prompt, see loading state, then diff view with accept/discard buttons.</verify>
  <done>Dedicated refine page with three-phase flow: input prompt, streaming preview, and before/after diff with accept/decline.</done>
</task>

<task type="auto">
  <name>Task 4: Replace inline refine UI with link to dedicated page</name>
  <files>src/routes/(app)/personas/[id]/+page.svelte</files>
  <action>
  In the persona detail page:

  1. Remove state variables: `showPromptRefine`, `userPrompt`, `refiningWithPrompt`, `promptRefineSuccess`
  2. Remove the `handlePromptRefine()` function
  3. Replace the "Refine with Prompt" toggle button (lines ~247-253) with a simple link:
     ```svelte
     <a
       href="/personas/{data.persona.id}/refine"
       class="text-sm text-gray-500 hover:text-gray-700"
     >
       Refine with Prompt
     </a>
     ```
  4. Remove the `{#if promptRefineSuccess}` success notification block (lines ~313-317)
  5. Remove the entire `{#if showPromptRefine}` block (lines ~320-349)
  6. In the toggle button for showExtractor (line ~256-261), remove the `if (showExtractor) showPromptRefine = false;` guard since showPromptRefine no longer exists

  Keep everything else intact -- the "Calibrate Voice" link, "Add more samples" toggle, version selector, platform voices, etc.
  </action>
  <verify>`bun run check` passes. The persona detail page renders without the inline refine UI. The "Refine with Prompt" text is now a link to `/personas/{id}/refine`.</verify>
  <done>Inline refine prompt UI fully removed from persona detail page, replaced with a navigation link to the new dedicated page.</done>
</task>

</tasks>

<verification>
1. `bun run check` -- no type errors across all modified files
2. Navigate to `/personas/{id}` -- "Refine with Prompt" is a link, not a toggle
3. Click "Refine with Prompt" -- navigates to `/personas/{id}/refine`
4. Type a prompt, click "Preview Changes" -- loading state shown, then diff view appears
5. Click "Accept Changes" -- profile saves, redirects to persona detail page with updated profile
6. Repeat and click "Discard" -- returns to persona page with no changes saved
7. Navigate to `/personas/{id}/refine` for a persona with no voice profile -- redirects to persona page
</verification>

<success_criteria>
- Voice profile refinement works through a dedicated page with preview-before-save flow
- Users see clear before/after comparison of their voice profile changes
- Accept saves the new version, Discard throws it away
- No inline refine UI remains on the persona detail page
- Existing voice extraction (new samples, recalibrate, platform override) is unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/006-refine-prompt-dedicated-page-with-diff/006-SUMMARY.md`
</output>
