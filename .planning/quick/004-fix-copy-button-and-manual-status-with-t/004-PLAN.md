---
phase: quick
plan: 004
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/components/chat/DraftBlock.svelte
  - src/lib/components/queue/QueueTable.svelte
  - src/routes/(app)/queue/[id]/+page.svelte
  - src/routes/(app)/queue/[id]/+page.server.ts
  - src/routes/(app)/+page.server.ts
  - src/routes/(app)/+page.svelte
autonomous: true

must_haves:
  truths:
    - "Copying a draft marks the post status as complete"
    - "Users can manually change post status from the queue table"
    - "Users can manually change post status from the post detail page"
    - "Status changes persist across page refresh"
  artifacts:
    - path: "src/lib/components/chat/DraftBlock.svelte"
      provides: "Copy button that also updates post status to complete"
    - path: "src/lib/components/queue/QueueTable.svelte"
      provides: "Inline status dropdown in queue table rows"
    - path: "src/routes/(app)/queue/[id]/+page.svelte"
      provides: "Status selector on post detail page"
    - path: "src/routes/(app)/queue/[id]/+page.server.ts"
      provides: "updateStatus form action"
    - path: "src/routes/(app)/+page.server.ts"
      provides: "updateStatus form action on dashboard"
  key_links:
    - from: "src/lib/components/chat/DraftBlock.svelte"
      to: "/queue/{postId}/drafts"
      via: "fetch POST with status update"
      pattern: "status.*complete"
    - from: "src/lib/components/queue/QueueTable.svelte"
      to: "?/updateStatus"
      via: "form action"
      pattern: "updateStatus"
---

<objective>
Fix the copy button in DraftBlock to mark the post as "complete" when a draft is copied to clipboard. Add a manual status selector so users can change post status from both the queue table and post detail page.

Purpose: Users need to track post progress. Copying a draft is the natural "done" signal, and manual overrides handle edge cases.
Output: Working copy-to-complete flow, inline status selectors, and tests.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/components/chat/DraftBlock.svelte
@src/lib/components/queue/QueueTable.svelte
@src/routes/(app)/queue/[id]/+page.svelte
@src/routes/(app)/queue/[id]/+page.server.ts
@src/routes/(app)/+page.server.ts
@src/lib/server/services/queue.ts
@src/routes/(app)/queue/[id]/drafts/+server.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copy marks post complete + status update endpoint</name>
  <files>
    src/lib/components/chat/DraftBlock.svelte
    src/routes/(app)/queue/[id]/drafts/+server.ts
    src/routes/(app)/queue/[id]/+page.server.ts
    src/routes/(app)/+page.server.ts
  </files>
  <action>
1. In `src/routes/(app)/queue/[id]/drafts/+server.ts`, when handling feedback with `action: "accepted"`, also update the post status to "complete" by calling `queue.updateStatus(userId, postId, "complete")`. Import `createQueueService` and instantiate it alongside draftService. The userId comes from `session.user.id`.

2. In `src/routes/(app)/queue/[id]/+page.server.ts`, add a new form action `updateStatus` that:
   - Gets session, validates auth
   - Reads `postId` and `status` from form data
   - Validates `status` is one of: "new", "in_progress", "draft_ready", "complete"
   - Calls `queue.updateStatus(session.user.id, postId, status)`
   - Returns `{ success: true }`

3. In `src/routes/(app)/+page.server.ts` (dashboard), add the same `updateStatus` form action (same logic as above). This is needed because the QueueTable renders on the dashboard page too.

4. In `src/lib/components/chat/DraftBlock.svelte`, no changes needed to the copy function itself since the server-side drafts endpoint will handle the status update. But add a visual indicator: after successful copy, show "Copied! (marked complete)" instead of just "Copied!" for 2 seconds.
  </action>
  <verify>
    - `bun run check` passes (no type errors)
    - The drafts POST endpoint with type "feedback" and action "accepted" also updates status
    - The updateStatus action exists on both page servers
  </verify>
  <done>
    - Copying a draft sends feedback AND marks post as complete server-side
    - updateStatus form action available on dashboard and post detail pages
    - Status validation rejects invalid values
  </done>
