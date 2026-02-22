<script lang="ts">
  import type { PageData } from "./$types";
  import QuickAdd from "$lib/components/queue/QuickAdd.svelte";
  import DashboardStats from "$lib/components/queue/DashboardStats.svelte";
  import StatusTabs from "$lib/components/queue/StatusTabs.svelte";
  import QueueTable from "$lib/components/queue/QueueTable.svelte";

  let { data }: { data: PageData } = $props();

  let searchQuery = $state("");

  const showArchived = $derived(data.activeStatus === "archived");
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-bold text-primary">Dashboard</h1>
    <p class="mt-1 text-sm text-muted">
      Manage your post queue and track replies
    </p>
  </div>

  <QuickAdd personas={data.personas} />

  <DashboardStats statusCounts={data.statusCounts} totalCostMicrocents={data.totalCostMicrocents} />

  <div class="space-y-3">
    <StatusTabs
      statusCounts={data.statusCounts}
      activeStatus={data.activeStatus}
      archivedCount={data.archivedCount}
    />

    <div>
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Search posts..."
        class="w-full rounded-md border border-border-input bg-surface px-3 py-2 text-sm placeholder-faint focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
      />
    </div>

    <QueueTable
      posts={data.posts}
      personas={data.personas}
      {searchQuery}
      {showArchived}
      postCosts={data.postCosts}
    />
  </div>
</div>
