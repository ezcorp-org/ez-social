import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { editPersonaSchema } from "$lib/schemas/persona";
import { getDb } from "$lib/server/db";
import { createPersonaService } from "$lib/server/services/persona";
import { createVoiceService } from "$lib/server/services/voice";
import { env } from "$env/dynamic/private";

async function getServices(event: {
  platform?: { env?: { DATABASE_URL?: string } };
}) {
  const databaseUrl =
    event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  return {
    persona: createPersonaService(db),
    voice: createVoiceService(db),
  };
}

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.id) throw redirect(303, "/login");

  const { persona: personaService, voice: voiceService } =
    await getServices(event);
  const persona = await personaService.getById(
    session.user.id,
    event.params.id,
  );

  if (!persona) throw redirect(303, "/personas");

  // Load voice profile data
  const activeVersion = await voiceService.getActiveVersion(event.params.id);
  const versions = await voiceService.listVersions(event.params.id);
  const samples = await voiceService.getSamples(event.params.id);

  // Load platform overrides
  const platformOverridesRaw = await voiceService.listPlatformOverrides(event.params.id);
  const platformOverrides = platformOverridesRaw.map((o) => ({
    platform: o.platform,
    versionId: o.version.id,
    version: o.version.version,
    createdAt: o.version.createdAt,
    sampleCount: o.version.sampleCount,
  }));

  // Calculate sample stats
  const sampleStats = {
    count: samples.length,
    platforms: [...new Set(samples.map((s) => s.platform).filter(Boolean))],
    totalWords: samples.reduce((sum, s) => sum + s.wordCount, 0),
  };

  return {
    persona,
    voiceProfile: activeVersion?.extractedProfile ?? null,
    voiceManualEdits: (activeVersion?.manualEdits as Record<string, unknown>) ?? null,
    activeVersionId: activeVersion?.id ?? null,
    versions,
    sampleStats,
    platformOverrides,
  };
};

export const actions: Actions = {
  update: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const raw = Object.fromEntries(formData);
    const result = editPersonaSchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        errors: result.error.flatten().fieldErrors,
        action: "update" as const,
      });
    }

    const { persona: personaService } = await getServices(event);
    await personaService.update(session.user.id, event.params.id, {
      name: result.data.name,
      description: result.data.description,
      platform: result.data.platform,
    });

    return { success: true, action: "update" as const };
  },

  archive: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const { persona: personaService } = await getServices(event);
    await personaService.archive(session.user.id, event.params.id);

    throw redirect(303, "/personas");
  },

  setDefault: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const { persona: personaService } = await getServices(event);
    await personaService.setDefault(session.user.id, event.params.id);

    return { success: true, action: "setDefault" as const };
  },

  setActiveVersion: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const versionId = formData.get("versionId") as string;
    if (!versionId) return fail(400, { error: "Missing versionId" });

    const { voice: voiceService } = await getServices(event);

    // Verify version belongs to this persona
    const version = await voiceService.getVersion(event.params.id, versionId);
    if (!version) return fail(404, { error: "Version not found" });

    await voiceService.setActiveVersion(event.params.id, versionId);

    return { success: true, action: "setActiveVersion" as const };
  },

  updateTraits: async (event) => {
    const session = await event.locals.auth();
    if (!session?.user?.id) return fail(401, { error: "Unauthorized" });

    const formData = await event.request.formData();
    const editsJson = formData.get("manualEdits") as string;
    if (!editsJson) return fail(400, { error: "Missing manualEdits" });

    let manualEdits: Record<string, unknown>;
    try {
      manualEdits = JSON.parse(editsJson);
    } catch {
      return fail(400, { error: "Invalid JSON for manualEdits" });
    }

    const { voice: voiceService } = await getServices(event);

    // Get active version for this persona
    const activeVersion = await voiceService.getActiveVersion(event.params.id);
    if (!activeVersion) return fail(404, { error: "No active version" });

    await voiceService.updateManualEdits(activeVersion.id, manualEdits);

    return { success: true, action: "updateTraits" as const };
  },
};
