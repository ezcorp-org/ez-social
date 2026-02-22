import { eq } from "drizzle-orm";
import { users } from "./db/schema";

export const AVAILABLE_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

export const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-sonnet-4-20250514": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-opus-4-20250514": { inputPerMTok: 15, outputPerMTok: 75 },
};

/** Calculate cost in microcents (1/10000 of a cent) for precision. */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) return 0;
  // Cost in dollars: (tokens / 1M) * $/MTok
  // Convert to microcents: dollars * 100 (cents) * 10000 (microcents)
  const dollars = (inputTokens / 1_000_000) * pricing.inputPerMTok + (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return Math.round(dollars * 100 * 10000);
}

export const DEFAULT_MODEL: ModelId = "claude-sonnet-4-20250514";

const validModelIds = new Set<string>(AVAILABLE_MODELS.map((m) => m.id));

/** Returns preferred if it's a valid model ID, otherwise DEFAULT_MODEL. */
export function resolveModel(preferred: string | null): ModelId {
  return preferred && validModelIds.has(preferred)
    ? (preferred as ModelId)
    : DEFAULT_MODEL;
}

/** Fetch the user's preferred model from DB, resolving to default if unset. */
export async function getUserPreferredModel(
  db: { select: Function },
  userId: string,
): Promise<ModelId> {
  const row = await (db as any)
    .select({ preferredModel: users.preferredModel })
    .from(users)
    .where(eq(users.id, userId))
    .then((r: { preferredModel: string | null }[]) => r[0]);
  return resolveModel(row?.preferredModel ?? null);
}
