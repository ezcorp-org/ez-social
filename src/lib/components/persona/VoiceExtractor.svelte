<script lang="ts">
  import type { VoiceProfile } from "$lib/schemas/voice-profile";
  import VoiceProfileDisplay from "./VoiceProfileDisplay.svelte";
  import { toasts } from "$lib/stores/toast";

  let {
    personaId,
    onExtracted,
  }: {
    personaId: string;
    onExtracted: (profile: VoiceProfile) => void;
  } = $props();

  let samples = $state("");
  let platform = $state("twitter");
  let extracting = $state(false);
  let partialProfile = $state<Partial<VoiceProfile> | null>(null);
  let error = $state<string | null>(null);

  let wordCount = $derived(
    samples.trim() ? samples.trim().split(/\s+/).length : 0,
  );

  const platformOptions = [
    { value: "twitter", label: "Twitter" },
    { value: "linkedin", label: "LinkedIn" },
    { value: "blog", label: "Blog" },
    { value: "reddit", label: "Reddit" },
    { value: "email", label: "Email" },
    { value: "other", label: "Other" },
  ];

  async function extractVoice() {
    extracting = true;
    error = null;
    partialProfile = null;

    try {
      const response = await fetch(`/personas/${personaId}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples, platform }),
      });

      if (!response.ok) {
        const text = await response.text();
        error = text || `Extraction failed (${response.status})`;
        extracting = false;
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        error = "No response stream available";
        extracting = false;
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        try {
          partialProfile = JSON.parse(accumulated);
        } catch {
          // Partial JSON — wait for more data
        }
      }

      // Final parse — try full accumulated text first, fall back to last successful partial
      let finalProfile: VoiceProfile | null = null;
      try {
        finalProfile = JSON.parse(accumulated) as VoiceProfile;
      } catch {
        finalProfile = partialProfile as VoiceProfile | null;
      }

      if (finalProfile) {
        onExtracted(finalProfile);
        samples = "";
        toasts.add("Writing sample saved and voice profile extracted", "success");
      } else {
        error = "Extraction completed but no profile was generated";
      }
    } catch (e) {
      error =
        e instanceof Error ? e.message : "An unexpected error occurred";
    } finally {
      extracting = false;
    }
  }
</script>

<div class="space-y-4">
  <!-- Textarea for writing samples -->
  <div>
    <label
      for="voice-samples"
      class="block text-sm font-medium text-secondary"
    >
      Writing samples
    </label>
    <textarea
      id="voice-samples"
      bind:value={samples}
      placeholder="Paste your writing samples here — tweets, blog posts, emails, anything that represents how you write..."
      rows={8}
      disabled={extracting}
      class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none disabled:bg-surface-alt disabled:text-faint"
    ></textarea>

    <!-- Word count & guidance -->
    <div class="mt-1 flex items-center justify-between">
      <p
        class="text-sm {wordCount < 100 && wordCount > 0
          ? 'text-red-500'
          : 'text-muted'}"
      >
        {wordCount} words
        {#if wordCount > 0 && wordCount < 100}
          — minimum 100 words required
        {:else if wordCount >= 100 && wordCount < 500}
          — 500+ words recommended for accuracy
        {/if}
      </p>
      <p class="text-xs text-faint">500+ words recommended</p>
    </div>
  </div>

  <!-- Platform dropdown -->
  <div>
    <label for="voice-platform" class="block text-sm font-medium text-secondary">
      Platform / source
    </label>
    <select
      id="voice-platform"
      bind:value={platform}
      disabled={extracting}
      class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none disabled:bg-surface-alt"
    >
      {#each platformOptions as opt (opt.value)}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>

  <!-- Extract button -->
  <button
    type="button"
    onclick={extractVoice}
    disabled={extracting || wordCount < 100}
    class="inline-flex items-center gap-2 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-40"
  >
    {#if extracting}
      <svg
        class="h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      Analyzing your writing...
    {:else}
      Extract Voice Profile
    {/if}
  </button>

  <!-- Error display -->
  {#if error}
    <div
      class="rounded-lg border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger-text"
    >
      <p>{error}</p>
      <button
        type="button"
        onclick={() => (error = null)}
        class="mt-1 text-xs font-medium text-status-danger-text underline opacity-80 hover:opacity-100"
      >
        Dismiss
      </button>
    </div>
  {/if}

  <!-- Streaming extraction preview -->
  {#if extracting && partialProfile}
    <div class="mt-4">
      <div
        class="mb-2 flex items-center gap-2 text-sm font-medium text-secondary"
      >
        <span class="relative flex h-2 w-2">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"
          ></span>
          <span class="relative inline-flex h-2 w-2 rounded-full bg-sky-500"
          ></span>
        </span>
        Analyzing your writing...
      </div>
      <VoiceProfileDisplay
        profile={partialProfile}
        manualEdits={null}
        editable={false}
        streaming={true}
      />
    </div>
  {/if}
</div>
