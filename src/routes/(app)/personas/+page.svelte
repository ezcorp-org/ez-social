<script lang="ts">
  import type { PageData } from "./$types";
  import { platformStyles } from "$lib/utils/platform";

  let { data }: { data: PageData } = $props();
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-primary">Personas</h1>
    <a
      href="/personas/new"
      class="rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover"
    >
      New persona
    </a>
  </div>

  {#if data.personas.length === 0}
    <div
      class="rounded-xl border-2 border-dashed border-border-input p-12 text-center"
    >
      <div class="mx-auto max-w-sm">
        <p class="text-lg font-medium text-primary">
          Create your first persona
        </p>
        <p class="mt-1 text-sm text-muted">
          A persona captures your unique writing voice for a platform or
          identity. Start by giving it a name.
        </p>
        <a
          href="/personas/new"
          class="mt-4 inline-block rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover"
        >
          Create persona
        </a>
      </div>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.personas as persona (persona.id)}
        <a
          href="/personas/{persona.id}"
          class="group rounded-xl border border-border-main bg-surface p-5 shadow-sm transition hover:border-border-input hover:shadow-md"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2">
              {#if persona.platform && platformStyles[persona.platform]}
                <span
                  class="inline-block h-3 w-3 rounded-full {platformStyles[
                    persona.platform
                  ].color}"
                  title={platformStyles[persona.platform].label}
                ></span>
              {/if}
              <h2 class="font-semibold text-primary group-hover:text-secondary">
                {persona.name}
              </h2>
            </div>
            {#if persona.isDefault}
              <span
                class="rounded-full bg-btn px-2 py-0.5 text-xs font-medium text-on-primary"
              >
                Default
              </span>
            {/if}
          </div>

          {#if persona.description}
            <p class="mt-2 line-clamp-2 text-sm text-muted">
              {persona.description}
            </p>
          {/if}

          {#if persona.voiceSummary}
            <p class="mt-3 text-xs italic text-faint">
              {persona.voiceSummary}
            </p>
          {:else}
            <p class="mt-3 text-xs text-status-warning-text">
              No voice profile — Add samples to extract your voice
            </p>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
