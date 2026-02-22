<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData } from "./$types";

  let { form }: { form: ActionData } = $props();
</script>

<div class="mx-auto max-w-lg space-y-6">
  <div>
    <a href="/personas" class="text-sm text-muted hover:text-secondary"
      >&larr; Back to personas</a
    >
    <h1 class="mt-2 text-2xl font-bold text-primary">New persona</h1>
    <p class="mt-1 text-sm text-muted">
      Give your persona a name to get started. You can add details later.
    </p>
  </div>

  <form method="POST" use:enhance class="space-y-4">
    <div>
      <label for="name" class="block text-sm font-medium text-secondary">
        Name <span class="text-red-500">*</span>
      </label>
      <input
        type="text"
        id="name"
        name="name"
        required
        value={form?.name ?? ""}
        placeholder="e.g., Professional Twitter"
        class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
      />
      {#if form?.errors?.name}
        <p class="mt-1 text-sm text-status-danger-text">{form.errors.name[0]}</p>
      {/if}
    </div>

    <div>
      <label
        for="description"
        class="block text-sm font-medium text-secondary"
      >
        Description
      </label>
      <textarea
        id="description"
        name="description"
        rows={3}
        value={form?.description ?? ""}
        placeholder="Brief description of this voice identity"
        class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
      ></textarea>
      {#if form?.errors?.description}
        <p class="mt-1 text-sm text-status-danger-text">{form.errors.description[0]}</p>
      {/if}
    </div>

    <div>
      <label for="platform" class="block text-sm font-medium text-secondary">
        Platform
      </label>
      <select
        id="platform"
        name="platform"
        class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
      >
        <option value="">None (general)</option>
        <option value="twitter" selected={form?.platform === "twitter"}
          >Twitter</option
        >
        <option value="linkedin" selected={form?.platform === "linkedin"}
          >LinkedIn</option
        >
        <option value="blog" selected={form?.platform === "blog"}>Blog</option>
        <option value="reddit" selected={form?.platform === "reddit"}
          >Reddit</option
        >
        <option value="email" selected={form?.platform === "email"}
          >Email</option
        >
        <option value="other" selected={form?.platform === "other"}
          >Other</option
        >
      </select>
    </div>

    {#if form?.error}
      <p class="text-sm text-status-danger-text">{form.error}</p>
    {/if}

    <button
      type="submit"
      class="w-full rounded-lg bg-btn px-4 py-2.5 text-sm font-medium text-on-primary hover:bg-btn-hover"
    >
      Create persona
    </button>
  </form>
</div>
