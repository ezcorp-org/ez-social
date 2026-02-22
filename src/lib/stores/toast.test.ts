import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import { toasts } from "./toast";

describe("toast store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear any leftover toasts
    for (const t of get(toasts)) {
      toasts.dismiss(t.id);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("add() creates a toast with correct message, type, and id", () => {
    toasts.add("Something failed", "error");
    const current = get(toasts);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({
      message: "Something failed",
      type: "error",
    });
    expect(current[0].id).toBeTypeOf("number");
  });

  it("add() defaults type to 'info'", () => {
    toasts.add("Hello");
    const current = get(toasts);
    expect(current).toHaveLength(1);
    expect(current[0].type).toBe("info");
  });

  it("add() auto-dismisses after 4s", () => {
    toasts.add("Temporary", "error");
    expect(get(toasts)).toHaveLength(1);

    vi.advanceTimersByTime(3999);
    expect(get(toasts)).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(get(toasts)).toHaveLength(0);
  });

  it("dismiss() removes a specific toast", () => {
    toasts.add("First", "info");
    toasts.add("Second", "error");
    const [first, second] = get(toasts);

    toasts.dismiss(first.id);

    const remaining = get(toasts);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
    expect(remaining[0].message).toBe("Second");
  });
});
