# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Casino App (`artifacts/casino`)

**Brand**: Mander Originals — 8 original games, crypto payments (Plisio), Supabase auth, VIP system, affiliate program.

### i18n System

- **12 languages**: es, en, pt, de, fr, id, it, ko, nl, pl, ru, tr
- **LANGS object** in `App.tsx` (lines ~27–1340): all UI string translations, 260+ keys per language
- **Helper files**: `lib/gameLabels.ts`, `lib/gameContent.ts`, `lib/fairnessContent.ts`
- **Usage pattern**:
  - `App.tsx` level: `const t = useCallback((key) => tl(lang, key), [lang])`
  - Game components (DiceGame, PlinkoGame, KenoGame, etc.): `const t = (key: string) => tl(lang, key);`
  - `ProfilePage`: `const T = (k: string) => gt(lang, k)`
  - `CasinoFooter`: `tl(lang, key)` directly
- **Goal**: ZERO hardcoded user-facing text — all strings go through `t()` / `tl()` / `gt()`
- **Accepted exceptions**: AdminPanel.tsx (internal tool, Spanish OK), footer legal paragraphs, brand name "Mander Originals"

### Known Non-Blocking Issues

- Plisio poller HTTP 401 errors (invalid API key in dev environment)
- Pre-existing TypeScript errors: `ticketId` type mismatch, `0|1|2|3` union, RouletteGame canvas null, `auth.ts` `data` unknown, BlackjackGame comparison, ProfilePage `T` undefined

### Recent i18n Work (completed)

Added 33 new LANGS keys across all 12 language blocks:
- Auto mode: `advanced`, `onWin`, `onLose`, `stopOnWin`, `stopOnLoss`
- Wallet: `walletSettings`
- UI controls: `resetAction`, `increaseAction`, `zeroOff`, `statsLabel`, `volume`, `invertDir`
- Chat: `writeMessage`, `attachFile`, `emojisLabel`
- Auth: `confirmPassPH`, `setNewPass`, `enterCodePH`, `emailValidErr`, `recoveryMsg`, `emailFmtErr`, `emailFmt`, `emailValidOk`, `resetPassTitle`, `pwdMin8`, `pwdUpper`, `pwdNum`, `pwdSym`, `referralCodeLabel`, `optional`
- Lobby: `searchCurrency`, `searchCurrencies`, `searchGames`, `comingSoonShort`
