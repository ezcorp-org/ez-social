import { test, expect, type Page } from "@playwright/test";
import { authenticate, waitForHydration } from "./helpers";

/**
 * Substantial writing sample for voice extraction (mock AI returns canned profile).
 */
function generateSamples(): string {
  return `I think the best way to ship software is to move fast and break things — but only if you have good tests.
Nobody talks about this enough: most teams spend 80% of their time on the wrong problems. They optimize for performance
when users don't even understand the UI. Here's my hot take: if your product needs a tutorial, you've already lost.

Short sentences hit harder. Trust me on this. I've been building products for 10 years and the ones that win are always
stupidly simple. Not simple as in easy to build — simple as in easy to understand. There's a massive difference.

When I see a landing page with 14 features listed, I bounce. When I see one sentence that tells me exactly what it does
and why I should care, I sign up. That's the whole game. Ship less, explain better, iterate faster.`;
}

async function createPersonaAndGo(page: Page, name: string): Promise<string> {
  const response = await page.request.post("/personas/new", { form: { name } });
  const body = await response.json();
  if (body.type !== "redirect" || !body.location) {
    throw new Error(`Persona creation failed: ${JSON.stringify(body)}`);
  }
  await page.goto(body.location);
  await waitForHydration(page);
  await expect(page.getByText("No voice profile yet")).toBeVisible({ timeout: 10000 });
  return body.location;
}

/** Authenticate, create persona, extract voice profile via mock AI. Retries on transient DB errors. */
async function fullSetup(page: Page): Promise<string> {
  await authenticate(page);

  let url = "";
  await expect(async () => {
    url = await createPersonaAndGo(page, `Edit Test ${Date.now()}`);
    await page.getByPlaceholder(/Paste your writing samples here/).fill(generateSamples());
    await page.getByRole("button", { name: "Extract Voice Profile" }).click();
    await expect(page.getByText("Writing sample saved and voice profile extracted")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Refine with Prompt")).toBeVisible({ timeout: 15000 });
  }).toPass({ timeout: 45000, intervals: [3000] });

  return url;
}

/**
 * Wait for an updateTraits POST and return the parsed manualEdits payload.
 * The page sends fetch() with FormData (multipart/form-data).
 */
async function captureUpdateTraits(
  page: Page,
  action: () => Promise<void>,
): Promise<Record<string, unknown>> {
  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes("updateTraits") && req.method() === "POST"),
    action(),
  ]);
  const body = request.postData() ?? "";
  // Multipart body contains a field named "manualEdits" with JSON value.
  const match = body.match(/name="manualEdits"\r?\n\r?\n([\s\S]*?)(?:\r?\n--)/);
  if (match) {
    return JSON.parse(match[1].trim());
  }
  // Fallback: try URL-encoded
  const params = new URLSearchParams(body);
  const raw = params.get("manualEdits");
  return JSON.parse(raw ?? "{}");
}

// ---------------------------------------------------------------------------
// Mock profile values (must match MOCK_VOICE_PROFILE in src/lib/server/ai.ts)
// ---------------------------------------------------------------------------
const MOCK_DNA = [
  "Short punchy sentences under 15 words",
  "Sarcastic asides in parentheses",
];
const MOCK_STRUCTURE_PATTERN = "Short punchy paragraphs";
const MOCK_CONTENT_MODE_TYPE = "original take";
const MOCK_LEAN_INTO = "Sarcastic asides";
const MOCK_CONSISTENCY_LABEL = "Moderately Consistent";
const MOCK_CONSISTENCY_SUMMARY = "Strong structural voice with sarcastic edge.";

/**
 * The voice profile display is inside a card with "Voice Profile" heading.
 * Scope locators to this section to avoid matching the persona edit form inputs.
 */
function voiceProfileSection(page: Page) {
  return page.locator("div.rounded-xl").filter({ has: page.locator("h2", { hasText: "Voice Profile" }) });
}

