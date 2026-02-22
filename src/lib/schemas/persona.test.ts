import { describe, it, expect } from "vitest";
import { createPersonaSchema, editPersonaSchema } from "./persona";

describe("createPersonaSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createPersonaSchema.safeParse({
      name: "My Persona",
      description: "A professional writing voice",
      platform: "twitter",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Persona");
      expect(result.data.description).toBe("A professional writing voice");
      expect(result.data.platform).toBe("twitter");
    }
  });

  it("accepts valid input with only required fields", () => {
    const result = createPersonaSchema.safeParse({ name: "Minimal" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Minimal");
      expect(result.data.description).toBeUndefined();
      expect(result.data.platform).toBeUndefined();
    }
  });

  // Name validation
  it("rejects missing name", () => {
    const result = createPersonaSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createPersonaSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name (trimmed to empty)", () => {
    const result = createPersonaSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("trims name whitespace", () => {
    const result = createPersonaSchema.safeParse({ name: "  hello  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("hello");
    }
  });

  it("rejects name longer than 255 characters", () => {
    const result = createPersonaSchema.safeParse({ name: "a".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("accepts name exactly 255 characters", () => {
    const result = createPersonaSchema.safeParse({ name: "a".repeat(255) });
    expect(result.success).toBe(true);
  });

  // Description validation
  it("rejects description longer than 2000 characters", () => {
    const result = createPersonaSchema.safeParse({
      name: "Test",
      description: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts description exactly 2000 characters", () => {
    const result = createPersonaSchema.safeParse({
      name: "Test",
      description: "a".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("transforms empty string description to undefined", () => {
    const result = createPersonaSchema.safeParse({
      name: "Test",
      description: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  // Platform validation
  it("accepts all valid platform values", () => {
    const platforms = ["twitter", "linkedin", "blog", "reddit", "email", "other"];
    for (const platform of platforms) {
      const result = createPersonaSchema.safeParse({ name: "Test", platform });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platform).toBe(platform);
      }
    }
  });

  it("rejects invalid platform value", () => {
    const result = createPersonaSchema.safeParse({
      name: "Test",
      platform: "instagram",
    });
    expect(result.success).toBe(false);
  });

  it("transforms missing platform to undefined", () => {
    const result = createPersonaSchema.safeParse({ name: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.platform).toBeUndefined();
    }
  });
});

describe("editPersonaSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = editPersonaSchema.safeParse({
      name: "Updated Name",
      description: "Updated description",
      platform: "linkedin",
    });
    expect(result.success).toBe(true);
  });

  it("accepts input with only name", () => {
    const result = editPersonaSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts input with only description", () => {
    const result = editPersonaSchema.safeParse({ description: "Updated desc" });
    expect(result.success).toBe(true);
  });

  it("accepts input with only platform", () => {
    const result = editPersonaSchema.safeParse({ platform: "blog" });
    expect(result.success).toBe(true);
  });

  it("rejects empty object (no fields provided)", () => {
    const result = editPersonaSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "At least one field must be provided",
      );
    }
  });

  it("rejects when all fields transform to undefined", () => {
    // empty description -> undefined, no platform -> undefined, no name -> undefined
    const result = editPersonaSchema.safeParse({ description: "" });
    expect(result.success).toBe(false);
  });

  it("name is optional but validated when present", () => {
    const result = editPersonaSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 255 characters", () => {
    const result = editPersonaSchema.safeParse({ name: "a".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("rejects description longer than 2000 characters", () => {
    const result = editPersonaSchema.safeParse({
      description: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts nullable platform (for clearing)", () => {
    const result = editPersonaSchema.safeParse({ name: "Test", platform: null });
    expect(result.success).toBe(true);
  });
});
