import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AdminLayout } from '@/apps/admin/routes/AdminLayout'
import { StoreLayout } from '@/apps/store/routes/StoreLayout'
import { useAuth, type AuthRole } from '@/auth/authStore'
import { adminPageImports } from '@/apps/admin/routes/adminRoutes'
import { storePageImports } from '@/apps/store/routes/storeRoutes'

// Route-level code splitting, one lazy bundle per portal: a store manager never
// downloads admin code and vice versa (enforced by ESLint import boundaries too).
const Login = lazy(() => import('@/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const ForgotPassword = lazy(() => import('@/auth/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPassword = lazy(() => import('@/auth/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const Forbidden = lazy(() => import('@/auth/ForbiddenPage').then(m => ({ default: m.ForbiddenPage })))
const NotFound = lazy(() => import('@/shared/pages/NotFound').then(m => ({ default: m.NotFound })))

const Admin = {
  Dashboard: lazy(adminPageImports.AdminDashboard),
  Stores: lazy(adminPageImports.AdminStores),
  Products: lazy(adminPageImports.AdminProducts),
  Inventory: lazy(adminPageImports.AdminInventory),
  Orders: lazy(adminPageImports.AdminOrders),
  OrderDetail: lazy(adminPageImports.AdminOrderDetail),
  People: lazy(adminPageImports.AdminPeople),
  Payments: lazy(adminPageImports.AdminPayments),
  Payouts: lazy(adminPageImports.AdminPayouts),
  Offers: lazy(adminPageImports.AdminOffers),
  Subscriptions: lazy(adminPageImports.AdminSubscriptions),
  Support: lazy(adminPageImports.AdminSupport),
  Reports: lazy(adminPageImports.AdminReports),
  Approvals: lazy(adminPageImports.AdminApprovals),
  Settings: lazy(adminPageImports.AdminSettings),
}

const Store = {
  Dashboard: lazy(storePageImports.StoreDashboard),
  OrdersPicking: lazy(storePageImports.StoreOrdersPicking),
  Inventory: lazy(storePageImports.StoreInventory),
  Returns: lazy(storePageImports.StoreReturns),
  RiderApplications: lazy(storePageImports.StoreRiderApplications),
  CodDeposits: lazy(storePageImports.StoreCodDeposits),
  StoreStatus: lazy(storePageImports.StoreStoreStatus),
  StaffWorkload: lazy(storePageImports.StoreStaffWorkload),
  NotificationsAccount: lazy(storePageImports.StoreNotificationsAccount),
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuth((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

/** Portal guard: opening the wrong portal URL (or an unassigned store manager on /admin) -> /403. */
function RequireRole({ role, children }: { role: AuthRole; children: JSX.Element }) {
  const user = useAuth((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to="/403" replace />
  return children
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

export default function App() {
  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={page(<Login />)} />
      <Route path="/forgot-password" element={page(<ForgotPassword />)} />
      <Route path="/reset-password" element={page(<ResetPassword />)} />
      <Route path="/403" element={page(<Forbidden />)} />
      <Route path="/404" element={page(<NotFound />)} />

      {/* admin portal (role = admin only) */}
      <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
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

      {/* store manager portal (role = store_manager only) */}
      <Route path="/store" element={<RequireRole role="store_manager"><StoreLayout /></RequireRole>}>
        <Route index element={<Navigate to="/store/dashboard" replace />} />
        <Route path="dashboard" element={page(<Store.Dashboard />)} />
        <Route path="orders-picking" element={page(<Store.OrdersPicking />)} />
        <Route path="inventory" element={page(<Store.Inventory />)} />
        <Route path="returns" element={page(<Store.Returns />)} />
        <Route path="rider-applications" element={page(<Store.RiderApplications />)} />
        <Route path="cod-deposits" element={page(<Store.CodDeposits />)} />
        <Route path="status" element={page(<Store.StoreStatus />)} />
        <Route path="staff-workload" element={page(<Store.StaffWorkload />)} />
        <Route path="notifications" element={page(<Store.NotificationsAccount />)} />
      </Route>

      {/* / redirects by role; everything else -> /404 */}
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={page(<NotFound />)} />
    </Routes>
  )
}

function RoleRedirect() {
  const user = useAuth((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/store/dashboard'} replace />
}
