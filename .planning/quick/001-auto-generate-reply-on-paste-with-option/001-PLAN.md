---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/components/queue/QuickAdd.svelte
  - src/routes/(app)/+page.server.ts
  - src/routes/(app)/queue/[id]/+page.svelte
  - src/routes/(app)/queue/[id]/+page.server.ts
autonomous: true

must_haves:
  truths:
    - "User can paste a URL and optionally type a prompt before adding to queue"
    - "After adding a post with scraped content, user is redirected to the chat page"
    - "On the chat page, a draft reply is automatically generated using the user's prompt or a sensible default"
    - "If no prompt is provided, the system sends a default 'generate a draft reply' message"
  artifacts:
    - path: "src/lib/components/queue/QuickAdd.svelte"
      provides: "Optional prompt textarea + redirect on success"
    - path: "src/routes/(app)/+page.server.ts"
      provides: "addPost returns postId on all success cases"
    - path: "src/routes/(app)/queue/[id]/+page.svelte"
      provides: "Auto-send initial message when autoGenerate param present"
  key_links:
    - from: "QuickAdd.svelte"
      to: "/queue/[id]?autoGenerate=true"
      via: "goto() redirect after successful addPost"
      pattern: "goto.*queue.*autoGenerate"
    - from: "+page.svelte (queue/[id])"
      to: "ChatInterface.svelte"
      via: "autoGenerate prop triggers chat.sendMessage on mount"
      pattern: "autoGenerate|sendMessage"
---

<objective>
Add auto-draft-generation after pasting a URL. When a user pastes a link, they can optionally provide a prompt (e.g., "disagree with the premise"). After the post is added and content is scraped, redirect to the chat page and automatically send a message to trigger AI draft generation. If no prompt was provided, send a default message like "Draft a reply to this post."

Purpose: Eliminates the manual step of navigating to the chat page and typing "draft a reply" — the most common action after adding a post.
Output: Modified QuickAdd with optional prompt, auto-redirect, and auto-generation on the chat page.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/components/queue/QuickAdd.svelte
@src/routes/(app)/+page.server.ts
@src/routes/(app)/queue/[id]/+page.svelte
@src/routes/(app)/queue/[id]/+page.server.ts
@src/lib/components/chat/ChatInterface.svelte
@src/routes/(app)/queue/[id]/chat/+server.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add optional prompt to QuickAdd and redirect on success</name>
  <files>
    src/lib/components/queue/QuickAdd.svelte
    src/routes/(app)/+page.server.ts
  </files>
  <action>
**QuickAdd.svelte changes:**

1. Add a collapsible/expandable optional prompt textarea below the URL input. Use a small toggle link like "Add instructions (optional)" that reveals the textarea. Keep it collapsed by default so the UI stays clean for quick pastes.

2. Add a `prompt` state variable bound to the textarea. Add a hidden input `name="prompt"` in the addPost form so the prompt value is submitted with the form.

3. Import `goto` from `$app/navigation`. In `handleAddPost`, when the result is success and `result.data?.postId` exists (content was scraped — no `needsContent` flag), redirect using:
   ```
   goto(`/queue/${result.data.postId}?autoGenerate=true&prompt=${encodeURIComponent(prompt.trim())}`)
   ```
   If `needsContent` is true (scrape failed), keep current behavior (show manual content paste form) — do NOT redirect since there's no content to generate a reply from.

4. Do NOT call `await update()` before the `goto()` redirect — it would cause a flash of the refreshed dashboard.

**+page.server.ts changes:**

5. In the `addPost` action, the success case currently returns `{ success: true }` when scraping succeeds. Change it to ALWAYS return `postId` on success:
   ```ts
   return { success: true, postId: post.id };
   ```
   The `needsContent` case already returns `postId` — just add it to the happy path too.

6. Read the optional `prompt` field from formData: `const prompt = (formData.get("prompt") as string) ?? "";` — but it does NOT need to be stored in DB or used server-side. It travels through the redirect URL param. Just ensure it doesn't break form parsing (no-op read is fine, or simply let the form include it without reading it).
  </action>
  <verify>
- Build succeeds: `bun run build` (or `bun run check`)
- QuickAdd form submits with URL + optional prompt
- After successful add (with scraped content), browser redirects to `/queue/[postId]?autoGenerate=true`
- When scrape fails (needsContent), manual content form still shows correctly
  </verify>
  <done>
