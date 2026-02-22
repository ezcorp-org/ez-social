import { describe, it, expect } from "vitest";
import { parseDraftBlocks } from "./draft";

describe("parseDraftBlocks", () => {
  it("returns a single text segment when no drafts present", () => {
    const result = parseDraftBlocks("Hello, this is plain text.");
    expect(result).toEqual([{ type: "text", content: "Hello, this is plain text." }]);
  });

  it("returns empty array for empty string", () => {
    expect(parseDraftBlocks("")).toEqual([]);
  });

  it("parses a single draft block", () => {
    const result = parseDraftBlocks("<draft>My draft reply</draft>");
    expect(result).toEqual([{ type: "draft", content: "My draft reply" }]);
  });

  it("trims whitespace inside draft tags", () => {
    const result = parseDraftBlocks("<draft>  spaced out  </draft>");
    expect(result).toEqual([{ type: "draft", content: "spaced out" }]);
  });

  it("parses text before and after a draft block", () => {
    const input = "Here is some context.\n<draft>The reply</draft>\nDoes this look good?";
    const result = parseDraftBlocks(input);

    expect(result).toEqual([
      { type: "text", content: "Here is some context.\n" },
      { type: "draft", content: "The reply" },
      { type: "text", content: "\nDoes this look good?" },
    ]);
  });

  it("parses multiple draft blocks", () => {
    const input = "Option A:\n<draft>First option</draft>\nOption B:\n<draft>Second option</draft>";
    const result = parseDraftBlocks(input);

    expect(result).toEqual([
      { type: "text", content: "Option A:\n" },
      { type: "draft", content: "First option" },
      { type: "text", content: "\nOption B:\n" },
      { type: "draft", content: "Second option" },
    ]);
  });

  it("handles draft with multiline content", () => {
    const input = "<draft>Line 1\nLine 2\nLine 3</draft>";
    const result = parseDraftBlocks(input);

    expect(result).toEqual([{ type: "draft", content: "Line 1\nLine 2\nLine 3" }]);
  });

  it("handles adjacent draft blocks with no text between", () => {
    const input = "<draft>First</draft><draft>Second</draft>";
    const result = parseDraftBlocks(input);

    expect(result).toEqual([
      { type: "draft", content: "First" },
      { type: "draft", content: "Second" },
    ]);
  });

  it("handles draft-only message with leading text", () => {
    const input = "Here's your draft:\n<draft>The actual draft</draft>";
    const result = parseDraftBlocks(input);

    expect(result).toEqual([
      { type: "text", content: "Here's your draft:\n" },
      { type: "draft", content: "The actual draft" },
    ]);
  });

  it("does not match incomplete draft tags", () => {
    const input = "<draft>unclosed draft";
    const result = parseDraftBlocks(input);

    expect(result).toEqual([{ type: "text", content: "<draft>unclosed draft" }]);
  });

  it("does not match nested draft tags (greedy inner match)", () => {
    const input = "<draft>outer <draft>inner</draft> rest</draft>";
    // The regex is non-greedy, so it matches the first closing tag
    const result = parseDraftBlocks(input);

    expect(result).toEqual([
      { type: "draft", content: "outer <draft>inner" },
      { type: "text", content: " rest</draft>" },
    ]);
  });
});
