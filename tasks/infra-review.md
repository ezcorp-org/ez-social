# Infrastructure Review — ez-social

**Date:** 2026-02-22
**Reviewer:** Claude (automated)

---

## 1. No CI/CD

**Status:** MISSING

The `.github/workflows/` directory does not exist. There is no CI/CD pipeline of any kind.

The `playwright.config.ts` already references `process.env.CI` for retries and worker count, so the codebase anticipates a CI environment but none is configured.

**Recommendation:** Add a GitHub Actions workflow at `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun test

  e2e:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: bun run test:e2e
```

---

## 2. Dead Lint Script

**Status:** BROKEN

`/home/dev/work/ez-social/package.json` defines a lint script:

```json
"lint": "eslint ."
```

However, **no ESLint configuration file exists** in the project root. There is no `eslint.config.js`, `eslint.config.mjs`, `.eslintrc`, `.eslintrc.json`, or any variant. The only `.eslintrc` files found are deep inside `node_modules/`.

ESLint is also not listed in either `dependencies` or `devDependencies`, so `bun run lint` will fail with a missing binary error.

**Recommendation:** Either:
- Remove the dead `lint` script from `package.json`, or
- Install ESLint and create a config: `bun add -d eslint eslint-plugin-svelte` and add an `eslint.config.js`.

---

## 3. No LICENSE File

**Status:** MISSING

There is no `LICENSE` file at the repository root (`/home/dev/work/ez-social/`). The only LICENSE files in the tree belong to dependencies inside `node_modules/`.

**Impact:** This is a blocker for open-source distribution. Without a license, the code is "all rights reserved" by default, meaning no one can legally use, modify, or distribute it.

**Recommendation:** Add a `LICENSE` file. For a permissive open-source project, MIT or Apache-2.0 are standard choices.

---

## 4. Dependency Classification

**Status:** MISCLASSIFIED PACKAGES

In `/home/dev/work/ez-social/package.json`, several packages in `dependencies` should be in `devDependencies`:

| Package | Why it should be devDependency |
|---|---|
| `@playwright/test` (^1.58.2) | E2E test framework, not needed at runtime |
| `playwright` (^1.58.2) | E2E test browser automation, not needed at runtime |
| `@tailwindcss/vite` (^4) | Vite plugin, build-time only |
| `@sveltejs/kit` (^2) | Framework tooling, build-time only (runtime is the built output) |

Additionally, `@cloudflare/puppeteer` (^1.0.6) is in `dependencies`, which is correct **if** it is used at runtime inside a Cloudflare Worker with Browser Rendering. The wrangler config does declare a `BROWSER` binding, so this appears intentional.

**Recommendation:** Move the four packages listed above to `devDependencies`:

```bash
bun remove @playwright/test playwright @tailwindcss/vite @sveltejs/kit
bun add -d @playwright/test playwright @tailwindcss/vite @sveltejs/kit
```

---

## 5. Docker Compose

**Status:** GOOD with minor issues

File: `/home/dev/work/ez-social/docker-compose.yml`

**What works well:**
- PostgreSQL 16-alpine with healthcheck and named volume for data persistence
- Dedicated `migrate` service that runs `drizzle-kit push` after DB is healthy
- `app` service depends on both `postgres` (healthy) and `migrate` (completed)
- `ANTHROPIC_API_KEY` passed from host env with empty-string fallback
- Separate `app_node_modules` volume avoids conflicts with host `node_modules`

**Issues:**
1. **No `.env.example` file** documented for required variables. New developers won't know they need `ANTHROPIC_API_KEY`.
2. **Hardcoded credentials** (`ezsocial/ezsocial`) are fine for local dev but should be clearly labeled as dev-only.
3. **`bun install` runs on every container start** (line 50: `sh -c "bun install && bun run dev --host 0.0.0.0"`). This adds 10-30s to every restart. Consider a separate `install` service or a Dockerfile with cached layers.
4. **Missing `--frozen-lockfile`** on `bun install` -- the container could silently update dependencies.

Overall, this provides a reasonable zero-setup dev experience via `docker compose up`.

---

## 6. Build Reproducibility

**Status:** MOSTLY GOOD

- **`bun.lock` is committed** to git (confirmed via `git ls-files`). It uses lockfile version 1 with JSON format. This ensures reproducible installs.
- **`bun.lock` is NOT in `.gitignore`** -- correct behavior.

**Issue: Loose version pinning in `package.json`**

Most versions use caret ranges with major-version-zero or bare major versions:

| Package | Version | Risk |
|---|---|---|
| `@neondatabase/serverless` | `^0` | Major-zero caret is essentially `>=0.0.0 <1.0.0` -- very wide |
| `drizzle-orm` | `^0` | Same issue |
| `svelte` | `^5` | `>=5.0.0 <6.0.0` -- wide but reasonable |
| `@auth/drizzle-adapter` | `^1` | Reasonable |

