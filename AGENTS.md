<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QuestGen Agent Workflow

## TDD Workflow (mandatory for all tasks)

1. **Write a failing test** — only tests that make sense for the functionality
2. **Implement the task** — make the test pass
3. **Run ALL tests** — `npx vitest run`. If anything fails, fix it before continuing.
4. **Code review** — use GPT 5.4 subagent for code review
5. **Address issues** — fix any code review findings, go back to step 3
6. **Move to next task** — only when all tests pass AND review issues are resolved

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
- **Local context only** — only current room + neighbors sent to AI per turn
- **Settings in localStorage** — BYOK keys never sent to server-side storage
- **Split Redis keys** — world, player, history, settings, metadata stored separately
- **Graceful degradation** — when auth env vars are missing, app redirects to /setup wizard
- **Unified settings** — all client settings flow through `src/lib/settings.ts` (single source of truth)

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
- `/setup` — Setup wizard (shown when env vars not configured)
- `/settings` — AI provider config, model selection, connection status
- `/guide` — How to get GitHub Copilot (free tier instructions)
- `/new-game` — New game creation wizard
- `/game/[id]` — Main gameplay page
- `/dashboard` — Saved games list
