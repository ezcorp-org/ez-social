import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getDb } from "$lib/server/db";
import { createPersonaService } from "$lib/server/services/persona";
import { createVoiceService } from "$lib/server/services/voice";
import { env } from "$env/dynamic/private";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.id) throw redirect(303, "/login");

  const databaseUrl =
    event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  const personaService = createPersonaService(db);
  const voiceService = createVoiceService(db);

  const persona = await personaService.getById(
    session.user.id,
    event.params.id,
  );
  if (!persona) throw redirect(303, "/personas");

  const activeVersion = await voiceService.getActiveVersion(event.params.id);
  if (!activeVersion?.extractedProfile) {
    // Cannot refine without an existing voice profile
    throw redirect(303, `/personas/${event.params.id}`);
  }

  return {
    persona: { id: persona.id, name: persona.name },
    currentProfile: activeVersion.extractedProfile,
  };
};
