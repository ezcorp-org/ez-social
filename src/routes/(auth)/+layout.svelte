<script lang="ts">
  import type { Snippet } from "svelte";
  import { theme, type ThemePreference } from "$lib/stores/theme";

  let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-surface-alt">
  <div class="fixed top-4 right-4">
    <select
      value={$theme}
      onchange={(e) => theme.set(e.currentTarget.value as ThemePreference)}
      class="rounded border border-border-input bg-surface px-2 py-1 text-xs text-secondary"
    >
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="system">System</option>
    </select>
  </div>
  {@render children()}
</div>
