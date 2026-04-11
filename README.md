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

### 3. Player Flow

On a configured deployment, regular players only need to:

1. Open QuestGen
2. Click **Connect GitHub Copilot**
3. Approve GitHub access
4. Start playing with their own Copilot subscription

No player should ever need to create OAuth apps or set environment variables.

### 4. Owner Setup (for local development or deployment configuration)

If you are deploying QuestGen yourself, the owner-only **Setup Wizard** at `/setup` helps during local development and troubleshooting:

1. **Generate AUTH_SECRET** — a one-click button generates a secure secret for you
2. **Create a GitHub OAuth App** — this is a one-time deployer task so players can later click **Connect GitHub Copilot**
3. **Set up Upstash Redis** — instructions to create a free Redis database

The wizard checks each step and shows ✓/✗ status in real time on localhost.

> **Why is owner setup still required?** The Copilot SDK's multi-user web app flow needs a GitHub user token from your app's OAuth flow. That means the deployer must configure GitHub sign-in once for the deployment, but each player still uses their **own** GitHub Copilot account afterward.

QuestGen now trusts the active host automatically, so local sign-in works without adding a separate `AUTH_TRUST_HOST` setting.

### Manual Setup (Alternative)

If you prefer to configure manually, copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
AUTH_SECRET=run_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

QuestGen accepts either `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` or
`GITHUB_ID` / `GITHUB_SECRET`.

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsasler%2Fquestgen&env=GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET,AUTH_SECRET,NEXTAUTH_URL,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN&envDescription=See%20README%20for%20setup%20instructions)

**One-time environment variables for the deployment owner:**

- `GITHUB_CLIENT_ID` or `GITHUB_ID` — the GitHub OAuth App **Client ID** (not the numeric App ID)
- `GITHUB_CLIENT_SECRET` or `GITHUB_SECRET` — from your GitHub OAuth App
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` — your QuestGen site URL, for example `https://your-domain.vercel.app`
- `UPSTASH_REDIS_REST_URL` — from Upstash dashboard
- `UPSTASH_REDIS_REST_TOKEN` — from Upstash dashboard

`GITHUB_ID` / `GITHUB_SECRET` are also supported for compatibility, but the
`GITHUB_CLIENT_*` names are recommended for new deployments.

**Important:** `NEXTAUTH_URL` must be the QuestGen app URL, not your Upstash URL. Update your
GitHub OAuth App's callback URL to `https://your-domain.vercel.app/api/auth/callback/github`.

QuestGen's Next.js config also explicitly traces the Copilot SDK and the platform-specific
Copilot CLI binary into the server routes that spawn it. If you refactor deployment config,
keep those `serverExternalPackages` and `outputFileTracingIncludes` entries intact or Vercel
may build successfully but fail at runtime or exceed the function size limit.

After this is configured once, players just click **Connect GitHub Copilot** and use their own subscription.

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

| Component | Technology                                  |
| --------- | ------------------------------------------- |
| Framework | Next.js 15 (App Router)                     |
| Language  | TypeScript (strict)                         |
| Styling   | Tailwind CSS v4                             |
| AI        | GitHub Copilot SDK + BYOK                   |
| Auth      | NextAuth.js v5 + GitHub OAuth               |
| Storage   | Upstash Redis                               |
| Testing   | Vitest + React Testing Library + Playwright |

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
