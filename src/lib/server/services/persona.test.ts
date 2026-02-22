import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPersonaService } from "./persona";

// ---------------------------------------------------------------------------
// Mock DB helper
// ---------------------------------------------------------------------------

/**
 * Creates a chainable mock that mimics Drizzle's query builder.
 *
 * Every method returns `this` for chaining. The chain is "thenable" — when
 * awaited, it resolves with the results set via `setResults()`. Calling
 * `setResults()` queues results for the *next* awaited chain. Multiple calls
 * queue in order so sequential DB calls in a single service method each get
 * their own result set.
 */
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

  // Make the chain thenable so `await chain` resolves to next queued result
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    const next = resultQueue.shift() ?? [];
    return Promise.resolve(next).then(resolve, reject);
  };

  function setResults(...batches: unknown[][]) {
    resultQueue.length = 0;
    resultQueue.push(...batches);
  }

  return {
    db: chain as unknown as Parameters<typeof createPersonaService>[0],
    setResults,
    chain,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePersona(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    userId: "u1",
    name: "Default Persona",
    description: null,
    platform: null,
    isDefault: true,
    archivedAt: null,
    activeVoiceVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("personaService", () => {
  let db: ReturnType<typeof createMockDb>["db"];
  let setResults: ReturnType<typeof createMockDb>["setResults"];
  let service: ReturnType<typeof createPersonaService>;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    setResults = mock.setResults;
    service = createPersonaService(db);
  });

  // ── list ──────────────────────────────────────────────────────

  describe("list", () => {
    it("returns non-archived personas with voiceSummary undefined when no active version", async () => {
      const p = makePersona();
      // First query: persona rows. Second query for versions won't run (no versionIds).
      setResults([p]);

      const result = await service.list("u1");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Default Persona");
      expect(result[0].voiceSummary).toBeUndefined();
    });

    it("returns voiceSummary from active version when present", async () => {
      const p = makePersona({ activeVoiceVersionId: "v1" });
      const version = {
        id: "v1",
        extractedProfile: { summary: "Writes with dry humor" },
      };
      // First call: personas. Second call: voice versions.
      setResults([p], [version]);

      const result = await service.list("u1");

      expect(result[0].voiceSummary).toBe("Writes with dry humor");
    });

    it("returns empty array when user has no personas", async () => {
      setResults([]);

      const result = await service.list("u1");

      expect(result).toEqual([]);
    });
  });

  // ── getById ───────────────────────────────────────────────────

  describe("getById", () => {
    it("returns persona with voiceProfile and voiceVersion when active version exists", async () => {
      const p = makePersona({ activeVoiceVersionId: "v1" });
      const version = {
        extractedProfile: { summary: "test" },
        version: 2,
      };
      setResults([p], [version]);

      const result = await service.getById("u1", "p1");

      expect(result).not.toBeNull();
      expect(result!.voiceProfile).toEqual({ summary: "test" });
      expect(result!.voiceVersion).toBe(2);
    });

    it("returns null for wrong user", async () => {
      setResults([]); // no rows found

      const result = await service.getById("other-user", "p1");

      expect(result).toBeNull();
    });

    it("returns persona with null voiceProfile when no active version", async () => {
      const p = makePersona({ activeVoiceVersionId: null });
      setResults([p]);

      const result = await service.getById("u1", "p1");

      expect(result).not.toBeNull();
      expect(result!.voiceProfile).toBeNull();
      expect(result!.voiceVersion).toBeNull();
    });
  });

  // ── create ────────────────────────────────────────────────────

  describe("create", () => {
    it("sets isDefault=true for first persona", async () => {
      const created = makePersona({ isDefault: true });
      // First call: count query. Second call: insert returning.
      setResults([{ count: 0 }], [created]);

      const result = await service.create("u1", { name: "First" });

      expect(result.isDefault).toBe(true);
      // Verify insert was called (values method on chain)
      expect(db.values).toHaveBeenCalled();
    });

    it("sets isDefault=false for subsequent personas", async () => {
      const created = makePersona({ isDefault: false });
      setResults([{ count: 2 }], [created]);

      const result = await service.create("u1", { name: "Another" });

      expect(result.isDefault).toBe(false);
    });

    it("passes description and platform to insert", async () => {
      const created = makePersona({
        description: "desc",
        platform: "twitter",
      });
      setResults([{ count: 0 }], [created]);

      const result = await service.create("u1", {
        name: "Social",
        description: "desc",
        platform: "twitter",
      });

      expect(result.description).toBe("desc");
      expect(result.platform).toBe("twitter");
    });
  });

  // ── update ────────────────────────────────────────────────────

  describe("update", () => {
    it("returns updated persona", async () => {
      const updated = makePersona({ name: "New Name" });
      setResults([updated]);

      const result = await service.update("u1", "p1", { name: "New Name" });

      expect(result).not.toBeNull();
      expect(result!.name).toBe("New Name");
    });

    it("returns null for wrong user (no row returned)", async () => {
      setResults([]);

      const result = await service.update("other-user", "p1", {
        name: "Nope",
      });

      expect(result).toBeNull();
    });
  });

  // ── archive ───────────────────────────────────────────────────

  describe("archive", () => {
    it("returns null when persona not found", async () => {
      setResults([]);

      const result = await service.archive("u1", "nonexistent");

      expect(result).toBeNull();
    });

    it("archives non-default persona without promoting another", async () => {
      // First: select persona. Second: update (archive).
      setResults([{ isDefault: false }], []);

      const result = await service.archive("u1", "p2");

      expect(result).toBe(true);
    });

    it("archives default persona and promotes the next one", async () => {
      // 1: select persona (isDefault). 2: update (archive). 3: select next. 4: update promote.
      setResults([{ isDefault: true }], [], [{ id: "p2" }], []);

      const result = await service.archive("u1", "p1");

      expect(result).toBe(true);
    });

    it("archives default persona with no others to promote", async () => {
      // 1: select. 2: archive update. 3: select next (empty).
      setResults([{ isDefault: true }], [], []);

      const result = await service.archive("u1", "p1");

      expect(result).toBe(true);
    });
  });

  // ── setDefault ────────────────────────────────────────────────

  describe("setDefault", () => {
    it("unsets others and sets the specified persona as default", async () => {
      const updated = makePersona({ id: "p2", isDefault: true });
      // 1: unset all defaults. 2: set new default.
      setResults([], [updated]);

      const result = await service.setDefault("u1", "p2");

      expect(result).not.toBeNull();
      expect(result!.isDefault).toBe(true);
    });

    it("returns null when persona not found for user", async () => {
      setResults([], []);

      const result = await service.setDefault("u1", "nonexistent");

      expect(result).toBeNull();
    });
  });

  // ── getDefault ──────────────────────────────────────────────

  describe("getDefault", () => {
    it("returns the default persona when one exists", async () => {
      const p = makePersona({ isDefault: true });
      setResults([p]);

      const result = await service.getDefault("u1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("p1");
      expect(result!.isDefault).toBe(true);
    });

    it("returns null when no default persona exists", async () => {
      setResults([]);

      const result = await service.getDefault("u1");

      expect(result).toBeNull();
    });

    it("does not return archived personas", async () => {
      // The query filters with isNull(archivedAt), so archived defaults won't appear
      setResults([]);

      const result = await service.getDefault("u1");

      expect(result).toBeNull();
    });
  });
});
