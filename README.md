# ez-social

> Chat-first AI reply tool that learns your writing voice and drafts social media responses in your style.

ez-social scrapes posts from any URL, analyzes your writing samples to build a voice profile, then generates reply drafts through an iterative chat interface. Built for people who want authentic social engagement without the time sink.

## Features

- **Voice Profiles** — Paste writing samples, and AI extracts your tone, vocabulary, and style patterns into a reusable profile
- **Chat-Based Drafting** — Refine replies through conversation, not one-shot generation
- **Multi-Persona Support** — Maintain separate voice profiles for different platforms or contexts
- **URL Scraping** — Drop any post URL and the content is extracted automatically (Twitter/X via fxtwitter, other platforms via headless browser)
- **Draft Feedback Loop** — Accept, reject, or edit drafts to improve future suggestions
- **Calibration** — Rate AI-generated samples to fine-tune voice accuracy
- **Token Cost Tracking** — Monitor AI usage and costs per persona and post
- **Dark Mode** — System-aware theme with manual toggle
- **Keyboard Shortcuts** — Navigate and act without touching the mouse

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Docker](https://www.docker.com/) and Docker Compose (for the database)
- [Anthropic API key](https://console.anthropic.com/) (for AI features)

## Quick Start

The fastest way to get running:

```bash
# Clone the repo
git clone https://github.com/your-org/ez-social.git
cd ez-social

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start everything (Postgres + migrations + app)
docker compose up
```

Open [http://localhost:5173](http://localhost:5173), register an account, and start adding personas.

## Manual Setup

If you prefer running the app outside Docker:

```bash
# 1. Start Postgres only
docker compose up postgres -d

# 2. Install dependencies
bun install

# 3. Copy environment config
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# 4. Push database schema
bunx drizzle-kit push

# 5. Start dev server
bun run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Random string for JWT signing (min 32 chars) |
| `AUTH_TRUST_HOST` | Yes | Set to `true` for local dev and Cloudflare Workers |
| `ANTHROPIC_API_KEY` | Yes | API key for Claude (voice extraction + chat) |

The `.env.example` file has working defaults for the Docker Compose Postgres instance.

## Architecture

**Tech Stack:**
- **Frontend:** SvelteKit + Svelte 5 (runes), Tailwind CSS 4
- **Backend:** SvelteKit server routes, Vercel AI SDK (streaming)
- **AI:** Anthropic Claude (chat completions, voice extraction)
- **Database:** PostgreSQL (Neon serverless driver), Drizzle ORM
- **Auth:** Auth.js (SvelteKit adapter) with credentials provider
- **Deployment:** Cloudflare Workers (with Browser Rendering for scraping)

**Data Flow:**
1. User submits a URL → scraper extracts post content
2. User selects a persona → voice profile is loaded
3. User chats with AI → Claude generates replies in the persona's voice
4. User accepts/edits/rejects drafts → feedback stored for future reference

## Database

**Schema** (11 tables defined in `src/lib/server/db/schema.ts`):

- `users` — accounts with email/password auth
- `accounts`, `sessions`, `verification_tokens` — Auth.js adapter tables
- `personas` — user-created writing identities
- `writing_samples` — raw text samples per persona
- `voice_profile_versions` — extracted voice profiles with versioning
- `post_queue` — scraped posts awaiting replies
- `chat_messages` — AI conversation history per post
- `draft_edits` — user edits to AI-generated drafts
- `draft_feedback` — accept/reject/edit signals on drafts
- `ai_usage_log` — token counts and cost tracking

**Commands:**
```bash
bunx drizzle-kit push    # Apply schema to database
bunx drizzle-kit studio  # Open Drizzle Studio GUI
```

## Testing

```bash
# Unit tests (vitest)
bun test

# E2E tests (playwright)
bun run test:e2e

# Type checking
bun run typecheck
```

Unit tests live alongside source files (`*.test.ts`). E2E tests are in the `e2e/` directory.

## Deployment

ez-social deploys to **Cloudflare Workers** with Browser Rendering.

```bash
# Set required secrets
wrangler secret put DATABASE_URL
wrangler secret put AUTH_SECRET
wrangler secret put ANTHROPIC_API_KEY

# Build and deploy
bun run build
wrangler deploy
```

**Requirements:**
- Cloudflare Workers Paid plan (for Browser Rendering)
- Neon or any PostgreSQL database accessible from Cloudflare's network
- `nodejs_compat` compatibility flag (already configured in `wrangler.jsonc`)

## Project Structure

```
src/
├── auth.ts                          # Auth.js configuration
├── hooks.server.ts                  # SvelteKit server hooks
├── routes/
│   ├── (auth)/                      # Login, register pages
│   │   ├── login/
│   │   └── register/
│   └── (app)/                       # Authenticated app routes
│       ├── +page.svelte             # Dashboard (post queue)
│       ├── queue/[id]/              # Post detail + chat
│       ├── personas/                # Persona management
│       │   ├── [id]/               # Voice extraction, calibration, refinement
│       │   └── new/
│       ├── settings/                # User preferences
│       └── share/                   # URL sharing entry point
├── lib/
│   ├── components/                  # Svelte 5 UI components
│   │   ├── chat/                   # Chat interface components
│   │   ├── layout/                 # App shell, navigation
│   │   ├── persona/               # Persona cards, forms
│   │   ├── queue/                  # Queue list, filters
│   │   └── ui/                    # Shared UI primitives
│   ├── schemas/                    # Zod validation schemas
│   ├── server/
│   │   ├── db/                    # Drizzle schema + connection
│   │   ├── services/              # Business logic (chat, voice, queue, persona, draft, scraper)
│   │   ├── auth/                  # Password hashing
│   │   └── chat-prompt.ts         # System prompt construction
│   ├── stores/                    # Svelte stores
│   └── utils/                     # Shared utilities
drizzle/                            # Migration files
e2e/                                # Playwright E2E tests
```

## Contributing

1. Fork the repo and create a feature branch
2. Run `bun install` and `docker compose up postgres -d`
3. Copy `.env.example` to `.env` and configure
4. Make your changes with tests
5. Ensure `bun run typecheck` and `bun test` pass
6. Open a pull request against `main`

**Code style:**
- Svelte 5 runes (`$state`, `$derived`, `$effect`) — no legacy reactive syntax
- Server logic in `src/lib/server/services/` with dependency injection
- Zod schemas for all user input validation
- Co-located unit tests (`*.test.ts` next to source files)

## Security Considerations

This project is under active development. A security audit identified these known areas for improvement:

- **No rate limiting** — Auth endpoints and AI API routes have no throttling. Deploy behind Cloudflare WAF rate limiting rules in production.
- **SSRF on URL scraping** — User-provided URLs are fetched server-side without private IP blocking. Cloudflare Workers network isolation provides some mitigation.
- **Prompt injection surface** — Scraped post content flows into AI system prompts. This is inherent to the product design but scraped third-party content could contain adversarial instructions.
- **Security headers** — CSP, HSTS, X-Frame-Options, and X-Content-Type-Options are configured in the server hooks.

See `tasks/security-audit.md` for the full audit report.

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE) — you can use, modify, and share the code for any noncommercial purpose.
