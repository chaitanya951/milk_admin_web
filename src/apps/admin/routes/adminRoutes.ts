// Admin portal route chunks — used by React.lazy in App.tsx and the sidebar's
// hover/focus prefetcher. Admin pages are prefixed Admin* and live under /admin/*.
export const adminPageImports = {
  AdminDashboard: () => import('@/apps/admin/pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })),
  AdminStores: () => import('@/apps/admin/pages/AdminStores').then(m => ({ default: m.AdminStores })),
  AdminProducts: () => import('@/apps/admin/pages/AdminProducts').then(m => ({ default: m.AdminProducts })),
  AdminInventory: () => import('@/apps/admin/pages/AdminInventory').then(m => ({ default: m.AdminInventory })),
  AdminOrders: () => import('@/apps/admin/pages/AdminOrders').then(m => ({ default: m.AdminOrders })),
  AdminOrderDetail: () => import('@/apps/admin/pages/AdminOrderDetail').then(m => ({ default: m.AdminOrderDetail })),
  AdminPeople: () => import('@/apps/admin/pages/AdminPeople').then(m => ({ default: m.AdminPeople })),
  AdminPayments: () => import('@/apps/admin/pages/AdminPayments').then(m => ({ default: m.AdminPayments })),
  AdminPayouts: () => import('@/apps/admin/pages/AdminPayouts').then(m => ({ default: m.AdminPayouts })),
  AdminOffers: () => import('@/apps/admin/pages/AdminOffers').then(m => ({ default: m.AdminOffers })),
  AdminSubscriptions: () => import('@/apps/admin/pages/AdminSubscriptions').then(m => ({ default: m.AdminSubscriptions })),
  AdminSupport: () => import('@/apps/admin/pages/AdminSupport').then(m => ({ default: m.AdminSupport })),
  AdminReports: () => import('@/apps/admin/pages/AdminReports').then(m => ({ default: m.AdminReports })),
  AdminApprovals: () => import('@/apps/admin/pages/AdminApprovals').then(m => ({ default: m.AdminApprovals })),
  AdminSettings: () => import('@/apps/admin/pages/AdminSettings').then(m => ({ default: m.AdminSettings })),
} as const

/** Sidebar nav path -> chunk loader (hover/focus prefetch). */
export const ADMIN_NAV_PATH_IMPORTS: Record<string, () => Promise<unknown>> = {
  '/admin/dashboard': adminPageImports.AdminDashboard,
  '/admin/stores': adminPageImports.AdminStores,
  '/admin/products': adminPageImports.AdminProducts,
  '/admin/inventory': adminPageImports.AdminInventory,
  '/admin/orders': adminPageImports.AdminOrders,
  '/admin/people': adminPageImports.AdminPeople,
  '/admin/payments': adminPageImports.AdminPayments,
  '/admin/payouts': adminPageImports.AdminPayouts,
  '/admin/offers': adminPageImports.AdminOffers,
  '/admin/subscriptions': adminPageImports.AdminSubscriptions,
  '/admin/support': adminPageImports.AdminSupport,
  '/admin/reports': adminPageImports.AdminReports,
  '/admin/approvals': adminPageImports.AdminApprovals,
  '/admin/settings': adminPageImports.AdminSettings,
}
