<script lang="ts">
  import { goto } from "$app/navigation";

  const STATUS_LABELS: Record<string, string> = {
    new: "New",
    in_progress: "In Progress",
    draft_ready: "Draft Ready",
    complete: "Complete",
    archived: "Archived",
  };

  const TAB_ORDER = ["all", "new", "in_progress", "draft_ready", "complete", "archived"];

  let {
    statusCounts = [],
    activeStatus = "all",
    archivedCount = 0,
  }: {
    statusCounts: { status: string; count: number }[];
    activeStatus: string;
    archivedCount?: number;
  } = $props();

  const countMap = $derived(
    Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
  );
  const total = $derived(statusCounts.reduce((sum, s) => sum + s.count, 0));

  function getCount(key: string): number {
    if (key === "all") return total;
    if (key === "archived") return archivedCount;
    return countMap[key] ?? 0;
  }

  function getLabel(key: string): string {
    if (key === "all") return "All";
    return STATUS_LABELS[key] ?? key;
  }

  function selectTab(key: string) {
    if (key === "all") {
      goto("?", { replaceState: true, noScroll: true });
    } else {
      goto(`?status=${key}`, { replaceState: true, noScroll: true });
    }
  }
</script>

<div class="flex gap-1 overflow-x-auto border-b border-border-main">
  {#each TAB_ORDER as key (key)}
    {#if key === "archived"}
      <span class="self-center px-1 text-faint">|</span>
    {/if}
    <button
      onclick={() => selectTab(key)}
      class="px-3 py-2 text-sm font-medium transition-colors {activeStatus ===
      key
        ? 'border-b-2 border-primary text-primary'
        : 'text-muted hover:text-secondary'}"
    >
      {getLabel(key)}
      <span
        class="ml-1 rounded-full px-1.5 py-0.5 text-xs {activeStatus === key
          ? 'bg-btn text-on-primary'
          : 'bg-surface-dim text-muted'}"
      >
        {getCount(key)}
      </span>
    </button>
  {/each}
</div>
