import { streamText, convertToModelMessages } from "ai";
import { getAIModel } from "$lib/server/ai";
import type { UIMessage } from "@ai-sdk/svelte";
import { getDb } from "$lib/server/db";
import { createQueueService } from "$lib/server/services/queue";
import { createPersonaService } from "$lib/server/services/persona";
import { createVoiceService } from "$lib/server/services/voice";
import { createChatService } from "$lib/server/services/chat";
import { buildChatSystemPrompt } from "$lib/server/chat-prompt";
import { getUserPreferredModel, calculateCost } from "$lib/server/models";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

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
  const userId = session.user.id;

  // Parse request body (DefaultChatTransport sends { id, messages, ...body })
  let body: { messages: UIMessage[]; personaId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, personaId: bodyPersonaId } = body;
  if (!messages || !Array.isArray(messages)) {
    return new Response("Missing messages array", { status: 400 });
  }

  // DB setup — per-request, not module scope
  const databaseUrl =
    platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const queueService = createQueueService(db);
  const personaService = createPersonaService(db);
  const voiceService = createVoiceService(db);
  const chatService = createChatService(db);

  // Load post
  const post = await queueService.getById(userId, params.id);
  if (!post) {
    return new Response("Post not found", { status: 404 });
  }

  // Track current status locally so onFinish sees the latest value
  let currentStatus = post.status;

  // Determine persona: body override > post's persona
  const personaId = bodyPersonaId ?? post.personaId;

  // Load persona, voice profile, and platform-specific override
  let personaName: string | null = null;
  let voiceProfile: {
    extractedProfile: unknown;
    manualEdits: unknown;
  } | null = null;
  let platformVoiceProfile: {
    extractedProfile: unknown;
    manualEdits: unknown;
    platform: string;
  } | null = null;

  if (personaId) {
    const persona = await personaService.getById(userId, personaId);
    if (persona) personaName = persona.name;

    // Load default voice profile
    const activeVersion = await voiceService.getActiveVersion(personaId);
    if (activeVersion) {
      voiceProfile = {
        extractedProfile: activeVersion.extractedProfile,
        manualEdits: activeVersion.manualEdits,
      };
    }

    // Check for platform-specific voice override
    if (post.platform) {
      const platformVersion = await voiceService.getActiveVersionForPlatform(
        personaId,
        post.platform,
      );
      // Only set platformVoiceProfile if it's different from the default
      if (platformVersion && platformVersion.platform) {
        platformVoiceProfile = {
          extractedProfile: platformVersion.extractedProfile,
          manualEdits: platformVersion.manualEdits,
          platform: platformVersion.platform,
        };
      }
    }
  }

  // Persist new user messages before streaming
  const existingIds = await chatService.getMessageIds(params.id);
  for (const msg of messages) {
    if (!existingIds.has(msg.id) && msg.role === "user") {
      await chatService.saveMessage(params.id, {
        id: msg.id,
        role: msg.role,
        parts: msg.parts,
      });
    }
  }

  // Status transition: new → in_progress
  if (currentStatus === "new") {
    await queueService.updateStatus(userId, params.id, "in_progress");
    currentStatus = "in_progress";
  }

  // Build system prompt
  const system = buildChatSystemPrompt({
    post: {
      url: post.url,
      platform: post.platform,
      postContent: post.postContent,
      postAuthor: post.postAuthor,
    },
    persona: personaName ? { name: personaName } : null,
    voiceProfile,
    platformVoiceProfile,
  });

  // Get API key
  const apiKey =
    platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "AI features are not available. Please configure your API key." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create AI model and stream
  const modelId = await getUserPreferredModel(db, userId);
  const model = getAIModel(apiKey, modelId);
  const modelMessages = await convertToModelMessages(messages);

  // Capture usage from streamText's onFinish (not available in toUIMessageStreamResponse's onFinish)
  let capturedUsage: { inputTokens: number; outputTokens: number } | null = null;

  const result = streamText({
    model,
    system,
    messages: modelMessages,
    maxOutputTokens: 2048,
    onFinish({ usage }) {
      capturedUsage = {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      };
    },
  });

  // Return streaming response with onFinish to persist AI response
  // generateMessageId ensures responseMessage.id is a real UUID (not "")
  return result.toUIMessageStreamResponse({
    generateMessageId: () => crypto.randomUUID(),
    async onFinish({ responseMessage }) {
      try {
        // Build metadata with usage info
        const metadata: Record<string, unknown> = {};
        if (capturedUsage) {
          metadata.inputTokens = capturedUsage.inputTokens;
          metadata.outputTokens = capturedUsage.outputTokens;
          metadata.model = modelId;
          metadata.costMicrocents = calculateCost(modelId, capturedUsage.inputTokens, capturedUsage.outputTokens);
        }

        // Persist the complete AI response with usage metadata
        await chatService.saveMessage(params.id, {
          id: responseMessage.id,
          role: responseMessage.role,
          parts: responseMessage.parts,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        });

        // Log to ai_usage_log for unified querying
        if (capturedUsage) {
          await chatService.logUsage({
            userId,
            postId: params.id,
            personaId: personaId ?? null,
            type: "chat",
            model: modelId,
            inputTokens: capturedUsage.inputTokens,
            outputTokens: capturedUsage.outputTokens,
            costMicrocents: calculateCost(modelId, capturedUsage.inputTokens, capturedUsage.outputTokens),
          });
        }

        // Check if response contains a draft → transition to draft_ready
        const hasDraft = responseMessage.parts.some(
          (part) =>
            part.type === "text" && part.text.includes("<draft>"),
        );

        if (hasDraft && currentStatus === "in_progress") {
          await queueService.updateStatus(userId, params.id, "draft_ready");
          currentStatus = "draft_ready";
        }

        // Update persona on post if caller specified a different one
        if (bodyPersonaId && bodyPersonaId !== post.personaId) {
          await queueService.updatePersona(userId, params.id, bodyPersonaId);
        }
      } catch (err) {
        console.error("Failed to persist AI response or update status:", err);
      }
    },
  });
};
