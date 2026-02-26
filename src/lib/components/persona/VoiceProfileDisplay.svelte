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

  // Deep merge manual edits over extracted profile for display
  let displayProfile = $derived.by(() => {
    if (!manualEdits) return profile as Partial<VoiceProfile>;
    const merged = { ...profile } as Record<string, unknown>;
    for (const [key, value] of Object.entries(manualEdits)) {
      if (key === "dimensions" || key === "recommendations") {
        // Deep merge: merge each sub-key individually
        const base = (profile as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
        const override = value as Record<string, unknown>;
        merged[key] = { ...(base ?? {}), ...override };
      } else if (key === "consistencyScore") {
        const base = (profile as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
        const override = value as Record<string, unknown>;
        merged[key] = { ...(base ?? {}), ...override };
      } else {
        merged[key] = value;
      }
    }
    return merged as Partial<VoiceProfile>;
  });

  // Inline editing state
  let editingField = $state<string | null>(null);
  let editValue = $state<string>("");
  let editValues = $state<Record<string, string>>({});

  function startEdit(field: string, currentValue: string) {
    if (!editable) return;
    editingField = field;
    editValue = currentValue;
    editValues = {};
  }

  function startMultiEdit(field: string, values: Record<string, string>) {
    if (!editable) return;
    editingField = field;
    editValues = { ...values };
    editValue = "";
  }

  function saveArrayEdit(arrayKey: string, index: number, sourceArray: unknown[], newItem: unknown) {
    if (!onEdit) return;
    const updated = [...sourceArray];
    updated[index] = newItem;
    // For nested paths like dimensions.structure, split and nest
    const parts = arrayKey.split(".");
    if (parts.length === 2) {
      const [parent, child] = parts;
      const existing = (manualEdits?.[parent] as Record<string, unknown>) ?? {};
      onEdit({ ...manualEdits, [parent]: { ...existing, [child]: updated } });
    } else {
      onEdit({ ...manualEdits, [arrayKey]: updated });
    }
    editingField = null;
    editValues = {};
  }

  function addArrayItem(arrayKey: string, sourceArray: unknown[], newItem: unknown) {
    if (!onEdit) return;
    const updated = [...sourceArray, newItem];
    const parts = arrayKey.split(".");
    if (parts.length === 2) {
      const [parent, child] = parts;
      const existing = (manualEdits?.[parent] as Record<string, unknown>) ?? {};
      onEdit({ ...manualEdits, [parent]: { ...existing, [child]: updated } });
    } else {
      onEdit({ ...manualEdits, [arrayKey]: updated });
    }
  }

  function removeArrayItem(arrayKey: string, sourceArray: unknown[], index: number) {
    if (!onEdit) return;
    const updated = sourceArray.filter((_, i) => i !== index);
    const parts = arrayKey.split(".");
    if (parts.length === 2) {
      const [parent, child] = parts;
      const existing = (manualEdits?.[parent] as Record<string, unknown>) ?? {};
      onEdit({ ...manualEdits, [parent]: { ...existing, [child]: updated } });
    } else {
      onEdit({ ...manualEdits, [arrayKey]: updated });
    }
  }

  function saveConsistencyScore(field: "rating" | "summary", value: string) {
    if (!onEdit) return;
    const existing = (manualEdits?.consistencyScore as Record<string, unknown>) ?? {};
    onEdit({ ...manualEdits, consistencyScore: { ...existing, [field]: value } });
    editingField = null;
    editValue = "";
  }

  function cancelEdit() {
    editingField = null;
    editValue = "";
    editValues = {};
  }

  function isEdited(field: string): boolean {
    if (!manualEdits) return false;
    // Handle nested paths like dimensions.structure or recommendations.leanInto
    const parts = field.split(".");
    if (parts.length === 1) return parts[0] in manualEdits;
    if (parts.length >= 2) {
      const parent = manualEdits[parts[0]] as Record<string, unknown> | undefined;
      if (!parent) return false;
      return parts[1] in parent;
    }
    return false;
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

  const signalOptions = ["embedded", "consistent", "contextual"] as const;

  const consistencyLabels: Record<string, { bg: string; text: string; label: string }> = {
    "highly-consistent": { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", label: "Highly Consistent" },
    "moderately-consistent": { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-300", label: "Moderately Consistent" },
    "context-dependent": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "Context-Dependent" },
    developing: { bg: "bg-surface-dim", text: "text-secondary", label: "Developing" },
  };

  const ratingOptions = ["highly-consistent", "moderately-consistent", "context-dependent", "developing"] as const;

  const dimensionLabels: Record<string, { label: string; description: string }> = {
    structure: { label: "Structure", description: "Sentence length, formatting, openings & closings" },
    grammar: { label: "Grammar", description: "Capitalization, punctuation, contractions, emoji" },
    vocabulary: { label: "Vocabulary", description: "Word choices, slang, jargon, intensifiers" },
    rhetoric: { label: "Rhetoric", description: "Argument style, humor, questions, authority" },
  };

  // Shared CSS classes
  const inputClass = "w-full rounded border border-border-input bg-surface px-2 py-1 text-sm focus:border-muted focus:outline-none";
  const btnSave = "text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300";
  const btnCancel = "text-xs text-faint hover:text-secondary";
  const btnAdd = "inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-dim hover:text-secondary";
  const btnRemove = "shrink-0 text-faint hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity";
  const editedDot = "inline-block h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500";
</script>

{#snippet editActions(onSave: () => void)}
  <div class="flex gap-2 mt-1.5">
    <button type="button" onclick={onSave} class={btnSave}>Save</button>
    <button type="button" onclick={cancelEdit} class={btnCancel}>Cancel</button>
  </div>
{/snippet}

{#snippet editedBadge(field: string)}
  {#if isEdited(field)}
    <span class={editedDot} title="Manually edited"></span>
  {/if}
{/snippet}

{#snippet pencilIcon()}
  <svg class="h-3 w-3 shrink-0 text-faint opacity-0 group-hover/item:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
{/snippet}

{#snippet removeBtn(onclick: () => void)}
  <button type="button" {onclick} class={btnRemove} title="Remove">
    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
{/snippet}

{#snippet addBtn(onclick: () => void, label: string)}
  <button type="button" {onclick} class={btnAdd}>
    <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
    </svg>
    {label}
  </button>
{/snippet}

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
        <div class="mb-2 flex items-center gap-2">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Voice DNA
          </h4>
          {@render editedBadge("voiceDNA")}
        </div>
        <ul class="space-y-1.5">
          {#each displayProfile.voiceDNA as dna, i (i)}
            {#if editingField === `voiceDNA.${i}`}
              <li class="flex flex-col gap-1 rounded-lg bg-surface-alt px-2 py-2">
                <input
                  bind:value={editValue}
                  class={inputClass}
                />
                {@render editActions(() => {
                  const arr = [...(displayProfile.voiceDNA ?? [])];
                  arr[i] = editValue;
                  onEdit?.({ ...manualEdits, voiceDNA: arr });
                  editingField = null;
                  editValue = "";
                })}
              </li>
            {:else}
              <li
                class="group/item flex items-start gap-2 rounded-lg px-2 py-1 text-sm text-secondary {editable ? 'hover:bg-surface-dim cursor-pointer' : ''}"
                role={editable ? "button" : undefined}
                tabindex={editable ? 0 : undefined}
                onclick={() => startEdit(`voiceDNA.${i}`, dna)}
                onkeydown={(e) => e.key === "Enter" && startEdit(`voiceDNA.${i}`, dna)}
              >
                <span class="mt-0.5 text-violet-400 dark:text-violet-500">&#9670;</span>
                <span class="flex-1">{dna}</span>
                {#if editable}
                  {@render pencilIcon()}
                  {@render removeBtn(() => { removeArrayItem("voiceDNA", displayProfile.voiceDNA ?? [], i); })}
                {/if}
              </li>
            {/if}
          {/each}
        </ul>
        {#if editable}
          <div class="mt-1 pl-2">
            {@render addBtn(() => { addArrayItem("voiceDNA", displayProfile.voiceDNA ?? [], "New voice trait"); }, "Add trait")}
          </div>
        {/if}
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
            {#if patterns.length > 0 || editable}
              <div class="rounded-lg border border-border-main">
                <button
                  type="button"
                  onclick={() => toggleDimension(key)}
                  class="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-primary">{meta.label}</span>
                    <span class="ml-1 text-xs text-faint">{meta.description}</span>
                    {@render editedBadge(`dimensions.${key}`)}
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
                      {#if editingField === `dimensions.${key}.${pi}`}
                        <div class="rounded-lg bg-surface-alt p-3 space-y-2">
                          <div>
                            <label class="text-xs font-medium text-muted">Pattern</label>
                            <input bind:value={editValues.pattern} class={inputClass} />
                          </div>
                          <div>
                            <label class="text-xs font-medium text-muted">Evidence</label>
                            <input bind:value={editValues.evidence} class={inputClass} />
                          </div>
                          <div>
                            <label class="text-xs font-medium text-muted">Signal</label>
                            <select bind:value={editValues.signal} class={inputClass}>
                              {#each signalOptions as opt}
                                <option value={opt}>{signalStyles[opt].label}</option>
                              {/each}
                            </select>
                          </div>
                          {@render editActions(() => {
                            saveArrayEdit(`dimensions.${key}`, pi, patterns, {
                              pattern: editValues.pattern,
                              evidence: editValues.evidence,
                              signal: editValues.signal,
                            });
                          })}
                        </div>
                      {:else}
                        {@const style = signalStyles[pattern.signal] ?? signalStyles.contextual}
                        <div
                          class="group/item flex items-start gap-3 {editable ? 'cursor-pointer hover:bg-surface-dim rounded-lg px-1 py-0.5 -mx-1' : ''}"
                          role={editable ? "button" : undefined}
                          tabindex={editable ? 0 : undefined}
                          onclick={() => startMultiEdit(`dimensions.${key}.${pi}`, {
                            pattern: pattern.pattern,
                            evidence: pattern.evidence,
                            signal: pattern.signal,
                          })}
                          onkeydown={(e) => e.key === "Enter" && startMultiEdit(`dimensions.${key}.${pi}`, {
                            pattern: pattern.pattern,
                            evidence: pattern.evidence,
                            signal: pattern.signal,
                          })}
                        >
                          <span class="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase {style.bg} {style.text}">
                            {style.label}
                          </span>
                          <div class="min-w-0 flex-1">
                            <p class="text-sm text-primary">{pattern.pattern}</p>
                            <p class="mt-0.5 text-xs text-faint">{pattern.evidence}</p>
                          </div>
                          {#if editable}
                            {@render pencilIcon()}
                            {@render removeBtn(() => { removeArrayItem(`dimensions.${key}`, patterns, pi); })}
                          {/if}
                        </div>
                      {/if}
                    {/each}
                    {#if editable}
                      <div>
                        {@render addBtn(() => {
                          addArrayItem(`dimensions.${key}`, patterns, { pattern: "New pattern", evidence: "Evidence here", signal: "contextual" });
                        }, "Add pattern")}
                      </div>
                    {/if}
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
        <div class="mb-3 flex items-center gap-2">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Content Modes
          </h4>
          {@render editedBadge("contentModes")}
        </div>
        <div class="space-y-4">
          {#each displayProfile.contentModes as mode, mi (mi)}
            {#if editingField === `contentModes.${mi}`}
              <div class="rounded-lg bg-surface-alt p-3 space-y-2">
                <div>
                  <label class="text-xs font-medium text-muted">Type</label>
                  <input bind:value={editValues.type} class={inputClass} />
                </div>
                <div>
                  <label class="text-xs font-medium text-muted">Dominant Patterns (comma-separated)</label>
                  <input bind:value={editValues.dominantPatterns} class={inputClass} />
                </div>
                <div>
                  <label class="text-xs font-medium text-muted">Distinctive Shifts</label>
                  <input bind:value={editValues.distinctiveShifts} class={inputClass} />
                </div>
                <div>
                  <label class="text-xs font-medium text-muted">Example Quote</label>
                  <textarea bind:value={editValues.exampleQuote} rows={2} class={inputClass}></textarea>
                </div>
                {@render editActions(() => {
                  saveArrayEdit("contentModes", mi, displayProfile.contentModes ?? [], {
                    type: editValues.type,
                    dominantPatterns: editValues.dominantPatterns.split(",").map((s: string) => s.trim()).filter(Boolean),
                    distinctiveShifts: editValues.distinctiveShifts,
                    exampleQuote: editValues.exampleQuote,
                  });
                })}
              </div>
            {:else}
              <div
                class="group/item {editable ? 'cursor-pointer hover:bg-surface-dim rounded-lg px-2 py-1 -mx-2' : ''}"
                role={editable ? "button" : undefined}
                tabindex={editable ? 0 : undefined}
                onclick={() => startMultiEdit(`contentModes.${mi}`, {
                  type: mode.type,
                  dominantPatterns: mode.dominantPatterns.join(", "),
                  distinctiveShifts: mode.distinctiveShifts ?? "",
                  exampleQuote: mode.exampleQuote ?? "",
                })}
                onkeydown={(e) => e.key === "Enter" && startMultiEdit(`contentModes.${mi}`, {
                  type: mode.type,
                  dominantPatterns: mode.dominantPatterns.join(", "),
                  distinctiveShifts: mode.distinctiveShifts ?? "",
                  exampleQuote: mode.exampleQuote ?? "",
                })}
              >
                <div class="flex items-center gap-2">
                  <span class="rounded-full bg-sky-100 dark:bg-sky-900/30 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                    {mode.type}
                  </span>
                  {#if editable}
                    {@render pencilIcon()}
                    {@render removeBtn(() => { removeArrayItem("contentModes", displayProfile.contentModes ?? [], mi); })}
                  {/if}
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
            {/if}
          {/each}
        </div>
        {#if editable}
          <div class="mt-3">
            {@render addBtn(() => {
              addArrayItem("contentModes", displayProfile.contentModes ?? [], {
                type: "New Mode",
                dominantPatterns: ["pattern"],
                distinctiveShifts: "",
                exampleQuote: "",
              });
            }, "Add mode")}
          </div>
        {/if}
      </div>
    {:else if streaming}
      <div class="h-20 animate-pulse rounded-lg bg-surface-dim"></div>
    {/if}

    <!-- Inconsistencies -->
    {#if displayProfile.inconsistencies?.length}
      <div class="rounded-lg border border-border-main p-4">
        <div class="mb-3 flex items-center gap-2">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Inconsistencies
          </h4>
          {@render editedBadge("inconsistencies")}
        </div>
        <div class="space-y-3">
          {#each displayProfile.inconsistencies as item, ii (ii)}
            {#if editingField === `inconsistencies.${ii}`}
              <div class="rounded-lg bg-surface-alt p-3 space-y-2">
                <div>
                  <label class="text-xs font-medium text-muted">Description</label>
                  <input bind:value={editValues.description} class={inputClass} />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="text-xs font-medium text-muted">Context A</label>
                    <input bind:value={editValues.contextA} class={inputClass} />
                  </div>
                  <div>
                    <label class="text-xs font-medium text-muted">Context B</label>
                    <input bind:value={editValues.contextB} class={inputClass} />
                  </div>
                </div>
                <div>
                  <label class="text-xs font-medium text-muted">Assessment</label>
                  <input bind:value={editValues.assessment} class={inputClass} />
                </div>
                {@render editActions(() => {
                  saveArrayEdit("inconsistencies", ii, displayProfile.inconsistencies ?? [], {
                    description: editValues.description,
                    contextA: editValues.contextA,
                    contextB: editValues.contextB,
                    assessment: editValues.assessment,
                  });
                })}
              </div>
            {:else}
              <div
                class="group/item rounded-lg bg-surface-alt p-3 {editable ? 'cursor-pointer hover:ring-1 hover:ring-border-input' : ''}"
                role={editable ? "button" : undefined}
                tabindex={editable ? 0 : undefined}
                onclick={() => startMultiEdit(`inconsistencies.${ii}`, {
                  description: item.description,
                  contextA: item.contextA,
                  contextB: item.contextB,
                  assessment: item.assessment,
                })}
                onkeydown={(e) => e.key === "Enter" && startMultiEdit(`inconsistencies.${ii}`, {
                  description: item.description,
                  contextA: item.contextA,
                  contextB: item.contextB,
                  assessment: item.assessment,
                })}
              >
                <div class="flex items-start justify-between">
                  <p class="text-sm font-medium text-primary">{item.description}</p>
                  {#if editable}
                    <div class="flex items-center gap-1">
                      {@render pencilIcon()}
                      {@render removeBtn(() => { removeArrayItem("inconsistencies", displayProfile.inconsistencies ?? [], ii); })}
                    </div>
                  {/if}
                </div>
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
            {/if}
          {/each}
        </div>
        {#if editable}
          <div class="mt-3">
            {@render addBtn(() => {
              addArrayItem("inconsistencies", displayProfile.inconsistencies ?? [], {
                description: "New inconsistency",
                contextA: "Context A",
                contextB: "Context B",
                assessment: "Assessment",
              });
            }, "Add inconsistency")}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Recommendations -->
    {#if displayProfile.recommendations}
      <div class="rounded-lg border border-border-main p-4">
        <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Recommendations
        </h4>
        <div class="space-y-3">
          {#each [
            { key: "leanInto", label: "Lean Into", color: "text-emerald-600 dark:text-emerald-400" },
            { key: "watchOutFor", label: "Watch Out For", color: "text-amber-600 dark:text-amber-400" },
            { key: "develop", label: "Develop", color: "text-sky-600 dark:text-sky-400" },
          ] as section (section.key)}
            {@const items = (displayProfile.recommendations as Record<string, string[]>)?.[section.key] ?? []}
            {#if items.length > 0 || editable}
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium {section.color}">{section.label}</span>
                  {@render editedBadge(`recommendations.${section.key}`)}
                </div>
                <ul class="mt-1 ml-4 list-disc space-y-0.5 text-sm text-secondary">
                  {#each items as item, ri (ri)}
                    {#if editingField === `recommendations.${section.key}.${ri}`}
                      <li class="list-none -ml-4">
                        <div class="flex flex-col gap-1 rounded bg-surface-alt px-2 py-1">
                          <input bind:value={editValue} class={inputClass} />
                          {@render editActions(() => {
                            const arr = [...items];
                            arr[ri] = editValue;
                            const existing = (manualEdits?.recommendations as Record<string, unknown>) ?? {};
                            onEdit?.({ ...manualEdits, recommendations: { ...existing, [section.key]: arr } });
                            editingField = null;
                            editValue = "";
                          })}
                        </div>
                      </li>
                    {:else}
                      <li
                        class="group/item flex items-center gap-1 {editable ? 'cursor-pointer hover:text-primary' : ''}"
                        role={editable ? "button" : undefined}
                        tabindex={editable ? 0 : undefined}
                        onclick={() => startEdit(`recommendations.${section.key}.${ri}`, item)}
                        onkeydown={(e) => e.key === "Enter" && startEdit(`recommendations.${section.key}.${ri}`, item)}
                      >
                        <span class="flex-1">{item}</span>
                        {#if editable}
                          {@render pencilIcon()}
                          {@render removeBtn(() => { removeArrayItem(`recommendations.${section.key}`, items, ri); })}
                        {/if}
                      </li>
                    {/if}
                  {/each}
                </ul>
                {#if editable}
                  <div class="mt-1 ml-4">
                    {@render addBtn(() => {
                      addArrayItem(`recommendations.${section.key}`, items, "New recommendation");
                    }, `Add ${section.label.toLowerCase()}`)}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {:else if streaming}
      <div class="h-16 animate-pulse rounded-lg bg-surface-dim"></div>
    {/if}

    <!-- Consistency Score -->
    {#if displayProfile.consistencyScore}
      {@const cs = displayProfile.consistencyScore}
      {@const badge = consistencyLabels[cs.rating ?? ""] ?? consistencyLabels.developing}
      <div class="rounded-lg border border-border-main p-4">
        <div class="flex items-start gap-3">
          {#if editingField === "consistencyScore.rating"}
            <select
              bind:value={editValue}
              class="shrink-0 rounded border border-border-input bg-surface px-2 py-1 text-xs focus:border-muted focus:outline-none"
              onchange={() => { saveConsistencyScore("rating", editValue); }}
            >
              {#each ratingOptions as opt}
                <option value={opt}>{consistencyLabels[opt].label}</option>
              {/each}
            </select>
          {:else}
            <span
              class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold {badge.bg} {badge.text} {editable ? 'cursor-pointer hover:ring-1 hover:ring-border-input' : ''}"
              role={editable ? "button" : undefined}
              tabindex={editable ? 0 : undefined}
              onclick={() => startEdit("consistencyScore.rating", cs.rating ?? "developing")}
              onkeydown={(e) => e.key === "Enter" && startEdit("consistencyScore.rating", cs.rating ?? "developing")}
            >
              {badge.label}
            </span>
          {/if}
          {#if editingField === "consistencyScore.summary"}
            <div class="flex-1">
              <textarea bind:value={editValue} rows={2} class={inputClass}></textarea>
              {@render editActions(() => { saveConsistencyScore("summary", editValue); })}
            </div>
          {:else}
            <p
              class="flex-1 text-sm text-secondary {editable ? 'cursor-pointer hover:text-primary' : ''}"
              role={editable ? "button" : undefined}
              tabindex={editable ? 0 : undefined}
              onclick={() => startEdit("consistencyScore.summary", cs.summary ?? "")}
              onkeydown={(e) => e.key === "Enter" && startEdit("consistencyScore.summary", cs.summary ?? "")}
            >
              {cs.summary}
            </p>
          {/if}
          {@render editedBadge("consistencyScore")}
        </div>
      </div>
    {:else if streaming}
      <div class="h-12 animate-pulse rounded-lg bg-surface-dim"></div>
    {/if}
  </div>
{/if}
