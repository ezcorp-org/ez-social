import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "$lib/server/models";
import { getServices } from "$lib/server/services";
import { env } from "$env/dynamic/private";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user) throw redirect(303, "/login");

  const databaseUrl =
    event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);

  const { queue, persona } = await getServices(event);

  const [row, personas, posts] = await Promise.all([
    db
      .select({ preferredModel: users.preferredModel })
      .from(users)
      .where(eq(users.id, session.user.id!))
      .then((r: { preferredModel: string | null }[]) => r[0]),
    persona.list(session.user.id!),
    queue.list(session.user.id!),
  ]);

  return {
    session,
    preferredModel: row?.preferredModel ?? DEFAULT_MODEL,
    availableModels: AVAILABLE_MODELS,
    personas,
    latestPostId: posts[0]?.id ?? null,
  };
};
