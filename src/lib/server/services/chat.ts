import { eq, asc, sql, type InferSelectModel } from "drizzle-orm";
import type { getDb } from "$lib/server/db";
import { chatMessages, aiUsageLog } from "$lib/server/db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;
type ChatMessage = InferSelectModel<typeof chatMessages>;

export function createChatService(db: Db) {
  return {
    /** Get all chat messages for a post, ordered by creation time. */
    async getMessages(postId: string): Promise<ChatMessage[]> {
      return (await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.postId, postId))
        .orderBy(asc(chatMessages.createdAt))) as ChatMessage[];
    },

    /** Save a single chat message. Uses onConflictDoNothing for idempotent saves. */
    async saveMessage(
      postId: string,
      message: {
        id: string;
        role: string;
        parts: unknown;
        metadata?: unknown;
      },
    ): Promise<void> {
      await db
        .insert(chatMessages)
        .values({
          id: message.id,
          postId,
          role: message.role,
          parts: message.parts,
          metadata: message.metadata ?? null,
        })
        .onConflictDoNothing();
    },

    /** Get the set of existing message IDs for a post (for diffing new vs saved). */
    async getMessageIds(postId: string): Promise<Set<string>> {
      const rows = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(eq(chatMessages.postId, postId));

      return new Set(rows.map((r: { id: string }) => r.id));
    },

    /** Get aggregated token usage and cost for a post from ai_usage_log. */
    async getPostUsage(postId: string): Promise<{
      inputTokens: number;
      outputTokens: number;
      totalCostMicrocents: number;
    }> {
      const rows = await db
        .select({
          inputTokens: sql<number>`coalesce(sum(${aiUsageLog.inputTokens}), 0)`,
          outputTokens: sql<number>`coalesce(sum(${aiUsageLog.outputTokens}), 0)`,
          totalCostMicrocents: sql<number>`coalesce(sum(${aiUsageLog.costMicrocents}), 0)`,
        })
        .from(aiUsageLog)
        .where(eq(aiUsageLog.postId, postId));

      const row = (rows as { inputTokens: number; outputTokens: number; totalCostMicrocents: number }[])[0];
      return {
        inputTokens: Number(row?.inputTokens ?? 0),
        outputTokens: Number(row?.outputTokens ?? 0),
        totalCostMicrocents: Number(row?.totalCostMicrocents ?? 0),
      };
    },

    /** Get costs for multiple posts in a single query. */
    async getPostCosts(postIds: string[]): Promise<Record<string, number>> {
      if (postIds.length === 0) return {};

      const rows = await db
        .select({
          postId: aiUsageLog.postId,
          totalCostMicrocents: sql<number>`coalesce(sum(${aiUsageLog.costMicrocents}), 0)`,
        })
        .from(aiUsageLog)
        .where(sql`${aiUsageLog.postId} in ${postIds}`)
        .groupBy(aiUsageLog.postId);

      return Object.fromEntries(
        (rows as { postId: string | null; totalCostMicrocents: number }[])
          .filter((r) => r.postId !== null)
          .map((r) => [r.postId!, Number(r.totalCostMicrocents)]),
      );
    },

    /** Log a usage entry to the ai_usage_log table. */
    async logUsage(entry: {
      userId: string;
      postId?: string | null;
      personaId?: string | null;
      type: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      costMicrocents: number;
    }): Promise<void> {
      await db.insert(aiUsageLog).values({
        userId: entry.userId,
        postId: entry.postId ?? null,
        personaId: entry.personaId ?? null,
        type: entry.type,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costMicrocents: entry.costMicrocents,
      });
    },
  };
}
