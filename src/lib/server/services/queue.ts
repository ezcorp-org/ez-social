import {
  eq,
  and,
  isNull,
  desc,
  sql,
  type InferSelectModel,
} from "drizzle-orm";
import type { getDb } from "$lib/server/db";
import { postQueue, personas } from "$lib/server/db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;
type PostQueueItem = InferSelectModel<typeof postQueue>;

export type QueueService = ReturnType<typeof createQueueService>;
export type PersonaService = { getDefault(userId: string): Promise<{ id: string } | null> };

/** Shared logic for creating a post from a URL: scrape, detect platform, auto-assign persona. */
export async function createPostFromUrl(deps: {
  queue: QueueService;
  persona: PersonaService;
  browser: import("@cloudflare/puppeteer").BrowserWorker | undefined;
  userId: string;
  url: string;
  personaId?: string | null;
}) {
  const { queue, persona, browser, userId, url } = deps;
  const { detectPlatform } = await import("$lib/utils/platform");
  const { scrapeUrl } = await import("$lib/server/services/scraper");
  const platform = detectPlatform(url);

  let scrapeResult = await scrapeUrl(browser, url);
  if (!scrapeResult) {
    scrapeResult = await scrapeUrl(browser, url); // single retry
  }

  let personaId: string | null = deps.personaId ?? null;
  if (!personaId && platform) {
    const matched = await queue.findPersonaByPlatform(userId, platform);
    if (matched) personaId = matched.id;
  }
  if (!personaId) {
    const defaultPersona = await persona.getDefault(userId);
    if (defaultPersona) personaId = defaultPersona.id;
  }

  const post = await queue.addPost(userId, {
    url,
    platform,
    personaId,
    postContent: scrapeResult?.content ?? null,
    postAuthor: scrapeResult?.author ?? null,
  });

  return { post, scrapeResult };
}

export function createQueueService(db: Db) {
  return {
    /** Insert a new post into the queue. */
    async addPost(
      userId: string,
      data: {
        url: string;
        platform: string | null;
        personaId: string | null;
        postContent: string | null;
        postAuthor: string | null;
      },
    ): Promise<PostQueueItem> {
      const [post] = await db
        .insert(postQueue)
        .values({
          userId,
          url: data.url,
          platform: data.platform,
          personaId: data.personaId,
          postContent: data.postContent,
          postAuthor: data.postAuthor,
          status: "new",
        })
        .returning();

      return post;
    },

    /** List non-archived posts for a user, optionally filtered by status. */
    async list(
      userId: string,
      status?: string,
    ): Promise<PostQueueItem[]> {
      const conditions = [
        eq(postQueue.userId, userId),
        isNull(postQueue.archivedAt),
      ];

      if (status) {
        conditions.push(eq(postQueue.status, status));
      }

      return db
        .select()
        .from(postQueue)
        .where(and(...conditions))
        .orderBy(desc(postQueue.createdAt));
    },

    /** Get status counts for a user's non-archived posts. */
    async getStatusCounts(
      userId: string,
    ): Promise<{ status: string; count: number }[]> {
      return db
        .select({
          status: postQueue.status,
          count: sql<number>`count(*)::int`,
        })
        .from(postQueue)
        .where(
          and(eq(postQueue.userId, userId), isNull(postQueue.archivedAt)),
        )
        .groupBy(postQueue.status);
    },

    /** Get a single post by ID with ownership check. */
    async getById(
      userId: string,
      postId: string,
    ): Promise<PostQueueItem | null> {
      const [post] = await db
        .select()
        .from(postQueue)
        .where(and(eq(postQueue.id, postId), eq(postQueue.userId, userId)))
        .limit(1);

      return post ?? null;
    },

    /** Change the persona assigned to a post. */
    async updatePersona(
      userId: string,
      postId: string,
      personaId: string | null,
    ): Promise<PostQueueItem | null> {
      const [updated] = await db
        .update(postQueue)
        .set({ personaId, updatedAt: new Date() })
        .where(and(eq(postQueue.id, postId), eq(postQueue.userId, userId)))
        .returning();

      return updated ?? null;
    },

    /** Set post content manually (fallback when scraper fails). */
    async updateContent(
      userId: string,
      postId: string,
      content: string,
    ): Promise<PostQueueItem | null> {
      const [updated] = await db
        .update(postQueue)
        .set({ postContent: content, updatedAt: new Date() })
        .where(and(eq(postQueue.id, postId), eq(postQueue.userId, userId)))
        .returning();

      return updated ?? null;
    },

    /** Soft-delete by setting archivedAt timestamp. */
    async archive(
      userId: string,
      postId: string,
    ): Promise<boolean> {
      const [updated] = await db
        .update(postQueue)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(postQueue.id, postId), eq(postQueue.userId, userId)))
        .returning();

      return !!updated;
    },

    /** Restore by clearing archivedAt. */
    async unarchive(
      userId: string,
      postId: string,
    ): Promise<boolean> {
      const [updated] = await db
        .update(postQueue)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(and(eq(postQueue.id, postId), eq(postQueue.userId, userId)))
        .returning();

      return !!updated;
    },

    /** List archived posts for a user. */
    async listArchived(userId: string): Promise<PostQueueItem[]> {
      return db
        .select()
        .from(postQueue)
        .where(
          and(
            eq(postQueue.userId, userId),
            sql`${postQueue.archivedAt} IS NOT NULL`,
          ),
        )
        .orderBy(desc(postQueue.archivedAt));
    },

    /** Count archived posts for a user. */
    async getArchivedCount(userId: string): Promise<number> {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(postQueue)
        .where(
          and(
            eq(postQueue.userId, userId),
            sql`${postQueue.archivedAt} IS NOT NULL`,
          ),
        );
      return result?.count ?? 0;
    },

    /** Get recently added posts (for dashboard "recent activity"). */
    async getRecentlyAdded(
      userId: string,
      limit = 5,
    ): Promise<PostQueueItem[]> {
      return db
        .select()
        .from(postQueue)
        .where(
          and(eq(postQueue.userId, userId), isNull(postQueue.archivedAt)),
        )
        .orderBy(desc(postQueue.createdAt))
        .limit(limit);
    },

    /** Update the status of a post (e.g., new → in_progress → draft_ready). */
    async updateStatus(
      userId: string,
      postId: string,
      status: string,
    ): Promise<PostQueueItem | null> {
      const [updated] = await db
        .update(postQueue)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(postQueue.id, postId), eq(postQueue.userId, userId)))
        .returning();

      return updated ?? null;
    },

    /** Find a persona matching a platform for auto-assignment. Prefers the default persona. */
    async findPersonaByPlatform(
      userId: string,
      platform: string,
    ): Promise<InferSelectModel<typeof personas> | null> {
      const rows = await db
        .select()
        .from(personas)
        .where(
          and(
            eq(personas.userId, userId),
            eq(personas.platform, platform),
            isNull(personas.archivedAt),
          ),
        )
        .orderBy(desc(personas.isDefault))
        .limit(1);

      return rows[0] ?? null;
    },
  };
}
