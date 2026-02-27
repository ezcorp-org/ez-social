<script lang="ts">
  import type { PageData } from "./$types";
  import { enhance } from "$app/forms";
  import PostContextCard from "$lib/components/chat/PostContextCard.svelte";
  import ChatInterface from "$lib/components/chat/ChatInterface.svelte";

  const statusColors: Record<string, string> = {
    new: "text-status-info-text",
    in_progress: "text-status-warning-text",
    draft_ready: "text-status-success-text",
    complete: "text-muted",
  };

  let { data }: { data: PageData } = $props();

  const post = $derived(data.post);
  const personas = $derived(
    data.personas.map((p: { id: string; name: string; voiceVersion?: number | null }) => ({
      id: p.id,
      name: p.name,
      voiceVersion: p.voiceVersion ?? null,
    })),
  );

  let showContentForm = $state(false);
</script>

<div class="flex h-full flex-col">
  <!-- Back link + status selector -->
  <div class="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
    <a href="/" class="inline-flex items-center text-sm font-medium text-secondary hover:text-primary">
      &larr; Back to Dashboard
    </a>
    <form method="POST" action="?/updateStatus" use:enhance={() => {
      return async ({ update }) => { await update(); };
    }} class="flex items-center gap-2">
      <input type="hidden" name="postId" value={post.id} />
      <span class="text-xs font-medium text-muted">Status:</span>
      <select
        name="status"
        class="rounded border border-border-main bg-transparent px-2 py-1 text-xs font-medium hover:border-border-input focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none {statusColors[post.status] ?? 'text-muted'}"
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="new" selected={post.status === 'new'}>New</option>
        <option value="in_progress" selected={post.status === 'in_progress'}>In Progress</option>
        <option value="draft_ready" selected={post.status === 'draft_ready'}>Draft Ready</option>
        <option value="complete" selected={post.status === 'complete'}>Complete</option>
      </select>
    </form>
  </div>

  <!-- Post context card (pinned) -->
  <div class="shrink-0 px-4 pb-2">
    <PostContextCard
      post={{
        url: post.url,
        platform: post.platform,
        postContent: post.postContent,
        postAuthor: post.postAuthor,
      }}
    />
  </div>

  <!-- Content paste form (only if no content yet) -->
  {#if !post.postContent}
    <div class="shrink-0 px-4 pb-2">
      <div class="rounded-lg border border-dashed border-border-input bg-surface-alt p-4">
        <p class="text-sm text-muted">Content not yet available</p>
        {#if !showContentForm}
          <button
            onclick={() => (showContentForm = true)}
            class="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Paste content manually
          </button>
        {:else}
          <form method="POST" action="?/updateContent" use:enhance={() => {
            return async ({ update }) => { await update(); };
          }} class="mt-3 space-y-2">
            <input type="hidden" name="postId" value={post.id} />
            <textarea
              name="content"
              rows="4"
              placeholder="Paste the post content here..."
              class="w-full rounded-md border border-border-input bg-surface px-3 py-2 text-sm placeholder-faint focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
            ></textarea>
            <div class="flex gap-2">
              <button
                type="submit"
                class="rounded-md bg-btn px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-btn-hover"
              >
                Save Content
              </button>
              <button
                type="button"
                onclick={() => (showContentForm = false)}
                class="rounded-md border border-border-input px-3 py-1.5 text-sm font-medium text-secondary hover:bg-surface-dim"
              >
                Cancel
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Chat interface (fills remaining height) -->
  <!-- Key on post.id to force remount when navigating between posts (e.g. via QuickAdd modal) -->
  {#key post.id}
    <ChatInterface
      postId={post.id}
      initialMessages={data.chatMessages}
      {personas}
      activePersonaId={data.persona?.id ?? null}
      draftEdits={data.draftEdits ?? []}
      autoGenerate={data.autoGenerate}
      autoPrompt={data.autoPrompt}
      usage={data.usage}
    />
  {/key}
</div>
