<script lang="ts">
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";
  import Toast from "$lib/components/Toast.svelte";
  import QuickAdd from "$lib/components/queue/QuickAdd.svelte";
  import { signOut } from "@auth/sveltekit/client";
  import { goto } from "$app/navigation";
  import { tick } from "svelte";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
  let mobileMenuOpen = $state(false);
  let quickAddOpen = $state(false);

  async function handleKeydown(event: KeyboardEvent) {
    // Escape closes the modal regardless of focus
    if (event.key === "Escape" && quickAddOpen) {
      quickAddOpen = false;
      event.preventDefault();
      return;
    }

    const target = event.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;

    if (event.key === "n") {
      quickAddOpen = true;
      event.preventDefault();
      await tick();
      document.querySelector<HTMLInputElement>('#modal-quick-add input[type="url"]')?.focus();
    } else if (event.key === "l") {
      if (data.latestPostId) {
        goto(`/queue/${data.latestPostId}`);
        event.preventDefault();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen bg-surface-alt">
  <nav class="border-b border-border-main bg-surface">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
      <a href="/" class="text-lg font-bold text-primary">ez-social</a>

      <button
        class="flex flex-col gap-1 md:hidden"
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
        aria-label="Toggle menu"
      >
        <div class="h-0.5 w-5 bg-secondary"></div>
        <div class="h-0.5 w-5 bg-secondary"></div>
        <div class="h-0.5 w-5 bg-secondary"></div>
      </button>

      <div class="hidden md:flex items-center gap-4">
        <a
          href="/"
          class="text-sm font-medium text-secondary hover:text-primary"
        >
          Dashboard
        </a>
        <a
          href="/personas"
          class="text-sm font-medium text-secondary hover:text-primary"
        >
          Personas
        </a>
        <a
          href="/settings"
          class="text-sm font-medium text-secondary hover:text-primary"
        >
          Settings
        </a>
        <span class="text-sm text-secondary">{data.session?.user?.email}</span>
        <button
          type="button"
          onclick={() => signOut({ redirectTo: "/login" })}
          class="rounded-md px-3 py-1.5 text-sm font-medium text-secondary hover:bg-surface-dim"
        >
          Sign out
        </button>
      </div>
    </div>

    {#if mobileMenuOpen}
      <div class="border-t border-border-main px-4 py-3 md:hidden">
        <div class="flex flex-col gap-3">
          <a
            href="/"
            class="text-sm font-medium text-secondary hover:text-primary"
            onclick={() => (mobileMenuOpen = false)}
          >
            Dashboard
          </a>
          <a
            href="/personas"
            class="text-sm font-medium text-secondary hover:text-primary"
            onclick={() => (mobileMenuOpen = false)}
          >
            Personas
          </a>
          <a
            href="/settings"
            class="text-sm font-medium text-secondary hover:text-primary"
            onclick={() => (mobileMenuOpen = false)}
          >
            Settings
          </a>
          <span class="text-sm text-secondary">{data.session?.user?.email}</span>
          <button
            type="button"
            onclick={() => { mobileMenuOpen = false; signOut({ redirectTo: "/login" }); }}
            class="rounded-md px-3 py-1.5 text-sm font-medium text-secondary hover:bg-surface-dim text-left"
          >
            Sign out
          </button>
        </div>
      </div>
    {/if}
  </nav>

  <main class="mx-auto max-w-5xl px-4 py-8">
    {@render children()}
  </main>
</div>

<Toast />

{#if quickAddOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    id="modal-quick-add"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={(e) => { if (e.target === e.currentTarget) quickAddOpen = false; }}
    onkeydown={() => {}}
  >
    <div class="w-full max-w-lg mx-4 rounded-lg border border-border-main bg-surface p-6 shadow-lg">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-primary">Quick Add</h2>
        <button
          type="button"
          onclick={() => (quickAddOpen = false)}
          class="rounded p-1 text-muted hover:text-primary hover:bg-surface-dim"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
      <QuickAdd personas={data.personas} onSuccess={() => (quickAddOpen = false)} />
    </div>
  </div>
{/if}
