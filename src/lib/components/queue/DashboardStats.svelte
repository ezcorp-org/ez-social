<script lang="ts">
  import { formatCost } from "$lib/utils/format";

  const STATUS_CONFIG: Record<
    string,
    { label: string; color: string; bgColor: string }
  > = {
    new: {
      label: "New",
      color: "text-status-info-text",
      bgColor: "bg-status-info-bg border-status-info-border",
    },
    in_progress: {
      label: "In Progress",
      color: "text-status-warning-text",
      bgColor: "bg-status-warning-bg border-status-warning-border",
    },
    draft_ready: {
      label: "Draft Ready",
      color: "text-status-success-text",
      bgColor: "bg-status-success-bg border-status-success-border",
    },
    complete: {
      label: "Complete",
      color: "text-muted",
      bgColor: "bg-surface-alt border-border-main",
    },
  };

  let {
    statusCounts = [],
    totalCostMicrocents = 0,
  }: {
    statusCounts: { status: string; count: number }[];
    totalCostMicrocents?: number;
  } = $props();

  const countMap = $derived(
    Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
  );
  const total = $derived(statusCounts.reduce((sum, s) => sum + s.count, 0));
  const needsReply = $derived(countMap["new"] ?? 0);


</script>

{#if total === 0}
  <div class="rounded-lg border border-dashed border-border-input p-8 text-center">
    <p class="text-muted">
      No posts in queue yet — paste a URL above to get started
    </p>
  </div>
{:else}
  <div class="space-y-4">
    <!-- Primary stat -->
    {#if needsReply > 0}
      <div
        class="rounded-lg border border-status-info-border bg-status-info-bg px-4 py-3 text-center"
      >
        <span class="text-2xl font-bold text-status-info-text">{needsReply}</span>
        <span class="ml-1 text-sm text-status-info-text"
          >{needsReply === 1 ? "post needs" : "posts need"} a reply</span
        >
      </div>
    {/if}

    <!-- Status breakdown -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      {#each ["new", "in_progress", "draft_ready", "complete"] as status (status)}
        {@const config = STATUS_CONFIG[status]}
        {@const count = countMap[status] ?? 0}
        <div class="rounded-lg border {config.bgColor} px-3 py-2 text-center">
          <div class="text-lg font-semibold {config.color}">{count}</div>
          <div class="text-xs {config.color}">{config.label}</div>
        </div>
      {/each}
    </div>

    <!-- Total AI cost -->
    {#if totalCostMicrocents > 0}
      <div class="rounded-lg border border-border-main bg-surface-alt px-4 py-2 text-center" data-testid="total-cost">
        <span class="text-sm text-muted">Total AI cost: </span>
        <span class="text-sm font-semibold text-primary">{formatCost(totalCostMicrocents)}</span>
      </div>
    {/if}

  </div>
{/if}
