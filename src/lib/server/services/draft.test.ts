import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDraftService } from "./draft";

// ---------------------------------------------------------------------------
// Mock DB helper (same pattern as queue.test.ts)
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
    db: chain as unknown as Parameters<typeof createDraftService>[0],
    setResults,
    chain,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEdit(overrides: Record<string, unknown> = {}) {
  return {
    id: "edit-1",
    messageId: "msg-1",
    postId: "post-1",
    originalText: "Original draft text",
    editedText: "Edited draft text",
    createdAt: new Date("2026-01-15"),
    ...overrides,
  };
}

function makeFeedback(overrides: Record<string, unknown> = {}) {
  return {
    id: "fb-1",
    postId: "post-1",
    messageId: "msg-1",
    personaId: "persona-1",
    action: "accepted",
    draftText: "The draft text",
    editedText: null,
    createdAt: new Date("2026-01-15"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("draftService", () => {
  let db: ReturnType<typeof createMockDb>["db"];
  let setResults: ReturnType<typeof createMockDb>["setResults"];
  let service: ReturnType<typeof createDraftService>;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    setResults = mock.setResults;
    service = createDraftService(db);
  });

  describe("saveEdit", () => {
    it("inserts and returns the saved edit", async () => {
      const edit = makeEdit();
      setResults([edit]);

      const result = await service.saveEdit({
        messageId: "msg-1",
        postId: "post-1",
        originalText: "Original draft text",
        editedText: "Edited draft text",
      });

      expect(result).toEqual(edit);
      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith({
        messageId: "msg-1",
        postId: "post-1",
        originalText: "Original draft text",
        editedText: "Edited draft text",
      });
      expect(db.returning).toHaveBeenCalled();
    });
  });

  describe("getEditsForPost", () => {
    it("returns edits for a given post ordered by createdAt", async () => {
      const edits = [makeEdit({ id: "e1" }), makeEdit({ id: "e2" })];
      setResults(edits);

      const result = await service.getEditsForPost("post-1");

      expect(result).toEqual(edits);
      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
      expect(db.orderBy).toHaveBeenCalled();
    });

    it("returns empty array when no edits exist", async () => {
      setResults([]);

      const result = await service.getEditsForPost("post-no-edits");

      expect(result).toEqual([]);
    });
  });

  describe("getEditsForMessage", () => {
    it("returns edits for a specific message", async () => {
      const edits = [makeEdit()];
      setResults(edits);

      const result = await service.getEditsForMessage("msg-1");

      expect(result).toEqual(edits);
      expect(db.where).toHaveBeenCalled();
    });
  });

  describe("saveFeedback", () => {
    it("saves accepted feedback", async () => {
      const feedback = makeFeedback();
      setResults([feedback]);

      const result = await service.saveFeedback({
        postId: "post-1",
        messageId: "msg-1",
        personaId: "persona-1",
        action: "accepted",
        draftText: "The draft text",
      });

      expect(result).toEqual(feedback);
      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith({
        postId: "post-1",
        messageId: "msg-1",
        personaId: "persona-1",
        action: "accepted",
        draftText: "The draft text",
        editedText: null,
      });
    });

    it("saves edited feedback with editedText", async () => {
      const feedback = makeFeedback({
        action: "edited",
        editedText: "Modified version",
      });
      setResults([feedback]);

      const result = await service.saveFeedback({
        postId: "post-1",
        messageId: "msg-1",
        personaId: null,
        action: "edited",
        draftText: "The draft text",
        editedText: "Modified version",
      });

      expect(result).toEqual(feedback);
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          personaId: null,
          action: "edited",
          editedText: "Modified version",
        }),
      );
    });

    it("defaults editedText to null when not provided", async () => {
      const feedback = makeFeedback();
      setResults([feedback]);

      await service.saveFeedback({
        postId: "post-1",
        messageId: "msg-1",
        personaId: null,
        action: "accepted",
        draftText: "The draft text",
      });

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ editedText: null }),
      );
    });
  });

  describe("getFeedbackForPersona", () => {
    it("returns feedback for a persona ordered newest first", async () => {
      const feedback = [
        makeFeedback({ id: "fb-2", createdAt: new Date("2026-01-16") }),
        makeFeedback({ id: "fb-1", createdAt: new Date("2026-01-15") }),
      ];
      setResults(feedback);

      const result = await service.getFeedbackForPersona("persona-1");

      expect(result).toEqual(feedback);
      expect(db.where).toHaveBeenCalled();
      expect(db.orderBy).toHaveBeenCalled();
    });

    it("returns empty array when no feedback exists", async () => {
      setResults([]);

      const result = await service.getFeedbackForPersona("persona-no-feedback");

      expect(result).toEqual([]);
    });
  });
});
