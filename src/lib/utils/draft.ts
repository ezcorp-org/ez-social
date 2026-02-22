export type DraftSegment =
  | { type: "text"; content: string }
  | { type: "draft"; content: string };

/**
 * Parse `<draft>...</draft>` blocks from an AI response, returning an
 * array of text and draft segments in document order.
 */
export function parseDraftBlocks(text: string): DraftSegment[] {
  const segments: DraftSegment[] = [];
  const regex = /<draft>([\s\S]*?)<\/draft>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "draft", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}
