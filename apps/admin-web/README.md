# DairyDirect — Admin Portal (`apps/admin-web`)

Standalone Vite + React + TypeScript web app. **Its own login page** at `/login` (admin-only), its own dev server on **port 5173**, its own build output. Shares the backend (mock DB / Supabase) with `apps/store-web` through `@dairydirect/shared`, but never imports from that app — enforced by ESLint (`no-restricted-imports`, build-failing).

## Run

```bash
# from repo root
npm run dev:admin          # → http://localhost:5173
# or from this folder
npm run dev
```

## Build / quality

```bash
npm run build:admin        # lint + vite build → dist/
npm run lint -w @dairydirect/admin-web
npm run typecheck
npm run test               # vitest smoke tests (incl. cross-role rejection)
npm run preview:admin
```

## Pages & routes (14 sections, root paths — no `/admin` prefix)

| Route | Page (component) |
|---|---|
| `/login` | Admin login (email + password, show/hide, remember me, forgot/reset password, validation, 5-attempt lockout, loading state, animated admin-themed hero) |
| `/forgot-password`, `/reset-password` | Password recovery flow |
| `/dashboard` | AdminDashboard |
| `/stores` | AdminStores — stores & service areas |
| `/products` | AdminProducts — products & pricing |
| `/inventory` | AdminInventory |
| `/orders`, `/orders/:id` | AdminOrders / AdminOrderDetail — orders & delivery |
| `/people` | AdminPeople |
| `/payments` | AdminPayments — payments, refunds & wallets |
| `/payouts` | AdminPayouts — rider payouts & COD |
| `/offers` | AdminOffers — offers & notifications |
| `/subscriptions` | AdminSubscriptions |
| `/support` | AdminSupport — support & reviews |
| `/reports` | AdminReports — reports & exports |
| `/approvals` | AdminApprovals — approvals & compliance |
| `/settings` | AdminSettings — settings & system |

Browser tab titles follow `Admin · <page> · DairyDirect`. The sidebar is light with the **Admin Portal** badge.

## Auth

- Role check happens in `src/login/authApi.ts` against the account record (mock `workforce` / Supabase `profiles.role`) — **admin only**. Store managers get the generic `"This account can't sign in here"`.
- Session store: `useAdminAuth` (Zustand persist, storage key **`dd_admin_session`**). Theme key `dd_admin_theme`, query-cache key `dd_admin_query_cache_v1`.
- Route guard: `src/login/RequireAdmin.tsx` → redirects to `/login` (and back after sign-in).
- Idle timeout 30 min (warn at 28) + cross-tab logout, handled by the shared shell with this app's session key.
- Sign out → `/login`; signing in here never affects store-web.

## Env vars (`.env.example` → `.env`)

| Var | Purpose |
|---|---|
| `VITE_DEMO_MODE` | `true` shows the demo account panel and pre-fills `admin@dairydirect.in` / `Admin@123`. Anything else hides it. |
| `VITE_USE_SUPABASE` | `true` switches the data layer to Supabase (same project as store-web). |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase project credentials. |
| `VITE_RAZORPAY_KEY_ID`, `VITE_TWILIO_*` | Integrations (mocked when empty). |
| `VITE_MOCK_LATENCY` | Fixed mock latency in ms (default random 60–120 ms). |

## Deploy (separate project)

- **Vercel**: new project → Root Directory `apps/admin-web` → Build `npm run build` → Output `dist`
- **Netlify**: Base `apps/admin-web` → Build `npm run build` → Publish `apps/admin-web/dist`; SPA redirect `/* → /index.html`
- Set the env vars above in the hosting dashboard (`VITE_DEMO_MODE` unset/false in production).
