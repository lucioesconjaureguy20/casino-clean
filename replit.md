# ManderBet Casino

A full-featured provably fair crypto casino with original games (Dice, Plinko, Keno, Blackjack, Mines, HiLo, Roulette, Baccarat, Limbo), deposits/withdrawals, VIP rewards, affiliates, and live support chat.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/casino run dev` — run the casino frontend (port 22412)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env secrets: `SESSION_SECRET`, `DATABASE_URL` (Postgres), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PLISIO_IPN_SECRET`, `NOWPAYMENTS_API_KEY`, `CRYPTOMUS_MERCHANT_ID`, `CRYPTOMUS_API_KEY`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS v4, Framer Motion, React Router DOM, Supabase JS client
- API: Express 5 + pino logging
- DB: PostgreSQL (Replit) + Drizzle ORM + Supabase for auth/profiles
- Payments: Plisio, NowPayments, Cryptomus (crypto payments)
- Build: esbuild (CJS bundle for api-server), Vite (casino frontend)

## Where things live

- `artifacts/casino/src/` — React frontend (App.tsx, games, pages, hooks, components)
- `artifacts/casino/public/` — Game images, banners, assets
- `artifacts/api-server/src/` — Express backend
  - `src/app.ts` — Express app setup
  - `src/routes/` — auth, deposit, withdrawals, admin, affiliate, stats, rewards, etc.
  - `src/lib/` — sessionStore, supabaseCache, requireAuth, atomicBalance, plisio-poller, etc.
- `lib/db/src/schema/index.ts` — Drizzle schema (app_settings table)
- `lib/api-spec/openapi.yaml` — OpenAPI spec

## Architecture decisions

- Supabase handles user profiles, game bets, and most relational data; Replit Postgres (via Drizzle) only stores app_settings
- Sessions are stored in Supabase profiles table (session_token column); falls back to memory-only if column missing
- Plisio, NowPayments, and Cryptomus handle crypto deposit/withdrawal flows via webhooks
- Frontend communicates with backend via `/api/*` routes (same origin, path-based routing)
- Backend uses lazy Proxy for db/pool to avoid throwing at import time when DATABASE_URL is missing

## Product

- 9 original provably fair casino games
- Crypto deposits and withdrawals (Plisio, NowPayments, Cryptomus)
- VIP rewards system, affiliate/referral program
- Live support chat, notifications, admin panel
- Multi-language support (ES, EN, PT, IT, KO, NL, PL, RU, TR)

## User preferences

- Project imported from GitHub: https://github.com/lucioesconjaureguy20/casino-clean
- User has uploaded secret keys to Replit

## Gotchas

- The casino backend (`src/src/`) is nested inside `artifacts/api-server/src/` — actual code lives at `src/app.ts`, `src/index.ts`, `src/routes/`, `src/lib/`
- SessionStore warns about missing `profiles.session_token` column — needs Supabase migration
- Migration warnings about missing Supabase tables are expected until Supabase DB is configured
- Always restart the api-server workflow after code changes (it builds first via esbuild)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
