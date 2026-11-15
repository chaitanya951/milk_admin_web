// Admin-web route chunks — used by React.lazy in App.tsx and the sidebar's
// hover/focus prefetcher. Pages are prefixed Admin*; routes live at the root.
export const ADMIN_PAGE_IMPORTS = {
  AdminDashboard: () => import('@/pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })),
  AdminStores: () => import('@/pages/AdminStores').then(m => ({ default: m.AdminStores })),
  AdminProducts: () => import('@/pages/AdminProducts').then(m => ({ default: m.AdminProducts })),
  AdminInventory: () => import('@/pages/AdminInventory').then(m => ({ default: m.AdminInventory })),
  AdminOrders: () => import('@/pages/AdminOrders').then(m => ({ default: m.AdminOrders })),
  AdminOrderDetail: () => import('@/pages/AdminOrderDetail').then(m => ({ default: m.AdminOrderDetail })),
  AdminPeople: () => import('@/pages/AdminPeople').then(m => ({ default: m.AdminPeople })),
  AdminPayments: () => import('@/pages/AdminPayments').then(m => ({ default: m.AdminPayments })),
  AdminPayouts: () => import('@/pages/AdminPayouts').then(m => ({ default: m.AdminPayouts })),
  AdminOffers: () => import('@/pages/AdminOffers').then(m => ({ default: m.AdminOffers })),
  AdminSubscriptions: () => import('@/pages/AdminSubscriptions').then(m => ({ default: m.AdminSubscriptions })),
  AdminSupport: () => import('@/pages/AdminSupport').then(m => ({ default: m.AdminSupport })),
  AdminReports: () => import('@/pages/AdminReports').then(m => ({ default: m.AdminReports })),
  AdminApprovals: () => import('@/pages/AdminApprovals').then(m => ({ default: m.AdminApprovals })),
  AdminSettings: () => import('@/pages/AdminSettings').then(m => ({ default: m.AdminSettings })),
} as const

/** Sidebar nav path -> chunk loader (hover/focus prefetch). */
export const ADMIN_NAV_PATH_IMPORTS: Record<string, () => Promise<unknown>> = {
  '/dashboard': ADMIN_PAGE_IMPORTS.AdminDashboard,
  '/stores': ADMIN_PAGE_IMPORTS.AdminStores,
  '/products': ADMIN_PAGE_IMPORTS.AdminProducts,
  '/inventory': ADMIN_PAGE_IMPORTS.AdminInventory,
  '/orders': ADMIN_PAGE_IMPORTS.AdminOrders,
  '/people': ADMIN_PAGE_IMPORTS.AdminPeople,
  '/payments': ADMIN_PAGE_IMPORTS.AdminPayments,
  '/payouts': ADMIN_PAGE_IMPORTS.AdminPayouts,
  '/offers': ADMIN_PAGE_IMPORTS.AdminOffers,
  '/subscriptions': ADMIN_PAGE_IMPORTS.AdminSubscriptions,
  '/support': ADMIN_PAGE_IMPORTS.AdminSupport,
  '/reports': ADMIN_PAGE_IMPORTS.AdminReports,
  '/approvals': ADMIN_PAGE_IMPORTS.AdminApprovals,
  '/settings': ADMIN_PAGE_IMPORTS.AdminSettings,
}