test.describe("Voice profile inline editing", () => {
  test.setTimeout(60000);

  test("displays voice profile after extraction and supports full editing lifecycle", async ({
    page,
  }) => {
    // ================================================================
    // SETUP
    // ================================================================
    await fullSetup(page);
    const vp = voiceProfileSection(page);

    // ================================================================
    // 1. Verify voice profile sections are rendered
    // ================================================================
    await expect(vp.getByText("Voice DNA")).toBeVisible();
    await expect(vp.getByText(MOCK_DNA[0])).toBeVisible();
    await expect(vp.getByText(MOCK_DNA[1])).toBeVisible();
    await expect(vp.getByText("Voice Patterns")).toBeVisible();
    await expect(vp.getByText("Content Modes")).toBeVisible();
    await expect(vp.getByText("Recommendations")).toBeVisible();
    await expect(vp.getByText(MOCK_CONSISTENCY_LABEL)).toBeVisible();
    await expect(vp.getByText(MOCK_CONSISTENCY_SUMMARY)).toBeVisible();

    // ================================================================
    // 2. Voice DNA: click item, edit, save, verify payload
    // ================================================================
    await vp.getByText(MOCK_DNA[0]).click();

    // Input appears inside the <ul> (not the persona form inputs above)
    const dnaInput = vp.locator("ul input").first();
    await expect(dnaInput).toBeVisible();
    await expect(dnaInput).toHaveValue(MOCK_DNA[0]);

    await dnaInput.fill("Concise direct statements");

    const edits = await captureUpdateTraits(page, async () => {
      await vp.getByRole("button", { name: "Save" }).click();
    });

    expect(edits.voiceDNA).toBeDefined();
    const dnaArray = edits.voiceDNA as string[];
    expect(dnaArray[0]).toBe("Concise direct statements");
    expect(dnaArray[1]).toBe(MOCK_DNA[1]);

    await expect(vp.getByText("Concise direct statements")).toBeVisible();

    // ================================================================
    // 3. Voice DNA: add and remove items
    // ================================================================
    const addTraitBtn = vp.getByRole("button", { name: "Add trait" });
    await expect(addTraitBtn).toBeVisible();

    const addEdits = await captureUpdateTraits(page, async () => {
      await addTraitBtn.click();
    });
    const addedDna = addEdits.voiceDNA as string[];
    expect(addedDna).toContain("New voice trait");
    await expect(vp.getByText("New voice trait")).toBeVisible();

    // Remove the newly added item via the X button on the same row
    const newTraitRow = vp.getByText("New voice trait").locator("..");
    const removeEdits = await captureUpdateTraits(page, async () => {
      await newTraitRow.locator('button[title="Remove"]').click();
    });
    const removedDna = removeEdits.voiceDNA as string[];
    expect(removedDna).not.toContain("New voice trait");

    // ================================================================
    // 4. Dimension pattern edit: expand Structure, edit pattern
    // ================================================================
    const structureBtn = vp.getByRole("button", { name: /Structure/ });
    await structureBtn.click();

    await expect(vp.getByText(MOCK_STRUCTURE_PATTERN)).toBeVisible();
    await vp.getByText(MOCK_STRUCTURE_PATTERN).click();

    // Multi-field form appears in a bg-surface-alt container
    const dimEditForm = vp.locator("div.bg-surface-alt").filter({ hasText: "Pattern" });
    await expect(dimEditForm).toBeVisible();
    await expect(dimEditForm.getByText("Evidence")).toBeVisible();
    await expect(dimEditForm.getByText("Signal")).toBeVisible();

    // The first input in the form is the Pattern field
    await dimEditForm.locator("input").first().fill("Medium-length paragraphs");

    const dimEdits = await captureUpdateTraits(page, async () => {
      await dimEditForm.getByRole("button", { name: "Save" }).click();
    });

    const dims = dimEdits.dimensions as Record<string, unknown[]>;
    expect(dims).toBeDefined();
    expect(dims.structure).toBeDefined();
    const structurePatterns = dims.structure as Array<{ pattern: string }>;
    expect(structurePatterns[0].pattern).toBe("Medium-length paragraphs");

    // ================================================================
    // 5. Content mode edit: click mode, verify form, edit, save
    // ================================================================
    const modeType = vp.getByText(MOCK_CONTENT_MODE_TYPE);
    await modeType.click();

    // Content mode edit form appears in bg-surface-alt
    const modeEditForm = vp.locator("div.bg-surface-alt").filter({ hasText: "Dominant Patterns" });
    await expect(modeEditForm).toBeVisible();
    await expect(modeEditForm.getByText("Type")).toBeVisible();
    await expect(modeEditForm.getByText("Distinctive Shifts")).toBeVisible();
    await expect(modeEditForm.getByText("Example Quote")).toBeVisible();

    // First input is the Type field
    await modeEditForm.locator("input").first().fill("hot take");

    const modeEdits = await captureUpdateTraits(page, async () => {
      await modeEditForm.getByRole("button", { name: "Save" }).click();
    });

    const modes = modeEdits.contentModes as Array<{ type: string }>;
    expect(modes).toBeDefined();
    expect(modes[0].type).toBe("hot take");

    // ================================================================
    // 6. Content mode add (inconsistencies empty in mock)
    // ================================================================
    const addModeBtn = vp.getByRole("button", { name: "Add mode" });
    await expect(addModeBtn).toBeVisible();

    const addModeEdits = await captureUpdateTraits(page, async () => {
      await addModeBtn.click();
    });
    const addedModes = addModeEdits.contentModes as Array<{ type: string }>;
    expect(addedModes.some((m) => m.type === "New Mode")).toBe(true);

    // ================================================================
    // 7. Recommendations: edit an item, test add
    // ================================================================
    const leanIntoItem = vp.getByText(MOCK_LEAN_INTO, { exact: true });
    await expect(leanIntoItem).toBeVisible();
    await leanIntoItem.click();

    // Input appears in the recommendations <ul>
    const recInput = vp.locator("ul li input").first();
    await expect(recInput).toBeVisible();
    await expect(recInput).toHaveValue(MOCK_LEAN_INTO);

    await recInput.fill("Witty one-liners");
    const recEdits = await captureUpdateTraits(page, async () => {
      await vp.getByRole("button", { name: "Save" }).click();
    });

    const recs = recEdits.recommendations as Record<string, string[]>;
    expect(recs).toBeDefined();
    expect(recs.leanInto).toContain("Witty one-liners");

    // Add a "lean into" recommendation
    const addLeanBtn = vp.getByRole("button", { name: "Add lean into" });
    await expect(addLeanBtn).toBeVisible();

    const addRecEdits = await captureUpdateTraits(page, async () => {
      await addLeanBtn.click();
    });
    const addedRecs = addRecEdits.recommendations as Record<string, string[]>;
    expect(addedRecs.leanInto).toContain("New recommendation");

    // ================================================================
    // 8. Consistency score: edit rating and summary
    // ================================================================
    const ratingBadge = vp.getByText(MOCK_CONSISTENCY_LABEL);
    await ratingBadge.click();

    const ratingSelect = vp.locator("select");
    await expect(ratingSelect).toBeVisible();

    // Select auto-saves on change
    const ratingEdits = await captureUpdateTraits(page, async () => {
      await ratingSelect.selectOption("highly-consistent");
    });

    const cs = ratingEdits.consistencyScore as Record<string, string>;
    expect(cs).toBeDefined();
    expect(cs.rating).toBe("highly-consistent");
    await expect(vp.getByText("Highly Consistent")).toBeVisible();

    // Edit summary
    await vp.getByText(MOCK_CONSISTENCY_SUMMARY).click();
    const summaryTextarea = vp.locator("textarea");
    await expect(summaryTextarea).toBeVisible();

    await summaryTextarea.fill("Very consistent voice overall.");

    const summaryEdits = await captureUpdateTraits(page, async () => {
      await vp.getByRole("button", { name: "Save" }).click();
    });

    const csSummary = summaryEdits.consistencyScore as Record<string, string>;
    expect(csSummary.summary).toBe("Very consistent voice overall.");
  });

  test("cancel edit restores original value without saving", async ({ page }) => {
    await fullSetup(page);
    const vp = voiceProfileSection(page);

    // Click a voiceDNA item to start editing
    await vp.getByText(MOCK_DNA[0]).click();

    const input = vp.locator("ul input").first();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue(MOCK_DNA[0]);

    await input.fill("Something completely different");

    // Click Cancel — no updateTraits request should fire
    await vp.getByRole("button", { name: "Cancel" }).click();

    // Input disappears, original value restored
    await expect(input).not.toBeVisible();
    await expect(vp.getByText(MOCK_DNA[0])).toBeVisible();
    await expect(vp.getByText("Something completely different")).not.toBeVisible();
  });

  test("edited fields show amber dot badge after saving", async ({ page }) => {
    await fullSetup(page);
    const vp = voiceProfileSection(page);

    // Before editing, no "Manually edited" badges
    await expect(vp.locator('[title="Manually edited"]')).toHaveCount(0);

    // Edit a voiceDNA item
    await vp.getByText(MOCK_DNA[0]).click();
    const input = vp.locator("ul input").first();
    await input.fill("Edited trait");
    await vp.getByRole("button", { name: "Save" }).click();

    // After save + invalidateAll, the edited badge should appear
    await expect(async () => {
      await expect(vp.locator('[title="Manually edited"]').first()).toBeVisible();
    }).toPass({ timeout: 10000, intervals: [1000] });
  });
});
