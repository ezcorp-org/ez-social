---
phase: quick
plan: 009
type: execute
wave: 1
depends_on: []
files_modified:
  - src/routes/(app)/settings/+page.svelte
  - src/routes/(app)/+layout.svelte
autonomous: true

must_haves:
  truths:
    - "User can navigate to /settings from the nav bar"
    - "Settings page has Appearance tab with theme picker (light/dark/system) and model selector"
    - "Settings page has Integrations tab explaining the iOS Shortcut and providing a download link"
    - "Theme picker and model selector are removed from the nav bar (both desktop and mobile)"
    - "Nav bar is cleaner with just links, user email, and sign out"
  artifacts:
    - path: "src/routes/(app)/settings/+page.svelte"
      provides: "Settings page with tabbed UI"
  key_links:
    - from: "src/routes/(app)/+layout.svelte"
      to: "/settings"
      via: "nav link"
---

<objective>
Create a /settings page with two tabs: "Appearance" (theme picker + model selector moved from nav) and "Integrations" (iOS Shortcut explanation + download button). Clean up the nav bar by removing the theme and model dropdowns.

Purpose: Declutter the nav bar and give settings a proper home, while making the iOS Shortcut discoverable.
Output: New settings page, cleaned-up nav bar.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/routes/(app)/+layout.svelte
@src/lib/stores/theme.ts
@src/routes/(app)/settings/model/+server.ts
@src/routes/(app)/share/+page.server.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create settings page with Appearance and Integrations tabs</name>
  <files>src/routes/(app)/settings/+page.svelte</files>
  <action>
Create `src/routes/(app)/settings/+page.svelte` with a tabbed settings page. Use URL hash or a local $state variable for tab switching (local state is fine, no need for URL params).

**Appearance tab (default):**
- Theme picker: radio group or styled select for light/dark/system. Import and use the existing `theme` store from `$lib/stores/theme`. Show current selection.
- Model selector: select dropdown for AI model. Import `data.availableModels` and `data.preferredModel` from the parent layout data (already provided by `+layout.server.ts`). On change, PUT to `/settings/model` (same logic as current nav). Show toast on success/error using `toasts` store.
- Style both as labeled form fields with descriptions, not just bare dropdowns.

**Integrations tab:**
- Section titled "iOS Share Sheet" with an explanation: "Share URLs directly from Safari or any iOS app to instantly create a draft post."
- Brief "How it works" list: 1) Download the shortcut, 2) Share a URL from any app, 3) The shortcut opens ez-social and auto-creates a draft post with AI-generated content.
- Download button/link pointing to `/EZ Social.shortcut` (the static file). Style as a prominent button. Add a note that it requires the iOS Shortcuts app.
- Mention the share URL format is `https://ez-social.ezcorp.org/share?url=<encoded-url>` for reference.

**Tab UI:** Use a horizontal tab bar at the top (similar to the StatusTabs pattern). Use Tailwind for active/inactive tab styling with bottom border highlight. Tabs: "Appearance", "Integrations".

**Page layout:** Use the same max-width and padding patterns as other pages. Add an h1 "Settings" at the top.

Use Svelte 5 runes ($state, $derived). Follow existing component patterns (Tailwind utility classes, text-primary/text-secondary/bg-surface semantic colors).
  </action>
  <verify>Navigate to /settings in the browser. Verify both tabs render, theme picker works, model selector saves, and Integrations tab shows shortcut info with download link.</verify>
  <done>Settings page renders with two functional tabs. Appearance tab controls theme and model. Integrations tab explains and links to the iOS Shortcut.</done>
</task>

<task type="auto">
  <name>Task 2: Clean up nav bar - remove theme/model selects, add Settings link</name>
  <files>src/routes/(app)/+layout.svelte</files>
  <action>
Edit `src/routes/(app)/+layout.svelte`:

1. **Remove** the theme select dropdown from BOTH desktop nav (line ~101-109) and mobile nav (line ~147-155).
2. **Remove** the model select dropdown from BOTH desktop nav (line ~92-100) and mobile nav (line ~138-146).
3. **Remove** the `selectedModel` state, `saveModel` function, and `setTheme` function since they are no longer needed here.
4. **Remove** the theme store import (`import { theme, type ThemePreference } from "$lib/stores/theme"`) and the `toasts` import if no longer used in this file (check: toasts may still be used elsewhere in this file -- it is NOT used elsewhere, the only usage was in saveModel).
5. **Add** a "Settings" nav link in both desktop and mobile nav sections, between "Personas" and the user email. Use the same styling as existing nav links: `text-sm font-medium text-secondary hover:text-primary`. Link to `/settings`.
6. Keep everything else (Dashboard link, Personas link, sign out button, QuickAdd modal, keyboard shortcuts).

The nav should end up with: Dashboard | Personas | Settings | user@email | Sign out
  </action>
  <verify>Nav bar shows Dashboard, Personas, Settings links. No theme or model dropdowns in nav. Settings link navigates to /settings. Mobile menu also updated.</verify>
  <done>Nav bar is decluttered with theme/model controls moved to settings page. Settings link present in both desktop and mobile nav.</done>
</task>

</tasks>

<verification>
- `/settings` page loads with Appearance tab showing theme and model controls
- Changing theme on settings page applies immediately (dark/light/system)
- Changing model on settings page saves via PUT and shows toast
- Integrations tab shows iOS Shortcut info and download link
- Download link points to `/EZ Social.shortcut` and downloads the file
- Nav bar no longer has theme or model dropdowns
- Nav bar has Settings link that works on both desktop and mobile
</verification>

<success_criteria>
Settings page fully functional with both tabs. Nav bar cleaned up. All existing functionality (theme switching, model selection) preserved in new location.
</success_criteria>

<output>
After completion, create `.planning/quick/009-settings-page-integrations-tab-theme/009-SUMMARY.md`
</output>
