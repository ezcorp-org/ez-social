import { test, expect } from "@playwright/test";
import { authenticate, gotoDashboard } from "./helpers";

/** Bypass browser-native URL validation so the server-side validation is exercised. */
async function disableBrowserValidation(page: import("@playwright/test").Page, selector: string) {
  await page.evaluate((sel) => {
    const input = document.querySelector(sel) as HTMLInputElement;
    if (input) {
      input.type = "text";
      input.removeAttribute("required");
    }
  }, selector);
}

test.describe("Toast on QuickAdd failure", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
    await gotoDashboard(page);
  });

  test("shows error toast when submitting invalid URL via inline form", async ({ page }) => {
    await disableBrowserValidation(page, '#quick-add-url');

    const urlInput = page.getByRole("textbox", { name: "Post URL" });
    await urlInput.fill("not-a-url");
    await page.getByRole("button", { name: "Add to Queue" }).click();

    // Toast should appear with error text
    const toast = page.locator('[role="status"]');
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText("Invalid URL");

    // The form should still be visible (not navigated away)
    await expect(urlInput).toBeVisible();
  });

  test("shows error toast when submitting invalid URL via modal", async ({ page }) => {
    // Open modal with 'n' hotkey
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();

    await disableBrowserValidation(page, '#modal-quick-add input[type="url"]');

    // Submit invalid URL
    const modalInput = page.locator('#modal-quick-add input[name="url"]');
    await modalInput.fill("not-a-url");
    await page.locator('#modal-quick-add button[type="submit"]').click();

    // Toast should appear
    const toast = page.locator('[role="status"]');
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText("Invalid URL");

    // Modal should remain open
    await expect(page.getByRole("heading", { name: "Quick Add" })).toBeVisible();
  });

  test("toast auto-dismisses", async ({ page }) => {
    await disableBrowserValidation(page, '#quick-add-url');

    const urlInput = page.getByRole("textbox", { name: "Post URL" });
    await urlInput.fill("not-a-url");
    await page.getByRole("button", { name: "Add to Queue" }).click();

    const toast = page.locator('[role="status"]');
    await expect(toast).toBeVisible({ timeout: 10000 });

    // Wait for auto-dismiss (4s timeout + buffer)
    await expect(toast).not.toBeVisible({ timeout: 8000 });
  });
});
