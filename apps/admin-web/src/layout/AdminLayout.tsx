import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell, type AppShellProps } from '@dairydirect/shared/ui/shell/AppShell'
import { LayoutDashboard, Warehouse, Package, Boxes, ShoppingCart, Users, Wallet, Bike, Tags, CalendarClock, Headset, FileOutput, ClipboardCheck, Settings2 } from 'lucide-react'
import { ADMIN_NAV_PATH_IMPORTS } from '../routes'
import { AdminCommandPalette } from '@/components/CommandPalette'
import { useAdminNotifications } from '@/api/queries'
import { useOfferActions } from '@/api/mutations'
import { useAdminAuth } from '@/login/authStore'
import { useQueryClient } from '@tanstack/react-query'

// The 14 admin sections, exactly in order. Admin-web owns the root paths.
export const ADMIN_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/stores', label: 'Stores & service areas', icon: Warehouse },
  { to: '/products', label: 'Products & pricing', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/orders', label: 'Orders & delivery', icon: ShoppingCart },
  { to: '/people', label: 'People', icon: Users },
  { to: '/payments', label: 'Payments, refunds & wallets', icon: Wallet },
  { to: '/payouts', label: 'Rider payouts & COD', icon: Bike },
  { to: '/offers', label: 'Offers & notifications', icon: Tags },
  { to: '/subscriptions', label: 'Subscriptions', icon: CalendarClock },
  { to: '/support', label: 'Support & reviews', icon: Headset },
  { to: '/reports', label: 'Reports & exports', icon: FileOutput },
  { to: '/approvals', label: 'Approvals & compliance', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings & system', icon: Settings2 },
]

/** Browser tab title: "Admin · <page> · DairyDirect". */
function useAdminPageTitle() {
  const location = useLocation()
  useEffect(() => {
    const base = '/' + (location.pathname.split('/')[1] ?? '')
    const label = ADMIN_NAV_ITEMS.find((i) => i.to === base)?.label
      ?? (base === '/orders' ? 'Order detail' : 'DairyDirect')
    document.title = `Admin · ${label} · DairyDirect`
  }, [location.pathname])
}

export function AdminLayout() {
  useAdminPageTitle()
  const user = useAdminAuth((s) => s.user)
  const navigate = useNavigate()
  const { data: notifications = [] } = useAdminNotifications()
  const { markNotificationRead } = useOfferActions()
  const qc = useQueryClient()
  const markAllRead = () => { notifications.forEach((n) => markNotificationRead(n.id)); void qc.invalidateQueries() }
  const shell: AppShellProps = {
    sidebar: {
      items: ADMIN_NAV_ITEMS, homePath: '/dashboard', badge: 'Admin Portal',
      variant: 'light', prefetch: (path) => ADMIN_NAV_PATH_IMPORTS[path]?.(),
    },
    searchPlaceholder: 'Search stores, products, orders, customers, riders…',
    userLabel: 'Admin',
    user: user ? { name: user.name, email: user.email, avatar: user.avatar } : null,
    onSignOut: () => useAdminAuth.getState().logout(),
    homePath: '/dashboard',
    settingsPath: '/settings',
    themeKey: 'dd_admin_theme',
    sessionStorageKey: 'dd_admin_session',
    onSessionExpire: () => { useAdminAuth.getState().logout(); navigate('/login') },
    bellTitle: 'My notifications',
    bellNotifications: notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.at, read: n.read, kind: n.kind })),
    onBellMarkAllRead: () => markAllRead(),
    onBellMarkRead: (id) => markNotificationRead(id),
    overlay: <AdminCommandPalette />,
  }
  return <AppShell {...shell} />
}
