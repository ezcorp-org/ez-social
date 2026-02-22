---
phase: quick-008
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/components/queue/QuickAdd.svelte
autonomous: true

must_haves:
  truths:
    - "Form submission failure shows a red toast notification"
    - "No inline error text appears in the QuickAdd component"
  artifacts:
    - path: "src/lib/components/queue/QuickAdd.svelte"
      provides: "QuickAdd form using toast for errors"
  key_links:
    - from: "src/lib/components/queue/QuickAdd.svelte"
      to: "src/lib/stores/toast.ts"
      via: "import toasts, call toasts.add(msg, 'error')"
      pattern: "toasts\\.add\\("
---

<objective>
Replace inline error display in QuickAdd with toast notifications.

Purpose: Consistent error UX across the app using the existing toast system.
Output: QuickAdd.svelte uses toasts.add() for errors, inline error markup removed.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/components/queue/QuickAdd.svelte
@src/lib/stores/toast.ts
@src/lib/components/Toast.svelte
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace inline error with toast in QuickAdd</name>
  <files>src/lib/components/queue/QuickAdd.svelte</files>
  <action>
    1. Import `toasts` from `$lib/stores/toast`.
    2. In `handleAddPost`, replace `errorMessage = result.data?.error ?? "Something went wrong"` with `toasts.add(result.data?.error ?? "Something went wrong", "error")`.
    3. Remove the `errorMessage` state variable declaration (`let errorMessage = $state("")`).
    4. Remove the `errorMessage = ""` reset at the top of `handleAddPost` (no longer needed — toasts auto-dismiss via setTimeout).
    5. Remove the inline error markup block: the `{#if errorMessage}...{/if}` paragraph (lines 165-167).
  </action>
  <verify>
    - `grep -c "errorMessage" src/lib/components/queue/QuickAdd.svelte` returns 0
    - `grep -c "toasts.add" src/lib/components/queue/QuickAdd.svelte` returns 1
    - `bun run check` passes (no type errors)
  </verify>
  <done>QuickAdd form errors display as red toast notifications via the shared toast store. No inline error text remains in the component.</done>
</task>

</tasks>

<verification>
- Submit an invalid URL in QuickAdd and confirm a red toast appears (bottom-right corner)
- No inline red text appears below the form
- Toast auto-dismisses after 4 seconds
</verification>

<success_criteria>
- errorMessage state and markup fully removed from QuickAdd.svelte
- toasts.add() called with "error" type on form failure
- Existing toast infrastructure handles display (no new components)
</success_criteria>

<output>
After completion, create `.planning/quick/008-toast-error-notifications-quickadd/008-SUMMARY.md`
</output>
