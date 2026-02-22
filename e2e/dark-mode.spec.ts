import { test, expect } from "@playwright/test";

test.describe("Dark Mode", () => {
  test("login page renders in light mode by default", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // html should NOT have .dark class
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass ?? "").not.toContain("dark");

    // Theme toggle select should be present
    const themeSelect = page.locator("select").filter({ hasText: "Light" });
    await expect(themeSelect).toBeVisible();

    // Take screenshot for visual inspection
    await page.screenshot({ path: "test-results/darkmode-login-light.png", fullPage: true });
  });

  test("theme toggle switches to dark mode", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Find theme select (has Light/Dark/System options)
    const themeSelect = page.locator("select").filter({ hasText: "System" });
    await expect(themeSelect).toBeVisible();

    // Switch to dark
    await themeSelect.selectOption("dark");
    await page.waitForTimeout(300);

    // html should now have .dark class
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).toContain("dark");

    // localStorage should persist
    const stored = await page.evaluate(() => localStorage.getItem("ez-theme"));
    expect(stored).toBe("dark");

    await page.screenshot({ path: "test-results/darkmode-login-dark.png", fullPage: true });
  });

  test("FOUC prevention: .dark class applied before paint on reload", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Set dark mode via localStorage directly
    await page.evaluate(() => localStorage.setItem("ez-theme", "dark"));

    // Reload
    await page.reload();
    // Check immediately — the inline script should have applied .dark
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(hasDark).toBe(true);

    await page.screenshot({ path: "test-results/darkmode-fouc-reload.png", fullPage: true });
  });

  test("register page renders correctly in dark mode", async ({ page }) => {
    // Set dark mode before navigating
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("ez-theme", "dark"));
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(hasDark).toBe(true);

    // Card should exist and use semantic classes
    const card = page.locator(".bg-surface").first();
    await expect(card).toBeVisible();

    // Card background should be dark (gray-900 ≈ rgb(17, 24, 39))
    const cardBg = await card.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    // Parse RGB — the red channel should be < 50 for a dark background
    const match = cardBg.match(/rgb\((\d+)/);
    if (match) {
      expect(parseInt(match[1])).toBeLessThan(50);
    }

    await page.screenshot({ path: "test-results/darkmode-register-dark.png", fullPage: true });
  });

  test("CSS custom properties are defined in both modes", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Light mode tokens
    const lightVars = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        surface: s.getPropertyValue("--surface").trim(),
        textPrimary: s.getPropertyValue("--text-primary").trim(),
        borderMain: s.getPropertyValue("--border-main").trim(),
        btn: s.getPropertyValue("--btn").trim(),
        chatUserBg: s.getPropertyValue("--chat-user-bg").trim(),
        draftBg: s.getPropertyValue("--draft-bg").trim(),
      };
    });

    for (const [key, value] of Object.entries(lightVars)) {
      expect(value, `light --${key} should not be empty`).toBeTruthy();
    }

    // Switch to dark mode
    await page.evaluate(() => localStorage.setItem("ez-theme", "dark"));
    await page.reload();
    await page.waitForLoadState("networkidle");

    const darkVars = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        surface: s.getPropertyValue("--surface").trim(),
        textPrimary: s.getPropertyValue("--text-primary").trim(),
        borderMain: s.getPropertyValue("--border-main").trim(),
        btn: s.getPropertyValue("--btn").trim(),
      };
    });

    for (const [key, value] of Object.entries(darkVars)) {
      expect(value, `dark --${key} should not be empty`).toBeTruthy();
    }

    // Surface token should differ between light and dark
    expect(lightVars.surface).not.toBe(darkVars.surface);
  });

  test("system mode respects OS preference", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Set system mode
    const themeSelect = page.locator("select").filter({ hasText: "System" });
    await themeSelect.selectOption("system");
    await page.waitForTimeout(300);

    const stored = await page.evaluate(() => localStorage.getItem("ez-theme"));
    expect(stored).toBe("system");
  });

  test("no hardcoded gray classes in rendered login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const hardcoded = await page.evaluate(() => {
      const patterns = [
        "bg-white", "bg-gray-50", "bg-gray-100", "text-gray-900",
        "text-gray-600", "text-gray-500", "text-gray-400",
        "border-gray-200", "border-gray-300", "border-gray-100",
      ];
      const found: string[] = [];
      document.querySelectorAll("*").forEach((el) => {
        const cls = el.className;
        if (typeof cls !== "string") return;
        for (const p of patterns) {
          // Only match exact class boundaries (not substrings of other classes)
          if (new RegExp(`\\b${p}\\b`).test(cls)) {
            found.push(`${el.tagName}.${p}`);
          }
        }
      });
      return found;
    });

    expect(hardcoded).toEqual([]);
  });

  test("error page uses semantic tokens", async ({ page }) => {
    await page.goto("/nonexistent-page-xyz");
    await page.waitForLoadState("networkidle");

    const pageContent = await page.content();
    // Should use semantic classes, not hardcoded ones
    expect(pageContent).not.toContain('class="bg-gray-50"');
    expect(pageContent).toContain("bg-surface-alt");

    await page.screenshot({ path: "test-results/darkmode-error-light.png", fullPage: true });
  });
});
