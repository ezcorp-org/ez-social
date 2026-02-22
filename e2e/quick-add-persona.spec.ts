import { test, expect } from "@playwright/test";
import { authenticate, gotoDashboard, waitForHydration } from "./helpers";

/**
 * Create a persona via the /personas/new form. First persona auto-becomes default.
 * NOTE: platform must be provided (not "None") due to a Zod enum validation issue
 * where empty string fails the platformEnum check.
 */
async function createPersona(
  page: import("@playwright/test").Page,
  name: string,
  platform: string = "twitter",
) {
  await expect(async () => {
    await page.goto("/personas/new");
    await expect(page.getByRole("button", { name: "Create persona" })).toBeVisible({ timeout: 5000 });
    await waitForHydration(page);

    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("combobox", { name: /platform/i }).selectOption(platform);

    await page.getByRole("button", { name: "Create persona" }).click();

    // Wait for redirect to persona detail page (UUID path, not /new)
    await page.waitForFunction(
      () => /\/personas\/[0-9a-f]{8}-/.test(window.location.pathname),
      { timeout: 10000 },
    );
  }).toPass({ timeout: 30000, intervals: [2000] });
}

test.describe("QuickAdd persona selector", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
    await gotoDashboard(page);
  });

  test("'more options' toggle shows and hides prompt textarea", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "more options (optional)" });
    await expect(toggle).toBeVisible();

    await toggle.click();

    // Prompt textarea visible
    await expect(page.getByPlaceholder(/e\.g\. Disagree/i)).toBeVisible();
    // Toggle text changed
    await expect(page.getByRole("button", { name: "Hide options" })).toBeVisible();

    // Hide
    await page.getByRole("button", { name: "Hide options" }).click();
    await expect(page.getByPlaceholder(/e\.g\. Disagree/i)).not.toBeVisible();
    await expect(toggle).toBeVisible();
  });

  test("no persona dropdown when user has no personas", async ({ page }) => {
    await page.getByRole("button", { name: "more options (optional)" }).click();

    await expect(page.getByPlaceholder(/e\.g\. Disagree/i)).toBeVisible();
    await expect(page.locator("#quick-add-persona")).not.toBeVisible();
  });

  test("persona dropdown appears and contains created persona", async ({ page }) => {
    test.setTimeout(60000);

    await createPersona(page, "My Twitter Voice");

    await gotoDashboard(page);

    await page.getByRole("button", { name: "more options (optional)" }).click();

    const personaSelect = page.locator("#quick-add-persona");
    await expect(personaSelect).toBeVisible();
    await expect(personaSelect).toContainText("My Twitter Voice");
  });

  test("default persona is pre-selected in the dropdown", async ({ page }) => {
    test.setTimeout(60000);

    await createPersona(page, "Only Persona");

    await gotoDashboard(page);

    await page.getByRole("button", { name: "more options (optional)" }).click();

    const personaSelect = page.locator("#quick-add-persona");
    await expect(personaSelect).toBeVisible();

    const selectedText = await personaSelect.locator("option:checked").textContent();
    expect(selectedText).toContain("Only Persona");
    expect(selectedText).toContain("(default)");
  });

  test("multiple personas in dropdown with switching", async ({ page }) => {
    test.setTimeout(60000);

    await createPersona(page, "Voice Alpha");
    await createPersona(page, "Voice Beta", "linkedin");

    await gotoDashboard(page);

    await page.getByRole("button", { name: "more options (optional)" }).click();

    const personaSelect = page.locator("#quick-add-persona");
    await expect(personaSelect).toBeVisible();

    // Both personas should be in the dropdown
    const options = personaSelect.locator("option");
    await expect(options).toHaveCount(2);

    const allText = await personaSelect.textContent();
    expect(allText).toContain("Voice Alpha");
    expect(allText).toContain("Voice Beta");

    // Switch to Voice Beta
    const betaOption = personaSelect.locator("option", { hasText: "Voice Beta" });
    const betaValue = await betaOption.getAttribute("value");
    await personaSelect.selectOption(betaValue!);

    const updatedText = await personaSelect.locator("option:checked").textContent();
    expect(updatedText).toContain("Voice Beta");
  });

  test("hidden personaId input present when options collapsed", async ({ page }) => {
    test.setTimeout(60000);

    await createPersona(page, "Hidden Persona");

    await gotoDashboard(page);

    // Wait for Svelte effect to initialize selectedPersonaId
    await page.waitForTimeout(500);

    const hiddenInput = page.locator('input[name="personaId"][type="hidden"]');
    await expect(hiddenInput).toBeAttached();
    const value = await hiddenInput.inputValue();
    expect(value).toBeTruthy();
  });

  test("persona selector works in hotkey modal", async ({ page }) => {
    test.setTimeout(60000);

    await createPersona(page, "Modal Persona");

    await gotoDashboard(page);

    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    const modal = page.locator("#modal-quick-add");
    await modal.getByRole("button", { name: "more options (optional)" }).click();

    const personaSelect = modal.locator("#quick-add-persona");
    await expect(personaSelect).toBeVisible();
    await expect(personaSelect).toContainText("Modal Persona");
  });
});
