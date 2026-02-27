<script lang="ts">
  let {
    personas,
    activePersonaId,
    onSwitch,
  }: {
    personas: Array<{ id: string; name: string; voiceVersion: number | null }>;
    activePersonaId: string | null;
    onSwitch: (personaId: string) => void;
  } = $props();

  const activePersona = $derived(
    personas.find((p) => p.id === activePersonaId) ?? null,
  );
</script>

<div class="flex items-center gap-2 px-1 py-1.5 text-xs text-muted">
  <span class="shrink-0">
    {#if activePersona}
      Replying as <span class="font-medium text-secondary">{activePersona.name}</span>
      {#if activePersona.voiceVersion}
        <span class="text-faint">v{activePersona.voiceVersion}</span>
      {/if}
    {:else}
      <span class="text-faint">No persona selected</span>
    {/if}
  </span>

  {#if personas.length > 0}
    <select
      value={activePersonaId ?? ""}
      onchange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        if (val) onSwitch(val);
      }}
      class="rounded border border-border-main bg-surface px-1.5 py-0.5 text-xs text-secondary focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none"
    >
      <option value="" disabled>Switch persona</option>
      {#each personas as p (p.id)}
        <option value={p.id} selected={p.id === activePersonaId}>{p.name}{p.voiceVersion ? ` (v${p.voiceVersion})` : ''}</option>
      {/each}
    </select>
  {/if}
</div>
