import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/layout/AdminLayout'
import { RequireAdmin } from '@/login/RequireAdmin'
import { ADMIN_PAGE_IMPORTS } from '@/routes'

// Route-level code splitting, one lazy bundle per section.
const LoginPage = lazy(() => import('@/login/AdminLoginPage').then(m => ({ default: m.AdminLoginPage })))
const ForgotPassword = lazy(() => import('@/login/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPassword = lazy(() => import('@/login/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const NotFound = lazy(() => import('@dairydirect/shared/ui/NotFound').then(m => ({ default: m.NotFound })))

const Admin = {
  Dashboard: lazy(ADMIN_PAGE_IMPORTS.AdminDashboard),
  Stores: lazy(ADMIN_PAGE_IMPORTS.AdminStores),
  Products: lazy(ADMIN_PAGE_IMPORTS.AdminProducts),
  Inventory: lazy(ADMIN_PAGE_IMPORTS.AdminInventory),
  Orders: lazy(ADMIN_PAGE_IMPORTS.AdminOrders),
  OrderDetail: lazy(ADMIN_PAGE_IMPORTS.AdminOrderDetail),
  People: lazy(ADMIN_PAGE_IMPORTS.AdminPeople),
  Payments: lazy(ADMIN_PAGE_IMPORTS.AdminPayments),
  Payouts: lazy(ADMIN_PAGE_IMPORTS.AdminPayouts),
  Offers: lazy(ADMIN_PAGE_IMPORTS.AdminOffers),
  Subscriptions: lazy(ADMIN_PAGE_IMPORTS.AdminSubscriptions),
  Support: lazy(ADMIN_PAGE_IMPORTS.AdminSupport),
  Reports: lazy(ADMIN_PAGE_IMPORTS.AdminReports),
  Approvals: lazy(ADMIN_PAGE_IMPORTS.AdminApprovals),
  Settings: lazy(ADMIN_PAGE_IMPORTS.AdminSettings),
}

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

// Admin-web is a standalone app: routes live at the root (no /admin prefix).
// Only admin accounts pass RequireAdmin; the login page is this app's own.
export default function App() {
  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={page(<LoginPage />)} />
      <Route path="/forgot-password" element={page(<ForgotPassword />)} />
      <Route path="/reset-password" element={page(<ResetPassword />)} />
      <Route path="/404" element={page(<NotFound />)} />

      {/* admin sections (role = admin only, enforced by RequireAdmin) */}
      <Route path="/" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={page(<Admin.Dashboard />)} />
        <Route path="stores" element={page(<Admin.Stores />)} />
        <Route path="products" element={page(<Admin.Products />)} />
        <Route path="inventory" element={page(<Admin.Inventory />)} />
        <Route path="orders" element={page(<Admin.Orders />)} />
        <Route path="orders/:id" element={page(<Admin.OrderDetail />)} />
        <Route path="people" element={page(<Admin.People />)} />
        <Route path="payments" element={page(<Admin.Payments />)} />
        <Route path="payouts" element={page(<Admin.Payouts />)} />
        <Route path="offers" element={page(<Admin.Offers />)} />
        <Route path="subscriptions" element={page(<Admin.Subscriptions />)} />
        <Route path="support" element={page(<Admin.Support />)} />
        <Route path="reports" element={page(<Admin.Reports />)} />
        <Route path="approvals" element={page(<Admin.Approvals />)} />
        <Route path="settings" element={page(<Admin.Settings />)} />
      </Route>

      {/* everything else -> /404 */}
      <Route path="*" element={page(<NotFound />)} />
    </Routes>
  )
}
