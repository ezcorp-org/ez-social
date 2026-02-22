import { expect, type Page } from "@playwright/test";

/**
 * Wait for SvelteKit hydration after a full page load.
 * Module scripts execute after the load event, but hydration is async.
 * Without this, forms submit as native HTML (not enhanced) and
 * Playwright's navigation detection breaks.
 *
 * Detects hydration by checking for the `__svelte` global, which Svelte 5
 * sets after mounting the root component.
 */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => (window as any).__svelte !== undefined,
    { timeout: 5000 },
  );
}

/**
 * Register a new user and authenticate. Uses element-based waits instead of
 * networkidle to avoid hangs under parallel load. Retries the entire flow
 * with a fresh email on transient failures.
 */
export async function authenticate(page: Page) {
  const password = "testpass123";
  let email = "";

  await expect(async () => {
    // Generate fresh email each attempt to avoid "already registered" on retry
    email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;

    await page.goto("/register");
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible({ timeout: 10000 });
    await waitForHydration(page);

    await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
    await page.getByRole("textbox", { name: "Email address" }).fill(email);

    // Verify fields were actually filled (page reload under load can clear them)
    await expect(page.getByRole("textbox", { name: "Email address" })).toHaveValue(email);

    await page.getByRole("button", { name: "Create account" }).click();

    // Poll actual URL via JS — resilient to both pushState (enhanced form)
    // and full page navigation (native form fallback).
    await page.waitForFunction(
      () => !window.location.pathname.includes("/register"),
      { timeout: 10000 },
    );

    // Registration may redirect to /login — complete the login flow
    if (page.url().includes("/login")) {
      await waitForHydration(page);
      await page.getByRole("textbox", { name: "Email address" }).fill(email);
      await page.getByRole("textbox", { name: "Password" }).fill(password);
      await expect(page.getByRole("textbox", { name: "Email address" })).toHaveValue(email);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForFunction(
        () => window.location.pathname === "/"
          || document.querySelector('[class*="text-red"]') !== null
          || document.body.textContent?.includes("Invalid email or password"),
        { timeout: 10000 },
      );
      // If login failed, throw to trigger toPass retry with fresh credentials
      if (page.url().includes("/login")) {
        throw new Error("Login failed after registration — retrying");
      }
    }
  }).toPass({ timeout: 45000, intervals: [2000] });
}

/**
 * Add a post via the QuickAdd form and return its ID. Retries the entire flow
 * up to 3 times to handle transient server errors under parallel load.
 */
export async function addPost(page: Page, url: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await gotoDashboard(page);

    await page.getByRole("textbox", { name: "Post URL" }).fill(url);
    await page.getByRole("button", { name: "Add to Queue" }).click();

    // Wait for either scraper failure (manual content form) or scraper success (redirect to chat)
    const result = await Promise.race([
      page.getByText("Could not scrape post content").waitFor({ timeout: 15000 }).then(() => "needs-content" as const),
      page.waitForURL(/\/queue\/.*\?autoGenerate/, { timeout: 15000 }).then(() => "redirected" as const),
    ]).catch(() => "error" as const);

    if (result === "error") {
      await page.waitForTimeout(1000);
      continue;
    }

    if (result === "needs-content") {
      await page.getByPlaceholder("Paste the post content here...").fill("Test post content.");
      const saveButton = page.getByRole("button", { name: "Save content" });
      for (let saveAttempt = 0; saveAttempt < 3; saveAttempt++) {
        const [response] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === "POST", { timeout: 5000 }).catch(() => null),
          saveButton.click(),
        ]);
        if (response) break;
        await page.waitForTimeout(300);
      }
      // After saving content, we get redirected to the chat page
      await page.waitForFunction(
        () => window.location.pathname.startsWith("/queue/"),
        { timeout: 10000 },
      );
    }

    // Extract post ID from current URL
    const postId = page.url().match(/\/queue\/([^?/]+)/)?.[1];
    if (postId) return postId;

    // Fallback: check the dashboard table
    await gotoDashboard(page);
    const tableRow = page.locator('table a[href^="/queue/"]').first();
    if (await tableRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await tableRow.getAttribute("href");
      return href!.split("/queue/")[1];
    }
  }

  throw new Error("Failed to add post after 3 attempts");
}

/** Navigate to an app page with retry on transient 500s under parallel load */
export async function navigateWithRetry(page: Page, path: string) {
  await expect(async () => {
    await page.goto(path);
    await waitForHydration(page);
    // Verify the nav loaded (not a 500 error page)
    await expect(page.locator('a[href="/personas"]')).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000, intervals: [2000] });
}

/** Navigate to the dashboard with retry */
export async function gotoDashboard(page: Page) {
  await expect(async () => {
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.getByRole("textbox", { name: "Post URL" })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000, intervals: [2000] });
}
