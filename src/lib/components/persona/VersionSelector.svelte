<script lang="ts">
  let {
    versions,
    activeVersionId,
    onSelect,
  }: {
    versions: Array<{
      id: string;
      version: number;
      createdAt: Date | string;
      sampleCount: number;
      totalWordCount: number;
    }>;
    activeVersionId: string;
    onSelect: (versionId: string) => void;
  } = $props();

  function formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

{#if versions.length > 1}
  <div class="rounded-lg border border-border-main bg-surface-alt p-3">
    <h4
      class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
    >
      Versions
    </h4>
    <div class="space-y-1">
      {#each versions as v (v.id)}
        <button
          type="button"
          onclick={() => onSelect(v.id)}
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition {v.id ===
          activeVersionId
            ? 'bg-surface font-medium text-primary shadow-sm ring-1 ring-border-main'
            : 'text-secondary hover:bg-surface hover:text-primary'}"
        >
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs text-faint">v{v.version}</span>
            <span>{formatDate(v.createdAt)}</span>
          </div>
          <div class="flex items-center gap-3 text-xs text-faint">
            <span>{v.sampleCount} samples</span>
            <span>{v.totalWordCount.toLocaleString()} words</span>
            {#if v.id === activeVersionId}
              <span
                class="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
                >Active</span
              >
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>
{/if}
