import { eq, and, isNull, desc, sql, type InferSelectModel } from "drizzle-orm";
import type { getDb } from "$lib/server/db";
import {
  personas,
  voiceProfileVersions,
} from "$lib/server/db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;
type Persona = InferSelectModel<typeof personas>;

export function createPersonaService(db: Db) {
  return {
    /** List all non-archived personas for a user, ordered by default first then most recently updated. */
    async list(userId: string) {
      // Fetch personas
      const personaRows: Persona[] = await db
        .select()
        .from(personas)
        .where(
          and(eq(personas.userId, userId), isNull(personas.archivedAt)),
        )
        .orderBy(desc(personas.isDefault), desc(personas.updatedAt));

      // Fetch active voice summaries for personas that have one
      const versionIds = personaRows
        .map((p) => p.activeVoiceVersionId)
        .filter((id): id is string => id !== null);

      let voiceSummaries = new Map<string, string>();
      if (versionIds.length > 0) {
        const versions = await db
          .select({
            id: voiceProfileVersions.id,
            extractedProfile: voiceProfileVersions.extractedProfile,
          })
          .from(voiceProfileVersions)
          .where(sql`${voiceProfileVersions.id} IN ${versionIds}`);

        for (const v of versions) {
          const profile = v.extractedProfile as Record<string, unknown> | null;
          if (profile?.summary) {
            voiceSummaries.set(v.id, profile.summary as string);
          }
        }
      }

      return personaRows.map((p): Persona & { voiceSummary: string | undefined } => ({
        ...p,
        voiceSummary: p.activeVoiceVersionId
          ? voiceSummaries.get(p.activeVoiceVersionId)
          : undefined,
      }));
    },

    /** Get a single persona by ID with ownership check. */
    async getById(userId: string, id: string) {
      const [persona] = await db
        .select()
        .from(personas)
        .where(and(eq(personas.id, id), eq(personas.userId, userId)))
        .limit(1);

      if (!persona) return null;

      // Get active voice profile version if set
      let voiceProfile: unknown = null;
      let voiceVersion: number | null = null;
      if (persona.activeVoiceVersionId) {
        const [version] = await db
          .select()
          .from(voiceProfileVersions)
          .where(eq(voiceProfileVersions.id, persona.activeVoiceVersionId))
          .limit(1);
        if (version) {
          voiceProfile = version.extractedProfile;
          voiceVersion = version.version;
        }
      }

      return { ...persona, voiceProfile, voiceVersion };
    },

    /** Create a new persona. Auto-sets as default if it's the user's first persona. */
    async create(
      userId: string,
      data: { name: string; description?: string; platform?: string },
    ) {
      // Check if user has any existing non-archived personas
      const existing = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(personas)
        .where(
          and(eq(personas.userId, userId), isNull(personas.archivedAt)),
        );

      const isFirst = (existing[0]?.count ?? 0) === 0;

      const [persona] = await db
        .insert(personas)
        .values({
          userId,
          name: data.name,
          description: data.description ?? null,
          platform: data.platform ?? null,
          isDefault: isFirst,
        })
        .returning();

      return persona;
    },

    /** Update persona fields with ownership check. */
    async update(
      userId: string,
      id: string,
      data: { name?: string; description?: string; platform?: string | null },
    ) {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.name !== undefined) updates.name = data.name;
      if (data.description !== undefined)
        updates.description = data.description || null;
      if (data.platform !== undefined)
        updates.platform = data.platform || null;

      const [updated] = await db
        .update(personas)
        .set(updates)
        .where(and(eq(personas.id, id), eq(personas.userId, userId)))
        .returning();

      return updated ?? null;
    },

    /** Soft-delete a persona. If archiving the default, promote another persona. */
    async archive(userId: string, id: string) {
      // Get the persona to check if it's default
      const [persona] = await db
        .select({ isDefault: personas.isDefault })
        .from(personas)
        .where(and(eq(personas.id, id), eq(personas.userId, userId)))
        .limit(1);

      if (!persona) return null;

      // Archive it
      await db
        .update(personas)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(personas.id, id), eq(personas.userId, userId)));

      // If it was the default, promote the most recently updated non-archived persona
      if (persona.isDefault) {
        const [next] = await db
          .select({ id: personas.id })
          .from(personas)
          .where(
            and(eq(personas.userId, userId), isNull(personas.archivedAt)),
          )
          .orderBy(desc(personas.updatedAt))
          .limit(1);

        if (next) {
          await db
            .update(personas)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(eq(personas.id, next.id));
        }
      }

      return true;
    },

    /** Get the user's default persona (non-archived, isDefault=true). */
    async getDefault(userId: string): Promise<Persona | null> {
      const [row] = await db
        .select()
        .from(personas)
        .where(
          and(
            eq(personas.userId, userId),
            eq(personas.isDefault, true),
            isNull(personas.archivedAt),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    /** Set a persona as the default, unsetting all others. */
    async setDefault(userId: string, id: string) {
      // Unset all defaults for this user
      await db
        .update(personas)
        .set({ isDefault: false })
        .where(
          and(eq(personas.userId, userId), eq(personas.isDefault, true)),
        );

      // Set the new default
      const [updated] = await db
        .update(personas)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(and(eq(personas.id, id), eq(personas.userId, userId)))
        .returning();

      return updated ?? null;
    },
  };
}
