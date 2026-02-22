import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockDraftService = {
  saveFeedback: vi.fn(),
  saveEdit: vi.fn(),
};

const mockQueueService = {
  updateStatus: vi.fn(),
};

vi.mock("$lib/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("$lib/server/services/draft", () => ({
  createDraftService: vi.fn(() => mockDraftService),
}));

vi.mock("$lib/server/services/queue", () => ({
  createQueueService: vi.fn(() => mockQueueService),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/queue/post-1/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeLocals(userId: string | null = "user-1") {
  return {
    auth: vi.fn().mockResolvedValue(
      userId ? { user: { id: userId } } : null,
    ),
  };
}

function callPOST(body: unknown, userId: string | null = "user-1") {
  return POST({
    request: makeRequest(body),
    params: { id: "post-1" },
    locals: makeLocals(userId),
    platform: { env: { DATABASE_URL: "test" } },
  } as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /queue/[id]/drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftService.saveFeedback.mockResolvedValue({ id: "fb-1" });
    mockDraftService.saveEdit.mockResolvedValue({ id: "edit-1", messageId: "msg-1" });
    mockQueueService.updateStatus.mockResolvedValue({ id: "post-1", status: "complete" });
  });

  // ── Auth ──────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    const res = await callPOST({ type: "feedback" }, null);
    expect(res.status).toBe(401);
  });

  // ── Invalid JSON ──────────────────────────────────────────────────

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST({
      request: new Request("http://localhost/queue/post-1/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      params: { id: "post-1" },
      locals: makeLocals(),
      platform: { env: { DATABASE_URL: "test" } },
    } as any);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid JSON");
  });

  // ── Feedback: accepted (copy) ─────────────────────────────────────

  describe("feedback type=accepted (copy draft)", () => {
    const feedbackBody = {
      type: "feedback",
      messageId: "msg-1",
      personaId: "persona-1",
      action: "accepted",
      draftText: "Here is the draft text",
    };

    it("saves feedback and returns 201", async () => {
      const res = await callPOST(feedbackBody);

      expect(res.status).toBe(201);
      expect(mockDraftService.saveFeedback).toHaveBeenCalledWith({
        postId: "post-1",
        messageId: "msg-1",
        personaId: "persona-1",
        action: "accepted",
        draftText: "Here is the draft text",
        editedText: undefined,
      });
    });

    it("marks post as complete when action is accepted", async () => {
      await callPOST(feedbackBody);

      expect(mockQueueService.updateStatus).toHaveBeenCalledWith(
        "user-1",
        "post-1",
        "complete",
      );
    });

    it("does not mark complete when action is edited", async () => {
      await callPOST({ ...feedbackBody, action: "edited" });

      expect(mockQueueService.updateStatus).not.toHaveBeenCalled();
    });

    it("handles null personaId", async () => {
      await callPOST({ ...feedbackBody, personaId: null });

      expect(mockDraftService.saveFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ personaId: null }),
      );
    });
  });

  // ── Feedback validation ───────────────────────────────────────────

  describe("feedback validation", () => {
    it("returns 400 when messageId is missing", async () => {
      const res = await callPOST({
        type: "feedback",
        action: "accepted",
        draftText: "text",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when action is missing", async () => {
      const res = await callPOST({
        type: "feedback",
        messageId: "msg-1",
        draftText: "text",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when draftText is missing", async () => {
      const res = await callPOST({
        type: "feedback",
        messageId: "msg-1",
        action: "accepted",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid action value", async () => {
      const res = await callPOST({
        type: "feedback",
        messageId: "msg-1",
        action: "rejected",
        draftText: "text",
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("action must be 'accepted' or 'edited'");
    });
  });

  // ── Feedback error handling ───────────────────────────────────────

  it("returns 500 when saveFeedback throws", async () => {
    mockDraftService.saveFeedback.mockRejectedValue(new Error("DB error"));

    const res = await callPOST({
      type: "feedback",
      messageId: "msg-1",
      action: "accepted",
      draftText: "text",
    });

    expect(res.status).toBe(500);
  });

  // ── Draft edit ────────────────────────────────────────────────────

  describe("draft edit", () => {
    const editBody = {
      messageId: "msg-1",
      originalText: "Original text",
      editedText: "Modified text",
      personaId: "persona-1",
    };

    it("saves edit and returns 201 with edit data", async () => {
      const res = await callPOST(editBody);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.edit).toBeDefined();
      expect(mockDraftService.saveEdit).toHaveBeenCalledWith({
        messageId: "msg-1",
        postId: "post-1",
        originalText: "Original text",
        editedText: "Modified text",
      });
    });

    it("also saves edited feedback for voice learning", async () => {
      await callPOST(editBody);

      expect(mockDraftService.saveFeedback).toHaveBeenCalledWith({
        postId: "post-1",
        messageId: "msg-1",
        personaId: "persona-1",
        action: "edited",
        draftText: "Original text",
        editedText: "Modified text",
      });
    });

    it("handles null personaId in edit path", async () => {
      await callPOST({ ...editBody, personaId: null });

      expect(mockDraftService.saveFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ personaId: null }),
      );
    });
  });

  // ── Edit validation ───────────────────────────────────────────────

  describe("edit validation", () => {
    it("returns 400 when messageId is missing", async () => {
      const res = await callPOST({
        originalText: "a",
        editedText: "b",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when originalText is missing", async () => {
      const res = await callPOST({
        messageId: "msg-1",
        editedText: "b",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when editedText is missing", async () => {
      const res = await callPOST({
        messageId: "msg-1",
        originalText: "a",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when originalText equals editedText", async () => {
      const res = await callPOST({
        messageId: "msg-1",
        originalText: "same",
        editedText: "same",
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("editedText must differ from originalText");
    });
  });

  // ── Edit error handling ───────────────────────────────────────────

  it("returns 500 when saveEdit throws", async () => {
    mockDraftService.saveEdit.mockRejectedValue(new Error("DB error"));

    const res = await callPOST({
      messageId: "msg-1",
      originalText: "a",
      editedText: "b",
    });

    expect(res.status).toBe(500);
  });
});
