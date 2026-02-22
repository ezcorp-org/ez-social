<script lang="ts">
  import { platformStyles } from "$lib/utils/platform";

  let {
    post,
  }: {
    post: {
      url: string;
      platform: string | null;
      postContent: string | null;
      postAuthor: string | null;
    };
  } = $props();

  let expanded = $state(false);

  const TRUNCATE_LENGTH = 200;
  const needsTruncation = $derived(
    (post.postContent?.length ?? 0) > TRUNCATE_LENGTH,
  );
  const displayContent = $derived(
    !post.postContent
      ? null
      : needsTruncation && !expanded
        ? post.postContent.slice(0, TRUNCATE_LENGTH) + "…"
        : post.postContent,
  );

  function getPlatformStyle(platform: string | null) {
    if (!platform) return null;
    return platformStyles[platform] ?? platformStyles["other"];
  }
</script>

<div class="rounded-lg border border-border-main bg-surface-alt px-4 py-3">
  <div class="flex items-start gap-3">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        {#if post.postAuthor}
          <span class="font-semibold text-primary">{post.postAuthor}</span>
        {/if}

        {#if post.platform}
          {@const style = getPlatformStyle(post.platform)}
          {#if style}
            <span class="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-secondary ring-1 ring-border-main">
              <span class="inline-block h-1.5 w-1.5 rounded-full {style.color}"></span>
              {style.label}
            </span>
          {/if}
        {/if}
      </div>

      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        class="mt-1 block truncate text-xs text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
      >{post.url}</a>

      {#if displayContent}
        <p class="mt-1.5 text-sm leading-relaxed text-secondary whitespace-pre-wrap">{displayContent}</p>
        {#if needsTruncation}
          <button
            onclick={() => (expanded = !expanded)}
            class="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        {/if}
      {:else}
        <p class="mt-1.5 text-sm text-faint italic">No content available</p>
      {/if}
    </div>

    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      class="shrink-0 rounded-md p-1.5 text-faint hover:bg-surface-dim hover:text-secondary"
      title="Open original post"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </a>
  </div>
</div>
