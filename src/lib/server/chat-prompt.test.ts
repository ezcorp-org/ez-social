import { describe, it, expect } from "vitest";
import { buildChatSystemPrompt } from "./chat-prompt";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseContext() {
  return {
    post: {
      url: "https://x.com/user/status/123",
      platform: "twitter" as string | null,
      postContent: "This is the original post content",
      postAuthor: "testuser",
    },
    persona: { name: "TestPersona" },
    voiceProfile: null as { extractedProfile: unknown; manualEdits: unknown } | null,
    platformVoiceProfile: undefined as
      | { extractedProfile: unknown; manualEdits: unknown; platform: string }
      | null
      | undefined,
  };
}

function newSchemaProfile() {
  return {
    voiceDNA: ["Short punchy sentences", "Opens with rhetorical questions"],
    dimensions: {
      structure: [
        { pattern: "1-2 sentence paragraphs", signal: "embedded", evidence: "Found in 5/6 types" },
      ],
      grammar: [
        { pattern: "No exclamation marks", signal: "consistent", evidence: "Absent across all samples" },
      ],
      vocabulary: [
        { pattern: "Tech jargon mixed with slang", signal: "contextual", evidence: "In replies only" },
      ],
      rhetoric: [
        { pattern: "Builds via analogy", signal: "embedded", evidence: "4/5 original takes" },
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

function legacyProfile() {
  return {
    summary: "A concise writing style",
    tone: { primary: "casual", formality: "informal" },
    vocabulary: { level: "moderate", favorites: [], avoids: [], jargon: [] },
    sentenceStructure: { averageLength: "short", complexity: "simple", patterns: [] },
    quirks: [],
    rhetoric: { persuasionStyle: "analogy", transitions: [], openingStyle: "question", closingStyle: "CTA" },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildChatSystemPrompt", () => {
  // ── Basic structure ──

  it("includes role definition", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("social media reply assistant");
  });

  it("includes persona name when provided", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain('persona "TestPersona"');
  });

  it("omits persona reference when persona is null", () => {
    const ctx = { ...baseContext(), persona: null };
    const prompt = buildChatSystemPrompt(ctx);
    expect(prompt).not.toContain("persona");
  });

  // ── Original post ──

  it("includes post URL", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("https://x.com/user/status/123");
  });

  it("includes post content", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("This is the original post content");
  });

  it("includes post author", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("testuser");
  });

  it("includes platform", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("Platform: twitter");
  });

  // ── Reply rules ──

  it("includes reply rules section", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("## Reply Rules");
  });

  it("includes value-add requirement", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("Value-Add Requirement");
    expect(prompt).toContain("specific data point");
  });

  it("includes anti-patterns", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("Anti-Patterns");
    expect(prompt).toContain('"Great post!"');
    expect(prompt).toContain('"This."');
    expect(prompt).toContain('"100%"');
  });

  it("includes reply templates", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("Value-add");
    expect(prompt).toContain("Respectful disagreement");
    expect(prompt).toContain("Sharp follow-up");
  });

  it("includes validation checklist", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("Validation Checklist");
    expect(prompt).toContain("real person, not a brand");
  });

  // ── Draft format ──

  it("includes draft format instructions", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("<draft>");
    expect(prompt).toContain("</draft>");
  });

  // ── Voice profile: new schema ──

  it("formats new schema voice profile as readable text", () => {
    const ctx = baseContext();
    ctx.voiceProfile = {
      extractedProfile: newSchemaProfile(),
      manualEdits: null,
    };

    const prompt = buildChatSystemPrompt(ctx);

    // Should contain Voice DNA section
    expect(prompt).toContain("Voice DNA");
    expect(prompt).toContain("Short punchy sentences");
    expect(prompt).toContain("Opens with rhetorical questions");

    // Should contain dimension patterns with signal labels
    expect(prompt).toContain("[CORE]");
    expect(prompt).toContain("[STRONG]");
    expect(prompt).toContain("[SITUATIONAL]");
    expect(prompt).toContain("1-2 sentence paragraphs");

    // Should contain content mode shifts
    expect(prompt).toContain("Content Mode Shifts");
    expect(prompt).toContain("reply");

    // Should contain voice guardrails
    expect(prompt).toContain("Voice Guardrails");
    expect(prompt).toContain("Punchy openings");
    expect(prompt).toContain("Overusing em-dashes");

    // Should NOT contain raw JSON
    expect(prompt).not.toContain('"voiceDNA"');
  });

  // ── Voice profile: legacy schema ──

  it("falls back to JSON for legacy schema profiles", () => {
    const ctx = baseContext();
    ctx.voiceProfile = {
      extractedProfile: legacyProfile(),
      manualEdits: null,
    };

    const prompt = buildChatSystemPrompt(ctx);

    // Legacy profiles get JSON-dumped
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain("A concise writing style");
  });

  // ── Voice profile: manual edits ──

  it("merges manual edits over extracted profile", () => {
    const ctx = baseContext();
    const profile = newSchemaProfile();
    ctx.voiceProfile = {
      extractedProfile: profile,
      manualEdits: {
        voiceDNA: ["Overridden voice DNA"],
      },
    };

    const prompt = buildChatSystemPrompt(ctx);
    expect(prompt).toContain("Overridden voice DNA");
  });

  // ── Voice profile: platform override ──

  it("uses platform voice profile when available", () => {
    const ctx = baseContext();
    const baseProfile = newSchemaProfile();
    const platformProfile = {
      ...newSchemaProfile(),
      voiceDNA: ["Platform-specific pattern"],
    };

    ctx.voiceProfile = {
      extractedProfile: baseProfile,
      manualEdits: null,
    };
    ctx.platformVoiceProfile = {
      extractedProfile: platformProfile,
      manualEdits: null,
      platform: "twitter",
    };

    const prompt = buildChatSystemPrompt(ctx);
    expect(prompt).toContain("Platform-specific pattern");
    expect(prompt).toContain("twitter-specific voice profile");
  });

  // ── No voice profile ──

  it("omits voice profile section when no profile exists", () => {
    const ctx = baseContext();
    ctx.voiceProfile = null;

    const prompt = buildChatSystemPrompt(ctx);
    expect(prompt).not.toContain("## Voice Profile");
  });

  // ── Platform hint ──

  it("includes platform-appropriate length hint for twitter", () => {
    const prompt = buildChatSystemPrompt(baseContext());
    expect(prompt).toContain("concise for Twitter/X");
  });

  it("uses generic hint when platform is null", () => {
    const ctx = baseContext();
    ctx.post.platform = null;

    const prompt = buildChatSystemPrompt(ctx);
    expect(prompt).toContain("concise and appropriate for the platform");
  });
});
