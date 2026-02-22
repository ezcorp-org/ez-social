<script lang="ts">
  import { toasts } from "$lib/stores/toast";

  const typeStyles = {
    success: "bg-toast-success-bg border-toast-success-border text-toast-success-text",
    error: "bg-toast-error-bg border-toast-error-border text-toast-error-text",
    info: "bg-toast-info-bg border-toast-info-border text-toast-info-text",
  };
</script>

{#if $toasts.length > 0}
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
    {#each $toasts as toast (toast.id)}
      <div
        class="rounded-lg border px-4 py-3 text-sm shadow-md {typeStyles[toast.type]}"
        role="status"
      >
        <div class="flex items-center justify-between gap-3">
          <span>{toast.message}</span>
          <button
            type="button"
            onclick={() => toasts.dismiss(toast.id)}
            class="text-xs font-medium opacity-60 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}
