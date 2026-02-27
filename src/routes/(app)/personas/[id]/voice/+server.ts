import { streamText, Output } from "ai";
import { getAIModel } from "$lib/server/ai";
import { voiceProfileSchema } from "$lib/schemas/voice-profile";
import { getDb } from "$lib/server/db";
import { createVoiceService } from "$lib/server/services/voice";
import { createChatService } from "$lib/server/services/chat";
import { createDraftService } from "$lib/server/services/draft";
import { getUserPreferredModel, calculateCost } from "$lib/server/models";
import { env } from "$env/dynamic/private";
import { sanitizePromptInput, wrapUserContent } from "$lib/server/prompt-safety";
import { createPersonaService } from "$lib/server/services/persona";
import type { RequestHandler } from "./$types";

const ALLOWED_PLATFORMS = [
  "twitter",
  "linkedin",
  "blog",
  "reddit",
  "email",
  "other",
];

const EXTRACTION_SYSTEM_PROMPT = `You are an expert writing voice analyst. Your job is to extract a deep, structured voice profile from writing samples using 4-dimension pattern analysis.

## Analysis Process

Follow these steps in order:

### Step 1: Classify Samples by Content Type
Categorize each sample as one of: original take, reply, quote/retweet, thread/long-form, question, announcement, or other. Note which types are present and absent.

### Step 2: Extract Patterns Across 4 Dimensions
Analyze each dimension from deepest to surface:

**Structure** (highest weight): Sentence length distribution, paragraph formatting, use of whitespace/line breaks, opening and closing patterns, list vs prose preference, how they handle transitions.

**Grammar** (second weight): Capitalization habits, punctuation patterns (em-dashes, ellipses, exclamation marks), contraction usage, emoji/hashtag patterns, comma splices or intentional fragments.

**Vocabulary** (third weight): Distinctive word choices, slang vs formal language, intensifiers and hedges, jargon and technical terms, filler words, catchphrases or repeated phrases.

**Rhetoric** (lowest weight): Confession/vulnerability patterns, argument frameworks (analogy, data, authority, emotion), question usage, humor style, how they establish credibility, how they handle disagreement.

### Step 3: Score Cross-Context Consistency
For each pattern, assign a signal tier:
- **Embedded**: Present in 4+ content types OR 30%+ prevalence within 3+ types. These are core voice DNA.
- **Consistent**: Present in 3 content types OR 30%+ prevalence within 2 types with 3+ occurrences.
- **Contextual**: Present in 1-2 content types with 2+ occurrences. These are situational patterns.

**Scarcity rules**: If fewer than 3 content types exist, relax thresholds — patterns appearing in all available types qualify as Embedded. For very small datasets (< 5 samples), focus on the strongest patterns and note lower confidence.

### Step 4: Generate Voice DNA
Select up to 5 headline patterns from Embedded-tier findings, weighted by dimension priority (structure > grammar > vocabulary > rhetoric). Each should be a concise, specific statement about the writer's voice.

### Step 5: Identify Content Modes
For each content type present, note the dominant patterns, any distinctive shifts from the baseline voice, and select a representative quote.

### Step 6: Flag Inconsistencies
Note where voice breaks or contradicts itself across contexts. Distinguish intentional code-switching (platform-appropriate shifts) from genuine inconsistencies.

### Step 7: Generate Recommendations
- **Lean into**: Patterns that make the voice distinctive and should be amplified
- **Watch out for**: Patterns that could become tics or weaken the voice
- **Develop**: Underdeveloped areas that could strengthen the voice

## Output Rules
- Be specific and concrete — cite actual patterns, phrases, and tendencies from the samples
- Do not be generic or vague. "Uses casual tone" is too vague. "Opens 60% of takes with a rhetorical question, then pivots with an em-dash" is specific.
- Every pattern must include evidence from the actual samples
- The profile should capture what makes this writer's voice UNIQUE, not what's common to all writers`;

function getSampleStats(samples: Array<{ platform: string | null; wordCount: number }>) {
  return {
    sampleCount: samples.length,
    samplePlatforms: [
      ...new Set(samples.map((s) => s.platform).filter(Boolean)),
    ] as string[],
    totalWordCount: samples.reduce((sum, s) => sum + s.wordCount, 0),
  };
}

