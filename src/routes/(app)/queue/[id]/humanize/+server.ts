import { generateText } from "ai";
import { getAIModel } from "$lib/server/ai";
import { getDb } from "$lib/server/db";
import { createQueueService } from "$lib/server/services/queue";
import { createPersonaService } from "$lib/server/services/persona";
import { createVoiceService } from "$lib/server/services/voice";
import { createDraftService } from "$lib/server/services/draft";
import { createChatService } from "$lib/server/services/chat";
import { buildHumanizeSystemPrompt } from "$lib/server/chat-prompt";
import { getUserPreferredModel, calculateCost } from "$lib/server/models";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "@sveltejs/kit";

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
  const userId = session.user.id;

  let body: { messageId: string; draftText: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messageId, draftText } = body;
  if (!messageId || !draftText) {
    return new Response("Missing required fields: messageId, draftText", {
      status: 400,
    });
  }

  const databaseUrl =
    platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const queueService = createQueueService(db);
  const personaService = createPersonaService(db);
  const voiceService = createVoiceService(db);
  const draftService = createDraftService(db);
  const chatService = createChatService(db);

  // Ownership check
  const post = await queueService.getById(userId, params.id!);
  if (!post) {
    return new Response("Not found", { status: 404 });
  }

  // Load persona + voice profile (same pattern as chat endpoint)
  let personaName: string | null = null;
  let voiceProfile: { extractedProfile: unknown; manualEdits: unknown } | null = null;
  let platformVoiceProfile: { extractedProfile: unknown; manualEdits: unknown; platform: string } | null = null;

  if (post.personaId) {
    const persona = await personaService.getById(userId, post.personaId);
    if (persona) personaName = persona.name;

    const activeVersion = await voiceService.getActiveVersion(post.personaId);
    if (activeVersion) {
      voiceProfile = {
        extractedProfile: activeVersion.extractedProfile,
        manualEdits: activeVersion.manualEdits,
      };
    }

    if (post.platform) {
      const platformVersion = await voiceService.getActiveVersionForPlatform(
        post.personaId,
        post.platform,
      );
      if (platformVersion && platformVersion.platform) {
        platformVoiceProfile = {
          extractedProfile: platformVersion.extractedProfile,
          manualEdits: platformVersion.manualEdits,
          platform: platformVersion.platform,
        };
      }
    }
  }

  const apiKey =
    platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "AI features are not available. Please configure your API key." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const modelId = await getUserPreferredModel(db, userId);
  const model = getAIModel(apiKey, modelId);

  const systemPrompt = buildHumanizeSystemPrompt({
    platform: post.platform,
    personaName,
    voiceProfile,
    platformVoiceProfile,
  });

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: draftText,
      maxOutputTokens: 2048,
    });

    const humanizedText = result.text;

    // Persist as a draft edit so it survives page reloads
    await draftService.saveEdit({
      messageId,
      postId: params.id!,
      originalText: draftText,
      editedText: humanizedText,
    });

    // Log usage
    if (result.usage) {
      chatService
        .logUsage({
          userId,
          postId: params.id!,
          personaId: post.personaId ?? null,
          type: "humanize",
          model: modelId,
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          costMicrocents: calculateCost(
            modelId,
            result.usage.inputTokens ?? 0,
            result.usage.outputTokens ?? 0,
          ),
        })
        .catch((err) => console.error("Failed to log humanize usage:", err));
    }

    return Response.json({ humanizedText });
  } catch (err) {
    console.error("Humanize failed:", err);
    return new Response("Humanize failed", { status: 500 });
  }
};
