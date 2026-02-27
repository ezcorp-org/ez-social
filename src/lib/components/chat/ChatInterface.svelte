<script lang="ts">
  import { onMount } from "svelte";
  import { Chat, type UIMessage } from "@ai-sdk/svelte";
  import { DefaultChatTransport } from "ai";
  import { replaceState } from "$app/navigation";
  import ChatMessage from "./ChatMessage.svelte";
  import PersonaSelector from "./PersonaSelector.svelte";
  import { formatCost, formatTokens } from "$lib/utils/format";

  type ServerMessage = {
    id: string;
    role: "user" | "assistant" | "system";
    parts: Array<{ type: string; text: string }>;
    createdAt?: Date | string;
  };

  type DraftEditData = {
    messageId: string;
    originalText: string;
    editedText: string;
  };

  let {
    postId,
    initialMessages,
    personas,
    activePersonaId,
    draftEdits = [],
    autoGenerate = false,
    autoPrompt = "",
    usage = { inputTokens: 0, outputTokens: 0, totalCostMicrocents: 0 },
  }: {
    postId: string;
    initialMessages: ServerMessage[];
    personas: Array<{ id: string; name: string; voiceVersion: number | null }>;
    activePersonaId: string | null;
    draftEdits?: DraftEditData[];
    autoGenerate?: boolean;
    autoPrompt?: string;
    usage?: { inputTokens: number; outputTokens: number; totalCostMicrocents: number };
  } = $props();

  let currentPersonaId = $state(activePersonaId);
  let inputText = $state("");
  let chatError = $state<string | null>(null);
  let messagesContainer: HTMLDivElement | undefined = $state();
  let switchNotification = $state<string | null>(null);
  let switchTimeout: ReturnType<typeof setTimeout> | null = null;
  let autoSent = false;

  const chat = new Chat({
    id: postId,
    messages: initialMessages as UIMessage[],
    transport: new DefaultChatTransport({
      api: `/queue/${postId}/chat`,
      body: () => ({ personaId: currentPersonaId }),
    }),
    onError: (error) => {
      chatError = error.message || String(error);
    },
  });

  const isStreaming = $derived(chat.status === "streaming" || chat.status === "submitted");

  // Map draftEdits by messageId for efficient lookup
  const editsByMessageId = $derived(
    draftEdits.reduce<Record<string, DraftEditData[]>>((acc, edit) => {
      if (!acc[edit.messageId]) acc[edit.messageId] = [];
      acc[edit.messageId].push(edit);
      return acc;
    }, {}),
  );

  $effect(() => {
    // Track message count changes to auto-scroll
    const _len = chat.messages.length;
    if (messagesContainer) {
      // Use requestAnimationFrame to scroll after DOM update
      requestAnimationFrame(() => {
        messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: "smooth" });
      });
    }
  });

  // Auto-send initial message when redirected from QuickAdd
  // Defer replaceState to next tick — SvelteKit router isn't ready during onMount
  onMount(() => {
    if (autoGenerate && !autoSent) {
      autoSent = true;
      // Always clean URL params regardless of sendMessage outcome
      setTimeout(() => {
        replaceState(`/queue/${postId}`, {});
      }, 0);
      const messageText = autoPrompt.trim() || "Draft a reply to this post.";
      chat.sendMessage({ text: messageText });
    }
  });

  function handleSend() {
    const text = inputText.trim();
    if (!text || isStreaming) return;
    inputText = "";
    chat.sendMessage({ text });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handlePersonaSwitch(personaId: string) {
    currentPersonaId = personaId;

    // Show transient notification
    const p = personas.find((p) => p.id === personaId);
    const label = p ? `${p.name}${p.voiceVersion ? ` v${p.voiceVersion}` : ''}` : "Unknown";
    switchNotification = `Now replying as ${label}`;

    if (switchTimeout) clearTimeout(switchTimeout);
    switchTimeout = setTimeout(() => {
      switchNotification = null;
    }, 3000);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Message list -->
  <div
    bind:this={messagesContainer}
    role="log"
    aria-live="polite"
    class="flex-1 overflow-y-auto px-4 py-3"
  >
    {#each chat.messages as message (message.id)}
      <ChatMessage
        {message}
        {postId}
        personaId={currentPersonaId}
        draftEdits={editsByMessageId[message.id] ?? []}
      />
    {/each}

    {#if isStreaming}
      <div class="mb-3 flex justify-start">
        <div class="rounded-2xl rounded-bl-md border border-chat-asst-border bg-chat-asst-bg px-4 py-2.5">
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-faint" style="animation-delay: 0ms"></span>
            <span class="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-faint" style="animation-delay: 150ms"></span>
            <span class="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-faint" style="animation-delay: 300ms"></span>
            <span class="ml-2 text-xs text-faint">AI is typing…</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Error display -->
  {#if chatError}
    <div class="mx-4 mb-2 flex items-center justify-between rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">
      <span>{chatError}</span>
      <button onclick={() => (chatError = null)} class="ml-2 text-status-danger-text opacity-60 hover:opacity-100" aria-label="Dismiss error">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  {/if}

  <!-- Persona selector with switch notification -->
  <div class="border-t border-border-subtle px-4">
    <div class="flex items-center gap-2">
      <PersonaSelector
        {personas}
        activePersonaId={currentPersonaId}
        onSwitch={handlePersonaSwitch}
      />
      {#if switchNotification}
        <span class="animate-fade-in text-xs font-medium text-status-success-text">
          {switchNotification}
        </span>
      {/if}
    </div>
  </div>

  <!-- Cost footer -->
  {#if usage.totalCostMicrocents > 0}
    <div class="px-4 py-1" data-testid="cost-footer">
      <span class="text-xs text-faint">
        Tokens: {formatTokens(usage.inputTokens)} in / {formatTokens(usage.outputTokens)} out
        &middot; Cost: {formatCost(usage.totalCostMicrocents)}
      </span>
    </div>
  {/if}

  <!-- Input area -->
  <div class="border-t border-border-main px-4 py-3">
    <div class="flex items-end gap-2">
      <textarea
        bind:value={inputText}
        onkeydown={handleKeydown}
        placeholder="Type your message…"
        aria-label="Chat message"
        rows="2"
        disabled={isStreaming}
        class="flex-1 resize-none rounded-lg border border-border-main bg-surface px-3 py-2 text-sm placeholder-faint focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none disabled:opacity-50"
      ></textarea>
      <button
        onclick={handleSend}
        disabled={!inputText.trim() || isStreaming}
        aria-label="Send message"
        class="shrink-0 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isStreaming ? "…" : "Send"}
      </button>
    </div>
  </div>
</div>

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }
  :global(.animate-fade-in) {
    animation: fade-in 0.2s ease-out;
  }
</style>
