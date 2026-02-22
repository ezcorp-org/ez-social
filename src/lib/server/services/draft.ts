import { eq, asc, desc, type InferSelectModel } from "drizzle-orm";
import type { getDb } from "$lib/server/db";
import { draftEdits, draftFeedback } from "$lib/server/db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;
type DraftEdit = InferSelectModel<typeof draftEdits>;
type DraftFeedback = InferSelectModel<typeof draftFeedback>;

export function createDraftService(db: Db) {
  return {
    /** Save an inline edit (original vs edited text) for a specific message. */
    async saveEdit(data: {
      messageId: string;
      postId: string;
      originalText: string;
      editedText: string;
    }): Promise<DraftEdit> {
      const [edit] = (await db
        .insert(draftEdits)
        .values({
          messageId: data.messageId,
          postId: data.postId,
          originalText: data.originalText,
          editedText: data.editedText,
        })
        .returning()) as DraftEdit[];
      return edit;
    },

    /** Get all edits for a post, ordered by creation time. */
    async getEditsForPost(postId: string): Promise<DraftEdit[]> {
      return (await db
        .select()
        .from(draftEdits)
        .where(eq(draftEdits.postId, postId))
        .orderBy(asc(draftEdits.createdAt))) as DraftEdit[];
    },

    /** Get all edits for a specific message, ordered by creation time. */
    async getEditsForMessage(messageId: string): Promise<DraftEdit[]> {
      return (await db
        .select()
        .from(draftEdits)
        .where(eq(draftEdits.messageId, messageId))
        .orderBy(asc(draftEdits.createdAt))) as DraftEdit[];
    },

    /** Save draft feedback (accepted/edited) for voice learning. */
    async saveFeedback(data: {
      postId: string;
      messageId: string;
      personaId: string | null;
      action: "accepted" | "edited";
      draftText: string;
      editedText?: string;
    }): Promise<DraftFeedback> {
      const [feedback] = (await db
        .insert(draftFeedback)
        .values({
          postId: data.postId,
          messageId: data.messageId,
          personaId: data.personaId,
          action: data.action,
          draftText: data.draftText,
          editedText: data.editedText ?? null,
        })
        .returning()) as DraftFeedback[];
      return feedback;
    },

    /** Get all feedback for a persona, newest first (for voice re-extraction). */
    async getFeedbackForPersona(personaId: string): Promise<DraftFeedback[]> {
      return (await db
        .select()
        .from(draftFeedback)
        .where(eq(draftFeedback.personaId, personaId))
        .orderBy(desc(draftFeedback.createdAt))) as DraftFeedback[];
    },
  };
}
