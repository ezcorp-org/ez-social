<script>
  import { page } from '$app/stores';
</script>

<div class="flex min-h-screen items-center justify-center bg-surface-alt px-4">
  <div class="text-center">
    <p class="text-6xl font-bold text-faint">{$page.status}</p>
    <h1 class="mt-4 text-xl font-semibold text-primary">
      {#if $page.status === 404}
        Page not found
      {:else if $page.status >= 500}
        Something went wrong
      {:else}
        An error occurred
      {/if}
    </h1>
    <p class="mt-2 text-secondary">{$page.error?.message || 'The page you are looking for could not be found.'}</p>
    <a href="/" class="mt-6 inline-block rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover">
      Go to Dashboard
    </a>
  </div>
</div>
