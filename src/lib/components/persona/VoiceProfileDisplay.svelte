<script lang="ts">
  import type { VoiceProfile, VoicePattern } from "$lib/schemas/voice-profile";

  let {
    profile,
    manualEdits = null,
    editable = false,
    streaming = false,
    onEdit,
    onReExtract,
  }: {
    profile: VoiceProfile | Partial<VoiceProfile> | Record<string, unknown>;
    manualEdits?: Record<string, unknown> | null;
    editable?: boolean;
    streaming?: boolean;
    onEdit?: (edits: Record<string, unknown>) => void;
    onReExtract?: () => void;
  } = $props();

  // Detect old-format profiles (has summary/tone but not voiceDNA)
  let isLegacyProfile = $derived(
    profile &&
      !("voiceDNA" in profile) &&
      ("summary" in profile || "tone" in profile),
  );

  // Merge manual edits over extracted profile for display
  let displayProfile = $derived.by(() => {
    if (!manualEdits) return profile as Partial<VoiceProfile>;
    const merged = { ...profile };
    for (const [key, value] of Object.entries(manualEdits)) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        (merged as Record<string, unknown>)[key] = {
          ...((profile as Record<string, unknown>)[key] as Record<
            string,
            unknown
          >),
          ...(value as Record<string, unknown>),
        };
      } else {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    return merged as Partial<VoiceProfile>;
  });

  // Inline editing state
  let editingField = $state<string | null>(null);
  let editValue = $state("");

  function startEdit(field: string, currentValue: string) {
    if (!editable) return;
    editingField = field;
    editValue = currentValue;
  }

  function saveEdit(field: string) {
    if (!onEdit) return;
    const newEdits = { ...manualEdits, [field]: editValue };
    onEdit(newEdits);
    editingField = null;
    editValue = "";
  }

  function cancelEdit() {
    editingField = null;
    editValue = "";
  }

  function isEdited(field: string): boolean {
    return manualEdits != null && field in manualEdits;
  }

  // Collapsible dimension state
  let expandedDimensions = $state<Record<string, boolean>>({});

  function toggleDimension(dim: string) {
    expandedDimensions = {
      ...expandedDimensions,
      [dim]: !expandedDimensions[dim],
    };
  }

  const signalStyles: Record<string, { bg: string; text: string; label: string }> = {
    embedded: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300", label: "Core" },
    consistent: { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-300", label: "Strong" },
    contextual: { bg: "bg-surface-dim", text: "text-secondary", label: "Situational" },
  };

  const consistencyLabels: Record<string, { bg: string; text: string; label: string }> = {
    "highly-consistent": { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", label: "Highly Consistent" },
    "moderately-consistent": { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-300", label: "Moderately Consistent" },
    "context-dependent": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "Context-Dependent" },
    developing: { bg: "bg-surface-dim", text: "text-secondary", label: "Developing" },
  };

  const dimensionLabels: Record<string, { label: string; description: string }> = {
    structure: { label: "Structure", description: "Sentence length, formatting, openings & closings" },
    grammar: { label: "Grammar", description: "Capitalization, punctuation, contractions, emoji" },
    vocabulary: { label: "Vocabulary", description: "Word choices, slang, jargon, intensifiers" },
    rhetoric: { label: "Rhetoric", description: "Argument style, humor, questions, authority" },
  };
</script>

{#if isLegacyProfile}
  <!-- Legacy profile detected — prompt re-extraction -->
  <div class="rounded-lg border-2 border-dashed border-status-warning-border bg-status-warning-bg p-4 text-center">
    <p class="text-sm font-medium text-status-warning-text">
      Voice profile uses an older format
    </p>
    <p class="mt-1 text-sm text-status-warning-text opacity-80">
      Re-extract to get the improved 4-dimension analysis with voice DNA, content modes, and consistency scoring.
    </p>
    {#if onReExtract}
      <button
        type="button"
        onclick={onReExtract}
        class="mt-3 inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
        Re-extract Voice Profile
      </button>
    {/if}
  </div>
{:else}
  <div class="space-y-5">
    <!-- Voice DNA -->
    {#if displayProfile.voiceDNA?.length}
      <div>
        <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Voice DNA
        </h4>
        <ul class="space-y-1.5">
          {#each displayProfile.voiceDNA as dna, i (i)}
            {#if editingField === `voiceDNA.${i}`}
              <li class="flex gap-2">
                <input
                  bind:value={editValue}
                  class="flex-1 rounded border border-border-input bg-surface px-2 py-1 text-sm focus:border-muted focus:outline-none"
                />
                <button type="button" onclick={() => saveEdit(`voiceDNA`)} class="text-xs text-secondary hover:text-primary">Save</button>
                <button type="button" onclick={cancelEdit} class="text-xs text-faint hover:text-secondary">Cancel</button>
              </li>
            {:else}
              <li
                class="flex items-start gap-2 rounded-lg px-2 py-1 text-sm text-secondary {editable ? 'hover:bg-surface-dim cursor-pointer' : ''}"
                role={editable ? "button" : undefined}
                tabindex={editable ? 0 : undefined}
                onclick={() => startEdit(`voiceDNA.${i}`, dna)}
                onkeydown={(e) => e.key === "Enter" && startEdit(`voiceDNA.${i}`, dna)}
              >
                <span class="mt-0.5 text-violet-400 dark:text-violet-500">&#9670;</span>
                <span>{dna}</span>
              </li>
            {/if}
          {/each}
        </ul>
      </div>
    {:else if streaming}
      <div class="h-16 animate-pulse rounded-lg bg-surface-dim"></div>
    {/if}

    <!-- Dimensions -->
    {#if displayProfile.dimensions}
      <div>
        <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Voice Patterns
        </h4>
        <div class="space-y-2">
          {#each Object.entries(dimensionLabels) as [key, meta] (key)}
            {@const patterns = (displayProfile.dimensions as Record<string, VoicePattern[]>)?.[key] ?? []}
            {#if patterns.length > 0}
              <div class="rounded-lg border border-border-main">
                <button
                  type="button"
                  onclick={() => toggleDimension(key)}
                  class="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <span class="text-sm font-medium text-primary">{meta.label}</span>
                    <span class="ml-2 text-xs text-faint">{meta.description}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-faint">{patterns.length} pattern{patterns.length !== 1 ? "s" : ""}</span>
                    <svg
                      class="h-4 w-4 text-faint transition-transform {expandedDimensions[key] ? 'rotate-180' : ''}"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {#if expandedDimensions[key]}
                  <div class="border-t border-border-subtle px-4 py-3 space-y-3">
                    {#each patterns as pattern, pi (pi)}
                      {@const style = signalStyles[pattern.signal] ?? signalStyles.contextual}
                      <div class="flex items-start gap-3">
                        <span class="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase {style.bg} {style.text}">
                          {style.label}
                        </span>
                        <div class="min-w-0">
                          <p class="text-sm text-primary">{pattern.pattern}</p>
                          <p class="mt-0.5 text-xs text-faint">{pattern.evidence}</p>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {:else if streaming}
      <div class="h-24 animate-pulse rounded-lg bg-surface-dim"></div>
    {/if}

    <!-- Content Modes -->
    {#if displayProfile.contentModes?.length}
      <div class="rounded-lg border border-border-main p-4">
        <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Content Modes
        </h4>
        <div class="space-y-4">
          {#each displayProfile.contentModes as mode (mode.type)}
            <div>
              <div class="flex items-center gap-2">
                <span class="rounded-full bg-sky-100 dark:bg-sky-900/30 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                  {mode.type}
                </span>
              </div>
              <div class="mt-1.5 space-y-1 pl-1">
                <p class="text-sm text-secondary">
                  <span class="font-medium">Patterns:</span>
                  {mode.dominantPatterns.join(", ")}
                </p>
                {#if mode.distinctiveShifts}
                  <p class="text-sm text-muted">
                    <span class="font-medium text-secondary">Shift:</span>
                    {mode.distinctiveShifts}
                  </p>
                {/if}
                {#if mode.exampleQuote}
                  <p class="mt-1 border-l-2 border-border-main pl-3 text-sm italic text-muted">
                    "{mode.exampleQuote}"
                  </p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else if streaming}
      <div class="h-20 animate-pulse rounded-lg bg-surface-dim"></div>
    {/if}

    <!-- Inconsistencies -->
    {#if displayProfile.inconsistencies?.length}
      <div class="rounded-lg border border-border-main p-4">
        <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Inconsistencies
        </h4>
        <div class="space-y-3">
          {#each displayProfile.inconsistencies as item (item.description)}
            <div class="rounded-lg bg-surface-alt p-3">
              <p class="text-sm font-medium text-primary">{item.description}</p>
              <div class="mt-1.5 grid grid-cols-2 gap-2 text-xs text-muted">
                <div>
                  <span class="font-medium text-secondary">Context A:</span>
                  {item.contextA}
                </div>
                <div>
                  <span class="font-medium text-secondary">Context B:</span>
                  {item.contextB}
                </div>
              </div>
              <p class="mt-1.5 text-xs text-faint">{item.assessment}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Recommendations -->
    {#if displayProfile.recommendations}
      <div class="rounded-lg border border-border-main p-4">
        <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Recommendations
        </h4>
        <div class="space-y-3">
          {#if displayProfile.recommendations.leanInto?.length}
            <div>
              <span class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Lean Into</span>
              <ul class="mt-1 ml-4 list-disc space-y-0.5 text-sm text-secondary">
                {#each displayProfile.recommendations.leanInto as item (item)}
                  <li>{item}</li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if displayProfile.recommendations.watchOutFor?.length}
            <div>
              <span class="text-xs font-medium text-amber-600 dark:text-amber-400">Watch Out For</span>
              <ul class="mt-1 ml-4 list-disc space-y-0.5 text-sm text-secondary">
                {#each displayProfile.recommendations.watchOutFor as item (item)}
                  <li>{item}</li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if displayProfile.recommendations.develop?.length}
            <div>
              <span class="text-xs font-medium text-sky-600 dark:text-sky-400">Develop</span>
              <ul class="mt-1 ml-4 list-disc space-y-0.5 text-sm text-secondary">
                {#each displayProfile.recommendations.develop as item (item)}
                  <li>{item}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>
    {:else if streaming}
      <div class="h-16 animate-pulse rounded-lg bg-surface-dim"></div>
    {/if}

    <!-- Consistency Score -->
    {#if displayProfile.consistencyScore}
      {@const cs = displayProfile.consistencyScore}
      {@const badge = consistencyLabels[cs.rating ?? ""] ?? consistencyLabels.developing}
      <div class="flex items-start gap-3 rounded-lg border border-border-main p-4">
        <span class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold {badge.bg} {badge.text}">
          {badge.label}
        </span>
        <p class="text-sm text-secondary">{cs.summary}</p>
      </div>
    {:else if streaming}
      <div class="h-12 animate-pulse rounded-lg bg-surface-dim"></div>
    {/if}
  </div>
{/if}
