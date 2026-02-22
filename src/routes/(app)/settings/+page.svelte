<script lang="ts">
  import type { LayoutData } from "../$types";
  import { theme, type ThemePreference } from "$lib/stores/theme";
  import { toasts } from "$lib/stores/toast";

  let { data }: { data: LayoutData } = $props();
  let activeTab = $state<"appearance" | "integrations">("appearance");
  let selectedModel = $state(data.preferredModel);

  const tabs = [
    { id: "appearance" as const, label: "Appearance" },
    { id: "integrations" as const, label: "Integrations" },
  ];

  async function saveModel(model: string) {
    selectedModel = model;
    const res = await fetch("/settings/model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (res.ok) {
      toasts.add("Model updated", "success");
    } else {
      toasts.add("Failed to save model", "error");
    }
  }

  function setTheme(value: string) {
    theme.set(value as ThemePreference);
  }
</script>

<h1 class="mb-6 text-2xl font-bold text-primary">Settings</h1>

<div class="mb-6 flex gap-4 border-b border-border-main">
  {#each tabs as tab}
    <button
      type="button"
      class="pb-2 text-sm font-medium transition-colors {activeTab === tab.id
        ? 'border-b-2 border-accent text-primary'
        : 'text-secondary hover:text-primary'}"
      onclick={() => (activeTab = tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

{#if activeTab === "appearance"}
  <div class="space-y-8">
    <div>
      <h2 class="text-lg font-semibold text-primary">Theme</h2>
      <p class="mt-1 text-sm text-secondary">Choose how ez-social looks to you.</p>
      <fieldset class="mt-3 flex gap-3">
        {#each [
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ] as option}
          <label
            class="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors {$theme === option.value
              ? 'border-accent bg-accent/10 text-primary'
              : 'border-border-input bg-surface text-secondary hover:border-accent/50'}"
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={$theme === option.value}
              onchange={() => setTheme(option.value)}
              class="sr-only"
            />
            {option.label}
          </label>
        {/each}
      </fieldset>
    </div>

    <div>
      <h2 class="text-lg font-semibold text-primary">AI Model</h2>
      <p class="mt-1 text-sm text-secondary">Select the model used for generating draft replies.</p>
      <select
        value={selectedModel}
        onchange={(e) => saveModel(e.currentTarget.value)}
        class="mt-3 rounded-lg border border-border-input bg-surface px-3 py-2 text-sm text-primary"
      >
        {#each data.availableModels as model}
          <option value={model.id}>{model.label}</option>
        {/each}
      </select>
    </div>
  </div>
{:else if activeTab === "integrations"}
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold text-primary">iOS Share Sheet</h2>
      <p class="mt-1 text-sm text-secondary">
        Share URLs directly from Safari or any iOS app to instantly create a draft post.
      </p>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-primary">How it works</h3>
      <ol class="mt-2 list-inside list-decimal space-y-1.5 text-sm text-secondary">
        <li>Download the shortcut below and add it to your Shortcuts app.</li>
        <li>Share a URL from any app using the iOS share sheet.</li>
        <li>The shortcut opens ez-social and auto-creates a draft post with AI-generated content.</li>
      </ol>
    </div>

    <div>
      <a
        href="/EZ Social.shortcut"
        download
        class="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
        Download Shortcut
      </a>
      <p class="mt-2 text-xs text-muted">Requires the iOS Shortcuts app.</p>
    </div>

    <div class="rounded-lg border border-border-main bg-surface-dim px-4 py-3">
      <p class="text-xs text-muted">
        <span class="font-medium">Share URL format:</span>
        <code class="ml-1">https://ez-social.ezcorp.org/share?url=&lt;encoded-url&gt;</code>
      </p>
    </div>
  </div>
{/if}
