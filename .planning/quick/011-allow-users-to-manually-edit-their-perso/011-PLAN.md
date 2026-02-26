---
phase: quick
plan: 011
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/components/persona/VoiceProfileDisplay.svelte
autonomous: true

must_haves:
  truths:
    - "User can edit voiceDNA items inline (already works but needs polish)"
    - "User can edit dimension patterns (pattern text, evidence, signal level)"
    - "User can edit content modes (type, dominant patterns, shifts, example quotes)"
    - "User can edit inconsistency entries (description, contextA, contextB, assessment)"
    - "User can edit recommendation lists (leanInto, watchOutFor, develop)"
    - "User can edit consistency score summary text"
    - "Edits persist via the existing manualEdits/updateTraits backend"
    - "Edited fields show visual indicator that they have been manually modified"
  artifacts:
    - path: "src/lib/components/persona/VoiceProfileDisplay.svelte"
      provides: "Full inline editing for all voice profile sections"
  key_links:
    - from: "VoiceProfileDisplay.svelte"
      to: "personas/[id]/+page.server.ts?/updateTraits"
      via: "onEdit callback -> handleTraitEdit -> fetch updateTraits"
      pattern: "onEdit.*manualEdits"
---

<objective>
Add comprehensive inline editing to VoiceProfileDisplay so users can manually tweak all voice profile fields.

Purpose: Users need to fine-tune AI-extracted voice profiles. Currently only voiceDNA items have basic click-to-edit. This adds editing for dimensions (patterns), content modes, inconsistencies, recommendations, and consistency score.

Output: Enhanced VoiceProfileDisplay.svelte with full section editing capabilities.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/components/persona/VoiceProfileDisplay.svelte
@src/lib/schemas/voice-profile.ts
@src/routes/(app)/personas/[id]/+page.server.ts
@src/routes/(app)/personas/[id]/+page.svelte
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add comprehensive inline editing to VoiceProfileDisplay</name>
  <files>src/lib/components/persona/VoiceProfileDisplay.svelte</files>
  <action>
Enhance VoiceProfileDisplay.svelte to support editing all voice profile sections. The existing `editable` prop, `onEdit` callback, `manualEdits` merge logic, and `isEdited()` helper are already wired up. Extend the editing pattern used for voiceDNA to cover all sections.

**Current state:** Only voiceDNA items have click-to-edit (but the save logic is buggy -- it saves `voiceDNA` key but the edit value is just a string, not the full array). Fix this.

**Editing approach per section:**

1. **Voice DNA** (fix existing): Click item to edit inline. On save, construct the full voiceDNA array with the edited item replaced at its index, then call `onEdit({ ...manualEdits, voiceDNA: updatedArray })`.

2. **Dimension patterns** (structure, grammar, vocabulary, rhetoric): When a dimension is expanded, show an "Edit" button on each pattern. Clicking opens inline editing for the pattern's `pattern` (text input), `evidence` (text input), and `signal` (select: embedded/consistent/contextual). Save as `manualEdits.dimensions.{dimKey}` = full array with the edited pattern replaced.

3. **Content modes**: Add edit button per content mode. Inline editing for `type` (input), `dominantPatterns` (comma-separated input), `distinctiveShifts` (input), `exampleQuote` (textarea). Save as `manualEdits.contentModes` = full array with edited mode replaced.

4. **Inconsistencies**: Add edit button per item. Inline editing for `description` (input), `contextA` (input), `contextB` (input), `assessment` (input). Save as `manualEdits.inconsistencies` = full array with edited item replaced.

5. **Recommendations** (leanInto, watchOutFor, develop): Click any recommendation item to edit inline (text input). Save as `manualEdits.recommendations.{subKey}` = full array with edited item replaced.

6. **Consistency score**: Click summary text to edit (textarea). Save as `manualEdits.consistencyScore` = `{ ...existing, summary: newValue }`. Also allow editing the rating via a select dropdown.

**Editing UX pattern (consistent across all sections):**
- Use a single `editingField` state variable (string key like `dimensions.vocabulary.2` or `contentModes.1` or `recommendations.leanInto.0`)
- When editing, show input/textarea fields with Save/Cancel buttons
- Show a small pencil icon or subtle edit affordance on hover when `editable` is true
- Show a colored dot or "edited" badge on fields that have manual edits (use existing `isEdited` but extend it to check nested paths)
- Keep the component's existing visual style -- just add editing capability

**Manual edits merge strategy (important):** The `manualEdits` object uses top-level keys that map to VoiceProfile fields. For array fields (voiceDNA, contentModes, inconsistencies, dimension arrays, recommendation arrays), store the FULL replacement array in manualEdits. The existing `displayProfile` derived merge logic handles shallow merging, but for nested objects like `dimensions` and `recommendations`, do a deep merge in the `displayProfile` derivation.

**Fix the displayProfile merge** to handle nested paths properly:
- `dimensions`: merge each sub-key (structure, grammar, vocabulary, rhetoric) individually
- `recommendations`: merge each sub-key (leanInto, watchOutFor, develop) individually
- All other fields: existing shallow merge is fine

**Add/Remove capability:**
- Add a "+" button at the end of each array section (voiceDNA, patterns per dimension, content modes, inconsistencies, recommendation items) to add a new empty entry in edit mode
- Add a trash/remove icon on each array item when in edit mode to remove it
- These modify the manualEdits array accordingly

Do NOT create a separate component -- keep all editing logic within VoiceProfileDisplay.svelte. The component is already ~345 lines, adding editing will bring it to ~500-600 lines which is acceptable for a single display+edit component.
  </action>
  <verify>
Run `npm run check` to verify no TypeScript errors. Manually verify in browser: navigate to a persona with a voice profile, confirm all sections show edit affordances on hover, click to edit each section type, save edits, and verify they persist after page reload.
  </verify>
  <done>
All voice profile sections (voiceDNA, dimensions, content modes, inconsistencies, recommendations, consistency score) are editable inline. Edits save via the existing updateTraits action and display correctly after reload. Users can add and remove items from array sections.
  </done>
</task>

</tasks>

<verification>
- `npm run check` passes with no type errors
- Navigate to /personas/{id} with an existing voice profile
- Click to edit a voiceDNA item, save, verify it persists on reload
- Expand a dimension, edit a pattern's text and signal level, save, verify
- Edit a content mode's dominant patterns and distinctive shifts, save, verify
- Edit an inconsistency description, save, verify
- Edit a recommendation item, save, verify
- Edit the consistency score summary, save, verify
- Add a new voiceDNA item via "+", save, verify it appears
- Remove a recommendation item, save, verify it disappears
- Edited fields show visual "edited" indicator
</verification>

<success_criteria>
Users can manually edit every section of their voice profile inline without leaving the persona page. All edits persist through the existing manualEdits/updateTraits backend mechanism and survive page reloads.
</success_criteria>

<output>
After completion, create `.planning/quick/011-allow-users-to-manually-edit-their-perso/011-SUMMARY.md`
</output>