- QuickAdd has expandable optional prompt textarea
- Successful addPost with content redirects to chat page with autoGenerate param
- Failed scrape still shows manual content fallback (no redirect)
  </done>
</task>

<task type="auto">
  <name>Task 2: Auto-send initial message on chat page when autoGenerate is present</name>
  <files>
    src/routes/(app)/queue/[id]/+page.svelte
    src/routes/(app)/queue/[id]/+page.server.ts
    src/lib/components/chat/ChatInterface.svelte
  </files>
  <action>
**+page.server.ts (queue/[id]) changes:**

1. Skip the greeting message generation when `autoGenerate=true` is in the URL. Read `event.url.searchParams.get("autoGenerate")` in the load function. When truthy AND chatMessages is empty, do NOT generate the standard greeting. Instead, let the chat start clean — the auto-sent user message will be the first message, and the AI response (with draft) will follow. This avoids the greeting + auto-message looking awkward together.

2. Pass `autoGenerate` and `prompt` (from URL params) to the page data:
   ```ts
   const autoGenerate = event.url.searchParams.get("autoGenerate") === "true";
   const autoPrompt = event.url.searchParams.get("prompt") ?? "";
   ```
   Return these in the load data alongside existing fields.

**+page.svelte (queue/[id]) changes:**

3. Read `data.autoGenerate` and `data.autoPrompt` from page data. Pass them as props to ChatInterface:
   ```svelte
   <ChatInterface
     ...existing props...
     autoGenerate={data.autoGenerate}
     autoPrompt={data.autoPrompt}
   />
   ```

**ChatInterface.svelte changes:**

4. Add `autoGenerate = false` and `autoPrompt = ""` to the props interface (with defaults so existing usage is unaffected).

5. Add an `$effect` that runs once on mount when `autoGenerate` is true. It should:
   - Determine the message text: if `autoPrompt` is non-empty, use it. Otherwise use a sensible default like `"Draft a reply to this post."`
   - Call `chat.sendMessage({ text: messageText })` to trigger the AI generation
   - This is fire-and-forget — the Chat class handles streaming, persistence, status transitions, etc.

6. Use a guard variable (e.g., `let autoSent = false`) to ensure the auto-send only fires once, not on re-renders. Set it to true immediately before calling sendMessage.

7. After the redirect, the URL will have query params. Consider using `replaceState` from `$app/navigation` to clean the URL after the auto-send fires (remove `autoGenerate` and `prompt` params), so refreshing the page doesn't re-trigger. Use:
   ```ts
   import { replaceState } from "$app/navigation";
   replaceState(`/queue/${postId}`, {});
   ```
  </action>
  <verify>
- Paste a URL in QuickAdd (with scraped content available) -> redirected to chat page -> draft reply automatically starts generating
- Paste a URL with a custom prompt like "disagree politely" -> redirected -> AI generates draft using that angle
- Paste a URL with no prompt -> AI generates draft with default "Draft a reply" instruction
- Refresh the chat page after auto-generation -> does NOT re-trigger (URL params cleaned)
- Navigate to a chat page normally (clicking from dashboard) -> greeting message shows as before, no auto-generation
  </verify>
  <done>
- Auto-generate fires on redirect from QuickAdd, producing a draft reply without user intervention
- Custom prompts shape the draft angle
- Default prompt produces a generic draft
- No re-trigger on refresh
- Normal chat page navigation is unaffected
  </done>
</task>

</tasks>

<verification>
1. Full flow test: Paste URL -> optional prompt -> Add to Queue -> auto-redirect -> draft streams in
2. No-prompt flow: Paste URL -> leave prompt empty -> Add to Queue -> auto-redirect -> default draft streams in
3. Failed scrape flow: Paste URL that fails scraping -> manual content form appears (no redirect)
4. Normal navigation: Click existing post from dashboard -> greeting message, no auto-generation
5. Refresh safety: After auto-generation completes, refresh page -> no re-trigger
</verification>

<success_criteria>
- Pasting a URL with scraped content auto-navigates to chat and generates a draft reply
- Optional prompt input available and used when provided
- Failed scrapes still show manual content fallback
- Existing chat page behavior preserved for non-redirected navigation
- Clean URL after auto-generation (no stale query params)
</success_criteria>

<output>
After completion, create `.planning/quick/001-auto-generate-reply-on-paste-with-option/001-SUMMARY.md`
</output>
