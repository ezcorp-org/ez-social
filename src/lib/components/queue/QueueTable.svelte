<script lang="ts">
  import { enhance } from "$app/forms";
  import { platformStyles } from "$lib/utils/platform";
  import { formatCost } from "$lib/utils/format";

  interface QueuePost {
    id: string;
    url: string;
    platform: string | null;
    postContent: string | null;
    postAuthor: string | null;
    status: string;
    personaId: string | null;
    createdAt: Date | string;
  }

  interface Persona {
    id: string;
    name: string;
  }

  const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
    new: { bg: "bg-status-info-bg", text: "text-status-info-text", label: "New" },
    in_progress: { bg: "bg-status-warning-bg", text: "text-status-warning-text", label: "In Progress" },
    draft_ready: { bg: "bg-status-success-bg", text: "text-status-success-text", label: "Draft Ready" },
    complete: { bg: "bg-surface-dim", text: "text-muted", label: "Complete" },
  };

  let {
    posts = [],
    personas = [],
    searchQuery = "",
    showArchived = false,
    postCosts = {},
  }: {
    posts: QueuePost[];
    personas: Persona[];
    searchQuery: string;
    showArchived?: boolean;
    postCosts?: Record<string, number>;
  } = $props();

  const personaMap = $derived(
    Object.fromEntries(personas.map((p) => [p.id, p.name])),
  );

  const filteredPosts = $derived(
    searchQuery.trim()
      ? posts.filter((p) => {
          const q = searchQuery.toLowerCase();
          return (
            p.url.toLowerCase().includes(q) ||
            (p.postContent?.toLowerCase().includes(q) ?? false)
          );
        })
      : posts,
  );

  function truncateContent(post: QueuePost, maxLen = 100): string {
    if (post.postContent) {
      return post.postContent.length > maxLen
        ? post.postContent.substring(0, maxLen) + "..."
        : post.postContent;
    }
    return post.url.length > maxLen
      ? post.url.substring(0, maxLen) + "..."
      : post.url;
  }

  function timeAgo(date: Date | string): string {
    const now = Date.now();
    const then = typeof date === "string" ? new Date(date).getTime() : date.getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return "yesterday";
    return `${diffDay}d ago`;
  }

  function getPlatformStyle(platform: string | null) {
    if (!platform) return null;
    return platformStyles[platform] ?? platformStyles["other"];
  }
</script>

{#if filteredPosts.length === 0}
  <div class="py-8 text-center text-sm text-muted">
    {searchQuery.trim()
      ? "No posts match this filter"
      : showArchived
        ? "No archived posts"
        : "No posts in this view"}
  </div>
{:else}
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border-main text-left text-xs font-medium uppercase tracking-wide text-faint">
          <th class="pb-2 pr-3">Platform</th>
          <th class="pb-2 pr-3">Post</th>
          <th class="pb-2 pr-3">Status</th>
          <th class="hidden pb-2 pr-3 sm:table-cell">Persona</th>
          <th class="hidden pb-2 pr-3 sm:table-cell">Added</th>
          <th class="hidden pb-2 pr-3 sm:table-cell">Cost</th>
          <th class="pb-2 w-16"></th>
        </tr>
      </thead>
      <tbody>
        {#each filteredPosts as post (post.id)}
          <tr class="group border-b border-border-subtle transition-colors hover:bg-surface-dim">
            <td class="py-2.5 pr-3">
              <a href="/queue/{post.id}" class="block">
                {#if getPlatformStyle(post.platform)}
                  {@const style = getPlatformStyle(post.platform)}
                  <span
                    class="inline-block h-3 w-3 rounded-full {style?.color}"
                    title={style?.label}
                  ></span>
                {:else}
                  <span
                    class="inline-block h-3 w-3 rounded-full bg-faint"
                    title="Unknown"
                  ></span>
                {/if}
              </a>
            </td>
            <td class="py-2.5 pr-3">
              <a href="/queue/{post.id}" class="block">
                {#if post.postContent}
                  <span class="text-primary">{truncateContent(post)}</span>
                {:else}
                  <span class="italic text-faint"
                    >{truncateContent(post)}
                    <span class="text-xs">(content pending)</span></span
                  >
                {/if}
              </a>
            </td>
            <td class="py-2.5 pr-3">
              <form method="POST" action="?/updateStatus" use:enhance={() => {
                return async ({ update }) => { await update(); };
              }}>
                <input type="hidden" name="postId" value={post.id} />
                <select
                  name="status"
                  class="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium hover:border-border-input focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none {STATUS_BADGES[post.status]?.text ?? 'text-muted'}"
                  onchange={(e) => e.currentTarget.form?.requestSubmit()}
                >
                  {#each Object.entries(STATUS_BADGES) as [value, badge] (value)}
                    <option {value} selected={value === post.status}>{badge.label}</option>
                  {/each}
                </select>
              </form>
            </td>
            <td class="hidden py-2.5 pr-3 sm:table-cell">
              <form method="POST" action="?/assignPersona" use:enhance={() => {
                return async ({ update }) => { await update(); };
              }}>
                <input type="hidden" name="postId" value={post.id} />
                <select
                  name="personaId"
                  class="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-secondary hover:border-border-input focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
                  onchange={(e) => e.currentTarget.form?.requestSubmit()}
                >
                  <option value="" selected={!post.personaId}>Unassigned</option>
                  {#each personas as persona (persona.id)}
                    <option value={persona.id} selected={persona.id === post.personaId}>{persona.name}</option>
                  {/each}
                </select>
              </form>
            </td>
            <td class="hidden py-2.5 pr-3 sm:table-cell">
              <a href="/queue/{post.id}" class="block">
                <span class="text-faint">{timeAgo(post.createdAt)}</span>
              </a>
            </td>
            <td class="hidden py-2.5 pr-3 sm:table-cell" data-testid="post-cost">
              <a href="/queue/{post.id}" class="block">
                <span class="text-faint">{postCosts[post.id] ? formatCost(postCosts[post.id]) : '--'}</span>
              </a>
            </td>
            <td class="py-2.5">
              {#if showArchived}
                <form method="POST" action="?/unarchive" use:enhance={() => {
                  return async ({ update }) => { await update(); };
                }}>
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    class="text-xs text-faint opacity-0 transition-opacity hover:text-secondary group-hover:opacity-100"
                    title="Restore to queue"
                  >
                    Unarchive
                  </button>
                </form>
              {:else}
                <form method="POST" action="?/archive" use:enhance={() => {
                  return async ({ update }) => { await update(); };
                }}>
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    class="text-xs text-faint opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    title="Archive post"
                  >
                    Archive
                  </button>
                </form>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
