# Project Setup

## Tech Stack
- **Frontend**: SvelteKit + TypeScript + Tailwind CSS v4
- **Desktop**: Tauri v2 (Rust shell only)
- **Backend**: SvelteKit API routes (deployed on Cloudflare Workers)
- **Database**: PostgreSQL (Neon DB production, Docker local)
- **ORM**: Drizzle ORM
- **Package Manager**: Bun

## Dependencies
- Install with: `bun install`

## Commands
- Run dev: `bun run dev`
- Build (web): `bun run build`
- Build (desktop): `bun run tauri dev` / `bun run tauri build`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Test (unit): `bun run test`
- Test (integration): `bun run test:integration`
- Test (E2E): `bun run test:e2e`
- DB migrate: `bunx drizzle-kit migrate`
- DB push (dev): `bunx drizzle-kit push`
- DB generate: `bunx drizzle-kit generate`
- DB studio: `bunx drizzle-kit studio`
- Deploy: `wrangler deploy`

## Local Development
1. `docker compose up -d` (start PostgreSQL)
2. `bun install`
3. `cp .env.example .env` (configure env vars)
4. `bunx drizzle-kit push` (apply schema)
5. `bun run dev`

## Key Directories
- `src/lib/server/` — Server-only code (DB, auth, services)
- `src/lib/components/` — Svelte components
- `src/routes/` — Pages and API endpoints
- `src/routes/api/` — REST API endpoints
- `src-tauri/` — Tauri Rust project
- `drizzle/` — Migration files

## Architecture Reference
- See `architecture.md` for full system design, data model, and deployment guide

## Notes
- GSD (Get Shit Done) framework is installed - use /gsd-help for commands
- Drizzle schema lives at `src/lib/server/db/schema.ts`
- Two build targets: `adapter-cloudflare` (web) and `adapter-static` (Tauri)
- Scraping service runs separately (Playwright needs a real browser, can't run on Workers)
