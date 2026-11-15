# DairyDirect — Store Manager Portal (`apps/store-web`)

Standalone Vite + React + TypeScript web app. **Its own login page** at `/login` (store-manager-only), its own dev server on **port 5174**, its own build output. Shares the backend (mock DB / Supabase) with `apps/admin-web` through `@dairydirect/shared`, but never imports from that app — enforced by ESLint (`no-restricted-imports`, build-failing).

## Run

```bash
# from repo root
npm run dev:store          # → http://localhost:5174
# or from this folder
npm run dev
```

## Build / quality

```bash
npm run build:store        # lint + vite build → dist/
npm run lint -w @dairydirect/store-web
npm run typecheck
npm run test               # vitest smoke tests (incl. cross-role rejection)
npm run preview:store
```

## Pages & routes (9 sections, root paths — no `/store` prefix)

| Route | Page (component) |
|---|---|
| `/login` | Store Manager login (same fields/features as admin login, store-manager-themed dark-green hero, **Store Manager Portal** badge) |
| `/forgot-password`, `/reset-password` | Password recovery flow |
| `/dashboard` | StoreDashboard |
| `/orders-picking` | StoreOrdersPicking — orders & picking |
| `/inventory` | StoreInventory |
| `/returns` | StoreReturns — returns & quality checks |
| `/rider-applications` | StoreRiderApplications |
| `/cod-deposits` | StoreCodDeposits — COD cash deposits |
| `/status` | StoreStoreStatus — store status (pause/resume) |
| `/staff-workload` | StoreStaffWorkload — staff & workload |
| `/notifications` | StoreNotificationsAccount — notifications & account |

Browser tab titles follow `Store · <page> · DairyDirect`. The sidebar is dark-green with the **Store Manager Portal** badge; the **top bar shows the store name**.

## Store selector & no-store screen

- After sign-in → `/dashboard`. The **store selector appears in the top bar only when the manager has more than one store**; with a single store a static label is shown.
- If the manager has **no store assigned**, the app shows **"No store assigned, contact admin"** with a **Sign out** button.

## Auth

- Role check happens in `src/login/authApi.ts` against the account record (mock `workforce` / Supabase `profiles.role`) — **store_manager only**. Admins get the generic `"This account can't sign in here"`.
- Session store: `useStoreAuth` (Zustand persist, storage key **`dd_store_session`**); active store remembered under `dd_store_active_store`. Theme key `dd_store_theme`, query-cache key `dd_store_query_cache_v1`.
- Route guard: `src/login/RequireStoreManager.tsx` → redirects to `/login` (and back after sign-in).
- Idle timeout 30 min (warn at 28) + cross-tab logout, handled by the shared shell with this app's session key.
- Sign out → `/login`; signing in here never affects admin-web.

## Env vars (`.env.example` → `.env`)

| Var | Purpose |
|---|---|
| `VITE_DEMO_MODE` | `true` shows the demo account panel and pre-fills `chaitanya.raju@srm.edu.in` / `Store@123`. Anything else hides it. |
| `VITE_USE_SUPABASE` | `true` switches the data layer to Supabase (same project as admin-web). |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase project credentials. |
| `VITE_RAZORPAY_KEY_ID`, `VITE_TWILIO_*` | Integrations (mocked when empty). |
| `VITE_MOCK_LATENCY` | Fixed mock latency in ms (default random 60–120 ms). |

## Deploy (separate project)

- **Vercel**: new project → Root Directory `apps/store-web` → Build `npm run build` → Output `dist`
- **Netlify**: Base `apps/store-web` → Build `npm run build` → Publish `apps/store-web/dist`; SPA redirect `/* → /index.html`
- Set the env vars above in the hosting dashboard (`VITE_DEMO_MODE` unset/false in production).
