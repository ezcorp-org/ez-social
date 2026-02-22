---
phase: quick
plan: 007
type: execute
wave: 1
depends_on: []
files_modified:
  - src/routes/(app)/+layout.svelte
  - src/routes/(app)/+layout.server.ts
autonomous: true

must_haves:
  truths:
    - "Pressing 'n' anywhere in the app (not in an input) opens a modal with the QuickAdd form"
    - "Pressing 'l' anywhere in the app (not in an input) navigates to the most recent post"
    - "Pressing Escape closes the QuickAdd modal"
    - "Hotkeys do not fire when user is typing in input, textarea, select, or contenteditable"
  artifacts:
    - path: "src/routes/(app)/+layout.svelte"
      provides: "Hotkey listener and QuickAdd modal"
  key_links:
    - from: "src/routes/(app)/+layout.svelte"
      to: "$lib/components/queue/QuickAdd.svelte"
      via: "modal render"
      pattern: "QuickAdd"
---

<objective>
Add keyboard shortcuts to the app layout: 'n' opens a modal with QuickAdd (reusing existing component), 'l' navigates to the most recent post.

Purpose: Power-user navigation for fast post creation and review.
Output: Updated app layout with hotkey handling and QuickAdd modal.
</objective>

<context>
@src/routes/(app)/+layout.svelte — App layout where hotkey listener will live
@src/routes/(app)/+layout.server.ts — May need to load personas for QuickAdd
@src/lib/components/queue/QuickAdd.svelte — Existing component to reuse in modal
@src/routes/(app)/+page.server.ts — Shows how personas are loaded
@src/routes/(app)/+page.svelte — Shows how QuickAdd is used
</context>

<tasks>

<task type="auto">
  <name>Task 1: Ensure layout server loads personas and latest post ID</name>
  <files>src/routes/(app)/+layout.server.ts</files>
  <action>
    Read the existing +layout.server.ts. Update (or create if needed) the layout load function to also return:
    1. `personas` — list of user's personas (needed by QuickAdd). Use `persona.list(userId)` from getServices.
    2. `latestPostId` — the ID of the most recent post. Use `queue.list(userId)` and take `posts[0]?.id ?? null`. Do NOT fetch all columns if there's a lighter query, but using the existing `list()` with a limit of 1 would be ideal. If adding a limit isn't straightforward with the existing service, just use `list()` and take the first result's ID.

    Check if the layout server already loads some of this data. Only add what's missing. The layout needs getServices access, which requires the event. Follow the same auth pattern used in +page.server.ts (check session, return empty defaults if not authenticated).
  </action>
  <verify>Run `bun run check` (or equivalent typecheck) to confirm no type errors.</verify>
  <done>Layout server returns personas array and latestPostId string|null to all app routes.</done>
</task>

<task type="auto">
  <name>Task 2: Add hotkey listener and QuickAdd modal to app layout</name>
  <files>src/routes/(app)/+layout.svelte</files>
  <action>
    Add to the app layout:

    1. Import QuickAdd and `goto` from `$app/navigation`.
    2. Add a `quickAddOpen` state (`$state(false)`).
    3. Add a `svelte:window` `on:keydown` handler:
       - Skip if `event.target` is an input, textarea, select, or has `contentEditable`.
       - Skip if any modifier key is held (ctrl, alt, meta, shift).
       - `n` -> set `quickAddOpen = true`, `event.preventDefault()`
       - `l` -> if `data.latestPostId` exists, `goto(`/queue/${data.latestPostId}`)`, `event.preventDefault()`
       - `Escape` -> if `quickAddOpen`, set `quickAddOpen = false`, `event.preventDefault()`
    4. Add a modal overlay (rendered conditionally when `quickAddOpen` is true):
       - Fixed position, full-screen backdrop with semi-transparent dark bg (`bg-black/50`)
       - Centered card with max-w-lg, same styling as existing surface cards
       - Header row: "Quick Add" title + close button (X)
       - Render `<QuickAdd personas={data.personas} />`
       - Click on backdrop (outside card) closes modal
       - Use `onclick|self` on the backdrop div (Svelte 5: use onclick with a check on event.target === event.currentTarget)

    Keep all existing layout code intact. Add the modal markup after the existing Toast component.

    IMPORTANT: Use Svelte 5 runes syntax. Event handlers use `onclick`, `onkeydown` etc (not `on:click`). The `svelte:window` element uses `onkeydown` attribute.
  </action>
  <verify>
    Run `bun run check` to confirm no type errors.
    Run `bun run build` to confirm the app builds.
    Manually verify: open the app, press 'n' -> modal opens with QuickAdd, press Escape -> modal closes, press 'l' -> navigates to latest post.
  </verify>
  <done>
    - Pressing 'n' opens QuickAdd in a modal overlay
    - Pressing Escape or clicking backdrop closes it
    - Pressing 'l' navigates to /queue/{latestPostId}
    - Hotkeys are ignored when typing in inputs/textareas
  </done>
</task>

</tasks>

<verification>
- `bun run check` passes with no type errors
- `bun run build` succeeds
- Hotkeys only fire outside of input fields
- Modal renders QuickAdd correctly and is dismissible
</verification>

<success_criteria>
- 'n' hotkey opens QuickAdd modal from any app page
- 'l' hotkey navigates to the most recent queue post
- Hotkeys are suppressed during text input
- Escape and backdrop click close the modal
- No regressions to existing layout or navigation
</success_criteria>

<output>
After completion, create `.planning/quick/007-add-hotkey-navigation-for-app/007-SUMMARY.md`
</output>
