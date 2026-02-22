import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { createPersonaSchema } from "$lib/schemas/persona";
import { getDb } from "$lib/server/db";
import { createPersonaService } from "$lib/server/services/persona";
import { env } from "$env/dynamic/private";

export const actions: Actions = {
  default: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const raw = Object.fromEntries(formData);
    const result = createPersonaSchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        errors: result.error.flatten().fieldErrors,
        name: raw.name as string,
        description: raw.description as string,
        platform: raw.platform as string,
      });
    }

    const databaseUrl =
      event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
    const db = await getDb(databaseUrl);
    const personaService = createPersonaService(db);

    const persona = await personaService.create(session.user.id, {
      name: result.data.name,
      description: result.data.description,
      platform: result.data.platform,
    });

    throw redirect(303, `/personas/${persona.id}`);
  },
};