export const POST: RequestHandler = async ({
  request,
  params,
  locals,
  platform,
}) => {
  // Auth check — layout guards don't apply to +server.ts
  const session = await locals.auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse & validate input
  let body: {
    samples?: string;
    platform?: string;
    platformFilter?: string;
    recalibrate?: boolean;
    userPrompt?: string;
    preview?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { platformFilter, recalibrate, userPrompt, preview } = body;

  // Skip new sample validation for recalibrate, platformFilter-only, and userPrompt modes
  // (all re-extract from existing stored samples)
  const skipNewSample = recalibrate || platformFilter || userPrompt;

  if (!skipNewSample) {
    const { samples, platform: samplePlatform } = body;

    if (!samples || typeof samples !== "string" || samples.length < 100) {
      return new Response("Writing samples must be at least 100 characters", {
        status: 400,
      });
    }

    if (!samplePlatform || !ALLOWED_PLATFORMS.includes(samplePlatform)) {
      return new Response(
        `Platform must be one of: ${ALLOWED_PLATFORMS.join(", ")}`,
        { status: 400 },
      );
    }
  }

  // Optional: platformFilter triggers a platform-specific voice override extraction
  if (platformFilter && !ALLOWED_PLATFORMS.includes(platformFilter)) {
    return new Response(
      `platformFilter must be one of: ${ALLOWED_PLATFORMS.join(", ")}`,
      { status: 400 },
    );
  }

  // Get API key (same pattern as DATABASE_URL)
  const apiKey =
    platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "AI features are not available. Please configure your API key." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  // DB setup — per-request, not module scope
  const databaseUrl =
    platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const voiceService = createVoiceService(db);
  const chatService = createChatService(db);
  const draftService = createDraftService(db);

  // Ownership check — verify user owns this persona
  const personaService = createPersonaService(db);
  const persona = await personaService.getById(session.user.id, params.id);
  if (!persona) {
    return new Response("Not found", { status: 404 });
  }

  // Save the new writing sample (only when providing new sample text)
  if (!skipNewSample && body.samples && body.platform) {
    await voiceService.saveSamples(params.id, body.samples, body.platform);
  }

  // Get samples — filter by platform if creating a platform-specific override
  const allSamples = await voiceService.getSamples(params.id);
  const samplesToUse = platformFilter
    ? allSamples.filter((s) => s.platform === platformFilter)
    : allSamples;

  if (samplesToUse.length === 0) {
    return new Response(
      `No writing samples found${platformFilter ? ` for platform "${platformFilter}"` : ""}`,
      { status: 400 },
    );
  }

  // Format samples for the AI prompt
  const formattedSamples = samplesToUse
    .map(
      (s, i) =>
        `--- Sample ${i + 1} (${s.platform}, ${s.wordCount} words) ---\n${s.content}`,
    )
    .join("\n\n");

  // Build feedback context sections for cumulative improvement
  const feedbackSections: string[] = [];

  // Calibration ratings from active voice version
  const activeVersion = await voiceService.getActiveVersion(params.id);
  if (activeVersion?.calibrationFeedback) {
    const ratings = activeVersion.calibrationFeedback as Array<{
      topic: string;
      reply: string;
      rating: string;
    }>;
    if (ratings.length > 0) {
      const liked = ratings.filter((r) => r.rating === "sounds_like_me");
      const disliked = ratings.filter(
        (r) => r.rating === "doesnt_sound_like_me",
      );

      let section =
        "## Calibration Feedback\nThe user has rated sample outputs generated from the current voice profile.";
      if (liked.length > 0) {
        section += `\n\nReplies they LIKED (these match their voice well):\n${liked.map((r) => `- Topic: "${r.topic}" → Reply: "${r.reply}"`).join("\n")}`;
      }
      if (disliked.length > 0) {
        section += `\n\nReplies they DIDN'T LIKE (these don't sound like them):\n${disliked.map((r) => `- Topic: "${r.topic}" → Reply: "${r.reply}"`).join("\n")}`;
      }
      section +=
        "\n\nAdjust the voice profile to better match their preferences based on this feedback.";
      feedbackSections.push(section);
    }
  }

  // Draft usage feedback (implicit signal from draft interactions)
  const draftFeedback = await draftService.getFeedbackForPersona(params.id);
  if (draftFeedback.length > 0) {
    const accepted = draftFeedback.filter((f) => f.action === "accepted");
    const edited = draftFeedback.filter((f) => f.action === "edited");

    let section =
      "## Draft Usage Feedback\nThe user has interacted with AI-generated drafts using this voice.";
    if (accepted.length > 0) {
      const recent = accepted.slice(0, 10);
      section += `\n\nAccepted drafts (user liked these as-is):\n${recent.map((f) => `- "${f.draftText}"`).join("\n")}`;
    }
    if (edited.length > 0) {
      const recent = edited.slice(0, 10);
      section += `\n\nEdited drafts (user changed these — pay attention to what they changed):\n${recent.map((f) => `- Original: "${f.draftText}" → Edited: "${f.editedText}"`).join("\n")}`;
    }
    section +=
      "\n\nUse this feedback to refine the voice profile — lean toward patterns in accepted drafts and away from patterns in pre-edit originals.";
    feedbackSections.push(section);
  }

  // User refinement prompt (free-form instructions for voice profile update)
  if (userPrompt && userPrompt.trim()) {
    const sanitized = sanitizePromptInput(userPrompt, 2000);
    feedbackSections.push(
      `## User Refinement Instructions\n${wrapUserContent("refinement instructions", sanitized)}\n\nCarefully incorporate these instructions into the re-extracted voice profile. Adjust patterns, recommendations, and voice DNA to reflect what the user is asking for.`,
    );
  }

  const feedbackContext =
    feedbackSections.length > 0 ? `\n\n${feedbackSections.join("\n\n")}` : "";

  // Create AI model per-request
  const modelId = await getUserPreferredModel(db, session.user.id);
  const model = getAIModel(apiKey, modelId);

  // Stream the voice extraction
  const platformHint = platformFilter
    ? `\nThis voice profile is specifically for ${platformFilter} writing style. Focus on patterns unique to how this writer communicates on ${platformFilter}.`
    : "";

  const result = streamText({
    model,
    output: Output.object({ schema: voiceProfileSchema }),
    system: `${EXTRACTION_SYSTEM_PROMPT}${platformHint}${feedbackContext}`,
    prompt: `Analyze these writing samples and extract a structured voice profile:\n\n${formattedSamples}`,
    onFinish: async ({ text, usage }) => {
      // Log usage to ai_usage_log
      try {
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        await chatService.logUsage({
          userId: session.user!.id!,
          personaId: params.id,
          type: "voice_extraction",
          model: modelId,
          inputTokens,
          outputTokens,
          costMicrocents: calculateCost(modelId, inputTokens, outputTokens),
        });
      } catch (err) {
        console.error("Failed to log voice extraction usage:", err);
      }

      // Preview mode: stream the profile but don't persist
      if (preview) return;

      // Parse the completed JSON output from the streamed text
      try {
        const parsed = voiceProfileSchema.parse(JSON.parse(text));

        await voiceService.saveVersion(
          params.id,
          parsed,
          getSampleStats(samplesToUse),
          platformFilter ?? undefined,
        );
      } catch {
        // If parsing fails, the extraction was incomplete — don't save
        console.error("Voice extraction completed but output parsing failed");
      }
    },
  });

  return result.toTextStreamResponse();
};

export const PUT: RequestHandler = async ({
  request,
  params,
  locals,
  platform,
}) => {
  const session = await locals.auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { profile: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Validate the profile against the schema
  const parsed = voiceProfileSchema.safeParse(body.profile);
  if (!parsed.success) {
    return new Response("Invalid voice profile", { status: 400 });
  }

  // DB setup
  const databaseUrl =
    platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const voiceService = createVoiceService(db);

  // Ownership check — verify user owns this persona
  const personaService = createPersonaService(db);
  const persona = await personaService.getById(session.user.id, params.id);
  if (!persona) {
    return new Response("Not found", { status: 404 });
  }

  // Get sample stats from existing samples (same as POST uses)
  const samples = await voiceService.getSamples(params.id);

  await voiceService.saveVersion(
    params.id,
    parsed.data,
    getSampleStats(samples),
  );

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
