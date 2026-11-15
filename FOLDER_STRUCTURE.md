# DairyDirect — FOLDER_STRUCTURE.md

Final monorepo tree after the two-app split. Each app is fully standalone (own login, port, build); the shared package carries no app-specific logic.

```
dairydirect/
├── README.md                          ← monorepo overview, commands, deploy notes
├── FOLDER_STRUCTURE.md                ← this file
├── AGENTS_CONTEXT.md                  ← historical admin spec (pre-split)
├── AGENTS_STORE_CONTEXT.md            ← historical store portal spec (pre-split)
├── package.json                       ← npm workspaces: apps/* + packages/*; root scripts
├── tsconfig.json                      ← base TS config extended by both apps
├── .eslintrc.cjs                      ← import-boundary rules (cross-app imports = build failure)
├── .env.example                       ← documents shared env vars
├── .gitignore
│
├── apps/
│   ├── admin-web/                     ← ══ ADMIN WEB (standalone) ══
│   │   ├── package.json               ← @dairydirect/admin-web (port 5173)
│   │   ├── vite.config.ts             ← alias @ + @dairydirect/shared, PWA "DairyDirect Admin Portal"
│   │   ├── tsconfig.json  tailwind.config.ts  postcss.config.js
│   │   ├── index.html                 ← "DairyDirect — Admin Portal"
│   │   ├── .env.example  .env (gitignored)
│   │   ├── public/ (favicon.svg, fonts/poppins-*.woff2)
│   │   ├── tests/auth.test.ts         ← smoke tests incl. cross-role rejection
│   │   └── src/
│   │       ├── main.tsx               ← providers, query cache (key dd_admin_query_cache_v1)
│   │       ├── App.tsx                ← routes at ROOT (no /admin prefix): /login /dashboard /stores …
│   │       ├── routes.ts              ← ADMIN_PAGE_IMPORTS + ADMIN_NAV_PATH_IMPORTS
│   │       ├── vite-env.d.ts
│   │       ├── login/                 ← ADMIN LOGIN (its own, no toggle)
│   │       │   ├── AdminLoginPage.tsx     ← "Admin Portal" badge, admin-themed hero, lockout, caps-lock, remember me
│   │       │   ├── ForgotPasswordPage.tsx / ResetPasswordPage.tsx
│   │       │   ├── authStore.ts           ← useAdminAuth, persisted as dd_admin_session
│   │       │   ├── authApi.ts             ← role checked from workforce/profiles record (admin only)
│   │       │   └── RequireAdmin.tsx       ← route guard → /login (remembers ?from)
│   │       ├── layout/AdminLayout.tsx     ← light sidebar, 14 sections, tab title "Admin · <page> · DairyDirect"
│   │       ├── pages/                     ← 14 admin sections (AdminDashboard, AdminStores, AdminProducts,
│   │       │                                 AdminInventory, AdminOrders, AdminOrderDetail, AdminPeople,
│   │       │                                 AdminPayments, AdminPayouts, AdminOffers, AdminSubscriptions,
│   │       │                                 AdminSupport, AdminReports, AdminApprovals, AdminSettings)
│   │       ├── api/ (queries.ts ['admin',…], mutations.ts)
│   │       └── components/ (CommandPalette.tsx)
│   │
│   └── store-web/                     ← ══ STORE MANAGER WEB (standalone) ══
│       ├── package.json               ← @dairydirect/store-web (port 5174)
│       ├── vite.config.ts             ← alias @ + @dairydirect/shared, PWA "DairyDirect Store Manager Portal"
│       ├── tsconfig.json  tailwind.config.ts  postcss.config.js
│       ├── index.html                 ← "DairyDirect — Store Manager Portal"
│       ├── .env.example  .env (gitignored)
│       ├── public/ (favicon.svg, fonts/poppins-*.woff2)
│       ├── tests/auth.test.ts         ← smoke tests incl. cross-role rejection
│       └── src/
│           ├── main.tsx               ← providers, query cache (key dd_store_query_cache_v1)
│           ├── App.tsx                ← routes at ROOT (no /store prefix): /login /dashboard /orders-picking …
│           ├── routes.ts              ← STORE_PAGE_IMPORTS + STORE_NAV_PATH_IMPORTS
│           ├── vite-env.d.ts
│           ├── login/                 ← STORE LOGIN (its own, no toggle)
│           │   ├── StoreLoginPage.tsx     ← "Store Manager Portal" badge, dark-green hero, lockout, remember me
│           │   ├── ForgotPasswordPage.tsx / ResetPasswordPage.tsx
│           │   ├── authStore.ts           ← useStoreAuth (dd_store_session) + useActiveStore (dd_store_active_store)
│           │   ├── authApi.ts             ← role checked from workforce/profiles record (store_manager only)
│           │   └── RequireStoreManager.tsx
│           ├── layout/StoreLayout.tsx     ← dark-green sidebar, 9 sections, store selector (only when
│           │                                 manager has >1 store), "No store assigned, contact admin"
│           │                                 screen with Sign out, tab title "Store · <page> · DairyDirect"
│           ├── pages/                     ← 9 store sections (StoreDashboard, StoreOrdersPicking,
│           │                                 StoreInventory, StoreReturns, StoreRiderApplications,
│           │                                 StoreCodDeposits, StoreStoreStatus, StoreStaffWorkload,
│           │                                 StoreNotificationsAccount)
│           └── api/ (storeApi, storeQueries ['store', storeId,…], storeMutations, storeSelectors)
│
├── packages/
│   └── shared/                        ← ══ @dairydirect/shared (no app-specific logic) ══
│       ├── package.json               ← exports ./* → ./src/*
│       └── src/
│           ├── ui/                    ← KpiCard, DataTable, charts (ChartCard), Drawer/overlays,
│           │   ├── shell/ (AppShell, Sidebar, Topbar, ui.ts)   ← auth-agnostic shell (props-injected)
│           │   ├── map/ (LazyMap, MapInner, PolygonEditor)
│           │   └── base.tsx, form.tsx, overlays.tsx, misc.tsx, domain.tsx, NotFound.tsx …
│           ├── styles/index.css       ← design tokens + tailwind layers + dark theme
│           ├── lib/                   ← utils (en-IN formatters, date helpers), toast, queryClient
│           ├── services/              ← supabase client, realtime, exports
│           ├── mock-db/               ← ONE shared dataset + repositories (db, api, seed, seedStorePortal,
│           │                              selectors, rng, staffIds) — both apps read/write the same store
│           ├── types/index.ts         ← Store, Order, Product, Rider, WorkforceAccount …
│           ├── hooks/                 ← flags (feature flags), misc
│           └── assets/                ← Logo, avatars, productIcons, scenes (illustrations)
│
└── supabase/
    ├── migrations/
    │   ├── 000_shared.sql             ← cities, legal entities, stores, zones, products/variants,
    │   │                                 stock levels, workforce (auth/roles for BOTH apps)
    │   ├── 100_admin.sql              ← customers, riders, orders, payments, payouts, offers,
    │   │                                 subscriptions, support, reports, approvals, settings
    │   └── 200_store.sql              ← store portal tables (picking, returns, rider docs, COD, status…)
    ├── policies/
    │   ├── admin_policies.sql         ← admins read everything; admin_write on master data
    │   └── store_policies.sql         ← managers only rows of their assigned store_ids
    └── seed/
        ├── shared.sql                 ← reference data (both apps)
        ├── admin.sql                  ← demo admin workforce account
        └── store.sql                  ← demo manager + store_managers mapping (2 stores → selector)
```

