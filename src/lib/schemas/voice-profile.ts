import { z } from "zod";

export const patternSchema = z.object({
  pattern: z.string(),
  signal: z.enum(["embedded", "consistent", "contextual"]),
  evidence: z.string(),
});

export type VoicePattern = z.infer<typeof patternSchema>;

export const voiceProfileSchema = z.object({
  // Voice DNA: up to 5 headline patterns (Embedded-tier, dimension-weighted)
  voiceDNA: z.array(z.string()),

  // 4-dimension pattern analysis (deepest → surface)
  dimensions: z.object({
    structure: z.array(patternSchema),
    grammar: z.array(patternSchema),
    vocabulary: z.array(patternSchema),
    rhetoric: z.array(patternSchema),
  }),

  // How voice manifests per content type
  contentModes: z.array(
    z.object({
      type: z.string(),
      dominantPatterns: z.array(z.string()),
      distinctiveShifts: z.string(),
      exampleQuote: z.string(),
    }),
  ),

  // Where voice breaks or contradicts itself
  inconsistencies: z.array(
    z.object({
      description: z.string(),
      contextA: z.string(),
      contextB: z.string(),
      assessment: z.string(),
    }),
  ),

  // Actionable guidance
  recommendations: z.object({
    leanInto: z.array(z.string()),
    watchOutFor: z.array(z.string()),
    develop: z.array(z.string()),
  }),

  // Overall consistency rating
  consistencyScore: z.object({
    rating: z.enum([
      "highly-consistent",
      "moderately-consistent",
      "context-dependent",
      "developing",
    ]),
    summary: z.string(),
  }),
});

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;
