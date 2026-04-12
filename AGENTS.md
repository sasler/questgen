<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

On this Next.js version, `middleware.ts` is deprecated and `proxy.ts` is the correct file convention. Never add both entrypoints at once; keep a single `src/proxy.ts` file and read the relevant `node_modules/next/dist/docs/` proxy docs before changing file conventions.
<!-- END:nextjs-agent-rules -->

# QuestGen Agent Workflow

## TDD Workflow (mandatory for all tasks)

1. **Write a failing test** — only tests that make sense for the functionality
2. **Implement the task** — make the test pass
3. **Run ALL tests** — `npx vitest run`. If anything fails, fix it before continuing.
4. **Code review** — use a subagent of different model for code review
5. **Address issues** — fix any code review findings, go back to step 3
6. **Move to next task** — only when all tests pass AND review issues are resolved

## Code review models

If the GPT family of models was used to writhe the code, use Sonnet 4.6. For everything else, use GPT 5.4 for code reviews.

## Commands

```bash
npm test              # Run all tests (vitest)
npm run test:watch    # Watch mode
npm run typecheck     # TypeScript strict check
npm run format        # Prettier
npm run dev           # Dev server (localhost:3000)
npx next build        # Production build
npx playwright test   # E2E tests (requires dev server running)
```

## Architecture Principles

- **AI is NOT the game engine** — deterministic code validates all state changes
- **World topology is deterministic and seeded per game** — room graphs, blockers, and the win path come from code, not free-form AI output
- **Connections are single bidirectional edges** — one `Connection` already includes `direction` and `reverseDirection`; do not add mirrored reverse duplicates
- **Local context only** — only current room + neighbors sent to AI per turn
- **Settings in localStorage** — BYOK keys never sent to server-side storage
- **Split Redis keys** — world, player, history, settings, metadata stored separately
- **Deployer vs player UX** — regular players should normally only see Connect GitHub Copilot; when deployment auth is missing, the landing page should still provide an actionable path to `/setup`
- **Unified settings** — all client settings flow through `src/lib/settings.ts` (single source of truth)
- **Copilot status checks stay lightweight** — do not boot the Copilot SDK or call `listModels()` from simple status endpoints; only actual model-loading paths should start the CLI/runtime
- **Deployment auth env compatibility** — accept both `GITHUB_ID` / `GITHUB_SECRET` and `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`; docs should prefer the `GITHUB_CLIENT_*` names, and `NEXTAUTH_URL` must point at the QuestGen app URL, not Upstash
- **Deployment storage envs must be explicit** — Vercel must have both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; if either is missing, fail with a clear config error instead of letting Upstash surface a vague `/pipeline` URL parse failure
- **Vercel Copilot runtime stays binary-first** — preserve the `next.config.ts` `serverExternalPackages` and `outputFileTracingIncludes` entries that trace `@github/copilot-sdk` plus the platform `@github/copilot-<platform>-<arch>` executable; falling back to the JS launcher can fail in serverless runtimes and bloat function size
- **Hidden tester commands stay hidden in the UI** — `/showfullmap` and `/showentitytables` are repo-documented debug tools, not player-facing affordances
- **Player hints stay actionable but spoiler-bounded** — `/hint` should point to the next useful step in tone, not dump the whole solution
- **Copilot SDK text streaming uses delta events** — enable session streaming and forward `assistant.message_delta` chunks immediately; do not buffer them until the end

## Key Directories

- `src/types/` — TypeScript interfaces and Zod schemas
- `src/engine/` — Deterministic game engine, world validator, context builder
- `src/providers/` — AI provider abstraction (Copilot SDK + BYOK)
- `src/lib/` — Storage, auth, settings, utilities
- `src/prompts/` — System prompts and prompt builders
- `src/components/` — React UI components
- `src/app/` — Next.js App Router pages and API routes
- `e2e/` — Playwright E2E tests

## Key Pages

- `/` — Landing page (auth-aware)
- `/setup` — Owner-only deployment setup
- `/settings` — AI provider config, model selection, connection status
- `/guide` — How to get GitHub Copilot (free tier instructions)
- `/new-game` — New game creation wizard
- `/game/[id]` — Main gameplay page
- `/dashboard` — Saved games list
