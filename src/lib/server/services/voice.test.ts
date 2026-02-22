import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVoiceService } from "./voice";

// ---------------------------------------------------------------------------
// Mock DB helper (same pattern as persona.test.ts)
// ---------------------------------------------------------------------------

function createMockDb() {
  const resultQueue: unknown[][] = [];

  const chain: Record<string, unknown> = {};

  const methods = [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "insert",
    "values",
    "returning",
    "update",
    "set",
  ];

  for (const m of methods) {
    chain[m] = vi.fn().mockImplementation(() => chain);
  }

  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    const next = resultQueue.shift() ?? [];
    return Promise.resolve(next).then(resolve, reject);
  };

  function setResults(...batches: unknown[][]) {
    resultQueue.length = 0;
    resultQueue.push(...batches);
  }

  return {
    db: chain as unknown as Parameters<typeof createVoiceService>[0],
    setResults,
    chain,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSample(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    personaId: "p1",
    content: "Hello world this is a test",
    platform: "twitter",
    wordCount: 6,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    personaId: "p1",
    version: 1,
    extractedProfile: { summary: "Test voice" },
    manualEdits: null,
    sampleCount: 3,
    samplePlatforms: ["twitter"],
    totalWordCount: 500,
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("voiceService", () => {
  let db: ReturnType<typeof createMockDb>["db"];
  let setResults: ReturnType<typeof createMockDb>["setResults"];
  let service: ReturnType<typeof createVoiceService>;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    setResults = mock.setResults;
    service = createVoiceService(db);
  });

  // ── saveSamples ───────────────────────────────────────────────

  describe("saveSamples", () => {
    it("returns the saved sample", async () => {
      const sample = makeSample();
      setResults([sample]);

      const result = await service.saveSamples("p1", "Hello world this is a test", "twitter");

      expect(result).toEqual(sample);
    });

    it("calculates wordCount correctly for normal text", async () => {
      const content = "one two three four five";
      const sample = makeSample({ wordCount: 5, content });
      setResults([sample]);

      await service.saveSamples("p1", content, "twitter");

      // Verify the values call received the correct wordCount
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ wordCount: 5 }),
      );
    });

    it("calculates wordCount correctly for text with extra whitespace", async () => {
      const content = "  one   two   three  ";
      const sample = makeSample({ wordCount: 3, content });
      setResults([sample]);

      await service.saveSamples("p1", content, "blog");

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ wordCount: 3 }),
      );
    });

    it("calculates wordCount as 0 for empty/whitespace-only content", async () => {
      const content = "   ";
      const sample = makeSample({ wordCount: 0, content });
      setResults([sample]);

      await service.saveSamples("p1", content, "blog");

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ wordCount: 0 }),
      );
    });

    it("passes personaId, content, and platform to insert", async () => {
      const sample = makeSample();
      setResults([sample]);

      await service.saveSamples("p1", "Hello world this is a test", "twitter");

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          personaId: "p1",
          content: "Hello world this is a test",
          platform: "twitter",
        }),
      );
    });
  });

  // ── getSamples ────────────────────────────────────────────────

  describe("getSamples", () => {
    it("returns samples ordered by createdAt", async () => {
      const samples = [
        makeSample({ id: "s2", createdAt: new Date("2025-02-01") }),
        makeSample({ id: "s1", createdAt: new Date("2025-01-01") }),
      ];
      setResults(samples);

      const result = await service.getSamples("p1");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("s2");
    });

    it("returns empty array when no samples exist", async () => {
      setResults([]);

      const result = await service.getSamples("p1");

      expect(result).toEqual([]);
    });
  });

  // ── saveVersion ───────────────────────────────────────────────

  describe("saveVersion", () => {
    it("increments version number from max existing", async () => {
      const version = makeVersion({ version: 3 });
      // 1: max query. 2: insert returning. 3: update persona.
      setResults([{ maxVersion: 2 }], [version], []);

      const result = await service.saveVersion("p1", { summary: "test" }, {
        sampleCount: 5,
        samplePlatforms: ["twitter"],
        totalWordCount: 1000,
      });

      expect(result.version).toBe(3);
      // Check the version number passed to values
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ version: 3 }),
      );
    });

    it("starts at version 1 when no prior versions exist", async () => {
      const version = makeVersion({ version: 1 });
      setResults([{ maxVersion: null }], [version], []);

      const result = await service.saveVersion("p1", { summary: "first" }, {
        sampleCount: 1,
        samplePlatforms: ["blog"],
        totalWordCount: 200,
      });

      expect(result.version).toBe(1);
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ version: 1 }),
      );
    });

    it("sets activeVoiceVersionId on persona after saving", async () => {
      const version = makeVersion({ id: "v-new" });
      setResults([{ maxVersion: 0 }], [version], []);

      await service.saveVersion("p1", {}, {
        sampleCount: 1,
        samplePlatforms: [],
        totalWordCount: 100,
      });

      // The update().set() call should include the version id
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({ activeVoiceVersionId: "v-new" }),
      );
    });
  });

  // ── listVersions ──────────────────────────────────────────────

  describe("listVersions", () => {
    it("returns versions ordered by version DESC", async () => {
      const versions = [
        { id: "v2", version: 2, createdAt: new Date(), sampleCount: 5, totalWordCount: 1000 },
        { id: "v1", version: 1, createdAt: new Date(), sampleCount: 3, totalWordCount: 500 },
      ];
      setResults(versions);

      const result = await service.listVersions("p1");

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
    });

    it("returns empty array when no versions exist", async () => {
      setResults([]);

      const result = await service.listVersions("p1");

      expect(result).toEqual([]);
    });
  });

  // ── getVersion ────────────────────────────────────────────────

  describe("getVersion", () => {
    it("returns version when personaId matches", async () => {
      const version = makeVersion();
      setResults([version]);

      const result = await service.getVersion("p1", "v1");

      expect(result).toEqual(version);
    });

    it("returns null when version does not belong to persona", async () => {
      setResults([]);

      const result = await service.getVersion("p1", "v-other");

      expect(result).toBeNull();
    });
  });

  // ── getActiveVersion ──────────────────────────────────────────

  describe("getActiveVersion", () => {
    it("returns null when persona has no active version", async () => {
      setResults([{ activeVoiceVersionId: null }]);

      const result = await service.getActiveVersion("p1");

      expect(result).toBeNull();
    });

    it("returns the active version", async () => {
      const version = makeVersion();
      // 1: persona select. 2: version select.
      setResults([{ activeVoiceVersionId: "v1" }], [version]);

      const result = await service.getActiveVersion("p1");

      expect(result).toEqual(version);
    });

    it("returns null when persona not found", async () => {
      setResults([]);

      const result = await service.getActiveVersion("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ── setActiveVersion ──────────────────────────────────────────

  describe("setActiveVersion", () => {
    it("updates the persona with the new active version id", async () => {
      setResults([]);

      await service.setActiveVersion("p1", "v2");

      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({ activeVoiceVersionId: "v2" }),
      );
    });
  });

  // ── updateManualEdits ─────────────────────────────────────────

  describe("updateManualEdits", () => {
    it("returns updated version with manual edits", async () => {
      const edits = { summary: "Override summary" };
      const updated = makeVersion({ manualEdits: edits });
      setResults([updated]);

      const result = await service.updateManualEdits("v1", edits);

      expect(result).toEqual(updated);
      expect(result!.manualEdits).toEqual(edits);
    });

    it("returns null when version not found", async () => {
      setResults([]);

      const result = await service.updateManualEdits("nonexistent", { foo: "bar" });

      expect(result).toBeNull();
    });
  });
});
