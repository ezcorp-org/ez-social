<script lang="ts">
  import { goto } from "$app/navigation";
  import { voiceProfileSchema, type VoiceProfile } from "$lib/schemas/voice-profile";
  import VoiceProfileDiff from "$lib/components/persona/VoiceProfileDiff.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let phase = $state<"input" | "loading" | "diff">("input");
  let userPrompt = $state("");
  let newProfile = $state<VoiceProfile | null>(null);
  let accepting = $state(false);
  let error = $state<string | null>(null);

  async function handlePreview() {
    error = null;
    phase = "loading";
    try {
      const response = await fetch(`/personas/${data.persona.id}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPrompt, preview: true }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to generate preview");
      }

      const text = await response.text();
      newProfile = voiceProfileSchema.parse(JSON.parse(text));
      phase = "diff";
    } catch (e) {
      error = e instanceof Error ? e.message : "Something went wrong";
      phase = "input";
    }
  }

  async function handleAccept() {
    if (!newProfile) return;
    accepting = true;
    error = null;
    try {
      const response = await fetch(`/personas/${data.persona.id}/voice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: newProfile }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save changes");
      }
      goto(`/personas/${data.persona.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save changes";
      accepting = false;
    }
  }

  function handleDiscard() {
    goto(`/personas/${data.persona.id}`);
  }

  function handleEditPrompt() {
    phase = "input";
    newProfile = null;
    error = null;
  }
</script>

<div class="space-y-8" aria-live="polite">
  <!-- Header -->
  <div>
    <a href="/personas/{data.persona.id}" class="text-sm text-muted hover:text-secondary">
      &larr; Back to {data.persona.name}
    </a>
    <h1 class="mt-2 text-2xl font-bold text-primary">Refine Voice Profile</h1>
    <p class="mt-1 text-sm text-muted">{data.persona.name}</p>
  </div>

  <!-- Phase 1: Input -->
  {#if phase === "input"}
    <div class="rounded-xl border border-border-main bg-surface p-6">
      <p class="mb-4 text-sm text-secondary">
        Describe how you'd like your voice profile updated. For example: "make my tone more casual" or "I use more analogies than you're capturing."
      </p>
      {#if error}
        <div role="alert" class="mb-4 rounded-lg bg-status-danger-bg px-4 py-2 text-sm text-status-danger-text">{error}</div>
      {/if}
      <label for="refine-prompt" class="sr-only">Refinement instructions</label>
      <textarea
        id="refine-prompt"
        bind:value={userPrompt}
        rows={4}
        autofocus
        placeholder="e.g., I tend to be more sarcastic and use shorter sentences..."
        class="block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
      ></textarea>
      <button
        type="button"
        onclick={handlePreview}
        disabled={!userPrompt.trim()}
        class="mt-4 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Preview Changes
      </button>
    </div>
  {/if}

  <!-- Phase 2: Loading -->
  {#if phase === "loading"}
    <div class="rounded-xl border border-border-main bg-surface p-6" role="status">
      <div class="mb-4 rounded-lg bg-surface-alt px-3 py-2 text-sm text-secondary">
        {userPrompt}
      </div>
      <div class="flex items-center gap-3 text-sm text-secondary">
        <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Generating refined profile...
      </div>
      <div class="mt-6 space-y-4">
        <div class="h-24 animate-pulse rounded-lg bg-surface-dim"></div>
        <div class="h-16 animate-pulse rounded-lg bg-surface-dim"></div>
        <div class="h-20 animate-pulse rounded-lg bg-surface-dim"></div>
      </div>
    </div>
  {/if}

  <!-- Phase 3: Diff -->
  {#if phase === "diff" && newProfile}
    <div class="rounded-xl border border-border-main bg-surface p-6">
      <div class="mb-6 rounded-lg bg-surface-alt px-3 py-2 text-xs text-muted">
        {userPrompt}
      </div>
      {#if error}
        <div role="alert" class="mb-4 rounded-lg bg-status-danger-bg px-4 py-2 text-sm text-status-danger-text">{error}</div>
      {/if}
      <VoiceProfileDiff before={data.currentProfile as VoiceProfile} after={newProfile} />
      <div class="mt-6 flex items-center gap-3 border-t border-border-subtle pt-4">
        <button
          type="button"
          onclick={handleAccept}
          disabled={accepting}
          class="inline-flex items-center gap-2 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if accepting}
            <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving...
          {:else}
            Accept Changes
          {/if}
        </button>
        <button
          type="button"
          onclick={handleDiscard}
          disabled={accepting}
          class="rounded-lg border border-border-input px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onclick={handleEditPrompt}
          disabled={accepting}
          class="ml-auto text-sm text-muted hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Edit prompt
        </button>
      </div>
    </div>
  {/if}
</div>
