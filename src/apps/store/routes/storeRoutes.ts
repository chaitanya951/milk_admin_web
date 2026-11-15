// Store Manager portal route chunks — Store* pages under /store/*.
export const storePageImports = {
  StoreDashboard: () => import('@/apps/store/pages/StoreDashboard').then(m => ({ default: m.StoreDashboard })),
  StoreOrdersPicking: () => import('@/apps/store/pages/StoreOrdersPicking').then(m => ({ default: m.StoreOrdersPicking })),
  StoreInventory: () => import('@/apps/store/pages/StoreInventory').then(m => ({ default: m.StoreInventory })),
  StoreReturns: () => import('@/apps/store/pages/StoreReturns').then(m => ({ default: m.StoreReturns })),
  StoreRiderApplications: () => import('@/apps/store/pages/StoreRiderApplications').then(m => ({ default: m.StoreRiderApplications })),
  StoreCodDeposits: () => import('@/apps/store/pages/StoreCodDeposits').then(m => ({ default: m.StoreCodDeposits })),
  StoreStoreStatus: () => import('@/apps/store/pages/StoreStoreStatus').then(m => ({ default: m.StoreStoreStatus })),
  StoreStaffWorkload: () => import('@/apps/store/pages/StoreStaffWorkload').then(m => ({ default: m.StoreStaffWorkload })),
  StoreNotificationsAccount: () => import('@/apps/store/pages/StoreNotificationsAccount').then(m => ({ default: m.StoreNotificationsAccount })),
} as const

export const STORE_NAV_PATH_IMPORTS: Record<string, () => Promise<unknown>> = {
  '/store/dashboard': storePageImports.StoreDashboard,
  '/store/orders-picking': storePageImports.StoreOrdersPicking,
  '/store/inventory': storePageImports.StoreInventory,
  '/store/returns': storePageImports.StoreReturns,
  '/store/rider-applications': storePageImports.StoreRiderApplications,
  '/store/cod-deposits': storePageImports.StoreCodDeposits,
  '/store/status': storePageImports.StoreStoreStatus,
  '/store/staff-workload': storePageImports.StoreStaffWorkload,
  '/store/notifications': storePageImports.StoreNotificationsAccount,
}
