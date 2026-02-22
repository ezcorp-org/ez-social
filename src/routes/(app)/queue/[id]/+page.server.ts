import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getDb } from "$lib/server/db";
import { createQueueService } from "$lib/server/services/queue";
import { createPersonaService } from "$lib/server/services/persona";
import { createVoiceService } from "$lib/server/services/voice";
import { createChatService } from "$lib/server/services/chat";
import { createDraftService } from "$lib/server/services/draft";
import { env } from "$env/dynamic/private";

async function getServices(event: {
  platform?: { env?: { DATABASE_URL?: string } };
}) {
  const databaseUrl =
    event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  return {
    queue: createQueueService(db),
    persona: createPersonaService(db),
    voice: createVoiceService(db),
    chat: createChatService(db),
    draft: createDraftService(db),
  };
}

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.id) error(401, "Unauthorized");

  const userId = session.user.id;
  const { queue, persona, voice, chat, draft } = await getServices(event);
  const post = await queue.getById(userId, event.params.id);

  if (!post) error(404, "Post not found");

  // Load persona info
  let postPersona: { id: string; name: string } | null = null;
  if (post.personaId) {
    const p = await persona.getById(userId, post.personaId);
    if (p) postPersona = { id: p.id, name: p.name };
  }

  // Load voice profile for the post's persona
  let voiceProfile: {
    extractedProfile: unknown;
    manualEdits: unknown;
  } | null = null;
  if (post.personaId) {
    const activeVersion = await voice.getActiveVersion(post.personaId);
    if (activeVersion) {
      voiceProfile = {
        extractedProfile: activeVersion.extractedProfile,
        manualEdits: activeVersion.manualEdits,
      };
    }
  }

  // Check for auto-generate redirect from QuickAdd
  const autoGenerate = event.url.searchParams.get("autoGenerate") === "true";

  // Load chat messages
  let chatMessages = await chat.getMessages(post.id);

  // Generate initial greeting if no messages exist (skip if auto-generating)
  if (chatMessages.length === 0 && !autoGenerate) {
    const authorPart = post.postAuthor ? `${post.postAuthor}'s` : "this";
    const personaPart = postPersona ? ` as ${postPersona.name}` : "";
    const greeting = `Ready to help you draft a reply to ${authorPart} post${personaPart}. What angle do you want to take?`;

    const greetingMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: greeting }],
    };

    await chat.saveMessage(post.id, greetingMessage);
    chatMessages = await chat.getMessages(post.id);
  }

  // Format messages as UIMessage-compatible objects
  const formattedMessages = chatMessages.map((msg) => ({
    id: msg.id,
    role: msg.role as "user" | "assistant" | "system",
    parts: msg.parts as Array<{ type: string; text: string }>,
    createdAt: msg.createdAt,
  }));

  // Load all non-archived personas for persona switcher
  const personas = await persona.list(userId);

  // Load draft edits for DraftBlocks
  const draftEdits = await draft.getEditsForPost(post.id);

  // Load usage data for cost display
  const usage = await chat.getPostUsage(post.id);

  return {
    post,
    persona: postPersona,
    chatMessages: formattedMessages,
    voiceProfile,
    personas,
    draftEdits,
    autoGenerate,
    autoPrompt: event.url.searchParams.get("prompt") ?? "",
    usage,
  };
};

export const actions: Actions = {
  updateContent: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const postId = formData.get("postId") as string;
    const content = formData.get("content") as string;

    if (!postId || !content) {
      return fail(400, { error: "Missing postId or content" });
    }

    const { queue } = await getServices(event);
    await queue.updateContent(session.user.id, postId, content);

    return { success: true };
  },

  updateStatus: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const postId = formData.get("postId") as string;
    const status = formData.get("status") as string;

    if (!postId || !status) return fail(400, { error: "Missing postId or status" });

    const validStatuses = ["new", "in_progress", "draft_ready", "complete"];
    if (!validStatuses.includes(status)) {
      return fail(400, { error: "Invalid status" });
    }

    const { queue } = await getServices(event);
    await queue.updateStatus(session.user.id, postId, status);

    return { success: true };
  },
};
