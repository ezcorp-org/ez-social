<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import type { PageData, ActionData } from "./$types";
  import type { VoiceProfile } from "$lib/schemas/voice-profile";
  import VoiceExtractor from "$lib/components/persona/VoiceExtractor.svelte";
  import VoiceProfileDisplay from "$lib/components/persona/VoiceProfileDisplay.svelte";
  import VersionSelector from "$lib/components/persona/VersionSelector.svelte";
  import { platformStyles } from "$lib/utils/platform";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let name = $state("");
  let description = $state("");
  let platform = $state("");
  let showArchiveConfirm = $state(false);
  let showExtractor = $state(false);
  let showPlatformPicker = $state(false);
  let extractingPlatform = $state<string | null>(null);

  // Sync local state from server data (runs on mount and when data changes, e.g. after form submission)
  $effect(() => {
    name = data.persona.name;
    description = data.persona.description ?? "";
    platform = data.persona.platform ?? "";
  });

  let currentPlatform = $derived(
    platform && platformStyles[platform]
      ? platformStyles[platform]
      : null,
  );

  function handleExtracted(_profile: VoiceProfile) {
    // Refresh page data to show the new version
    invalidateAll();
  }

  function handleVersionSelect(versionId: string) {
    // Submit form action to switch active version
    const formData = new FormData();
    formData.set("versionId", versionId);
    fetch(`?/setActiveVersion`, {
      method: "POST",
      body: formData,
    }).then(() => invalidateAll());
  }

  function handleTraitEdit(edits: Record<string, unknown>) {
    // Submit form action to save manual edits
    const formData = new FormData();
    formData.set("manualEdits", JSON.stringify(edits));
    fetch(`?/updateTraits`, {
      method: "POST",
      body: formData,
    }).then(() => invalidateAll());
  }

  async function handlePlatformVoiceExtract(targetPlatform: string) {
    extractingPlatform = targetPlatform;
    showPlatformPicker = false;

    try {
      // Trigger extraction with platformFilter — no new samples needed,
      // the endpoint will use existing samples filtered by platform
      const response = await fetch(`/personas/${data.persona.id}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformFilter: targetPlatform }),
      });

      if (!response.ok) {
        // Consume the stream so it doesn't hang
        await response.text();
      } else {
        // Consume the stream to completion
        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
      }

      invalidateAll();
    } finally {
      extractingPlatform = null;
    }
  }

  // Platforms available for creating overrides (exclude ones that already have overrides)
  let availablePlatforms = $derived(
    Object.entries(platformStyles)
      .filter(([key]) => key !== "other")
      .filter(([key]) => !data.platformOverrides?.some((o: { platform: string }) => o.platform === key))
      .map(([key, style]) => ({ value: key, label: style.label })),
  );
</script>

<div class="space-y-8">
  <!-- Header -->
  <div>
    <a href="/personas" class="text-sm text-muted hover:text-secondary"
      >&larr; Back to personas</a
    >
    <div class="mt-2 flex items-center gap-3">
      {#if currentPlatform}
        <span
          class="inline-block h-4 w-4 rounded-full {currentPlatform.color}"
        ></span>
      {/if}
      <h1 class="text-2xl font-bold text-primary">{data.persona.name}</h1>
      {#if data.persona.isDefault}
        <span
          class="rounded-full bg-btn px-2.5 py-0.5 text-xs font-medium text-on-primary"
        >
          Default
        </span>
      {/if}
    </div>
  </div>

  <!-- Edit form -->
  <div class="rounded-xl border border-border-main bg-surface p-6">
    <h2 class="text-lg font-semibold text-primary">Details</h2>

    {#if form?.success && form?.action === "update"}
      <p class="mt-2 text-sm text-status-success-text">Changes saved.</p>
    {/if}
    {#if form?.success && form?.action === "setDefault"}
      <p class="mt-2 text-sm text-status-success-text">Set as default persona.</p>
    {/if}

    <form method="POST" action="?/update" use:enhance class="mt-4 space-y-4">
      <div>
        <label for="name" class="block text-sm font-medium text-secondary">
          Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          bind:value={name}
          class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
        />
        {#if form?.errors?.name}
          <p class="mt-1 text-sm text-status-danger-text">{form.errors.name[0]}</p>
        {/if}
      </div>

      <div>
        <label
          for="description"
          class="block text-sm font-medium text-secondary"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          bind:value={description}
          placeholder="Brief description of this voice identity"
          class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
        ></textarea>
        {#if form?.errors?.description}
          <p class="mt-1 text-sm text-status-danger-text">{form.errors.description[0]}</p>
        {/if}
      </div>

      <div>
        <label for="platform" class="block text-sm font-medium text-secondary">
          Platform
        </label>
        <select
          id="platform"
          name="platform"
          bind:value={platform}
          class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
        >
          <option value="">None (general)</option>
          <option value="twitter">Twitter</option>
          <option value="linkedin">LinkedIn</option>
          <option value="blog">Blog</option>
          <option value="reddit">Reddit</option>
          <option value="email">Email</option>
          <option value="other">Other</option>
        </select>
      </div>

      <button
        type="submit"
        class="rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover"
      >
        Save changes
      </button>
    </form>
  </div>

  <!-- Voice Profile section -->
  <div class="rounded-xl border border-border-main bg-surface p-6">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-primary">Voice Profile</h2>
      <div class="flex items-center gap-3">
        {#if data.voiceProfile}
          <a
            href="/personas/{data.persona.id}/calibrate"
            class="text-sm text-muted hover:text-secondary"
          >
            Calibrate Voice
          </a>
          <span class="text-faint">|</span>
          <a
            href="/personas/{data.persona.id}/refine"
            class="text-sm text-muted hover:text-secondary"
          >
            Refine with Prompt
          </a>
          <span class="text-faint">|</span>
          <button
            type="button"
            onclick={() => { showExtractor = !showExtractor; }}
            class="text-sm text-muted hover:text-secondary"
          >
            {showExtractor ? "Hide" : "Add more samples & re-extract"}
          </button>
        {/if}
      </div>
    </div>

    {#if data.voiceProfile}
      <!-- Source stats -->
      <div class="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span>{data.sampleStats.count} sample{data.sampleStats.count !== 1 ? "s" : ""}</span>
        <span>{data.sampleStats.totalWords.toLocaleString()} words</span>
        {#if data.sampleStats.platforms.length > 0}
          <span>
            from {data.sampleStats.platforms.join(", ")}
          </span>
        {/if}
      </div>

      <!-- Version selector -->
      {#if data.versions.length > 0 && data.activeVersionId}
        <div class="mt-4">
          <VersionSelector
            versions={data.versions}
            activeVersionId={data.activeVersionId}
            onSelect={handleVersionSelect}
          />
        </div>
      {/if}

      <!-- Voice profile display -->
      <div class="mt-4">
        <VoiceProfileDisplay
          profile={data.voiceProfile}
          manualEdits={data.voiceManualEdits}
          editable={true}
          onEdit={handleTraitEdit}
          onReExtract={() => {
            fetch(`/personas/${data.persona.id}/voice`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recalibrate: true }),
            }).then((res) => {
              if (res.body) {
                const reader = res.body.getReader();
                const pump = () => reader.read().then(({ done }) => { if (!done) pump(); });
                pump().then(() => invalidateAll());
              }
            });
          }}
        />
      </div>

      <!-- Collapsible extractor for re-extraction -->
      {#if showExtractor}
        <div class="mt-6 border-t border-border-main pt-6">
          <h3 class="mb-3 text-sm font-medium text-secondary">
            Add more writing samples
          </h3>
          <VoiceExtractor
            personaId={data.persona.id}
            onExtracted={handleExtracted}
          />
        </div>
      {/if}
    {:else}
      <!-- No voice profile — show extraction UI -->
      <div class="mt-4">
        <div
          class="mb-4 rounded-lg border-2 border-dashed border-status-warning-border bg-status-warning-bg p-4 text-center"
        >
          <p class="text-sm font-medium text-status-warning-text">
            No voice profile yet
          </p>
          <p class="mt-1 text-sm text-status-warning-text opacity-80">
            Paste your writing samples below to extract your unique voice.
            This will power AI-generated replies that sound like you.
          </p>
        </div>

        <VoiceExtractor
          personaId={data.persona.id}
          onExtracted={handleExtracted}
        />
      </div>
    {/if}
  </div>

  <!-- Platform Voices section -->
  {#if data.voiceProfile}
    <div class="rounded-xl border border-border-main bg-surface p-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-primary">Platform Voices</h2>
        {#if availablePlatforms.length > 0 && data.sampleStats.count > 0}
          <button
            type="button"
            onclick={() => (showPlatformPicker = !showPlatformPicker)}
            class="text-sm text-muted hover:text-secondary"
          >
            {showPlatformPicker ? "Cancel" : "Create Platform Voice"}
          </button>
        {/if}
      </div>

      {#if data.platformOverrides && data.platformOverrides.length > 0}
        <div class="mt-4 space-y-3">
          {#each data.platformOverrides as override (override.platform)}
            {@const style = platformStyles[override.platform]}
            <div class="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-alt px-4 py-3">
              <div class="flex items-center gap-3">
                {#if style}
                  <span class="inline-block h-3 w-3 rounded-full {style.color}"></span>
                {/if}
                <div>
                  <span class="text-sm font-medium text-primary">{style?.label ?? override.platform}</span>
                  <span class="ml-2 text-xs text-muted">v{override.version}</span>
                </div>
              </div>
              <div class="text-xs text-faint">
                {override.sampleCount} sample{override.sampleCount !== 1 ? "s" : ""}
                {#if override.createdAt}
                  &middot; {new Date(override.createdAt).toLocaleDateString()}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="mt-3 text-sm text-muted">
          Using the same voice across all platforms. Create a platform-specific voice to vary your style.
        </p>
      {/if}

      <!-- Platform picker -->
      {#if showPlatformPicker}
        <div class="mt-4 rounded-lg border border-border-main bg-surface-alt p-4">
          <p class="mb-3 text-sm text-secondary">
            Extract a voice profile from samples of a specific platform:
          </p>
          <div class="flex flex-wrap gap-2">
            {#each availablePlatforms as opt (opt.value)}
              {@const style = platformStyles[opt.value]}
              <button
                type="button"
                onclick={() => handlePlatformVoiceExtract(opt.value)}
                disabled={extractingPlatform !== null}
                class="inline-flex items-center gap-2 rounded-lg border border-border-main bg-surface px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50"
              >
                {#if style}
                  <span class="inline-block h-2.5 w-2.5 rounded-full {style.color}"></span>
                {/if}
                {opt.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Extracting indicator -->
      {#if extractingPlatform}
        {@const style = platformStyles[extractingPlatform]}
        <div class="mt-4 flex items-center gap-2 text-sm text-secondary">
          <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Extracting {style?.label ?? extractingPlatform} voice...
        </div>
      {/if}
    </div>
  {/if}

  <!-- Actions -->
  <div class="rounded-xl border border-border-main bg-surface p-6">
    <h2 class="text-lg font-semibold text-primary">Actions</h2>

    <div class="mt-4 flex flex-wrap gap-3">
      {#if !data.persona.isDefault}
        <form method="POST" action="?/setDefault" use:enhance>
          <button
            type="submit"
            class="rounded-lg border border-border-input px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-dim"
          >
            Set as default
          </button>
        </form>
      {/if}

      {#if !showArchiveConfirm}
        <button
          type="button"
          onclick={() => (showArchiveConfirm = true)}
          class="rounded-lg border border-status-danger-border px-4 py-2 text-sm font-medium text-status-danger-text hover:bg-status-danger-bg"
        >
          Archive persona
        </button>
      {:else}
        <div class="flex items-center gap-2 rounded-lg border border-red-300 bg-status-danger-bg px-4 py-2 dark:border-red-700">
          <span class="text-sm text-status-danger-text">Are you sure?</span>
          <form method="POST" action="?/archive" use:enhance>
            <button
              type="submit"
              class="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Yes, archive
            </button>
          </form>
          <button
            type="button"
            onclick={() => (showArchiveConfirm = false)}
            class="rounded px-3 py-1 text-xs font-medium text-secondary hover:bg-surface-dim"
          >
            Cancel
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>
