import type { PageServerLoad } from "./$types";
import { getDb } from "$lib/server/db";
import { createPersonaService } from "$lib/server/services/persona";
import { env } from "$env/dynamic/private";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.id) return { personas: [] };

  const databaseUrl =
    event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const personaService = createPersonaService(db);

  const personas = await personaService.list(session.user.id);
  return { personas };
};
