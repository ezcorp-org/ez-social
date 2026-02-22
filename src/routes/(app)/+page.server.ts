import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { addPostSchema } from "$lib/schemas/queue";
import { createPostFromUrl } from "$lib/server/services/queue";
import { getServices } from "$lib/server/services";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.id)
    return { posts: [], statusCounts: [], personas: [], activeStatus: "all", archivedCount: 0 };

  const { queue, persona, chat } = await getServices(event);
  const status = event.url.searchParams.get("status") ?? "all";

  const isArchived = status === "archived";
  const statusFilter = status === "all" || isArchived ? undefined : status;

  const [posts, statusCounts, personas, archivedCount] = await Promise.all([
    isArchived
      ? queue.listArchived(session.user.id)
      : queue.list(session.user.id, statusFilter),
    queue.getStatusCounts(session.user.id),
    persona.list(session.user.id),
    queue.getArchivedCount(session.user.id),
  ]);

  // Load costs for all visible posts
  const postIds = posts.map((p: { id: string }) => p.id);
  const postCosts = await chat.getPostCosts(postIds);

  // Calculate total cost across all posts
  const totalCostMicrocents = Object.values(postCosts).reduce((sum: number, c: number) => sum + c, 0);

  return { posts, statusCounts, personas, activeStatus: status, archivedCount, postCosts, totalCostMicrocents };
};

export const actions: Actions = {
  addPost: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const url = (formData.get("url") as string) ?? "";
    const personaId = (formData.get("personaId") as string) || null;

    const result = addPostSchema.safeParse({ url });
    if (!result.success) {
      return fail(400, { error: "Invalid URL" });
    }

    const { queue, persona, browser } = await getServices(event);

    const { post, scrapeResult } = await createPostFromUrl({
      queue,
      persona,
      browser,
      userId: session.user.id,
      url,
      personaId,
    });

    if (!scrapeResult) {
      return { success: true, needsContent: true, postId: post.id };
    }

    return { success: true, postId: post.id };
  },

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

  assignPersona: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const postId = formData.get("postId") as string;
    const personaId = (formData.get("personaId") as string) || null;

    if (!postId) return fail(400, { error: "Missing postId" });

    const { queue } = await getServices(event);
    await queue.updatePersona(session.user.id, postId, personaId);

    return { success: true };
  },

  archive: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const postId = formData.get("postId") as string;

    if (!postId) return fail(400, { error: "Missing postId" });

    const { queue } = await getServices(event);
    await queue.archive(session.user.id, postId);

    return { success: true };
  },

  unarchive: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const postId = formData.get("postId") as string;

    if (!postId) return fail(400, { error: "Missing postId" });

    const { queue } = await getServices(event);
    await queue.unarchive(session.user.id, postId);

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