</task>

<task type="auto">
  <name>Task 2: Manual status selector UI on queue table and post detail</name>
  <files>
    src/lib/components/queue/QueueTable.svelte
    src/routes/(app)/queue/[id]/+page.svelte
  </files>
  <action>
1. In `src/lib/components/queue/QueueTable.svelte`, replace the static status badge in the status column (`<td>`) with an inline `<select>` dropdown wrapped in a `<form>` (same pattern as the persona dropdown already in the table). The form should:
   - Use `method="POST" action="?/updateStatus"` with `use:enhance`
   - Include hidden `<input name="postId">` with the post id
   - Have a `<select name="status">` with options: New, In Progress, Draft Ready, Complete
   - Use `onchange={(e) => e.currentTarget.form?.requestSubmit()}` for seamless submission (same pattern as persona dropdown)
   - Style the select with the same color coding as STATUS_BADGES (use conditional classes based on current value). Use a similar transparent-bg style as the persona selector: `rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-gray-300 focus:border-gray-400 focus:ring-1 focus:ring-gray-400 focus:outline-none`
   - Each `<option>` should be `selected` when matching `post.status`

2. In `src/routes/(app)/queue/[id]/+page.svelte`, add a status indicator/selector below the back link or inside the post context area. Add a small inline form with:
   - A label "Status:"
   - A styled `<select>` dropdown with options: New, In Progress, Draft Ready, Complete
   - Same form action pattern: `method="POST" action="?/updateStatus" use:enhance`
   - Hidden input for `postId`
   - `onchange` auto-submit
   - Use color-coded badge styling on the select itself (text color matching STATUS_BADGES)
   - Place it in the header area between the back link and the PostContextCard, aligned right
  </action>
  <verify>
    - `bun run check` passes
    - Status dropdown appears in queue table rows replacing static badges
    - Status dropdown appears on post detail page
    - Selecting a new status submits the form
  </verify>
  <done>
    - Queue table shows inline status dropdowns with color coding
    - Post detail page shows status selector in header area
    - Changing status auto-submits and persists without page reload
  </done>
</task>

<task type="auto">
  <name>Task 3: Integration tests for status update and copy-complete flow</name>
  <files>
    src/lib/server/services/queue.test.ts
  </files>
  <action>
Create `src/lib/server/services/queue.test.ts` with integration tests for the queue service's `updateStatus` method. Follow the same testing patterns used in `src/lib/server/services/persona.test.ts` (mock db, test service methods).

Test cases:
1. `updateStatus` sets status correctly and returns updated post
2. `updateStatus` with invalid postId returns null
3. `updateStatus` respects userId ownership (wrong user returns null)
4. `updateStatus` updates the `updatedAt` timestamp

Use the same mock/setup patterns as existing test files. Import from the queue service, mock the db layer.

Note: E2E and UI tests are not practical here since the project doesn't have Playwright or a component testing setup. Focus on service-level integration tests that actually run with `bun test`.
  </action>
  <verify>
    `bun test src/lib/server/services/queue.test.ts` passes all test cases
  </verify>
  <done>
    - Queue service updateStatus has test coverage
    - All tests pass with `bun test`
  </done>
</task>

</tasks>

<verification>
- `bun run check` passes with no type errors
- `bun test` passes all tests including new queue tests
- Copy button in DraftBlock triggers status update to "complete" via the drafts endpoint
- Status dropdown in queue table allows manual status changes
- Status dropdown on post detail page allows manual status changes
</verification>

<success_criteria>
- Copying a draft automatically marks the post as "complete"
- Users can manually change status from queue table dropdown
- Users can manually change status from post detail page dropdown
- Status changes persist (verified by page refresh showing new status)
- All new tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/004-fix-copy-button-and-manual-status-with-t/004-SUMMARY.md`
</output>
