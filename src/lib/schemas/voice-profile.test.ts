import { describe, it, expect } from "vitest";
import { voiceProfileSchema, patternSchema } from "./voice-profile";

function validPattern(overrides?: Partial<{ pattern: string; signal: string; evidence: string }>) {
  return {
    pattern: "Uses short, punchy sentences",
    signal: "embedded" as const,
    evidence: "Found in 5/6 content types",
    ...overrides,
  };
}

function validProfile() {
  return {
    voiceDNA: [
      "Short punchy sentences with dry humor",
      "Opens with provocative questions",
      "Heavy use of em-dashes",
    ],
    dimensions: {
      structure: [validPattern()],
      grammar: [validPattern({ pattern: "Minimal punctuation, no exclamation marks" })],
      vocabulary: [validPattern({ pattern: "Tech jargon mixed with casual slang", signal: "consistent" as const })],
      rhetoric: [validPattern({ pattern: "Builds arguments via analogy", signal: "contextual" as const })],
    },
    contentModes: [
      {
        type: "original take",
        dominantPatterns: ["Short punchy sentences", "Provocative opener"],
        distinctiveShifts: "More aggressive tone than replies",
        exampleQuote: "Here's the thing nobody wants to admit about microservices—",
      },
    ],
    inconsistencies: [
      {
        description: "Formality shifts between platforms",
        contextA: "Very casual on Twitter",
        contextB: "More structured on LinkedIn",
        assessment: "Context-appropriate code-switching, not true inconsistency",
      },
    ],
    recommendations: {
      leanInto: ["The punchy opening style", "Dry humor delivery"],
      watchOutFor: ["Over-reliance on em-dashes", "Occasional run-on sentences"],
      develop: ["Closing hooks could be stronger"],
    },
    consistencyScore: {
      rating: "moderately-consistent" as const,
      summary: "Strong structural consistency across contexts with minor vocabulary shifts by platform.",
    },
  };
}

describe("patternSchema", () => {
  it("accepts a valid pattern", () => {
    const result = patternSchema.safeParse(validPattern());
    expect(result.success).toBe(true);
  });

  it("accepts all valid signal values", () => {
    for (const signal of ["embedded", "consistent", "contextual"]) {
      const result = patternSchema.safeParse(validPattern({ signal }));
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid signal value", () => {
    const result = patternSchema.safeParse(validPattern({ signal: "strong" }));
    expect(result.success).toBe(false);
  });

  it("rejects missing pattern field", () => {
    const { pattern, ...rest } = validPattern();
    const result = patternSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing evidence field", () => {
    const { evidence, ...rest } = validPattern();
    const result = patternSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("voiceProfileSchema", () => {
  it("accepts a valid complete profile", () => {
    const result = voiceProfileSchema.safeParse(validProfile());
    expect(result.success).toBe(true);
  });

  // voiceDNA
  it("rejects missing voiceDNA", () => {
    const { voiceDNA, ...rest } = validProfile();
    const result = voiceProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts empty voiceDNA array", () => {
    const profile = validProfile();
    profile.voiceDNA = [];
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  // dimensions
  it("rejects missing dimensions", () => {
    const { dimensions, ...rest } = validProfile();
    const result = voiceProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing dimension sub-field", () => {
    const profile = validProfile();
    delete (profile.dimensions as Record<string, unknown>).structure;
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("accepts empty dimension arrays", () => {
    const profile = validProfile();
    profile.dimensions = { structure: [], grammar: [], vocabulary: [], rhetoric: [] };
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  // contentModes
  it("rejects missing contentModes", () => {
    const { contentModes, ...rest } = validProfile();
    const result = voiceProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts empty contentModes array", () => {
    const profile = validProfile();
    profile.contentModes = [];
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  it("rejects contentMode missing required fields", () => {
    const profile = validProfile();
    profile.contentModes = [{ type: "reply" } as never];
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  // inconsistencies
  it("rejects missing inconsistencies", () => {
    const { inconsistencies, ...rest } = validProfile();
    const result = voiceProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts empty inconsistencies array", () => {
    const profile = validProfile();
    profile.inconsistencies = [];
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  // recommendations
  it("rejects missing recommendations", () => {
    const { recommendations, ...rest } = validProfile();
    const result = voiceProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing recommendations.leanInto", () => {
    const profile = validProfile();
    delete (profile.recommendations as Record<string, unknown>).leanInto;
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("accepts empty recommendation arrays", () => {
    const profile = validProfile();
    profile.recommendations = { leanInto: [], watchOutFor: [], develop: [] };
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  // consistencyScore
  it("rejects missing consistencyScore", () => {
    const { consistencyScore, ...rest } = validProfile();
    const result = voiceProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts all valid consistencyScore rating values", () => {
    const values = ["highly-consistent", "moderately-consistent", "context-dependent", "developing"];
    for (const rating of values) {
      const profile = validProfile();
      profile.consistencyScore.rating = rating as typeof profile.consistencyScore.rating;
      const result = voiceProfileSchema.safeParse(profile);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid consistencyScore rating", () => {
    const profile = validProfile();
    (profile.consistencyScore as Record<string, unknown>).rating = "excellent";
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("rejects missing consistencyScore.summary", () => {
    const profile = validProfile();
    delete (profile.consistencyScore as Record<string, unknown>).summary;
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  // Type coercion
  it("rejects non-array voiceDNA", () => {
    const profile = validProfile();
    (profile as Record<string, unknown>).voiceDNA = "not an array";
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("rejects non-string in voiceDNA", () => {
    const profile = validProfile();
    (profile.voiceDNA as unknown[]) = [123];
    const result = voiceProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });
});
