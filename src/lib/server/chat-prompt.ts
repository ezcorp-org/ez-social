/**
 * System prompt builder for the chat-based draft generation interface.
 * Pure function — no DB access. Assembles AI context from post + persona + voice data.
 */

import type { VoiceProfile, VoicePattern } from "$lib/schemas/voice-profile";

interface ChatPromptContext {
  post: {
    url: string;
    platform: string | null;
    postContent: string | null;
    postAuthor: string | null;
  };
  persona: { name: string; description?: string | null } | null;
  voiceProfile: {
    extractedProfile: unknown;
    manualEdits: unknown;
  } | null;
  platformVoiceProfile?: {
    extractedProfile: unknown;
    manualEdits: unknown;
    platform: string;
  } | null;
}

/** Deep-merge two objects, with `overrides` values taking precedence. */
function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides)) {
    const baseVal = base[key];
    const overVal = overrides[key];
    if (
      baseVal &&
      overVal &&
      typeof baseVal === "object" &&
      typeof overVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else {
      result[key] = overVal;
    }
  }
  return result;
}

const SIGNAL_LABEL: Record<string, string> = {
  embedded: "CORE",
  consistent: "STRONG",
  contextual: "SITUATIONAL",
};

/** Format dimension patterns into readable instructions. */
function formatDimension(name: string, patterns: VoicePattern[]): string {
  if (!patterns || patterns.length === 0) return "";
  const lines = patterns.map(
    (p) => `- [${SIGNAL_LABEL[p.signal] ?? p.signal}] ${p.pattern} (${p.evidence})`,
  );
  return `**${name}**:\n${lines.join("\n")}`;
}

/** Format voice profile as readable instructions instead of raw JSON. */
function formatVoiceProfile(profile: VoiceProfile): string {
  const sections: string[] = [];

  // Voice DNA — the headline patterns
  if (profile.voiceDNA?.length) {
    sections.push(
      `### Voice DNA (core identity)\n${profile.voiceDNA.map((d) => `- ${d}`).join("\n")}`,
    );
  }

  // 4-dimension breakdown
  if (profile.dimensions) {
    const dims = [
      formatDimension("Structure", profile.dimensions.structure),
      formatDimension("Grammar", profile.dimensions.grammar),
      formatDimension("Vocabulary", profile.dimensions.vocabulary),
      formatDimension("Rhetoric", profile.dimensions.rhetoric),
    ].filter(Boolean);
    if (dims.length > 0) {
      sections.push(`### Voice Patterns\n${dims.join("\n\n")}`);
    }
  }

  // Content modes
  if (profile.contentModes?.length) {
    const modes = profile.contentModes.map(
      (m) =>
        `- **${m.type}**: ${m.dominantPatterns.join(", ")}${m.distinctiveShifts ? ` — ${m.distinctiveShifts}` : ""}`,
    );
    sections.push(`### Content Mode Shifts\n${modes.join("\n")}`);
  }

  // Recommendations as guardrails
  if (profile.recommendations) {
    const rec = profile.recommendations;
    const parts: string[] = [];
    if (rec.leanInto?.length) {
      parts.push(`DO more of: ${rec.leanInto.join("; ")}`);
    }
    if (rec.watchOutFor?.length) {
      parts.push(`NEVER do: ${rec.watchOutFor.join("; ")}`);
    }
    if (parts.length) {
      sections.push(`### Voice Guardrails\n${parts.join("\n")}`);
    }
  }

  // Inconsistencies flagged for elimination → render as hard constraints
  if (profile.inconsistencies?.length) {
    const eliminations = profile.inconsistencies
      .filter((i) => /eliminat|remove|never|avoid|ban/i.test(i.assessment))
      .map((i) => `- ${i.description}`);
    if (eliminations.length) {
      sections.push(
        `### Hard Constraints (NEVER do these)\n${eliminations.join("\n")}`,
      );
    }
  }

  return sections.join("\n\n");
}

