# DairyDirect — Monorepo (two standalone web apps)

DairyDirect is split into **two independent web apps**, each with its **own login page**, its own folder, port, build and deploy pipeline. Both apps talk to the **same backend** (shared mock database / one Supabase project) so data stays connected: a store manager pauses their store → the Admin sees it paused; a manager approves rider documents → Admin People shows the status; a manager adjusts stock → Admin Inventory and Approvals update.

| App | Folder | Port | Login | Demo account (only when `VITE_DEMO_MODE=true`) |
|---|---|---|---|---|
| **Admin Portal** | `apps/admin-web` | 5173 | `/login` (admin-themed) | `admin@dairydirect.in` / `Admin@123` |
| **Store Manager Portal** | `apps/store-web` | 5174 | `/login` (store-manager-themed) | `chaitanya.raju@srm.edu.in` / `Store@123` |

There is **no unified login**: no role toggle, no cross-portal redirect, no `/admin/*` or `/store/*` URL prefixes, no 403 cross-portal page. Each app accepts **only its own role** — the role comes from the account record (`profiles.role` / workforce record), never from the UI. Signing in to one app never signs in to (or out of) the other: separate Zustand stores, separate session keys (`dd_admin_session`, `dd_store_session`), separate guards, idle timeouts and logout.

## Repository layout

```
dairydirect/
├── README.md / FOLDER_STRUCTURE.md     ← docs (this file + full tree)
├── package.json                        ← npm workspaces + root scripts
├── .eslintrc.cjs                       ← import-boundary enforcement (fails build)
├── .env.example
├── apps/
│   ├── admin-web/                      ← ADMIN WEB (standalone Vite + React + TS)
│   │   ├── package.json  vite.config.ts  index.html  tsconfig.json
│   │   ├── tailwind.config.ts  postcss.config.js  .env.example
│   │   └── src/ (login/ layout/ pages/ api/ components/ + App/routes/main)
│   └── store-web/                      ← STORE MANAGER WEB (standalone Vite + React + TS)
│       ├── package.json  vite.config.ts  index.html  tsconfig.json
│       ├── tailwind.config.ts  postcss.config.js  .env.example
│       └── src/ (login/ layout/ pages/ api/ + App/routes/main)
├── packages/
│   └── shared/                         ← used by BOTH apps (no app-specific logic)
│       └── src/ (ui/ styles/ lib/ services/ mock-db/ types/ hooks/ assets/)
└── supabase/
    ├── migrations/ (000_shared, 100_admin, 200_store)
    ├── policies/   (admin_policies.sql, store_policies.sql)
    └── seed/       (shared.sql, admin.sql, store.sql)
```

See [FOLDER_STRUCTURE.md](./FOLDER_STRUCTURE.md) for the complete annotated tree.

## Run

```bash
npm install          # installs workspaces

npm run dev          # BOTH apps (concurrently): 5173 + 5174
npm run dev:admin    # admin-web only   → http://localhost:5173
npm run dev:store    # store-web only   → http://localhost:5174
```

## Build, quality gates, preview

```bash
npm run build        # build both (each app lints itself first)
npm run build:admin  # admin-web → apps/admin-web/dist
npm run build:store  # store-web → apps/store-web/dist

npm run lint         # ESLint both apps (import boundary = error)
npm run typecheck    # tsc --noEmit both apps
npm run test         # vitest both apps (auth boundary + routes smoke tests)

npm run preview:admin
npm run preview:store
```

## Import boundary (enforced)

`apps/admin-web` and `apps/store-web` **never import from each other**. Both import only from `@dairydirect/shared/*` (source-mapped to `packages/shared/src`). This is enforced three ways:

1. **ESLint `no-restricted-imports`** in `.eslintrc.cjs` — violations are **errors**, and each app's `build` script runs lint first, so a violating import **fails the build**.
2. Vite aliases + tsconfig paths only expose `@dairydirect/shared/*` — there is no alias pointing at the other app.
3. Smoke tests (`npm run test`) assert the auth boundary: an admin account cannot sign in to store-web and a store manager cannot sign in to admin-web (`"This account can't sign in here"`).

## Demo mode

Demo credentials appear (and pre-fill) on the login pages **only** when `VITE_DEMO_MODE=true` in the app's `.env`. Never enable it in production.

## Supabase

Both apps run on the built-in deterministic mock layer by default (`VITE_USE_SUPABASE=false`). To switch to Supabase, set the **same** project URL/anon key in **both** apps' `.env` (data stays connected via the shared project). Apply `supabase/migrations/*.sql` in order, then `policies/*.sql`, then `seed/*.sql`. RLS model:

- **admins** can read everything (and mutate master data);
- **store managers** only rows for their assigned `store_id`s (`is_assigned_store_manager()`).

## Deploy

Deploy each app as its own project (Vercel/Netlify):

- **admin-web** → root directory `apps/admin-web`, build `npm run build`, output `apps/admin-web/dist`
- **store-web** → root directory `apps/store-web`, build `npm run build`, output `apps/store-web/dist`

More detail in each app's README: [apps/admin-web/README.md](./apps/admin-web/README.md) · [apps/store-web/README.md](./apps/store-web/README.md)