The lockfile mitigates this in practice, but bare `^0` ranges are unusual and could cause confusion. If someone runs `bun install` without the lockfile, they could get wildly different versions.

**Recommendation:** Pin `^0` ranges to at least a minor version (e.g., `^0.36` instead of `^0`).

---

## 7. Wrangler Config

**Status:** MINIMAL

File: `/home/dev/work/ez-social/wrangler.jsonc`

```jsonc
{
  "name": "ez-social",
  "main": ".svelte-kit/cloudflare/_worker.js",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": ".svelte-kit/cloudflare"
  },
  "browser": {
    "binding": "BROWSER"
  }
}
```

**Observations:**
- **Browser Rendering binding** (`BROWSER`) is declared but there are no comments or documentation explaining its purpose or required Cloudflare plan (Browser Rendering requires Workers Paid plan).
- **No KV, D1, R2, or Durable Object bindings** -- the app uses Neon (external Postgres) via `@neondatabase/serverless`, not Cloudflare D1.
- **No `[vars]` section** for environment variables like `DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`. These must be set via `wrangler secret` or the dashboard, but this is not documented.
- **No `[env.staging]` or `[env.production]`** environment separation.
- **`compatibility_date` is `2026-01-01`** -- current and appropriate.

**Recommendation:**
- Add comments documenting required secrets (`DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`).
- Consider adding `[env.production]` and `[env.staging]` blocks if deploying to multiple environments.

---

## 8. Test Infrastructure

### Unit Tests — Vitest

File: `/home/dev/work/ez-social/vitest.config.ts`

```ts
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    globals: true,
    alias: {
      "$lib": "/src/lib",
      "$lib/*": "/src/lib/*",
      "$app/forms": "/src/test-utils/mocks/app-forms.ts",
      "$app/navigation": "/src/test-utils/mocks/app-navigation.ts",
      "$env/dynamic/private": "/src/test-utils/mocks/env.ts",
    },
  },
});
```

**Good:** SvelteKit aliases are properly mocked. jsdom environment is appropriate for component tests. `globals: true` enables implicit `describe`/`it`/`expect`.

**Issues:**
- **No coverage configuration.** Consider adding `coverage: { provider: 'v8', reporter: ['text', 'lcov'] }` for visibility.
- **No `setupFiles`** for `@testing-library/jest-dom` matchers. Tests using `.toBeInTheDocument()` may need a setup file importing `@testing-library/jest-dom/vitest`.

### Integration Tests

File: `/home/dev/work/ez-social/vitest.integration.config.ts` -- **DOES NOT EXIST**

The `package.json` defines a script:

```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

But the file `vitest.integration.config.ts` is missing. Running `bun run test:integration` will fail.

**Recommendation:** Either create the config file or remove the dead script.

### E2E Tests — Playwright

File: `/home/dev/work/ez-social/playwright.config.ts`

```ts
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run dev --port 5174",
    port: 5174,
    reuseExistingServer: !process.env.CI,
  },
});
```

**Good:** CI-aware config with `forbidOnly`, retry count, and worker limits. Trace capture on first retry is useful for debugging. WebServer auto-start is configured.

**Issues:**
- **No `projects` array** -- tests only run in one browser (default: Chromium). Consider adding Firefox/WebKit for cross-browser coverage.
- **No `outputDir`** configured for test artifacts. The `test-results/` directory appears in git status with deleted trace files, suggesting artifacts are being generated but not properly gitignored.
- **`test-results/` is not in `.gitignore`** -- trace files and screenshots are leaking into git status.

**E2E test files found** (8 spec files + 1 helper):
- `e2e/dark-mode.spec.ts`
- `e2e/token-cost.spec.ts`
- `e2e/prompt-refine-voice.spec.ts`
- `e2e/auto-generate.spec.ts`
- `e2e/quick-add-toast.spec.ts`
- `e2e/quick-add-persona.spec.ts`
- `e2e/copy-draft.spec.ts`
- `e2e/hotkeys.spec.ts`
- `e2e/helpers.ts`

---

## Summary of Action Items

| Priority | Item | Effort |
|---|---|---|
| High | Add CI/CD pipeline (`.github/workflows/ci.yml`) | 1-2 hours |
| High | Add `LICENSE` file | 5 minutes |
| High | Add `test-results/` to `.gitignore` | 1 minute |
| Medium | Fix or remove dead `lint` script | 15 min (remove) or 1 hr (fix) |
| Medium | Fix or remove dead `test:integration` script | 5 minutes |
| Medium | Move test/build packages to `devDependencies` | 10 minutes |
| Medium | Pin `^0` dependency ranges to minor versions | 10 minutes |
| Low | Add coverage config to vitest | 10 minutes |
| Low | Document required secrets for wrangler deployment | 15 minutes |
| Low | Optimize Docker Compose `bun install` step | 30 minutes |
