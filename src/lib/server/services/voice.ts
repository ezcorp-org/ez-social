import { eq, and, desc, isNull, max, type InferSelectModel } from "drizzle-orm";
import type { getDb } from "$lib/server/db";
import {
  personas,
  writingSamples,
  voiceProfileVersions,
} from "$lib/server/db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;
type WritingSample = InferSelectModel<typeof writingSamples>;
type VoiceProfileVersion = InferSelectModel<typeof voiceProfileVersions>;

export function createVoiceService(db: Db) {
  return {
    /** Save a writing sample for a persona. */
    async saveSamples(
      personaId: string,
      content: string,
      platform: string,
    ): Promise<WritingSample> {
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      const [sample] = (await db
        .insert(writingSamples)
        .values({ personaId, content, platform, wordCount })
        .returning()) as WritingSample[];
      return sample;
    },

    /** Get all writing samples for a persona, newest first. */
    async getSamples(personaId: string): Promise<WritingSample[]> {
      return (await db
        .select()
        .from(writingSamples)
        .where(eq(writingSamples.personaId, personaId))
        .orderBy(desc(writingSamples.createdAt))) as WritingSample[];
    },

    /** Save a new voice profile version. When no platform specified, sets it as the active (default) version. */
    async saveVersion(
      personaId: string,
      extractedProfile: unknown,
      sampleStats: {
        sampleCount: number;
        samplePlatforms: string[];
        totalWordCount: number;
      },
      platform?: string,
    ): Promise<VoiceProfileVersion> {
      // Version numbering is per-platform: get max version for this personaId + platform combo
      const conditions = [eq(voiceProfileVersions.personaId, personaId)];
      if (platform) {
        conditions.push(eq(voiceProfileVersions.platform, platform));
      } else {
        conditions.push(isNull(voiceProfileVersions.platform));
      }

      const [maxResult] = await db
        .select({ maxVersion: max(voiceProfileVersions.version) })
        .from(voiceProfileVersions)
        .where(and(...conditions));

      const nextVersion = ((maxResult?.maxVersion as number | null) ?? 0) + 1;

      const [version] = (await db
        .insert(voiceProfileVersions)
        .values({
          personaId,
          version: nextVersion,
          extractedProfile,
          platform: platform ?? null,
          sampleCount: sampleStats.sampleCount,
          samplePlatforms: sampleStats.samplePlatforms,
          totalWordCount: sampleStats.totalWordCount,
        })
        .returning()) as VoiceProfileVersion[];

      // Only update persona.activeVoiceVersionId for the default (non-platform) voice
      if (!platform) {
        await db
          .update(personas)
          .set({ activeVoiceVersionId: version.id, updatedAt: new Date() })
          .where(eq(personas.id, personaId));
      }

      return version;
    },

    /** List all versions for a persona, newest first. */
    async listVersions(personaId: string) {
      return db
        .select({
          id: voiceProfileVersions.id,
          version: voiceProfileVersions.version,
          createdAt: voiceProfileVersions.createdAt,
          sampleCount: voiceProfileVersions.sampleCount,
          totalWordCount: voiceProfileVersions.totalWordCount,
        })
        .from(voiceProfileVersions)
        .where(eq(voiceProfileVersions.personaId, personaId))
        .orderBy(desc(voiceProfileVersions.version));
    },

    /** Get a single version with ownership check via persona. */
    async getVersion(
      personaId: string,
      versionId: string,
    ): Promise<VoiceProfileVersion | null> {
      const [version] = (await db
        .select()
        .from(voiceProfileVersions)
        .where(
          and(
            eq(voiceProfileVersions.id, versionId),
            eq(voiceProfileVersions.personaId, personaId),
          ),
        )
        .limit(1)) as VoiceProfileVersion[];
      return version ?? null;
    },

    /** Get the active version for a persona. */
    async getActiveVersion(
      personaId: string,
    ): Promise<VoiceProfileVersion | null> {
      // Get the persona's activeVoiceVersionId
      const [persona] = await db
        .select({ activeVoiceVersionId: personas.activeVoiceVersionId })
        .from(personas)
        .where(eq(personas.id, personaId))
        .limit(1);

      if (!persona?.activeVoiceVersionId) return null;

      const [version] = (await db
        .select()
        .from(voiceProfileVersions)
        .where(eq(voiceProfileVersions.id, persona.activeVoiceVersionId))
        .limit(1)) as VoiceProfileVersion[];

      return version ?? null;
    },

    /** Set the active voice profile version for a persona. */
    async setActiveVersion(personaId: string, versionId: string) {
      await db
        .update(personas)
        .set({ activeVoiceVersionId: versionId, updatedAt: new Date() })
        .where(eq(personas.id, personaId));
    },

    /** Save calibration ratings for a persona's active version (append to existing). */
    async saveCalibrationRatings(
      personaId: string,
      ratings: Array<{
        topic: string;
        reply: string;
        rating: "sounds_like_me" | "doesnt_sound_like_me";
      }>,
    ): Promise<void> {
      const activeVersion = await this.getActiveVersion(personaId);
      if (!activeVersion) return;

      const existing =
        (activeVersion.calibrationFeedback as Array<unknown>) ?? [];
      const updated = [...existing, ...ratings];

      await db
        .update(voiceProfileVersions)
        .set({ calibrationFeedback: updated })
        .where(eq(voiceProfileVersions.id, activeVersion.id));
    },

    /** Update manual edits on a specific version. */
    async updateManualEdits(
      versionId: string,
      manualEdits: Record<string, unknown>,
    ) {
      const [updated] = (await db
        .update(voiceProfileVersions)
        .set({ manualEdits })
        .where(eq(voiceProfileVersions.id, versionId))
        .returning()) as VoiceProfileVersion[];
      return updated ?? null;
    },

    /** Get the best voice version for a platform: platform-specific override if available, else default. */
    async getActiveVersionForPlatform(
      personaId: string,
      platform: string | null,
    ): Promise<VoiceProfileVersion | null> {
      // 1. If platform specified, look for a platform-specific version (latest by version number)
      if (platform) {
        const [platformVersion] = (await db
          .select()
          .from(voiceProfileVersions)
          .where(
            and(
              eq(voiceProfileVersions.personaId, personaId),
              eq(voiceProfileVersions.platform, platform),
            ),
          )
          .orderBy(desc(voiceProfileVersions.version))
          .limit(1)) as VoiceProfileVersion[];

        if (platformVersion) return platformVersion;
      }

      // 2. Fall back to the default (active) voice version
      return this.getActiveVersion(personaId);
    },

    /** List platform-specific overrides for a persona (latest version per platform). */
    async listPlatformOverrides(
      personaId: string,
    ): Promise<Array<{ platform: string; version: VoiceProfileVersion }>> {
      // Get all platform-specific versions (platform is not null), newest first
      const allPlatformVersions = (await db
        .select()
        .from(voiceProfileVersions)
        .where(
          and(
            eq(voiceProfileVersions.personaId, personaId),
            // platform IS NOT NULL — only platform-specific overrides
          ),
        )
        .orderBy(desc(voiceProfileVersions.version))) as VoiceProfileVersion[];

      // Filter to non-null platforms and group by platform, keeping latest
      const byPlatform = new Map<string, VoiceProfileVersion>();
      for (const v of allPlatformVersions) {
        if (v.platform && !byPlatform.has(v.platform)) {
          byPlatform.set(v.platform, v);
        }
      }

      return Array.from(byPlatform.entries()).map(([p, v]) => ({
        platform: p,
        version: v,
      }));
    },
  };
}
