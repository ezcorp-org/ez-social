<script lang="ts">
  import type { VoiceProfile, VoicePattern } from "$lib/schemas/voice-profile";

  let { before, after }: {
    before: VoiceProfile;
    after: VoiceProfile;
  } = $props();

  const consistencyLabels: Record<string, { bg: string; text: string; label: string }> = {
    "highly-consistent": { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", label: "Highly Consistent" },
    "moderately-consistent": { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-300", label: "Moderately Consistent" },
    "context-dependent": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "Context-Dependent" },
    developing: { bg: "bg-surface-dim", text: "text-secondary", label: "Developing" },
  };

  const dimensionLabels: Record<string, string> = {
    structure: "Structure",
    grammar: "Grammar",
    vocabulary: "Vocabulary",
    rhetoric: "Rhetoric",
  };

  // Diff helpers
  function classifyItems(beforeList: string[], afterList: string[]) {
    const afterSet = new Set(afterList);
    const beforeSet = new Set(beforeList);
    return {
      removed: beforeList.filter((item) => !afterSet.has(item)),
      added: afterList.filter((item) => !beforeSet.has(item)),
      unchanged: beforeList.filter((item) => afterSet.has(item)),
    };
  }

  function patternTexts(patterns: VoicePattern[]): string[] {
    return patterns.map((p) => p.pattern);
  }

  // Voice DNA diff
  let dnaDiff = $derived(classifyItems(before.voiceDNA, after.voiceDNA));

  // Recommendations diffs
  let leanIntoDiff = $derived(classifyItems(before.recommendations.leanInto, after.recommendations.leanInto));
  let watchOutDiff = $derived(classifyItems(before.recommendations.watchOutFor, after.recommendations.watchOutFor));
  let developDiff = $derived(classifyItems(before.recommendations.develop, after.recommendations.develop));

  let ratingChanged = $derived(before.consistencyScore.rating !== after.consistencyScore.rating);
  let beforeBadge = $derived(consistencyLabels[before.consistencyScore.rating] ?? consistencyLabels.developing);
  let afterBadge = $derived(consistencyLabels[after.consistencyScore.rating] ?? consistencyLabels.developing);
</script>

<div class="space-y-6">
  <!-- Voice DNA -->
  <div>
    <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Voice DNA</h4>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <span class="mb-2 block text-xs font-medium text-faint">Current</span>
        <ul class="space-y-1.5">
          {#each before.voiceDNA as dna (dna)}
            {@const removed = dnaDiff.removed.includes(dna)}
            <li class="flex items-start gap-2 rounded-lg px-2 py-1 text-sm text-secondary {removed ? 'border-l-2 border-red-500 bg-status-danger-bg line-through opacity-60' : ''}">
              <span class="mt-0.5 text-violet-400 dark:text-violet-500">&#9670;</span>
              <span>{dna}</span>
            </li>
          {/each}
        </ul>
      </div>
      <div>
        <span class="mb-2 block text-xs font-medium text-faint">Proposed</span>
        <ul class="space-y-1.5">
          {#each after.voiceDNA as dna (dna)}
            {@const added = dnaDiff.added.includes(dna)}
            <li class="flex items-start gap-2 rounded-lg px-2 py-1 text-sm text-secondary {added ? 'border-l-2 border-green-500 bg-status-success-bg' : ''}">
              <span class="mt-0.5 text-violet-400 dark:text-violet-500">&#9670;</span>
              <span>{dna}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>

  <!-- Dimensions -->
  <div>
    <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Voice Patterns</h4>
    <div class="space-y-2">
      {#each Object.entries(dimensionLabels) as [key, label] (key)}
        {@const beforePatterns = before.dimensions[key as keyof typeof before.dimensions] ?? []}
        {@const afterPatterns = after.dimensions[key as keyof typeof after.dimensions] ?? []}
        {@const beforeCount = beforePatterns.length}
        {@const afterCount = afterPatterns.length}
        {@const changed = beforeCount !== afterCount}
        <div class="flex items-center justify-between rounded-lg border border-border-main px-4 py-3">
          <span class="text-sm font-medium text-primary">{label}</span>
          <span class="text-xs {changed ? 'font-medium text-status-warning-text' : 'text-faint'}">
            {#if changed}
              {beforeCount} pattern{beforeCount !== 1 ? "s" : ""} &rarr; {afterCount} pattern{afterCount !== 1 ? "s" : ""}
            {:else}
              {beforeCount} pattern{beforeCount !== 1 ? "s" : ""} (unchanged)
            {/if}
          </span>
        </div>
        {#if changed}
          {@const diff = classifyItems(patternTexts(beforePatterns), patternTexts(afterPatterns))}
          <div class="grid grid-cols-1 gap-4 pl-4 md:grid-cols-2">
            <div>
              {#if diff.removed.length > 0}
                <span class="mb-1 block text-xs font-medium text-red-400 dark:text-red-500">Removed</span>
                {#each diff.removed as text (text)}
                  <p class="border-l-2 border-red-500 bg-status-danger-bg px-2 py-1 text-sm text-secondary line-through opacity-60">{text}</p>
                {/each}
              {/if}
            </div>
            <div>
              {#if diff.added.length > 0}
                <span class="mb-1 block text-xs font-medium text-green-500 dark:text-green-400">Added</span>
                {#each diff.added as text (text)}
                  <p class="border-l-2 border-green-500 bg-status-success-bg px-2 py-1 text-sm text-secondary">{text}</p>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <!-- Content Modes & Inconsistencies (count only) -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div class="rounded-lg border border-border-main px-4 py-3">
      <span class="text-xs font-semibold uppercase tracking-wide text-muted">Content Modes</span>
      <p class="mt-1 text-sm text-secondary">
        {before.contentModes.length} mode{before.contentModes.length !== 1 ? "s" : ""}
        {#if before.contentModes.length !== after.contentModes.length}
          <span class="font-medium text-status-warning-text">&rarr; {after.contentModes.length} mode{after.contentModes.length !== 1 ? "s" : ""}</span>
        {/if}
      </p>
    </div>
    <div class="rounded-lg border border-border-main px-4 py-3">
      <span class="text-xs font-semibold uppercase tracking-wide text-muted">Inconsistencies</span>
      <p class="mt-1 text-sm text-secondary">
        {before.inconsistencies.length} found
        {#if before.inconsistencies.length !== after.inconsistencies.length}
          <span class="font-medium text-status-warning-text">&rarr; {after.inconsistencies.length} found</span>
        {/if}
      </p>
    </div>
  </div>

  <!-- Consistency Score -->
  <div>
    <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Consistency Score</h4>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <span class="mb-2 block text-xs font-medium text-faint">Current</span>
        <div class="flex items-start gap-3 rounded-lg border border-border-main p-4">
          <span class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold {beforeBadge.bg} {beforeBadge.text}">{beforeBadge.label}</span>
          <p class="text-sm text-secondary">{before.consistencyScore.summary}</p>
        </div>
      </div>
      <div>
        <span class="mb-2 block text-xs font-medium text-faint">Proposed</span>
        <div class="flex items-start gap-3 rounded-lg border p-4 {ratingChanged ? 'border-status-warning-border bg-status-warning-bg/30' : 'border-border-main'}">
          <span class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold {afterBadge.bg} {afterBadge.text}">{afterBadge.label}</span>
          <p class="text-sm text-secondary">{after.consistencyScore.summary}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Recommendations -->
  <div>
    <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Recommendations</h4>
    <div class="space-y-4">
      {#each [
        { label: "Lean Into", color: "emerald", diff: leanIntoDiff, beforeList: before.recommendations.leanInto, afterList: after.recommendations.leanInto },
        { label: "Watch Out For", color: "amber", diff: watchOutDiff, beforeList: before.recommendations.watchOutFor, afterList: after.recommendations.watchOutFor },
        { label: "Develop", color: "sky", diff: developDiff, beforeList: before.recommendations.develop, afterList: after.recommendations.develop },
      ] as section (section.label)}
        {#if section.beforeList.length > 0 || section.afterList.length > 0}
          <div>
            <span class="text-xs font-medium text-{section.color}-600 dark:text-{section.color}-400">{section.label}</span>
            <div class="mt-1 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <span class="mb-1 block text-xs font-medium text-faint">Current</span>
                <ul class="ml-4 list-disc space-y-0.5 text-sm text-secondary">
                  {#each section.beforeList as item (item)}
                    {@const removed = section.diff.removed.includes(item)}
                    <li class={removed ? "border-l-2 border-red-500 bg-status-danger-bg pl-1 line-through opacity-60" : ""}>{item}</li>
                  {/each}
                </ul>
              </div>
              <div>
                <span class="mb-1 block text-xs font-medium text-faint">Proposed</span>
                <ul class="ml-4 list-disc space-y-0.5 text-sm text-secondary">
                  {#each section.afterList as item (item)}
                    {@const added = section.diff.added.includes(item)}
                    <li class={added ? "border-l-2 border-green-500 bg-status-success-bg pl-1" : ""}>{item}</li>
                  {/each}
                </ul>
              </div>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>
