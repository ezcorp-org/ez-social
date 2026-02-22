<script lang="ts">
  import type { UIMessage } from "@ai-sdk/svelte";
  import DraftBlock from "./DraftBlock.svelte";
  import { parseDraftBlocks } from "$lib/utils/draft";

  type ChatMsg = UIMessage & { createdAt?: Date | string };
  type DraftEditInfo = { originalText: string; editedText: string };

  let {
    message,
    postId = "",
    personaId = null,
    draftEdits = [],
  }: {
    message: ChatMsg;
    postId?: string;
    personaId?: string | null;
    draftEdits?: DraftEditInfo[];
  } = $props();

  /** Find a saved edit matching a draft's original text */
  function findEditForDraft(originalText: string): string | null {
    const edit = draftEdits.find((e) => e.originalText === originalText);
    return edit?.editedText ?? null;
  }

  function formatTime(date: Date | string | undefined): string | null {
    if (!date) return null;
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
</script>

<div data-role={message.role} class="flex {message.role === 'user' ? 'justify-end' : message.role === 'system' ? 'justify-center' : 'justify-start'} mb-3">
  <div class="max-w-[85%] {message.role === 'user'
    ? 'rounded-2xl rounded-br-md bg-chat-user-bg px-4 py-2.5 text-chat-user-text'
    : message.role === 'system'
      ? 'px-4 py-2 text-center text-sm text-faint italic'
      : 'rounded-2xl rounded-bl-md border border-chat-asst-border bg-chat-asst-bg px-4 py-2.5 text-chat-asst-text'}">
    {#each message.parts as part}
      {#if part.type === "text"}
        {#if message.role === "assistant" && part.state !== "streaming" && part.text.includes("<draft>")}
          {#each parseDraftBlocks(part.text) as segment}
            {#if segment.type === "draft"}
              <DraftBlock
                text={segment.content}
                messageId={message.id}
                {postId}
                {personaId}
                savedEditText={findEditForDraft(segment.content)}
              />
            {:else if segment.content.trim()}
              <p class="text-sm leading-relaxed whitespace-pre-wrap">{segment.content.trim()}</p>
            {/if}
          {/each}
        {:else}
          <p class="text-sm leading-relaxed whitespace-pre-wrap">{part.text}</p>
        {/if}
      {/if}
    {/each}

    {#if formatTime(message.createdAt)}
      <p class="mt-1 text-[10px] {message.role === 'user' ? 'text-chat-user-text/40' : 'text-faint'}">
        {formatTime(message.createdAt)}
      </p>
    {/if}
  </div>
</div>