/** Detect whether a profile uses the new schema (has voiceDNA) or the old flat schema. */
function isNewSchema(profile: Record<string, unknown>): profile is VoiceProfile {
  return "voiceDNA" in profile && "dimensions" in profile;
}

const REPLY_RULES = `## Reply Rules

### Value-Add Requirement
Every reply MUST include at least one of:
- A specific data point, fact, or lived experience that extends the point
- A fresh angle or reframe the audience hasn't considered
- A practical insight, tip, or actionable takeaway
- A sharp follow-up question that advances the conversation

### Anti-Patterns (NEVER do these)
- "Great post!", "This.", "100%", "So true!", "Couldn't agree more"
- Pure agreement with no added value
- Restating what the original post already said
- Generic compliments or engagement farming
- Product pitching or self-promotion in replies

### Banned Words & Punctuation
NEVER use these in draft replies. They are telltale AI-isms that make replies sound fake:
- Words: "honestly", "frankly", "literally", "actually" (as filler), "utilize", "leverage", "delve", "tapestry", "landscape", "nuance", "robust", "streamline", "arguably", "essentially", "fundamentally"
- Phrases: "it's worth noting", "at the end of the day", "the reality is", "I think it's fair to say", "to be fair", "hot take:", "unpopular opinion:"
- Punctuation: em-dashes (—). Use commas, periods, or semicolons instead. NEVER use em-dashes.
- Formatting: Do not start replies with "I" unless the writer's voice profile specifically favors it

### Reply Format
- 1-3 sentences. Brevity is a feature.
- No hashtags in replies unless the writer's voice specifically uses them
- Platform-appropriate length (shorter for Twitter/X, can be longer for LinkedIn/Reddit)

### Reply Templates (choose the right one for context)
1. **Agree & extend**: Build on the point with a supporting example, data point, or related experience
2. **Fresh angle**: Offer a reframe or perspective the author/audience hasn't considered
3. **Lived experience**: Share a brief, relevant story that reinforces or nuances the point
4. **Sharp question**: Ask a specific question that deepens the conversation
5. **Quick win**: Share a concrete tip, tool, or resource the audience can use immediately

### Validation Checklist
Before outputting any draft reply, verify:
- Sounds like a real person, not a brand or bot
- Has "breathing room" -- not trying to say too much
- Free of engagement farming ("Who else thinks...", "Tag someone who...")
- Contains ZERO banned words/punctuation from the list above
- Passes the "would I actually post this?" test`;

interface VoiceContext {
  voiceProfile: { extractedProfile: unknown; manualEdits: unknown } | null;
  platformVoiceProfile?: {
    extractedProfile: unknown;
    manualEdits: unknown;
    platform: string;
  } | null;
}

/** Build voice profile section from voice + platform context. Shared by chat and humanize prompts. */
function buildVoiceSection(
  { voiceProfile, platformVoiceProfile }: VoiceContext,
  instruction: string,
): string | null {
  const activeVoice = platformVoiceProfile ?? voiceProfile;
  if (!activeVoice) return null;

  const extracted =
    (activeVoice.extractedProfile as Record<string, unknown>) ?? {};
  const edits =
    (activeVoice.manualEdits as Record<string, unknown>) ?? null;
  const merged = edits ? deepMerge(extracted, edits) : extracted;

  if (Object.keys(merged).length === 0) return null;

  const platformNote = platformVoiceProfile
    ? `\nUsing ${platformVoiceProfile.platform}-specific voice profile. Match this platform's style.`
    : "";

  const profileText = isNewSchema(merged)
    ? formatVoiceProfile(merged)
    : JSON.stringify(merged, null, 2);

  return `## Voice Profile\n${instruction}:\n\n${profileText}${platformNote}`;
}