## What moved / was removed / was added

**Moved (git mv, history preserved)**
- `src/shared/*` → `packages/shared/src/*` (renames: `components`→`ui`, `layouts`→`ui/shell`, `illustrations`→`assets`, `data`→`mock-db`, `pages/NotFound`→`ui/NotFound`)
- `src/apps/admin/{api,components,pages}` → `apps/admin-web/src/*`; `routes/AdminLayout.tsx` → `src/layout/AdminLayout.tsx`; `routes/adminRoutes.ts` → `src/routes.ts`
- `src/apps/store/{api,pages}` → `apps/store-web/src/*`; `routes/StoreLayout.tsx` → `src/layout/StoreLayout.tsx`; `routes/storeRoutes.ts` → `src/routes.ts`
- `public/` → copied into both apps' `public/`
- `supabase/schema.sql` → split into `migrations/000_shared|100_admin|200_store.sql` + `policies/admin_policies|store_policies.sql`; `seed.sql` → `seed/shared.sql` (+ new `admin.sql`, `store.sql`)

**Removed**
- Unified login `src/auth/LoginPage.tsx` with the **"Admin | Store Manager" toggle**
- Role-based portal redirect (`RoleRedirect`) and `/403` cross-portal page (`src/auth/ForbiddenPage.tsx`)
- All `/admin/*` and `/store/*` URL prefixes (routes now live at each app's root)
- Unified `src/auth/authStore.ts` (`dairydirect-auth-v3` key) — replaced by per-app stores
- Old single-app root files (`src/App.tsx`, `src/main.tsx`, root `index.html`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`) and the old monolithic `supabase/schema.sql` / `seed.sql`

**Added**
- Two standalone apps with their own `package.json`, `vite.config.ts` (ports **5173** / **5174**), `index.html`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `.env.example`, `public/`
- Per-app login modules (`login/`): themed login page, forgot/reset password, `authApi`, `authStore` (`dd_admin_session` / `dd_store_session`), `RequireAdmin` / `RequireStoreManager` guards
- `packages/shared` workspace (`@dairydirect/shared`) consumed via `@dairydirect/shared/*` alias in both apps
- Root npm-workspaces `package.json` with `dev`, `dev:admin`, `dev:store`, `build:admin`, `build:store`, `lint`, `typecheck`, `test` scripts (+ per-app variants)
- Root `.eslintrc.cjs` enforcing the cross-app import boundary as build-failing errors
- Per-app vitest smoke tests (auth boundary + routes shape)
- Tab titles `Admin · <page> · DairyDirect` / `Store · <page> · DairyDirect`
- "No store assigned, contact admin" screen with Sign out (store-web)
