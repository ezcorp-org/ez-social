import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Pure functions extracted from VoiceProfileDisplay.svelte
// These mirror the exact logic in the component for testability.
// ---------------------------------------------------------------------------

function mergeProfileWithEdits(
  profile: Record<string, unknown>,
  manualEdits: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!manualEdits) return profile;
  const merged = { ...profile };
  for (const [key, value] of Object.entries(manualEdits)) {
    if (
      key === "dimensions" ||
      key === "recommendations" ||
      key === "consistencyScore"
    ) {
      const base = profile[key] as Record<string, unknown> | undefined;
      const override = value as Record<string, unknown>;
      merged[key] = { ...(base ?? {}), ...override };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function isEdited(
  manualEdits: Record<string, unknown> | null,
  field: string,
): boolean {
  if (!manualEdits) return false;
  const parts = field.split(".");
  if (parts.length === 1) return parts[0] in manualEdits;
  if (parts.length >= 2) {
    const parent = manualEdits[parts[0]] as
      | Record<string, unknown>
      | undefined;
    if (!parent) return false;
    return parts[1] in parent;
  }
  return false;
}

function buildNestedEdit(
  arrayKey: string,
  updated: unknown[],
  manualEdits: Record<string, unknown> | null,
): Record<string, unknown> {
  const parts = arrayKey.split(".");
  if (parts.length === 2) {
    const [parent, child] = parts;
    const existing =
      (manualEdits?.[parent] as Record<string, unknown>) ?? {};
    return { ...manualEdits, [parent]: { ...existing, [child]: updated } };
  }
  return { ...manualEdits, [arrayKey]: updated };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseProfile() {
  return {
    voiceDNA: ["Short punchy sentences", "Opens with rhetorical questions"],
    dimensions: {
      structure: [
        {
          pattern: "1-2 sentence paragraphs",
          signal: "embedded",
          evidence: "Found in 5/6 types",
        },
      ],
      grammar: [
        {
          pattern: "No exclamation marks",
          signal: "consistent",
          evidence: "Absent across all samples",
        },
      ],
      vocabulary: [
        {
          pattern: "Tech jargon mixed with slang",
          signal: "contextual",
          evidence: "In replies only",
        },
      ],
      rhetoric: [
        {
          pattern: "Builds via analogy",
          signal: "embedded",
          evidence: "4/5 original takes",
        },
      ],
    },
    contentModes: [
      {
        type: "reply",
        dominantPatterns: ["Punchy sentences"],
        distinctiveShifts: "More casual than takes",
        exampleQuote: "Nah, the real issue is...",
      },
    ],
    inconsistencies: [],
    recommendations: {
      leanInto: ["Punchy openings"],
      watchOutFor: ["Overusing em-dashes"],
      develop: ["Closing hooks"],
    },
    consistencyScore: {
      rating: "moderately-consistent",
      summary: "Strong structural consistency.",
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mergeProfileWithEdits", () => {
  it("returns profile as-is when manualEdits is null", () => {
    const profile = baseProfile();
    const result = mergeProfileWithEdits(profile, null);
    expect(result).toBe(profile);
  });

  it("returns profile as-is when manualEdits is empty object", () => {
    const profile = baseProfile();
    const result = mergeProfileWithEdits(profile, {});
    expect(result).toEqual(profile);
  });

  it("overrides top-level simple fields", () => {
    const profile = baseProfile();
    const edits = { voiceDNA: ["Overridden trait"] };
    const result = mergeProfileWithEdits(profile, edits);
    expect(result.voiceDNA).toEqual(["Overridden trait"]);
  });

  it("deep merges dimensions - editing structure preserves grammar, vocabulary, rhetoric", () => {
    const profile = baseProfile();
    const newStructure = [
      { pattern: "Edited structure", signal: "embedded", evidence: "test" },
    ];
    const edits = { dimensions: { structure: newStructure } };
    const result = mergeProfileWithEdits(profile, edits);

    const dims = result.dimensions as Record<string, unknown>;
    expect(dims.structure).toEqual(newStructure);
    // Other dimension keys preserved from base
    expect(dims.grammar).toEqual(
      (baseProfile().dimensions as Record<string, unknown>).grammar,
    );
    expect(dims.vocabulary).toEqual(
      (baseProfile().dimensions as Record<string, unknown>).vocabulary,
    );
    expect(dims.rhetoric).toEqual(
      (baseProfile().dimensions as Record<string, unknown>).rhetoric,
    );
  });

  it("deep merges recommendations - editing leanInto preserves watchOutFor and develop", () => {
    const profile = baseProfile();
    const edits = {
      recommendations: { leanInto: ["New lean-into item"] },
    };
    const result = mergeProfileWithEdits(profile, edits);

    const recs = result.recommendations as Record<string, unknown>;
    expect(recs.leanInto).toEqual(["New lean-into item"]);
    expect(recs.watchOutFor).toEqual(["Overusing em-dashes"]);
    expect(recs.develop).toEqual(["Closing hooks"]);
  });

  it("deep merges consistencyScore - editing rating preserves summary", () => {
    const profile = baseProfile();
    const edits = {
      consistencyScore: { rating: "highly-consistent" },
    };
    const result = mergeProfileWithEdits(profile, edits);

    const cs = result.consistencyScore as Record<string, unknown>;
    expect(cs.rating).toBe("highly-consistent");
    expect(cs.summary).toBe("Strong structural consistency.");
  });

  it("deep merges consistencyScore - editing summary preserves rating", () => {
    const profile = baseProfile();
    const edits = {
      consistencyScore: { summary: "Edited summary text" },
    };
    const result = mergeProfileWithEdits(profile, edits);

    const cs = result.consistencyScore as Record<string, unknown>;
    expect(cs.rating).toBe("moderately-consistent");
    expect(cs.summary).toBe("Edited summary text");
  });

  it("handles dimensions override when base has no dimensions", () => {
    const profile = { voiceDNA: ["trait"] };
    const edits = {
      dimensions: {
        structure: [{ pattern: "test", signal: "embedded", evidence: "e" }],
      },
    };
    const result = mergeProfileWithEdits(profile, edits);

    const dims = result.dimensions as Record<string, unknown>;
    expect(dims.structure).toEqual([
      { pattern: "test", signal: "embedded", evidence: "e" },
    ]);
  });

  it("applies multiple edits simultaneously", () => {
    const profile = baseProfile();
    const edits = {
      voiceDNA: ["New DNA"],
      dimensions: { grammar: [{ pattern: "New grammar", signal: "consistent", evidence: "test" }] },
      recommendations: { develop: ["New develop item"] },
    };
    const result = mergeProfileWithEdits(profile, edits);

    expect(result.voiceDNA).toEqual(["New DNA"]);
    const dims = result.dimensions as Record<string, unknown>;
    expect(dims.grammar).toEqual([{ pattern: "New grammar", signal: "consistent", evidence: "test" }]);
    // structure preserved
    expect(dims.structure).toEqual(baseProfile().dimensions.structure);
    const recs = result.recommendations as Record<string, unknown>;
    expect(recs.develop).toEqual(["New develop item"]);
    // leanInto preserved
    expect(recs.leanInto).toEqual(["Punchy openings"]);
  });
});

describe("isEdited", () => {
  it("returns false when manualEdits is null", () => {
    expect(isEdited(null, "voiceDNA")).toBe(false);
  });

  it("returns true for a top-level edited field", () => {
    const edits = { voiceDNA: ["Overridden"] };
    expect(isEdited(edits, "voiceDNA")).toBe(true);
  });

  it("returns false for an unedited top-level field", () => {
    const edits = { voiceDNA: ["Overridden"] };
    expect(isEdited(edits, "contentModes")).toBe(false);
  });

  it("returns true for nested path dimensions.structure when structure is edited", () => {
    const edits = { dimensions: { structure: [{ pattern: "edited" }] } };
    expect(isEdited(edits, "dimensions.structure")).toBe(true);
  });

  it("returns false for nested path dimensions.grammar when only structure is edited", () => {
    const edits = { dimensions: { structure: [{ pattern: "edited" }] } };
    expect(isEdited(edits, "dimensions.grammar")).toBe(false);
  });

  it("returns true for recommendations.leanInto when leanInto is edited", () => {
    const edits = { recommendations: { leanInto: ["New item"] } };
    expect(isEdited(edits, "recommendations.leanInto")).toBe(true);
  });

  it("returns false for recommendations.watchOutFor when only leanInto is edited", () => {
    const edits = { recommendations: { leanInto: ["New item"] } };
    expect(isEdited(edits, "recommendations.watchOutFor")).toBe(false);
  });

  it("returns true for consistencyScore when it has any edits", () => {
    const edits = { consistencyScore: { rating: "highly-consistent" } };
    expect(isEdited(edits, "consistencyScore")).toBe(true);
  });

  it("returns true for consistencyScore.rating when rating is edited", () => {
    const edits = { consistencyScore: { rating: "highly-consistent" } };
    expect(isEdited(edits, "consistencyScore.rating")).toBe(true);
  });

  it("returns false for consistencyScore.summary when only rating is edited", () => {
    const edits = { consistencyScore: { rating: "highly-consistent" } };
    expect(isEdited(edits, "consistencyScore.summary")).toBe(false);
  });

  it("returns true for array index access since arrays have numeric keys", () => {
    const edits = { voiceDNA: ["Overridden"] };
    // Arrays have numeric keys, so "0" in ["Overridden"] === true
    expect(isEdited(edits, "voiceDNA.0")).toBe(true);
  });

  it("returns false for out-of-bounds array index", () => {
    const edits = { voiceDNA: ["Overridden"] };
    expect(isEdited(edits, "voiceDNA.5")).toBe(false);
  });
});

describe("buildNestedEdit", () => {
  it("creates nested structure for dimensions.structure", () => {
    const updated = [{ pattern: "new", signal: "embedded", evidence: "e" }];
    const result = buildNestedEdit("dimensions.structure", updated, null);
    expect(result).toEqual({
      dimensions: { structure: updated },
    });
  });

  it("preserves existing dimension edits when adding a new one", () => {
    const existing = {
      dimensions: {
        grammar: [{ pattern: "existing", signal: "consistent", evidence: "e" }],
      },
    };
    const updated = [{ pattern: "new structure", signal: "embedded", evidence: "e" }];
    const result = buildNestedEdit("dimensions.structure", updated, existing);
    expect(result).toEqual({
      dimensions: {
        grammar: [{ pattern: "existing", signal: "consistent", evidence: "e" }],
        structure: updated,
      },
    });
  });

  it("creates nested structure for recommendations.leanInto", () => {
    const updated = ["New lean-into"];
    const result = buildNestedEdit("recommendations.leanInto", updated, null);
    expect(result).toEqual({
      recommendations: { leanInto: updated },
    });
  });

  it("preserves existing recommendation edits", () => {
    const existing = {
      recommendations: { watchOutFor: ["Existing watch out"] },
    };
    const updated = ["New lean-into"];
    const result = buildNestedEdit(
      "recommendations.leanInto",
      updated,
      existing,
    );
    expect(result).toEqual({
      recommendations: {
        watchOutFor: ["Existing watch out"],
        leanInto: updated,
      },
    });
  });

  it("uses flat key for top-level arrays like voiceDNA", () => {
    const updated = ["trait1", "trait2"];
    const result = buildNestedEdit("voiceDNA", updated, null);
    expect(result).toEqual({ voiceDNA: updated });
  });

  it("uses flat key for contentModes", () => {
    const updated = [{ type: "reply", dominantPatterns: [], distinctiveShifts: "", exampleQuote: "" }];
    const result = buildNestedEdit("contentModes", updated, { voiceDNA: ["existing"] });
    expect(result).toEqual({
      voiceDNA: ["existing"],
      contentModes: updated,
    });
  });

  it("preserves other top-level edits when adding nested edit", () => {
    const existing = { voiceDNA: ["existing trait"] };
    const updated = [{ pattern: "p", signal: "embedded", evidence: "e" }];
    const result = buildNestedEdit("dimensions.structure", updated, existing);
    expect(result).toEqual({
      voiceDNA: ["existing trait"],
      dimensions: { structure: updated },
    });
  });
});

describe("saveArrayEdit (via buildNestedEdit)", () => {
  it("replaces item at index in a nested array", () => {
    const source = [
      { pattern: "old", signal: "embedded", evidence: "e1" },
      { pattern: "keep", signal: "consistent", evidence: "e2" },
    ];
    const updated = [...source];
    updated[0] = { pattern: "new", signal: "contextual", evidence: "e3" };

    const result = buildNestedEdit("dimensions.structure", updated, null);
    expect(
      (result.dimensions as Record<string, unknown>).structure,
    ).toEqual([
      { pattern: "new", signal: "contextual", evidence: "e3" },
      { pattern: "keep", signal: "consistent", evidence: "e2" },
    ]);
  });

  it("replaces item at index in a top-level array", () => {
    const source = ["trait1", "trait2", "trait3"];
    const updated = [...source];
    updated[1] = "edited trait";

    const result = buildNestedEdit("voiceDNA", updated, null);
    expect(result.voiceDNA).toEqual(["trait1", "edited trait", "trait3"]);
  });
});

describe("addArrayItem (via buildNestedEdit)", () => {
  it("appends to a nested array", () => {
    const source = [{ pattern: "existing", signal: "embedded", evidence: "e" }];
    const updated = [...source, { pattern: "new", signal: "contextual", evidence: "e2" }];

    const result = buildNestedEdit("dimensions.grammar", updated, null);
    const grammar = (result.dimensions as Record<string, unknown>).grammar as unknown[];
    expect(grammar).toHaveLength(2);
    expect(grammar[1]).toEqual({ pattern: "new", signal: "contextual", evidence: "e2" });
  });

  it("appends to a top-level array", () => {
    const source = ["trait1"];
    const updated = [...source, "trait2"];

    const result = buildNestedEdit("voiceDNA", updated, null);
    expect(result.voiceDNA).toEqual(["trait1", "trait2"]);
  });
});

describe("removeArrayItem (via buildNestedEdit)", () => {
  it("removes by index from a nested array", () => {
    const source = [
      { pattern: "p1", signal: "embedded", evidence: "e1" },
      { pattern: "p2", signal: "consistent", evidence: "e2" },
      { pattern: "p3", signal: "contextual", evidence: "e3" },
    ];
    const updated = source.filter((_, i) => i !== 1);

    const result = buildNestedEdit("dimensions.structure", updated, null);
    const structure = (result.dimensions as Record<string, unknown>).structure as unknown[];
    expect(structure).toHaveLength(2);
    expect(structure[0]).toEqual({ pattern: "p1", signal: "embedded", evidence: "e1" });
    expect(structure[1]).toEqual({ pattern: "p3", signal: "contextual", evidence: "e3" });
  });

  it("removes by index from a top-level array", () => {
    const source = ["trait1", "trait2", "trait3"];
    const updated = source.filter((_, i) => i !== 0);

    const result = buildNestedEdit("voiceDNA", updated, null);
    expect(result.voiceDNA).toEqual(["trait2", "trait3"]);
  });

  it("results in empty array when removing the last item", () => {
    const source = ["only-trait"];
    const updated = source.filter((_, i) => i !== 0);

    const result = buildNestedEdit("voiceDNA", updated, null);
    expect(result.voiceDNA).toEqual([]);
  });
});
