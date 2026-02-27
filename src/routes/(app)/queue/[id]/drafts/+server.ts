import { getDb } from "$lib/server/db";
import { createDraftService } from "$lib/server/services/draft";
import { createQueueService } from "$lib/server/services/queue";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({
  request,
  params,
  locals,
  platform,
}) => {
  // Auth check
  const session = await locals.auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // DB setup — per-request
  const databaseUrl =
    platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const draftService = createDraftService(db);
  const queueService = createQueueService(db);

  // Ownership check — verify user owns this post
  const post = await queueService.getById(session.user.id, params.id!);
  if (!post) {
    return new Response("Not found", { status: 404 });
  }

  const type = body.type as string | undefined;

  // ─── Feedback-only tracking (e.g. copy/accept) ─────────────────
  if (type === "feedback") {
    const { messageId, personaId, action, draftText, editedText } = body as {
      messageId: string;
      personaId: string | null;
      action: string;
      draftText: string;
      editedText?: string;
    };

    if (!messageId || !action || !draftText) {
      return new Response("Missing required fields: messageId, action, draftText", {
        status: 400,
      });
    }

    if (action !== "accepted" && action !== "edited") {
      return new Response("action must be 'accepted' or 'edited'", {
        status: 400,
      });
    }

    try {
      await draftService.saveFeedback({
        postId: params.id!,
        messageId,
        personaId: personaId ?? null,
        action,
        draftText,
        editedText,
      });

      // Mark post as complete when draft is accepted (copied)
      if (action === "accepted") {
        queueService
          .updateStatus(session.user.id, params.id!, "complete")
          .catch((err) => console.error("Failed to update post status:", err));
      }

      return Response.json({ success: true }, { status: 201 });
    } catch (err) {
      console.error("Failed to save draft feedback:", err);
      return new Response("Failed to save draft feedback", { status: 500 });
    }
  }

  // ─── Draft edit (existing flow + feedback tracking) ────────────
  const { messageId, originalText, editedText, personaId } = body as {
    messageId: string;
    originalText: string;
    editedText: string;
    personaId?: string | null;
  };

  // Validate required fields
  if (!messageId || !originalText || !editedText) {
    return new Response("Missing required fields: messageId, originalText, editedText", {
      status: 400,
    });
  }

  // Validate edit differs from original
  if (originalText === editedText) {
    return new Response("editedText must differ from originalText", {
      status: 400,
    });
  }

  try {
    const edit = await draftService.saveEdit({
      messageId,
      postId: params.id!,
      originalText,
      editedText,
    });

    // Also track as 'edited' feedback for voice learning (fire-and-forget)
    draftService
      .saveFeedback({
        postId: params.id!,
        messageId,
        personaId: personaId ?? null,
        action: "edited",
        draftText: originalText,
        editedText,
      })
      .catch((err) => console.error("Failed to save edit feedback:", err));

    return Response.json({ success: true, edit }, { status: 201 });
  } catch (err) {
    console.error("Failed to save draft edit:", err);
    return new Response("Failed to save draft edit", { status: 500 });
  }
};
