<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { toasts } from "$lib/stores/toast";

  interface Persona {
    id: string;
    name: string;
    platform: string | null;
    isDefault: boolean;
  }

  let {
    personas: personaList = [],
    onSuccess,
  }: {
    personas: Persona[];
    onSuccess?: () => void;
  } = $props();

  let submitting = $state(false);
  let needsContent = $state(false);
  let pendingPostId = $state("");

  let prompt = $state("");
  let showOptions = $state(false);
  let selectedPersonaId = $state("");

  // Manual content fallback
  let manualContent = $state("");
  let savingContent = $state(false);

  // Default persona: first default, or first in list
  const defaultPersonaId = $derived(
    personaList.find((p) => p.isDefault)?.id ?? personaList[0]?.id ?? "",
  );

  // Initialize selectedPersonaId from default when options first shown
  $effect(() => {
    if (!selectedPersonaId && defaultPersonaId) {
      selectedPersonaId = defaultPersonaId;
    }
  });

  function handleAddPost() {
    submitting = true;
    return async ({
      result,
      update,
    }: {
      result: any;
      update: () => Promise<void>;
    }) => {
      submitting = false;
      if (result.type === "failure") {
        toasts.add(result.data?.error ?? "Something went wrong", "error");
      } else if (result.type === "success") {
        if (result.data?.needsContent) {
          needsContent = true;
          pendingPostId = result.data.postId;
          await update();
        } else if (result.data?.postId) {
          const params = new URLSearchParams({ autoGenerate: "true" });
          if (prompt.trim()) params.set("prompt", prompt.trim());
          goto(`/queue/${result.data.postId}?${params.toString()}`);
          onSuccess?.();
        }
      }
    };
  }

  function handleUpdateContent() {
    savingContent = true;
    return async ({
      result,
    }: {
      result: any;
      update: () => Promise<void>;
    }) => {
      savingContent = false;
      if (result.type === "success") {
        const postId = pendingPostId;
        needsContent = false;
        pendingPostId = "";
        manualContent = "";
        const params = new URLSearchParams({ autoGenerate: "true" });
        if (prompt.trim()) params.set("prompt", prompt.trim());
        goto(`/queue/${postId}?${params.toString()}`);
        onSuccess?.();
      }
    };
  }
</script>

<div class="rounded-lg border border-border-main bg-surface p-4">
  <form
    method="POST"
    action="/?/addPost"
    use:enhance={handleAddPost}
    class="space-y-2"
  >
    <div class="flex gap-2">
      <label for="quick-add-url" class="sr-only">Post URL</label>
      <input
        id="quick-add-url"
        type="url"
        name="url"
        required
        autocomplete="off"
        placeholder="Paste a post URL..."
        disabled={submitting}
        class="flex-1 rounded-md border border-border-input bg-surface px-3 py-2 text-sm placeholder-faint focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover disabled:opacity-50"
      >
        {submitting ? "Adding..." : "Add to Queue"}
      </button>
    </div>

    {#if showOptions}
      <textarea
        name="prompt"
        bind:value={prompt}
        rows="2"
        placeholder="e.g. Disagree with the premise, be concise..."
        disabled={submitting}
        class="w-full rounded-md border border-border-input bg-surface px-3 py-2 text-sm placeholder-faint focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none disabled:opacity-50"
      ></textarea>

      {#if personaList.length > 0}
        <div class="flex items-center gap-2">
          <label for="quick-add-persona" class="text-xs text-muted shrink-0">Persona</label>
          <select
            id="quick-add-persona"
            name="personaId"
            bind:value={selectedPersonaId}
            disabled={submitting}
            class="rounded-md border border-border-input bg-surface px-2 py-1 text-xs text-secondary focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none disabled:opacity-50"
          >
            {#each personaList as p (p.id)}
              <option value={p.id}>
                {p.name}{p.isDefault ? " (default)" : ""}
              </option>
            {/each}
          </select>
        </div>
      {/if}
    {:else if selectedPersonaId}
      <input type="hidden" name="personaId" value={selectedPersonaId} />
    {/if}

    <button
      type="button"
      onclick={() => (showOptions = !showOptions)}
      class="text-xs text-muted hover:text-secondary"
    >
      {showOptions ? "Hide options" : "more options (optional)"}
    </button>
  </form>

  {#if needsContent}
    <div class="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
      <p class="mb-2 text-sm text-status-warning-text">
        Could not scrape post content — paste it manually below.
      </p>
      <form
        method="POST"
        action="/?/updateContent"
        use:enhance={handleUpdateContent}
        class="space-y-2"
      >
        <input type="hidden" name="postId" value={pendingPostId} />
        <textarea
          name="content"
          required
          rows={3}
          bind:value={manualContent}
          placeholder="Paste the post content here..."
          class="w-full rounded-md border border-border-input bg-surface px-3 py-2 text-sm placeholder-faint focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
        ></textarea>
        <button
          type="submit"
          disabled={savingContent || !manualContent.trim()}
          class="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {savingContent ? "Saving..." : "Save content"}
        </button>
      </form>
    </div>
  {/if}
</div>
