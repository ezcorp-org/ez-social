---
phase: quick
plan: 005
type: execute
wave: 1
depends_on: []
files_modified:
  - src/routes/(app)/personas/[id]/voice/+server.ts
  - src/routes/(app)/personas/[id]/+page.svelte
autonomous: true

must_haves:
  truths:
    - "User can type a free-form prompt describing how they want their voice profile updated"
    - "Submitting the prompt triggers a voice re-extraction that incorporates the prompt"
    - "The new voice profile version reflects the user's prompt instructions"
  artifacts:
    - path: "src/routes/(app)/personas/[id]/voice/+server.ts"
      provides: "userPrompt field support in POST body"
      contains: "userPrompt"
    - path: "src/routes/(app)/personas/[id]/+page.svelte"
      provides: "Prompt textarea UI for voice refinement"
      contains: "userPrompt"
  key_links:
    - from: "src/routes/(app)/personas/[id]/+page.svelte"
      to: "/personas/[id]/voice"
      via: "fetch POST with userPrompt in body"
      pattern: "userPrompt"
---

<objective>
Add ability for users to write a free-form prompt to update their voice profile. Similar to the existing calibrate flow but instead of rating sample replies, the user writes instructions like "make my voice more casual" or "I tend to use more analogies than you're capturing" and the AI re-extracts the profile incorporating those instructions.

Purpose: Give users direct control over voice profile refinement beyond the structured calibrate flow.
Output: Updated voice endpoint + textarea UI on persona detail page.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/routes/(app)/personas/[id]/voice/+server.ts
@src/routes/(app)/personas/[id]/+page.svelte
@src/lib/schemas/voice-profile.ts
@src/lib/server/services/voice.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add userPrompt support to voice extraction endpoint</name>
  <files>src/routes/(app)/personas/[id]/voice/+server.ts</files>
  <action>
Add `userPrompt?: string` to the POST body type. When `userPrompt` is provided:

1. Treat it like `recalibrate` mode — skip new sample validation (`skipNewSample = recalibrate || platformFilter || userPrompt`)
2. Require an active voice profile to exist (same as recalibrate check pattern)
3. Append a new feedback section to `feedbackSections` array:
   ```
   ## User Refinement Instructions
   The user has provided the following instructions for how their voice profile should be updated:

   "${body.userPrompt}"

   Carefully incorporate these instructions into the re-extracted voice profile. Adjust patterns, recommendations, and voice DNA to reflect what the user is asking for.
   ```

This is minimal — just add the field to body type, include it in `skipNewSample` check, and add it as a feedback section. The rest of the extraction pipeline (samples, AI call, onFinish save) handles everything already.
  </action>
  <verify>Read the file and confirm userPrompt is in the body type, included in skipNewSample logic, and appended to feedbackSections.</verify>
  <done>POST /personas/[id]/voice with { userPrompt: "make it more casual" } triggers a re-extraction using existing samples with the prompt as additional AI context.</done>
</task>

<task type="auto">
  <name>Task 2: Add prompt refinement UI to persona detail page</name>
  <files>src/routes/(app)/personas/[id]/+page.svelte</files>
  <action>
Add a "Refine with prompt" UI to the Voice Profile section of the persona detail page. Place it in the action links area next to "Calibrate Voice" and "Add more samples".

State variables to add:
- `showPromptRefine = $state(false)` — toggle the prompt textarea
- `userPrompt = $state("")` — the prompt text
- `refiningWithPrompt = $state(false)` — loading state

Add a link/button "Refine with Prompt" next to the existing "Calibrate Voice" link (separated by the same `|` pattern). When clicked, toggle `showPromptRefine`.

When `showPromptRefine` is true, render a section below the voice profile display (similar to the showExtractor pattern) with:
- A short description: "Describe how you'd like your voice profile updated. For example: 'make my tone more casual' or 'I use more analogies than you're capturing'."
- A `<textarea>` bound to `userPrompt`, 3 rows, placeholder "e.g., I tend to be more sarcastic and use shorter sentences..."
- A submit button "Update Voice Profile" (disabled when `userPrompt.trim()` is empty or `refiningWithPrompt` is true)
- When submitting: fetch POST to `/personas/${data.persona.id}/voice` with `{ userPrompt }`, show spinner, consume stream to completion, call `invalidateAll()`, reset state, hide the section

Follow existing patterns:
- Spinner SVG from the calibrate page (animate-spin pattern)
- Stream consumption pattern from `handlePlatformVoiceExtract` (read loop)
- Button styling: `bg-gray-900 text-white hover:bg-gray-800` (primary action)
- Section styling: border-t separator like the showExtractor section

Add a success notification after completion: set a `promptRefineSuccess = $state(false)` that auto-clears after 3 seconds (same pattern as transient notifications in the codebase — setTimeout).
  </action>
  <verify>Run `bun run check` to verify no type errors. Visually inspect the component renders the new UI elements.</verify>
  <done>User sees "Refine with Prompt" link on persona detail page, can type a prompt, submit it, and see the voice profile update with a success message.</done>
</task>

</tasks>

<verification>
- The voice endpoint accepts `userPrompt` in POST body and uses it during re-extraction
- The persona detail page shows a "Refine with Prompt" option when a voice profile exists
- Submitting a prompt triggers re-extraction and updates the voice profile
- No type errors from `bun run check`
</verification>

<success_criteria>
- User can type a free-form prompt on the persona detail page
- Submitting the prompt creates a new voice profile version incorporating the instructions
- UI shows loading state during extraction and success message after completion
- Existing calibrate and re-extract flows are unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/005-add-ability-for-users-to-write-a-prompt-/005-SUMMARY.md`
</output>
