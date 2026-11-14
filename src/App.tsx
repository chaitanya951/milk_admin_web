import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { useAuth } from '@/store/auth'
import { pageImports } from '@/routes'

// Route-level code splitting: every page is its own chunk, fetched on demand
// (and prefetched from the sidebar on hover/focus).
const Login = lazy(pageImports.Login)
const Dashboard = lazy(pageImports.Dashboard)
const Stores = lazy(pageImports.Stores)
const Products = lazy(pageImports.Products)
const Inventory = lazy(pageImports.Inventory)
const Orders = lazy(pageImports.Orders)
const OrderDetail = lazy(pageImports.OrderDetail)
const People = lazy(pageImports.People)
const Payments = lazy(pageImports.Payments)
const Payouts = lazy(pageImports.Payouts)
const Offers = lazy(pageImports.Offers)
const Subscriptions = lazy(pageImports.Subscriptions)
const Support = lazy(pageImports.Support)
const Reports = lazy(pageImports.Reports)
const Approvals = lazy(pageImports.Approvals)
const Settings = lazy(pageImports.Settings)
const NotFound = lazy(pageImports.NotFound)

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuth((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

/** Layout-stable route fallback (no spinners — shimmer only, no layout shift). */
function RouteFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <div className="skeleton h-9 w-64 rounded-xl" />
      <div className="skeleton h-4 w-80 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[110px] rounded-card" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="skeleton h-[300px] rounded-card lg:col-span-6" />
        <div className="skeleton h-[300px] rounded-card lg:col-span-3" />
        <div className="skeleton h-[300px] rounded-card lg:col-span-3" />
      </div>
    </div>
  )
}

const page = (el: React.ReactNode) => <Suspense fallback={<RouteFallback />}>{el}</Suspense>

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={page(<Login />)} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* 1 — Dashboard */}
        <Route path="/dashboard" element={page(<Dashboard />)} />
        {/* 2 — Stores & service areas */}
        <Route path="/stores" element={page(<Stores />)} />
        {/* 3 — Products & pricing */}
        <Route path="/products" element={page(<Products />)} />
        {/* 4 — Inventory */}
        <Route path="/inventory" element={page(<Inventory />)} />
        {/* 5 — Orders & delivery */}
        <Route path="/orders" element={page(<Orders />)} />
        <Route path="/orders/:id" element={page(<OrderDetail />)} />
        {/* 6 — People */}
        <Route path="/people" element={page(<People />)} />
        {/* 7 — Payments, refunds & wallets */}
        <Route path="/payments" element={page(<Payments />)} />
        {/* 8 — Rider payouts & COD */}
        <Route path="/payouts" element={page(<Payouts />)} />
        {/* 9 — Offers & notifications */}
        <Route path="/offers" element={page(<Offers />)} />
        {/* 10 — Subscriptions */}
        <Route path="/subscriptions" element={page(<Subscriptions />)} />
        {/* 11 — Support & reviews */}
        <Route path="/support" element={page(<Support />)} />
        {/* 12 — Reports & exports */}
        <Route path="/reports" element={page(<Reports />)} />
        {/* 13 — Approvals & compliance */}
        <Route path="/approvals" element={page(<Approvals />)} />
        {/* 14 — Settings & system */}
        <Route path="/settings" element={page(<Settings />)} />
        <Route path="*" element={page(<NotFound />)} />
      </Route>
    </Routes>
  )
}
