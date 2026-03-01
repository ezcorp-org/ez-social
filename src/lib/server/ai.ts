import { createAnthropic } from "@ai-sdk/anthropic";
import { env } from "$env/dynamic/private";
import type { LanguageModel } from "ai";

/**
 * Canned voice profile that satisfies voiceProfileSchema.
 * Used by the mock model when the prompt mentions "writing samples" or "voice".
 */
const MOCK_VOICE_PROFILE = JSON.stringify({
  voiceDNA: [
    "Short punchy sentences under 15 words",
    "Sarcastic asides in parentheses",
  ],
  dimensions: {
    structure: [
      {
        pattern: "Short punchy paragraphs",
        signal: "embedded",
        evidence: "80% of samples use 1-2 sentence paragraphs",
      },
    ],
    grammar: [
      {
        pattern: "Liberal use of em-dashes",
        signal: "consistent",
        evidence: "Found in 4 out of 6 samples",
      },
    ],
    vocabulary: [
      {
        pattern: "Heavy sarcasm markers",
        signal: "embedded",
        evidence: "Every other sentence",
      },
    ],
    rhetoric: [
      {
        pattern: "Leads with hot take, then softens",
        signal: "contextual",
        evidence: "Present in 2 of 3 openers",
      },
    ],
  },
  contentModes: [
    {
      type: "original take",
      dominantPatterns: ["Rhetorical opener"],
      distinctiveShifts: "More assertive",
      exampleQuote: "Why?",
    },
  ],
  inconsistencies: [],
  recommendations: {
    leanInto: ["Sarcastic asides"],
    watchOutFor: ["Overusing questions"],
    develop: ["Long-form"],
  },
  consistencyScore: {
    rating: "moderately-consistent",
    summary: "Strong structural voice with sarcastic edge.",
  },
});

/**
 * Canned calibration response: array of {topic, reply} objects.
 */
const MOCK_CALIBRATION = JSON.stringify([
  {
    topic: "AI hype",
    reply: "Hot take: most AI demos are just fancy autocomplete.",
  },
  {
    topic: "Remote work",
    reply: "Offices exist so managers can see you look busy.",
  },
  {
    topic: "Startup culture",
    reply: "Move fast and break things — mainly your sleep schedule.",
  },
]);

/**
 * Canned chat response with a draft tag.
 */
const MOCK_CHAT_RESPONSE =
  "Here's a draft reply:\n\n<draft>This is a mock AI-generated reply for testing purposes. It demonstrates the draft format without burning real API tokens.</draft>";

/**
 * Extract text from the V3 prompt array for response routing.
 */
function extractPromptText(
  prompt: Array<{ role: string; content: unknown }>,
): { system: string; user: string } {
  let system = "";
  let user = "";
  for (const msg of prompt) {
    if (typeof msg.content === "string") {
      if (msg.role === "system") system = msg.content;
      else user = msg.content;
    } else if (Array.isArray(msg.content)) {
      const texts = msg.content
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { type: string; text?: string }) => p.text ?? "")
        .join(" ");
      if (msg.role === "system") system = texts;
      else user += " " + texts;
    }
  }
  return { system, user };
}

/**
 * Detect what kind of response to return based on the prompt/system content.
 */
/**
 * Canned humanized text for the humanizer endpoint mock.
 */
const MOCK_HUMANIZED_TEXT =
  "This is a humanized version of the draft. The AI patterns have been removed and it reads more naturally now.";

function pickMockResponse(system: string, user: string): string {
  const combined = `${system} ${user}`.toLowerCase();
  if (combined.includes("humanize") || combined.includes("ai writing patterns") || combined.includes("remove ai writing")) {
    return MOCK_HUMANIZED_TEXT;
  }
  if (combined.includes("voice") || combined.includes("writing samples")) {
    return MOCK_VOICE_PROFILE;
  }
  if (combined.includes("calibrat") || combined.includes("sample replies")) {
    return MOCK_CALIBRATION;
  }
  return MOCK_CHAT_RESPONSE;
}

const FINISH_REASON = { type: "stop" as const, unified: "stop" as const };
const MOCK_USAGE = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };

/**
 * Build a mock LanguageModel (V3 spec) that returns canned responses.
 * Supports both doGenerate and doStream for compatibility with
 * streamText, generateText, and structured output modes.
 */
function createMockModel(): LanguageModel {
  return {
    specificationVersion: "v3",
    provider: "mock",
    modelId: "mock-model",
    defaultObjectGenerationMode: "json",

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doGenerate: async (options: any) => {
      const { system, user } = extractPromptText(options.prompt);
      const text = pickMockResponse(system, user);
      return {
        text,
        content: [{ type: "text", text }],
        finishReason: FINISH_REASON,
        usage: MOCK_USAGE,
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doStream: async (options: any) => {
      const { system, user } = extractPromptText(options.prompt);
      const text = pickMockResponse(system, user);
      const textId = "mock-text-0";

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start" as const, id: textId });
          controller.enqueue({
            type: "text-delta" as const,
            id: textId,
            delta: text,
          });
          controller.enqueue({ type: "text-end" as const, id: textId });
          controller.enqueue({
            type: "finish" as const,
            finishReason: FINISH_REASON,
            usage: MOCK_USAGE,
          });
          controller.close();
        },
      });

      return {
        stream,
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/**
 * Returns an AI model instance. When MOCK_AI=true, returns a mock that
 * produces canned responses (no API calls). Otherwise returns the real
 * Anthropic model.
 */
export function getAIModel(apiKey: string, modelId: string): LanguageModel {
  if (env.MOCK_AI === "true") {
    return createMockModel();
  }
  const anthropic = createAnthropic({ apiKey });
  return anthropic(modelId);
}
