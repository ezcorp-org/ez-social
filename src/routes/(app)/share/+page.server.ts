import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { addPostSchema } from "$lib/schemas/queue";
import { createPostFromUrl } from "$lib/server/services/queue";
import { getServices } from "$lib/server/services";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.id) throw redirect(303, "/login");

  const url = event.url.searchParams.get("url");
  if (!url) throw redirect(303, "/");

  const result = addPostSchema.safeParse({ url });
  if (!result.success) throw redirect(303, "/");

  const { queue, persona, browser } = await getServices(event);

  try {
    const { post } = await createPostFromUrl({
      queue,
      persona,
      browser,
      userId: session.user.id,
      url,
    });
    throw redirect(303, `/queue/${post.id}?autoGenerate=true`);
  } catch (e) {
    // Re-throw redirects (SvelteKit uses throw for redirects)
    if (e && typeof e === "object" && "status" in e) throw e;
    throw redirect(303, "/?error=share_failed");
  }
};
