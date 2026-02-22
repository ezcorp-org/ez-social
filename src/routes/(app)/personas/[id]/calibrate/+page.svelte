<script lang="ts">
  import { invalidateAll, goto } from "$app/navigation";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  type Sample = { topic: string; reply: string };
  type Rating = "sounds_like_me" | "doesnt_sound_like_me";

  let step = $state<"generate" | "rate" | "refining" | "done">("generate");
  let samples = $state<Sample[]>([]);
  let ratings = $state<Map<number, Rating>>(new Map());
  let generating = $state(false);
  let refining = $state(false);
  let error = $state<string | null>(null);

  const defaultTopics = [
    "someone sharing a hot take on your industry",
    "a post asking for tool recommendations",
    "a personal milestone announcement",
  ];

  let topics = $state<string[]>([...defaultTopics]);

  let allRated = $derived(
    samples.length > 0 && ratings.size === samples.length,
  );

  function updateTopic(index: number, value: string) {
    topics[index] = value;
  }

  async function generateSamples() {
    generating = true;
    error = null;
    samples = [];
    ratings = new Map();

    try {
      const response = await fetch(
        `/personas/${data.persona.id}/calibrate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topics }),
        },
      );

      if (!response.ok) {
        error = await response.text();
        generating = false;
        return;
      }

      // Stream and parse the JSON response
      const reader = response.body?.getReader();
      if (!reader) {
        error = "No response stream available";
        generating = false;
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        try {
          const parsed = JSON.parse(accumulated);
          if (Array.isArray(parsed)) {
            samples = parsed;
          }
        } catch {
          // Partial JSON — wait for more data
        }
      }

      // Final parse
      try {
        const parsed = JSON.parse(accumulated);
        if (Array.isArray(parsed)) {
          samples = parsed;
        }
      } catch {
        // Use last successful partial
      }

      if (samples.length > 0) {
        step = "rate";
      } else {
        error = "Failed to generate samples";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "An unexpected error occurred";
    } finally {
      generating = false;
    }
  }

  function rateSample(index: number, rating: Rating) {
    const updated = new Map(ratings);
    updated.set(index, rating);
    ratings = updated;
  }

  async function refineVoice() {
    refining = true;
    step = "refining";
    error = null;

    try {
      // Save calibration ratings
      const ratingEntries = samples.map((s, i) => ({
        topic: s.topic,
        reply: s.reply,
        rating: ratings.get(i) ?? ("doesnt_sound_like_me" as Rating),
      }));

      const saveResponse = await fetch(
        `/personas/${data.persona.id}/calibrate`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratings: ratingEntries }),
        },
      );

      if (!saveResponse.ok) {
        error = await saveResponse.text();
        step = "rate";
        refining = false;
        return;
      }

      // Trigger voice re-extraction with feedback context
      const extractResponse = await fetch(
        `/personas/${data.persona.id}/voice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recalibrate: true }),
        },
      );

      if (!extractResponse.ok) {
        error = await extractResponse.text();
        step = "rate";
        refining = false;
        return;
      }

      // Consume the stream to completion
      const reader = extractResponse.body?.getReader();
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      step = "done";
      await invalidateAll();
    } catch (e) {
      error = e instanceof Error ? e.message : "An unexpected error occurred";
      step = "rate";
    } finally {
      refining = false;
    }
  }
</script>

