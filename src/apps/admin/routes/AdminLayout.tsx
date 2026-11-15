import { AppShell, type AppShellProps } from '@/shared/layouts/AppShell'
import { LayoutDashboard, Warehouse, Package, Boxes, ShoppingCart, Users, Wallet, Bike, Tags, CalendarClock, Headset, FileOutput, ClipboardCheck, Settings2 } from 'lucide-react'
import { ADMIN_NAV_PATH_IMPORTS } from './adminRoutes'
import { AdminCommandPalette } from '@/apps/admin/components/CommandPalette'
import { useAdminNotifications } from '@/apps/admin/api/queries'
import { useOfferActions } from '@/apps/admin/api/mutations'
import { useAuth } from '@/auth/authStore'
import { useQueryClient } from '@tanstack/react-query'

// The 14 admin sections, exactly in order, under /admin/*.
export const ADMIN_NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/stores', label: 'Stores & service areas', icon: Warehouse },
  { to: '/admin/products', label: 'Products & pricing', icon: Package },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/orders', label: 'Orders & delivery', icon: ShoppingCart },
  { to: '/admin/people', label: 'People', icon: Users },
  { to: '/admin/payments', label: 'Payments, refunds & wallets', icon: Wallet },
  { to: '/admin/payouts', label: 'Rider payouts & COD', icon: Bike },
  { to: '/admin/offers', label: 'Offers & notifications', icon: Tags },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CalendarClock },
  { to: '/admin/support', label: 'Support & reviews', icon: Headset },
  { to: '/admin/reports', label: 'Reports & exports', icon: FileOutput },
  { to: '/admin/approvals', label: 'Approvals & compliance', icon: ClipboardCheck },
  { to: '/admin/settings', label: 'Settings & system', icon: Settings2 },
]

export function AdminLayout() {
  const user = useAuth((s) => s.user)
  const { data: notifications = [] } = useAdminNotifications()
  const { markNotificationRead } = useOfferActions()
  const qc = useQueryClient()
  const markAllRead = () => { notifications.forEach((n) => markNotificationRead(n.id)); void qc.invalidateQueries() }
  const shell: AppShellProps = {
    sidebar: {
      items: ADMIN_NAV_ITEMS, homePath: '/admin/dashboard', badge: 'Admin Portal',
      variant: 'light', prefetch: (path) => ADMIN_NAV_PATH_IMPORTS[path]?.(),
    },
    searchPlaceholder: 'Search stores, products, orders, customers, riders…',
    userLabel: 'Admin',
    bellTitle: 'My notifications',
    bellNotifications: notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.at, read: n.read, kind: n.kind })),
    onBellMarkAllRead: () => markAllRead(),
    onBellMarkRead: (id) => markNotificationRead(id),
    overlay: <AdminCommandPalette />,
  }
  void user
  return <AppShell {...shell} />
}