export function buildChatSystemPrompt(context: ChatPromptContext): string {
  const { post, persona, voiceProfile, platformVoiceProfile } = context;

  const sections: string[] = [];

  // ── Role definition ──
  const personaIntro = persona
    ? ` in the voice of their persona "${persona.name}"${persona.description ? ` (${persona.description})` : ""}`
    : "";
  sections.push(
    `You are a social media reply assistant. You help the user craft authentic replies${personaIntro}. You can discuss the post, brainstorm angles, and generate draft replies when asked.`,
  );

  // ── Original post context ──
  const postParts: string[] = [`URL: ${post.url}`];
  if (post.platform) postParts.push(`Platform: ${post.platform}`);
  if (post.postAuthor) postParts.push(`Author: ${post.postAuthor}`);
  if (post.postContent) postParts.push(`Content:\n${post.postContent}`);

  sections.push(`## Original Post\n${postParts.join("\n")}`);

  // ── Voice profile ──
  const voiceSection = buildVoiceSection(
    { voiceProfile, platformVoiceProfile },
    "When generating draft replies, match these voice characteristics",
  );
  if (voiceSection) {
    sections.push(
      voiceSection +
        "\n\nUse this voice profile to shape the tone, vocabulary, sentence structure, and style of draft replies. When simply discussing the post (not drafting), converse naturally.",
    );
  }

  // ── Reply rules ──
  sections.push(REPLY_RULES);

  // ── Draft format instructions ──
  sections.push(
    `## Draft Format\nWhen the user asks for a draft reply or refinement, wrap the reply text in <draft>...</draft> markers. The content inside draft markers should contain ONLY the reply text — what would actually be posted. Outside of draft markers you can explain, discuss, or provide context.\n\nDo NOT include <draft> markers unless the user is asking for a draft or a refinement of a previous draft.`,
  );

  // ── Behavioral instructions ──
  const platformHint = post.platform
    ? `Keep drafts appropriate for ${post.platform} (e.g., concise for Twitter/X, longer for LinkedIn or Reddit).`
    : "Keep drafts concise and appropriate for the platform.";

  sections.push(
    `## Behavior\n- Be responsive to both discussion requests and draft requests — no rigid flow.\n- When asked to refine a draft ("make it shorter", "more casual"), generate a new <draft> block with the updated version.\n- ${platformHint}\n- When the user wants to explore angles or discuss the post, respond conversationally without draft markers.\n- Prioritize replies that make the original author want to respond back. Agreement with added value drives more engagement than contradiction.`,
  );

  return sections.join("\n\n");
}

// @ts-ignore — Vite ?raw import
import humanizerPromptRaw from "../../prompts/humanizer.prompt.md?raw";

/** Strip YAML frontmatter (--- ... ---) from markdown content. */
function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\s*/, "");
}

const baseHumanizerPrompt = stripFrontmatter(humanizerPromptRaw);

interface HumanizePromptContext {
  platform: string | null;
  personaName: string | null;
  voiceProfile: { extractedProfile: unknown; manualEdits: unknown } | null;
  platformVoiceProfile?: {
    extractedProfile: unknown;
    manualEdits: unknown;
    platform: string;
  } | null;
}

/**
 * Build system prompt for the humanize endpoint.
 * Combines the humanizer prompt with the user's voice profile and platform context
 * so the rewritten text sounds like *them*, not generic.
 */
export function buildHumanizeSystemPrompt(context: HumanizePromptContext): string {
  const sections: string[] = [baseHumanizerPrompt];

  // Voice profile — rewrite should match their voice, not just remove AI-isms
  const voiceSection = buildVoiceSection(
    { voiceProfile: context.voiceProfile, platformVoiceProfile: context.platformVoiceProfile },
    "After removing AI patterns, rewrite the text to match these voice characteristics",
  );
  if (voiceSection) {
    sections.push(voiceSection);
  }

  // Platform context
  if (context.platform) {
    sections.push(
      `## Platform Context\nThis text is for ${context.platform}. Keep the tone and length appropriate for this platform.`,
    );
  }

  // Persona hint
  if (context.personaName) {
    sections.push(
      `## Persona\nThe writer's persona is "${context.personaName}". The rewritten text should sound like this person.`,
    );
  }

  return sections.join("\n\n");
}