<div class="mx-auto max-w-2xl space-y-6">
  <!-- Header -->
  <div>
    <a
      href="/personas/{data.persona.id}"
      class="text-sm text-muted hover:text-secondary"
    >
      &larr; Back to {data.persona.name}
    </a>
    <h1 class="mt-2 text-2xl font-bold text-primary">Calibrate Voice</h1>
    <p class="mt-1 text-sm text-secondary">
      Rate AI-generated sample replies to refine how well the voice profile
      matches your writing style.
    </p>
  </div>

  <!-- Progress indicator -->
  <div class="flex items-center gap-2">
    {#each ["Generate", "Rate", "Refine"] as label, i}
      {@const stepIndex =
        step === "generate"
          ? 0
          : step === "rate"
            ? 1
            : step === "refining"
              ? 2
              : 3}
      <div class="flex items-center gap-2">
        <div
          class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium {i <=
          stepIndex
            ? 'bg-btn text-on-primary'
            : 'bg-surface-dim text-muted'}"
        >
          {#if i < stepIndex}
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          {:else}
            {i + 1}
          {/if}
        </div>
        <span class="text-sm {i <= stepIndex ? 'font-medium text-primary' : 'text-muted'}">{label}</span>
      </div>
      {#if i < 2}
        <div class="h-px w-8 {i < stepIndex ? 'bg-btn' : 'bg-surface-dim'}"></div>
      {/if}
    {/each}
  </div>

  <!-- Error display -->
  {#if error}
    <div class="rounded-lg border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger-text">
      <p>{error}</p>
      <button
        type="button"
        onclick={() => (error = null)}
        class="mt-1 text-xs font-medium text-status-danger-text underline opacity-80 hover:opacity-100"
      >
        Dismiss
      </button>
    </div>
  {/if}

  <!-- Step 1: Generate Samples -->
  {#if step === "generate"}
    <div class="rounded-xl border border-border-main bg-surface p-6">
      <h2 class="text-lg font-semibold text-primary">
        Choose topics for sample replies
      </h2>
      <p class="mt-1 text-sm text-secondary">
        We'll generate replies to these topics in your voice. Edit them or use
        the defaults.
      </p>

      <div class="mt-4 space-y-3">
        {#each topics as topic, i}
          <div>
            <label
              for="topic-{i}"
              class="block text-xs font-medium text-muted"
            >
              Topic {i + 1}
            </label>
            <input
              id="topic-{i}"
              type="text"
              value={topic}
              oninput={(e) =>
                updateTopic(i, (e.target as HTMLInputElement).value)}
              disabled={generating}
              class="mt-1 block w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm shadow-sm focus:border-muted focus:ring-1 focus:ring-muted focus:outline-none disabled:bg-surface-alt"
            />
          </div>
        {/each}
      </div>

      <button
        type="button"
        onclick={generateSamples}
        disabled={generating || topics.some((t) => !t.trim())}
        class="mt-4 inline-flex items-center gap-2 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {#if generating}
          <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Generating samples...
        {:else}
          Generate Samples
        {/if}
      </button>
    </div>
  {/if}

  <!-- Step 2: Rate Samples -->
  {#if step === "rate"}
    <div class="space-y-4">
      {#each samples as sample, i}
        <div class="rounded-xl border border-border-main bg-surface p-5">
          <p class="text-xs font-medium text-muted uppercase tracking-wide">
            Replying to: {sample.topic}
          </p>
          <p class="mt-2 text-sm text-primary leading-relaxed">
            "{sample.reply}"
          </p>

          <div class="mt-3 flex gap-2">
            <button
              type="button"
              onclick={() => rateSample(i, "sounds_like_me")}
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {ratings.get(
                i,
              ) === 'sounds_like_me'
                ? 'bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-700'
                : 'bg-surface-dim text-secondary hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/20 dark:hover:text-green-400'}"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
              </svg>
              Sounds like me
            </button>
            <button
              type="button"
              onclick={() => rateSample(i, "doesnt_sound_like_me")}
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {ratings.get(
                i,
              ) === 'doesnt_sound_like_me'
                ? 'bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-700'
                : 'bg-surface-dim text-secondary hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400'}"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
              </svg>
              Doesn't sound like me
            </button>
          </div>
        </div>
      {/each}

      {#if allRated}
        <button
          type="button"
          onclick={refineVoice}
          class="w-full rounded-lg bg-btn px-4 py-2.5 text-sm font-medium text-on-primary hover:bg-btn-hover"
        >
          Refine Voice Profile
        </button>
      {:else}
        <p class="text-center text-sm text-muted">
          Rate all {samples.length} samples to continue
        </p>
      {/if}
    </div>
  {/if}

  <!-- Step 3: Refining -->
  {#if step === "refining"}
    <div class="rounded-xl border border-border-main bg-surface p-8 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center">
        <svg class="h-8 w-8 animate-spin text-faint" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <h2 class="mt-4 text-lg font-semibold text-primary">
        Refining your voice profile...
      </h2>
      <p class="mt-1 text-sm text-secondary">
        Incorporating your calibration feedback and draft usage history to
        create an improved voice profile.
      </p>
    </div>
  {/if}

  <!-- Step 4: Done -->
  {#if step === "done"}
    <div class="rounded-xl border border-status-success-border bg-status-success-bg p-8 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
        <svg class="h-6 w-6 text-status-success-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 class="mt-4 text-lg font-semibold text-primary">
        Voice profile updated!
      </h2>
      <p class="mt-1 text-sm text-secondary">
        A new version has been created incorporating your calibration feedback.
        Your voice profile will continue to improve with each calibration cycle.
      </p>
      <div class="mt-6 flex justify-center gap-3">
        <a
          href="/personas/{data.persona.id}"
          class="rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-hover"
        >
          Back to Persona
        </a>
        <button
          type="button"
          onclick={() => {
            step = "generate";
            samples = [];
            ratings = new Map();
            topics = [...defaultTopics];
          }}
          class="rounded-lg border border-border-input px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-dim"
        >
          Calibrate Again
        </button>
      </div>
    </div>
  {/if}
</div>
