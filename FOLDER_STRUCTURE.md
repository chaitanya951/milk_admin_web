# Folder structure

One repo, two portals, one shared core. **Admin and Store apps never import from each other**
(enforced by ESLint `no-restricted-imports` in `.eslintrc.cjs`); everything used by both lives
in `src/shared/` or `src/auth/`.

```
src/
├── apps/
│   ├── admin/                      # ADMIN PORTAL (role = admin) — /admin/* URLs
│   │   ├── pages/                  # AdminDashboard.tsx, AdminStores.tsx, … (Admin* prefix)
│   │   ├── api/                    # queries.ts (keys 'admin:*'), mutations.ts
│   │   ├── routes/                 # AdminLayout.tsx, adminRoutes.ts
│   │   └── components/             # admin-only components (CommandPalette)
│   └── store/                      # STORE MANAGER PORTAL (role = store_manager) — /store/* URLs
│       ├── pages/                  # StoreDashboard.tsx, StoreOrdersPicking.tsx, … (Store* prefix)
│       ├── api/                    # storeApi.ts, storeQueries.ts ('store:*' keys), storeMutations.ts,
│       │                           # storeSelectors.ts (getStoreDashboard aggregation)
│       └── routes/                 # StoreLayout.tsx (dark sidebar + store selector), storeRoutes.ts
├── auth/                           # UNIFIED LOGIN + guards (shared by both portals)
│   ├── authStore.ts                # role from account, lockout, assigned stores, active store
│   ├── LoginPage.tsx               # Admin | Store Manager toggle, demo panel (VITE_DEMO_MODE)
│   ├── ForgotPasswordPage.tsx
│   ├── ResetPasswordPage.tsx
│   └── ForbiddenPage.tsx           # /403 — wrong portal for this role
├── shared/                         # everything used by BOTH portals
│   ├── components/                 # ui/ (base, overlays, form), DataTable, KpiCard, charts,
│   │   │                           # domain.tsx (ApprovalBadge, StatusTimeline, CsvImportWizard…),
│   │   │                           # map/ (LazyMap, MapInner, PolygonEditor)
│   ├── layouts/                    # AppShell (generic), Sidebar (light/dark), Topbar (prop-driven)
│   ├── data/                       # db.ts (zustand + journal), seed.ts, seedStorePortal.ts,
│   │                               # selectors.ts, rng.ts, api.ts (admin-side core)
│   ├── hooks/                      # flags.ts, misc.ts (count-up, stagger, OS)
│   ├── lib/                        # utils.ts (fmtINR…), queryClient.ts, toast.ts
│   ├── illustrations/              # scenes.tsx (all animated headers), avatars, productIcons, Logo
│   ├── pages/                      # NotFound.tsx
│   ├── services/                   # exports.ts (xlsx/csv), supabaseClient.ts
│   ├── styles/                     # index.css (design tokens, animations)
│   └── types/                      # index.ts — the single typed domain
├── App.tsx                         # routes: /login /forgot-password /reset-password /403 /404
│                                   # /admin/* (RequireRole admin) · /store/* (RequireRole store_manager)
└── main.tsx
```

## Query keys
- Admin: `['admin:', …]` (src/apps/admin/api/queries.ts)
- Store: `['store:', …]` (src/apps/store/api/storeQueries.ts)

## Boundary enforcement
`npx npm run lint` runs ESLint; `.eslintrc.cjs` forbids:
- `src/apps/admin/**` importing `@/apps/store/*`
- `src/apps/store/**` importing `@/apps/admin/*`
- `src/shared/**` + `src/auth/**` importing any `@/apps/*`
