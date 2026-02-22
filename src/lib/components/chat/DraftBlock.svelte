<script lang="ts">
  let {
    text,
    messageId,
    postId,
    personaId = null,
    savedEditText = null,
    onEdit,
  }: {
    text: string;
    messageId: string;
    postId: string;
    personaId?: string | null;
    savedEditText?: string | null;
    onEdit?: (text: string) => void;
  } = $props();

  let copied = $state(false);
  let isEditing = $state(false);
  let editText = $state("");
  let isSaving = $state(false);
  let hasBeenEdited = $state(false);
  let localEditText = $state<string | null>(null);
  let saveError = $state<string | null>(null);
  let showOriginal = $state(false);

  // The text to display: local edit > saved edit > original
  const displayText = $derived(localEditText ?? savedEditText ?? text);
  const isEdited = $derived(hasBeenEdited || savedEditText != null);
  const charCount = $derived(displayText.length);
  const wordCount = $derived(displayText.trim() ? displayText.trim().split(/\s+/).length : 0);

  /** execCommand fallback for browsers where navigator.clipboard is unavailable or blocked. */
  function execCopyFallback(text: string): boolean {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Place off-screen so it's invisible
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function copyToClipboard() {
    let didCopy = false;

    // Try modern Clipboard API first, fall back to execCommand
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(displayText);
        didCopy = true;
      } catch {
        didCopy = execCopyFallback(displayText);
      }
    } else {
      didCopy = execCopyFallback(displayText);
    }

    if (didCopy) {
      copied = true;
      setTimeout(() => (copied = false), 2000);

      // Track as 'accepted' feedback — fire and forget
      fetch(`/queue/${postId}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "feedback",
          messageId,
          personaId,
          action: "accepted",
          draftText: displayText,
        }),
      }).catch(() => {});
    }
  }

  function startEditing() {
    editText = displayText;
    isEditing = true;
    saveError = null;
  }

  function cancelEditing() {
    isEditing = false;
    editText = "";
    saveError = null;
  }

  async function saveEdit() {
    if (!editText.trim() || editText === text) {
      saveError = "Edit must differ from the original text";
      return;
    }

    isSaving = true;
    saveError = null;

    try {
      const res = await fetch(`/queue/${postId}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          originalText: text,
          editedText: editText,
          personaId,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        saveError = msg || "Failed to save edit";
        return;
      }

      localEditText = editText;
      hasBeenEdited = true;
      isEditing = false;
      onEdit?.(editText);
    } catch (err) {
      saveError = "Network error — could not save edit";
    } finally {
      isSaving = false;
    }
  }
</script>

<div data-draft-message={messageId} class="my-2 rounded-lg border border-draft-border bg-draft-bg p-4">
  <div class="mb-2 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-xs font-medium uppercase tracking-wide text-draft-text">Draft</span>
      {#if isEdited && !isEditing}
        <span class="rounded bg-draft-bg px-1.5 py-0.5 text-[10px] font-medium text-draft-text-dim border border-draft-border">Edited</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if !isEditing}
        <button
          onclick={startEditing}
          class="rounded px-2 py-0.5 text-xs font-medium text-draft-text hover:bg-draft-border/30"
        >
          Edit
        </button>
        <button
          onclick={copyToClipboard}
          class="rounded px-2 py-0.5 text-xs font-medium {copied ? 'text-status-success-text' : 'text-draft-text hover:bg-draft-border/30'}"
        >
          {copied ? "Copied! (marked complete)" : "Copy"}
        </button>
      {/if}
    </div>
  </div>

  {#if isEditing}
    <textarea
      bind:value={editText}
      rows="6"
      disabled={isSaving}
      class="w-full rounded-md border border-draft-border bg-surface px-3 py-2 text-sm leading-relaxed text-primary placeholder-faint focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
    ></textarea>

    {#if saveError}
      <p class="mt-1 text-xs text-status-danger-text">{saveError}</p>
    {/if}

    <div class="mt-2 flex items-center gap-2">
      <button
        onclick={saveEdit}
        disabled={isSaving || !editText.trim()}
        class="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSaving ? "Saving…" : "Save"}
      </button>
      <button
        onclick={cancelEditing}
        disabled={isSaving}
        class="rounded-md border border-border-input px-3 py-1 text-xs font-medium text-secondary hover:bg-surface-dim disabled:opacity-40"
      >
        Cancel
      </button>
    </div>
  {:else}
    <div class="draft-text text-sm leading-relaxed text-primary whitespace-pre-wrap">{displayText}</div>

    {#if isEdited}
      <button
        onclick={() => (showOriginal = !showOriginal)}
        class="mt-1 text-[10px] font-medium text-draft-text-faint hover:text-draft-text"
      >
        {showOriginal ? "Hide original" : "Show original"}
      </button>
      {#if showOriginal}
        <div class="mt-1 rounded border border-border-main bg-surface-alt p-2 text-xs leading-relaxed text-muted whitespace-pre-wrap">
          {text}
        </div>
      {/if}
    {/if}
  {/if}

  <div class="mt-2 text-xs text-faint">
    {charCount} chars · {wordCount} words
  </div>
</div>
