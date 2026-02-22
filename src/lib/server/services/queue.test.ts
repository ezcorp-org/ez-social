import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueueService, createPostFromUrl } from "./queue";

// ---------------------------------------------------------------------------
// Module mocks for createPostFromUrl deps (static imports in queue.ts)
// ---------------------------------------------------------------------------

vi.mock("$lib/utils/platform", () => ({
  detectPlatform: vi.fn(),
}));
vi.mock("$lib/server/services/scraper", () => ({
  scrapeUrl: vi.fn(),
}));

import { detectPlatform } from "$lib/utils/platform";
import { scrapeUrl } from "$lib/server/services/scraper";

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

  return {
    db: chain as unknown as Parameters<typeof createQueueService>[0],
    setResults,
    chain,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: "post1",
    userId: "u1",
    url: "https://example.com/post",
    platform: "twitter",
    postContent: "Some content",
    postAuthor: "author",
    personaId: null,
    status: "new",
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("queueService", () => {
  let db: ReturnType<typeof createMockDb>["db"];
  let setResults: ReturnType<typeof createMockDb>["setResults"];
  let service: ReturnType<typeof createQueueService>;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    setResults = mock.setResults;
    service = createQueueService(db);
  });

  describe("updateStatus", () => {
    it("sets status correctly and returns updated post", async () => {
      const updated = makePost({ status: "complete", updatedAt: new Date() });
      setResults([updated]);

      const result = await service.updateStatus("u1", "post1", "complete");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("complete");
      expect(db.update).toHaveBeenCalled();
      expect(db.set).toHaveBeenCalled();
    });

    it("returns null when postId does not exist", async () => {
      setResults([]);

      const result = await service.updateStatus("u1", "nonexistent", "complete");

      expect(result).toBeNull();
    });

    it("returns null for wrong userId (ownership check)", async () => {
      // DB returns no rows when userId doesn't match the WHERE clause
      setResults([]);

      const result = await service.updateStatus("wrong-user", "post1", "complete");

      expect(result).toBeNull();
    });

    it("updates the updatedAt timestamp", async () => {
      const now = new Date();
      const updated = makePost({ status: "in_progress", updatedAt: now });
      setResults([updated]);

      const result = await service.updateStatus("u1", "post1", "in_progress");

      expect(result).not.toBeNull();
      // Verify set was called (which includes updatedAt: new Date())
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "in_progress",
          updatedAt: expect.any(Date),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// createPostFromUrl
// ---------------------------------------------------------------------------

describe("createPostFromUrl", () => {
  const mockQueue = {
    addPost: vi.fn(),
    findPersonaByPlatform: vi.fn(),
  };
  const mockPersona = {
    getDefault: vi.fn(),
  };
  const mockBrowser = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function callCreatePost(url = "https://twitter.com/user/status/123") {
    return createPostFromUrl({
      queue: mockQueue as any,
      persona: mockPersona as any,
      browser: mockBrowser,
      userId: "u1",
      url,
    });
  }

  it("creates post with platform-matched persona and successful scrape", async () => {
    vi.mocked(detectPlatform).mockReturnValue("twitter");
    vi.mocked(scrapeUrl).mockResolvedValue({ content: "Hello world", author: "author1" });
    mockQueue.findPersonaByPlatform.mockResolvedValue({ id: "persona-twitter" });
    mockQueue.addPost.mockResolvedValue(makePost({ personaId: "persona-twitter" }));

    const result = await callCreatePost();

    expect(detectPlatform).toHaveBeenCalledWith("https://twitter.com/user/status/123");
    expect(mockQueue.findPersonaByPlatform).toHaveBeenCalledWith("u1", "twitter");
    expect(mockPersona.getDefault).not.toHaveBeenCalled();
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1", {
      url: "https://twitter.com/user/status/123",
      platform: "twitter",
      personaId: "persona-twitter",
      postContent: "Hello world",
      postAuthor: "author1",
    });
    expect(result.scrapeResult).toEqual({ content: "Hello world", author: "author1" });
  });

  it("falls back to default persona when no platform match", async () => {
    vi.mocked(detectPlatform).mockReturnValue(null);
    vi.mocked(scrapeUrl).mockResolvedValue({ content: "content", author: null });
    mockPersona.getDefault.mockResolvedValue({ id: "default-persona" });
    mockQueue.addPost.mockResolvedValue(makePost({ personaId: "default-persona" }));

    await callCreatePost("https://example.com/article");

    expect(mockQueue.findPersonaByPlatform).not.toHaveBeenCalled();
    expect(mockPersona.getDefault).toHaveBeenCalledWith("u1");
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ personaId: "default-persona" }),
    );
  });

  it("falls back to default persona when platform has no matching persona", async () => {
    vi.mocked(detectPlatform).mockReturnValue("twitter");
    vi.mocked(scrapeUrl).mockResolvedValue({ content: "content", author: null });
    mockQueue.findPersonaByPlatform.mockResolvedValue(null);
    mockPersona.getDefault.mockResolvedValue({ id: "default-persona" });
    mockQueue.addPost.mockResolvedValue(makePost({ personaId: "default-persona" }));

    await callCreatePost();

    expect(mockQueue.findPersonaByPlatform).toHaveBeenCalledWith("u1", "twitter");
    expect(mockPersona.getDefault).toHaveBeenCalledWith("u1");
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ personaId: "default-persona" }),
    );
  });

  it("retries scrape once on failure", async () => {
    vi.mocked(detectPlatform).mockReturnValue(null);
    vi.mocked(scrapeUrl)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ content: "retry content", author: "a" });
    mockPersona.getDefault.mockResolvedValue({ id: "p1" });
    mockQueue.addPost.mockResolvedValue(makePost());

    const result = await callCreatePost();

    expect(scrapeUrl).toHaveBeenCalledTimes(2);
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ postContent: "retry content", postAuthor: "a" }),
    );
    expect(result.scrapeResult).toEqual({ content: "retry content", author: "a" });
  });

  it("returns null scrapeResult when both scrape attempts fail", async () => {
    vi.mocked(detectPlatform).mockReturnValue(null);
    vi.mocked(scrapeUrl).mockResolvedValue(null);
    mockPersona.getDefault.mockResolvedValue({ id: "p1" });
    mockQueue.addPost.mockResolvedValue(makePost());

    const result = await callCreatePost();

    expect(scrapeUrl).toHaveBeenCalledTimes(2);
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ postContent: null, postAuthor: null }),
    );
    expect(result.scrapeResult).toBeNull();
  });

  it("sets personaId to null when no persona found at all", async () => {
    vi.mocked(detectPlatform).mockReturnValue(null);
    vi.mocked(scrapeUrl).mockResolvedValue({ content: "c", author: null });
    mockPersona.getDefault.mockResolvedValue(null);
    mockQueue.addPost.mockResolvedValue(makePost());

    await callCreatePost();

    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ personaId: null }),
    );
  });

  it("uses explicit personaId and skips platform matching", async () => {
    (detectPlatform as ReturnType<typeof vi.fn>).mockReturnValue("twitter");
    (scrapeUrl as ReturnType<typeof vi.fn>).mockResolvedValue({ content: "content", author: null });
    mockQueue.addPost.mockResolvedValue(makePost({ personaId: "explicit-persona" }));

    await createPostFromUrl({
      queue: mockQueue as any,
      persona: mockPersona as any,
      browser: mockBrowser,
      userId: "u1",
      url: "https://twitter.com/user/status/123",
      personaId: "explicit-persona",
    } as any);

    expect(mockQueue.findPersonaByPlatform).not.toHaveBeenCalled();
    expect(mockPersona.getDefault).not.toHaveBeenCalled();
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ personaId: "explicit-persona" }),
    );
  });

  it("uses explicit personaId even when no platform detected", async () => {
    (detectPlatform as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (scrapeUrl as ReturnType<typeof vi.fn>).mockResolvedValue({ content: "content", author: null });
    mockQueue.addPost.mockResolvedValue(makePost({ personaId: "chosen-persona" }));

    await createPostFromUrl({
      queue: mockQueue as any,
      persona: mockPersona as any,
      browser: mockBrowser,
      userId: "u1",
      url: "https://example.com/article",
      personaId: "chosen-persona",
    } as any);

    expect(mockPersona.getDefault).not.toHaveBeenCalled();
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ personaId: "chosen-persona" }),
    );
  });

  it("falls back to platform matching when personaId is null", async () => {
    (detectPlatform as ReturnType<typeof vi.fn>).mockReturnValue("twitter");
    (scrapeUrl as ReturnType<typeof vi.fn>).mockResolvedValue({ content: "content", author: null });
    mockQueue.findPersonaByPlatform.mockResolvedValue({ id: "twitter-persona" });
    mockQueue.addPost.mockResolvedValue(makePost({ personaId: "twitter-persona" }));

    await createPostFromUrl({
      queue: mockQueue as any,
      persona: mockPersona as any,
      browser: mockBrowser,
      userId: "u1",
      url: "https://twitter.com/user/status/123",
      personaId: null,
    } as any);

    expect(mockQueue.findPersonaByPlatform).toHaveBeenCalledWith("u1", "twitter");
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ personaId: "twitter-persona" }),
    );
  });

  it("falls back to platform matching when personaId is undefined", async () => {
    (detectPlatform as ReturnType<typeof vi.fn>).mockReturnValue("twitter");
    (scrapeUrl as ReturnType<typeof vi.fn>).mockResolvedValue({ content: "content", author: null });
    mockQueue.findPersonaByPlatform.mockResolvedValue({ id: "twitter-persona" });
    mockQueue.addPost.mockResolvedValue(makePost({ personaId: "twitter-persona" }));

    await callCreatePost();

    expect(mockQueue.findPersonaByPlatform).toHaveBeenCalledWith("u1", "twitter");
    expect(mockQueue.addPost).toHaveBeenCalledWith("u1",
      expect.objectContaining({ personaId: "twitter-persona" }),
    );
  });
});
