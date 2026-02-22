import { describe, it, expect, vi } from "vitest";
import {
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  resolveModel,
  getUserPreferredModel,
  calculateCost,
  MODEL_PRICING,
} from "./models";

describe("models", () => {
  describe("AVAILABLE_MODELS", () => {
    it("contains at least one model", () => {
      expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
    });

    it("each model has an id and label", () => {
      for (const m of AVAILABLE_MODELS) {
        expect(m.id).toBeTruthy();
        expect(m.label).toBeTruthy();
      }
    });
  });

  describe("DEFAULT_MODEL", () => {
    it("is one of the available model ids", () => {
      const ids = AVAILABLE_MODELS.map((m) => m.id);
      expect(ids).toContain(DEFAULT_MODEL);
    });
  });

  describe("resolveModel", () => {
    it("returns the preferred model when valid", () => {
      for (const m of AVAILABLE_MODELS) {
        expect(resolveModel(m.id)).toBe(m.id);
      }
    });

    it("returns DEFAULT_MODEL for null", () => {
      expect(resolveModel(null)).toBe(DEFAULT_MODEL);
    });

    it("returns DEFAULT_MODEL for empty string", () => {
      expect(resolveModel("")).toBe(DEFAULT_MODEL);
    });

    it("returns DEFAULT_MODEL for an invalid model id", () => {
      expect(resolveModel("gpt-4o")).toBe(DEFAULT_MODEL);
      expect(resolveModel("not-a-model")).toBe(DEFAULT_MODEL);
    });
  });

  describe("getUserPreferredModel", () => {
    function createMockDb(preferredModel: string | null = null) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "from", "where"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve([{ preferredModel }]).then(resolve);
      return chain as unknown as { select: Function };
    }

    it("returns the user's stored preference when valid", async () => {
      const db = createMockDb("claude-opus-4-20250514");
      const result = await getUserPreferredModel(db, "user-1");
      expect(result).toBe("claude-opus-4-20250514");
    });

    it("returns DEFAULT_MODEL when preference is null", async () => {
      const db = createMockDb(null);
      const result = await getUserPreferredModel(db, "user-1");
      expect(result).toBe(DEFAULT_MODEL);
    });

    it("returns DEFAULT_MODEL when preference is invalid", async () => {
      const db = createMockDb("gpt-4o");
      const result = await getUserPreferredModel(db, "user-1");
      expect(result).toBe(DEFAULT_MODEL);
    });

    it("returns DEFAULT_MODEL when user not found", async () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "from", "where"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      // Empty result set — user doesn't exist
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve([]).then(resolve);
      const db = chain as unknown as { select: Function };

      const result = await getUserPreferredModel(db, "nonexistent");
      expect(result).toBe(DEFAULT_MODEL);
    });
  });

  describe("calculateCost", () => {
    it("calculates cost for claude-sonnet-4 correctly", () => {
      // 1000 input + 500 output: (1000/1M)*$3 + (500/1M)*$15 = $0.0105
      // $0.0105 * 100 cents * 10000 microcents = 10500 microcents
      expect(calculateCost("claude-sonnet-4-20250514", 1000, 500)).toBe(10500);
    });

    it("calculates cost for claude-opus-4-6 correctly", () => {
      // (1000/1M)*$5 + (500/1M)*$25 = $0.0175 = 17500 microcents
      expect(calculateCost("claude-opus-4-6", 1000, 500)).toBe(17500);
    });

    it("calculates cost for claude-haiku-4.5 correctly", () => {
      // (10000/1M)*$1 + (2000/1M)*$5 = $0.02 = 20000 microcents
      expect(calculateCost("claude-haiku-4-5-20251001", 10000, 2000)).toBe(20000);
    });

    it("returns 0 for unknown model", () => {
      expect(calculateCost("unknown-model", 1000, 500)).toBe(0);
    });

    it("returns 0 for zero tokens", () => {
      expect(calculateCost("claude-sonnet-4-20250514", 0, 0)).toBe(0);
    });

    it("handles large token counts", () => {
      // 1M input + 1M output on sonnet: (1M/1M)*$3 + (1M/1M)*$15 = $18
      // $18 * 100 * 10000 = 18,000,000 microcents
      expect(calculateCost("claude-sonnet-4-20250514", 1_000_000, 1_000_000)).toBe(18_000_000);
    });

    it("has pricing for all available models", () => {
      for (const m of AVAILABLE_MODELS) {
        expect(MODEL_PRICING[m.id]).toBeDefined();
        expect(MODEL_PRICING[m.id].inputPerMTok).toBeGreaterThan(0);
        expect(MODEL_PRICING[m.id].outputPerMTok).toBeGreaterThan(0);
      }
    });
  });
});
