import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — vi.mock calls are hoisted, so factories must not reference
// variables declared in the same file. Use vi.fn() inline instead.
// ---------------------------------------------------------------------------

vi.mock("$env/dynamic/private", () => ({
  env: { DATABASE_URL: "test" },
}));

vi.mock("$lib/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("$lib/server/services/chat", () => ({
  createChatService: vi.fn(() => ({
    getPostCosts: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("$lib/server/services/queue", () => ({
  createPostFromUrl: vi.fn(),
  createQueueService: vi.fn(() => ({})),
}));

vi.mock("$lib/server/services", () => ({
  getServices: vi.fn().mockResolvedValue({
    queue: {},
    persona: {},
    chat: { getPostCosts: vi.fn().mockResolvedValue({}) },
    browser: undefined,
  }),
}));

// Import after mocks are set up
import { actions } from "./+page.server";
import { createPostFromUrl } from "$lib/server/services/queue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

function makeEvent(formData: FormData, userId: string | null = "user-1") {
  return {
    request: {
      formData: vi.fn().mockResolvedValue(formData),
    },
    locals: {
      auth: vi.fn().mockResolvedValue(
        userId ? { user: { id: userId } } : null,
      ),
    },
    platform: { env: { DATABASE_URL: "test" } },
    url: new URL("http://localhost/?status=all"),
  } as any;
}

const mockCreatePostFromUrl = createPostFromUrl as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("addPost action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes personaId from form data to createPostFromUrl", async () => {
    mockCreatePostFromUrl.mockResolvedValue({
      post: { id: "post-1" },
      scrapeResult: { content: "text", author: "a" },
    });

    const fd = makeFormData({
      url: "https://twitter.com/user/status/123",
      personaId: "my-persona-id",
    });

    await actions.addPost(makeEvent(fd));

    expect(mockCreatePostFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: "my-persona-id" }),
    );
  });

  it("passes null personaId when not provided in form data", async () => {
    mockCreatePostFromUrl.mockResolvedValue({
      post: { id: "post-1" },
      scrapeResult: { content: "text", author: "a" },
    });

    const fd = makeFormData({
      url: "https://twitter.com/user/status/123",
    });

    await actions.addPost(makeEvent(fd));

    expect(mockCreatePostFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: null }),
    );
  });

  it("passes null personaId when form sends empty string", async () => {
    mockCreatePostFromUrl.mockResolvedValue({
      post: { id: "post-1" },
      scrapeResult: { content: "text", author: "a" },
    });

    const fd = makeFormData({
      url: "https://twitter.com/user/status/123",
      personaId: "",
    });

    await actions.addPost(makeEvent(fd));

    expect(mockCreatePostFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: null }),
    );
  });

  it("returns postId on successful scrape", async () => {
    mockCreatePostFromUrl.mockResolvedValue({
      post: { id: "post-42" },
      scrapeResult: { content: "text", author: null },
    });

    const fd = makeFormData({
      url: "https://example.com/article",
      personaId: "p1",
    });

    const result = await actions.addPost(makeEvent(fd));

    expect(result).toEqual({ success: true, postId: "post-42" });
  });

  it("returns needsContent when scrape fails", async () => {
    mockCreatePostFromUrl.mockResolvedValue({
      post: { id: "post-43" },
      scrapeResult: null,
    });

    const fd = makeFormData({
      url: "https://example.com/article",
      personaId: "p1",
    });

    const result = await actions.addPost(makeEvent(fd));

    expect(result).toEqual({ success: true, needsContent: true, postId: "post-43" });
  });

  it("returns 401 when not authenticated", async () => {
    const fd = makeFormData({ url: "https://example.com" });
    const result = await actions.addPost(makeEvent(fd, null));

    expect(result).toEqual(
      expect.objectContaining({ status: 401 }),
    );
  });

  it("returns 400 with 'Invalid URL' for bad URL", async () => {
    const fd = makeFormData({ url: "not-a-url" });
    const result = await actions.addPost(makeEvent(fd));

    expect(result).toEqual(
      expect.objectContaining({ status: 400, data: { error: "Invalid URL" } }),
    );
    expect(mockCreatePostFromUrl).not.toHaveBeenCalled();
  });

  it("forwards userId to createPostFromUrl", async () => {
    mockCreatePostFromUrl.mockResolvedValue({
      post: { id: "post-1" },
      scrapeResult: { content: "text", author: null },
    });

    const fd = makeFormData({ url: "https://example.com/post" });
    await actions.addPost(makeEvent(fd, "user-99"));

    expect(mockCreatePostFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-99" }),
    );
  });
});
