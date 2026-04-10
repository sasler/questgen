# QuestGen — AI Text Adventure Game

> An AI-powered text adventure game with the humor of The Hitchhiker's Guide to the Galaxy.
> Don't Panic.

QuestGen uses the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) to generate entire
text adventure worlds on-the-fly. Every dungeon, puzzle, and snarky NPC is conjured by AI — so no
two playthroughs are ever the same.

## Features

- 🎮 **Classic text adventure feel** — retro terminal UI with CRT scanlines and green phosphor glow
- 🗺️ **ASCII map with fog of war** — only see rooms you've visited
- 🤖 **AI-generated worlds** — describe your adventure and AI builds it
- 🔒 **Deterministic game engine** — AI proposes, code validates. No cheating.
- 📦 **Inventory management** — collect items, solve puzzles, unlock doors
- 🧠 **Separate models for generation vs gameplay** — use a powerful model for world-building and a fast one for turns
- 💾 **Persistent games** — save progress in Upstash Redis, continue where you left off
- 🔑 **Bring Your Own Key** — use GitHub Copilot (free tier) or your own OpenAI/Anthropic/Azure API key
- 🚀 **Hosted on Vercel** — deploy with one click

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A [GitHub](https://github.com) account
- [GitHub Copilot](https://github.com/features/copilot) (free tier works!) OR your own API key

### 1. Get GitHub Copilot (Free)

1. Go to [github.com/features/copilot](https://github.com/features/copilot)
2. Click **"Get started for free"**
3. Sign in with your GitHub account
4. Choose the **Free** plan — it includes access to AI models
5. That's it! Your GitHub login now works with QuestGen

### 2. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Follow the Setup Wizard

When you first run QuestGen, the built-in **Setup Wizard** at `/setup` will guide you through:

1. **Generate AUTH_SECRET** — a one-click button generates a secure secret for you
2. **Create a GitHub OAuth App** — a pre-filled link takes you to GitHub with all the right values
3. **Set up Upstash Redis** — instructions to create a free Redis database

The wizard checks each step and shows ✓/✗ status in real time.

### Manual Setup (Alternative)

If you prefer to configure manually, copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:
```env
GITHUB_ID=your_github_oauth_client_id
GITHUB_SECRET=your_github_oauth_client_secret
AUTH_SECRET=run_openssl_rand_base64_32
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

Generate `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsasler%2Fquestgen&env=GITHUB_ID,GITHUB_SECRET,AUTH_SECRET,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN&envDescription=See%20README%20for%20setup%20instructions)

**Environment variables to set in Vercel:**
- `GITHUB_ID` — from your GitHub OAuth App
- `GITHUB_SECRET` — from your GitHub OAuth App
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `AUTH_TRUST_HOST` — set to `true`
- `UPSTASH_REDIS_REST_URL` — from Upstash dashboard
- `UPSTASH_REDIS_REST_TOKEN` — from Upstash dashboard

**Important:** Update your GitHub OAuth App's callback URL to `https://your-domain.vercel.app/api/auth/callback/github`.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│  Next.js API  │────▶│  Copilot SDK │
│  (React UI)  │◀────│   Routes      │◀────│  (CLI/BYOK)  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │ Upstash Redis │
                    │  (Game State) │
                    └──────────────┘
```

**Key design principle:** The AI is NOT the game engine. AI generates narrative and proposes actions; the deterministic engine (`game-engine.ts`) validates all state changes against the world graph. This prevents hallucinated exits, bypassed locks, and impossible state transitions.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| AI | GitHub Copilot SDK + BYOK |
| Auth | NextAuth.js v5 + GitHub OAuth |
| Storage | Upstash Redis |
| Testing | Vitest + React Testing Library + Playwright |

## Development

```bash
npm test            # Run all unit tests (Vitest)
npm run test:watch  # Watch mode
npm run typecheck   # TypeScript check
npm run format      # Prettier
npm run dev         # Dev server
npx playwright test # Run E2E tests (requires dev server running)
```

## License

MIT
