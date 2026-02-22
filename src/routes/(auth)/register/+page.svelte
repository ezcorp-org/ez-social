<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData } from "./$types";

  let { form }: { form: ActionData } = $props();
</script>

<div class="w-full max-w-md space-y-8 rounded-lg bg-surface p-8 shadow-md">
  <div class="text-center">
    <h1 class="text-2xl font-bold text-primary">Create your account</h1>
    <p class="mt-2 text-sm text-secondary">
      Join ez-social to get started
    </p>
  </div>

  <form method="POST" use:enhance class="space-y-6">
    <div>
      <label for="email" class="block text-sm font-medium text-secondary">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        value={form?.email ?? ""}
        aria-describedby={form?.errors?.email ? "email-error" : undefined}
        class="mt-1 block w-full rounded-md border border-border-input bg-surface px-3 py-2 text-primary placeholder-faint shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        placeholder="you@example.com"
      />
      {#if form?.errors?.email}
        <p id="email-error" class="mt-1 text-sm text-status-danger-text">{form.errors.email[0]}</p>
      {/if}
    </div>

    <div>
      <label for="password" class="block text-sm font-medium text-secondary">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minlength={8}
        aria-describedby={form?.errors?.password ? "password-error" : undefined}
        class="mt-1 block w-full rounded-md border border-border-input bg-surface px-3 py-2 text-primary placeholder-faint shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        placeholder="At least 8 characters"
      />
      {#if form?.errors?.password}
        <p id="password-error" class="mt-1 text-sm text-status-danger-text">{form.errors.password[0]}</p>
      {/if}
    </div>

    <div>
      <label for="confirmPassword" class="block text-sm font-medium text-secondary">
        Confirm password
      </label>
      <input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        required
        aria-describedby={form?.errors?.confirmPassword ? "confirmPassword-error" : undefined}
        class="mt-1 block w-full rounded-md border border-border-input bg-surface px-3 py-2 text-primary placeholder-faint shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        placeholder="Repeat your password"
      />
      {#if form?.errors?.confirmPassword}
        <p id="confirmPassword-error" class="mt-1 text-sm text-status-danger-text">{form.errors.confirmPassword[0]}</p>
      {/if}
    </div>

    {#if form?.errors?._}
      <div class="rounded-md bg-status-danger-bg p-3">
        <p class="text-sm text-status-danger-text">{form.errors._[0]}</p>
      </div>
    {/if}

    <button
      type="submit"
      class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
    >
      Create account
    </button>
  </form>

  <p class="text-center text-sm text-secondary">
    Already have an account?
    <a href="/login" class="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
      Sign in
    </a>
  </p>
</div>
