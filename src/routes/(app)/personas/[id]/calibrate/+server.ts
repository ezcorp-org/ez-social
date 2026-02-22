import { streamText, Output } from "ai";
import { getAIModel } from "$lib/server/ai";
import { z } from "zod";
import { getDb } from "$lib/server/db";
import { createVoiceService } from "$lib/server/services/voice";
import { createChatService } from "$lib/server/services/chat";
import { getUserPreferredModel, calculateCost } from "$lib/server/models";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";
import type { VoiceProfile, VoicePattern } from "$lib/schemas/voice-profile";

const sampleResponseSchema = z.array(
  z.object({ topic: z.string(), reply: z.string() }),
);

/** Deep-merge two objects, with `overrides` values taking precedence. */
function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides)) {
    const baseVal = base[key];
    const overVal = overrides[key];
    if (
      baseVal &&
      overVal &&
      typeof baseVal === "object" &&
      typeof overVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else {
      result[key] = overVal;
    }
  }
  return result;
}

const SIGNAL_LABEL: Record<string, string> = {
  embedded: "CORE",
  consistent: "STRONG",
  contextual: "SITUATIONAL",
};

/** Format dimension patterns for the calibration prompt. */
function formatDimensionForPrompt(name: string, patterns: VoicePattern[]): string {
  if (!patterns || patterns.length === 0) return "";
  const lines = patterns.map(
    (p) => `- [${SIGNAL_LABEL[p.signal] ?? p.signal}] ${p.pattern}`,
  );
  return `**${name}**: ${lines.join(", ")}`;
}

/** Format a voice profile (new or legacy) into a readable prompt section. */
function formatVoiceForPrompt(merged: Record<string, unknown>): string {
  // New schema with voiceDNA + dimensions
  if ("voiceDNA" in merged && "dimensions" in merged) {
    const profile = merged as VoiceProfile;
    const parts: string[] = [];

    if (profile.voiceDNA?.length) {
      parts.push(`Voice DNA: ${profile.voiceDNA.join("; ")}`);
    }

    if (profile.dimensions) {
      const dims = [
        formatDimensionForPrompt("Structure", profile.dimensions.structure),
        formatDimensionForPrompt("Grammar", profile.dimensions.grammar),
        formatDimensionForPrompt("Vocabulary", profile.dimensions.vocabulary),
        formatDimensionForPrompt("Rhetoric", profile.dimensions.rhetoric),
      ].filter(Boolean);
      if (dims.length) parts.push(dims.join("\n"));
    }

    if (profile.recommendations) {
      if (profile.recommendations.leanInto?.length) {
        parts.push(`Lean into: ${profile.recommendations.leanInto.join("; ")}`);
      }
      if (profile.recommendations.watchOutFor?.length) {
        parts.push(`Watch out for: ${profile.recommendations.watchOutFor.join("; ")}`);
      }
    }

    return parts.join("\n\n");
  }

  // Legacy flat schema — dump as JSON
  return JSON.stringify(merged, null, 2);
}

export const POST: RequestHandler = async ({
  request,
  params,
  locals,
  platform,
}) => {
  const session = await locals.auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { topics: string[] };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (
    !body.topics ||
    !Array.isArray(body.topics) ||
    body.topics.length === 0
  ) {
    return new Response("topics must be a non-empty array of strings", {
      status: 400,
    });
  }

  const apiKey =
    platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "AI features are not available. Please configure your API key." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const databaseUrl =
    platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const voiceService = createVoiceService(db);
  const chatService = createChatService(db);

  const activeVersion = await voiceService.getActiveVersion(params.id);
  if (!activeVersion) {
    return new Response("No voice profile — extract one first", {
      status: 400,
    });
  }

  // Merge extractedProfile + manualEdits
  const extracted =
    (activeVersion.extractedProfile as Record<string, unknown>) ?? {};
  const edits =
    (activeVersion.manualEdits as Record<string, unknown>) ?? null;
  const merged = edits ? deepMerge(extracted, edits) : extracted;

  const modelId = await getUserPreferredModel(db, session.user.id);
  const model = getAIModel(apiKey, modelId);

  const voicePrompt = formatVoiceForPrompt(merged);

  const result = streamText({
    model,
    output: Output.object({ schema: sampleResponseSchema }),
    system: `You are generating sample social media replies in a specific voice. Generate exactly ${body.topics.length} short replies (1-3 sentences each) to the given topics, matching the voice profile below. Return as a JSON array of objects with "topic" and "reply" fields.

Each reply MUST:
- Sound like a real person, not a brand
- Add value (a specific insight, question, or angle) — never just agree
- Stay within 1-3 sentences

## Voice Profile
${voicePrompt}`,
    prompt: `Generate sample replies for these topics:\n${body.topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    onFinish: async ({ usage }) => {
      try {
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        await chatService.logUsage({
          userId: session.user!.id!,
          personaId: params.id,
          type: "calibration",
          model: modelId,
          inputTokens,
          outputTokens,
          costMicrocents: calculateCost(modelId, inputTokens, outputTokens),
        });
      } catch (err) {
        console.error("Failed to log calibration usage:", err);
      }
    },
  });

  return result.toTextStreamResponse();
};

/** PUT: Save calibration ratings */
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

  let body: {
    ratings: Array<{
      topic: string;
      reply: string;
      rating: "sounds_like_me" | "doesnt_sound_like_me";
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.ratings || !Array.isArray(body.ratings) || body.ratings.length === 0) {
    return new Response("ratings must be a non-empty array", { status: 400 });
  }

  const databaseUrl =
    platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const voiceService = createVoiceService(db);

  await voiceService.saveCalibrationRatings(params.id, body.ratings);

  return new Response("OK", { status: 200 });
};
