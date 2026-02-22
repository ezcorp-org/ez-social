import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChatService } from "./chat";

// ---------------------------------------------------------------------------
// Mock DB helper
// ---------------------------------------------------------------------------

function createMockDb() {
  const resultQueue: unknown[][] = [];

  const chain: Record<string, unknown> = {};

  const methods = [
    "select",
    "from",
    "where",
    "orderBy",
    "insert",
    "values",
    "onConflictDoNothing",
    "groupBy",
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

  return { db: chain as any, setResults };
}

describe("createChatService", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: ReturnType<typeof createChatService>;

  beforeEach(() => {
    mockDb = createMockDb();
    service = createChatService(mockDb.db);
  });

  describe("getMessages", () => {
    it("returns messages ordered by creation time", async () => {
      const messages = [
        { id: "1", postId: "p1", role: "user", parts: [], createdAt: new Date() },
        { id: "2", postId: "p1", role: "assistant", parts: [], createdAt: new Date() },
      ];
      mockDb.setResults(messages);

      const result = await service.getMessages("p1");
      expect(result).toEqual(messages);
    });
  });

  describe("saveMessage", () => {
    it("inserts a message with metadata", async () => {
      mockDb.setResults([]);
      await service.saveMessage("p1", {
        id: "msg-1",
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
        metadata: { inputTokens: 100, outputTokens: 50 },
      });

      expect(mockDb.db.insert).toHaveBeenCalled();
      expect(mockDb.db.values).toHaveBeenCalled();
      expect(mockDb.db.onConflictDoNothing).toHaveBeenCalled();
    });
  });

  describe("getMessageIds", () => {
    it("returns a Set of message IDs", async () => {
      mockDb.setResults([{ id: "a" }, { id: "b" }, { id: "c" }]);

      const ids = await service.getMessageIds("p1");
      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(3);
      expect(ids.has("a")).toBe(true);
      expect(ids.has("b")).toBe(true);
      expect(ids.has("c")).toBe(true);
    });
  });

  describe("getPostUsage", () => {
    it("returns aggregated usage data", async () => {
      mockDb.setResults([{ inputTokens: 5000, outputTokens: 2000, totalCostMicrocents: 30000 }]);

      const usage = await service.getPostUsage("p1");
      expect(usage).toEqual({
        inputTokens: 5000,
        outputTokens: 2000,
        totalCostMicrocents: 30000,
      });
    });

    it("returns zeros when no usage data exists", async () => {
      mockDb.setResults([{ inputTokens: 0, outputTokens: 0, totalCostMicrocents: 0 }]);

      const usage = await service.getPostUsage("p1");
      expect(usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalCostMicrocents: 0,
      });
    });
  });

  describe("getPostCosts", () => {
    it("returns empty object for empty input", async () => {
      const costs = await service.getPostCosts([]);
      expect(costs).toEqual({});
    });

    it("returns cost map for multiple posts", async () => {
      mockDb.setResults([
        { postId: "p1", totalCostMicrocents: 10000 },
        { postId: "p2", totalCostMicrocents: 20000 },
      ]);

      const costs = await service.getPostCosts(["p1", "p2"]);
      expect(costs).toEqual({ p1: 10000, p2: 20000 });
    });
  });

  describe("logUsage", () => {
    it("inserts a usage log entry", async () => {
      mockDb.setResults([]);
      await service.logUsage({
        userId: "u1",
        postId: "p1",
        personaId: "per1",
        type: "chat",
        model: "claude-sonnet-4-20250514",
        inputTokens: 1000,
        outputTokens: 500,
        costMicrocents: 1050,
      });

      expect(mockDb.db.insert).toHaveBeenCalled();
      expect(mockDb.db.values).toHaveBeenCalled();
    });
  });
});
