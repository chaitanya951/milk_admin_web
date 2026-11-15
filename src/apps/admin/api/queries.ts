import { useQuery } from '@tanstack/react-query'
import { useDB } from '@/shared/data/db'
import type { RangeKey } from '@/shared/types'
import * as api from '@/shared/data/api'

/** Include the store version in every key so queries refetch after any mutation. */
export function useVersion() {
  return useDB((s) => s.version)
}

const V = { meta: { staleTime: 15_000, gcTime: 5 * 60_000 } }

// §1
export const useDashboard = (range: RangeKey, storeId: string | 'all') =>
  useQuery({ queryKey: ['admin:','dashboard', useVersion(), range, storeId], queryFn: () => api.getDashboard(range, storeId), ...V })

// §2
export const useStores = () => useQuery({ queryKey: ['admin:','stores', useVersion()], queryFn: api.listStores, ...V })
export const useStore = (id: string | null) => useQuery({ queryKey: ['admin:','store', useVersion(), id], queryFn: () => api.getStore(id!), enabled: !!id, ...V })
export const useZones = () => useQuery({ queryKey: ['admin:','zones', useVersion()], queryFn: api.listZones, ...V })
export const useCities = () => useQuery({ queryKey: ['admin:','cities', useVersion()], queryFn: api.listCities, ...V })
export const useLegalEntities = () => useQuery({ queryKey: ['admin:','legal-entities', useVersion()], queryFn: api.listLegalEntities, ...V })

// §3
export const useProducts = (filters: api.ProductFilters) => useQuery({ queryKey: ['admin:','products', useVersion(), filters], queryFn: () => api.listProducts(filters), ...V })
export const useVariants = (productId?: string) => useQuery({ queryKey: ['admin:','variants', useVersion(), productId ?? 'all'], queryFn: () => api.listVariants(productId), ...V })
export const useStoreVariants = (variantId?: string) => useQuery({ queryKey: ['admin:','store-variants', useVersion(), variantId ?? 'all'], queryFn: () => api.listStoreVariants(variantId), ...V })

// §4
export const useStock = (filters: api.StockFilters) => useQuery({ queryKey: ['admin:','stock', useVersion(), filters], queryFn: () => api.listStock(filters), ...V })
export const useMovements = (filters: api.MovementFilters) => useQuery({ queryKey: ['admin:','movements', useVersion(), filters], queryFn: () => api.listMovements(filters), ...V })
export const useStockBatches = () => useQuery({ queryKey: ['admin:','stock-batches', useVersion()], queryFn: api.listStockBatches, ...V })

// §5
export const useOrders = (filters: api.OrderFilters) => useQuery({ queryKey: ['admin:','orders', useVersion(), filters], queryFn: () => api.listOrders(filters), ...V })
export const useOrderDetail = (id: string | null) => useQuery({ queryKey: ['admin:','order-detail', useVersion(), id], queryFn: () => api.getOrderDetail(id!), enabled: !!id, ...V })
export const useRiders = () => useQuery({ queryKey: ['admin:','riders', useVersion()], queryFn: api.listRiders, ...V })

// §6
export const useCustomers = (filters: api.CustomerFilters) => useQuery({ queryKey: ['admin:','customers', useVersion(), filters], queryFn: () => api.listCustomers(filters), ...V })
export const useCustomerOrders = (customerId: string | null) => useQuery({ queryKey: ['admin:','customer-orders', useVersion(), customerId], queryFn: () => api.getCustomerOrders(customerId!), enabled: !!customerId, ...V })
export const useRiderApplications = (filters: api.RiderFilters) => useQuery({ queryKey: ['admin:','rider-applications', useVersion(), filters], queryFn: () => api.listRiderApplications(filters), ...V })
export const useWorkforce = (filters: Parameters<typeof api.listWorkforce>[0]) => useQuery({ queryKey: ['admin:','workforce', useVersion(), filters], queryFn: () => api.listWorkforce(filters), ...V })

// §7
export const usePaymentAttempts = (filters: api.PaymentFilters) => useQuery({ queryKey: ['admin:','payments', useVersion(), filters], queryFn: () => api.listPaymentAttempts(filters), ...V })
export const useRefundList = (filters: { search?: string; status?: string; page?: number; pageSize?: number }) => useQuery({ queryKey: ['admin:','refunds', useVersion(), filters], queryFn: () => api.listRefunds(filters), ...V })
export const useWalletLedger = (filters: { search?: string; type?: string; page?: number; pageSize?: number }) => useQuery({ queryKey: ['admin:','wallet', useVersion(), filters], queryFn: () => api.listWalletLedger(filters), ...V })
export const useReconciliation = () => useQuery({ queryKey: ['admin:','reconciliation', useVersion()], queryFn: api.listReconciliation, ...V })
export const useInvoiceFailures = () => useQuery({ queryKey: ['admin:','invoice-failures', useVersion()], queryFn: api.listInvoiceFailures, ...V })

// §8
export const usePayouts = (filters: { search?: string; status?: string; page?: number; pageSize?: number }) => useQuery({ queryKey: ['admin:','payouts', useVersion(), filters], queryFn: () => api.listPayouts(filters), ...V })
export const usePayoutCorrections = () => useQuery({ queryKey: ['admin:','payout-corrections', useVersion()], queryFn: api.listPayoutCorrections, ...V })

// §9
export const useCoupons = () => useQuery({ queryKey: ['admin:','coupons', useVersion()], queryFn: api.listCoupons, ...V })
export const useCampaigns = () => useQuery({ queryKey: ['admin:','campaigns', useVersion()], queryFn: api.listCampaigns, ...V })
export const useAdminNotifications = () => useQuery({ queryKey: ['admin:','admin-notifications', useVersion()], queryFn: api.listAdminNotifications, ...V })

// §10
export const useSubscriptionRuns = () => useQuery({ queryKey: ['admin:','sub-runs', useVersion()], queryFn: api.listSubscriptionRuns, ...V })
export const useSubscriptionConfig = () => useQuery({ queryKey: ['admin:','sub-config', useVersion()], queryFn: api.getSubscriptionConfig, ...V })

// §11
export const useTickets = (filters: api.TicketFilters) => useQuery({ queryKey: ['admin:','tickets', useVersion(), filters], queryFn: () => api.listTickets(filters), ...V })
export const useTicket = (id: string | null) => useQuery({ queryKey: ['admin:','ticket', useVersion(), id], queryFn: () => api.getTicket(id!), enabled: !!id, ...V })
export const useSavedResponses = () => useQuery({ queryKey: ['admin:','saved-responses', useVersion()], queryFn: api.listSavedResponses, ...V })
export const useRatings = (queueOnly = false) => useQuery({ queryKey: ['admin:','ratings', useVersion(), queueOnly], queryFn: () => api.listRatings({ queueOnly }), ...V })

// §12
export const useReportPreview = (tab: string) => useQuery({ queryKey: ['admin:','report-preview', useVersion(), tab], queryFn: () => api.getReportPreview(tab), ...V })
export const useExportJobs = () => useQuery({ queryKey: ['admin:','export-jobs', useVersion()], queryFn: api.listExportJobs, ...V })

// §13
export const useApprovals = (filters: { status?: string; search?: string }) => useQuery({ queryKey: ['admin:','approvals', useVersion(), filters], queryFn: () => api.listApprovals(filters), ...V })
export const useFraudFindings = () => useQuery({ queryKey: ['admin:','fraud', useVersion()], queryFn: api.listFraudFindings, ...V })
export const useErasureRequests = () => useQuery({ queryKey: ['admin:','erasure', useVersion()], queryFn: api.listErasureRequests, ...V })
export const useLegalHolds = () => useQuery({ queryKey: ['admin:','legal-holds', useVersion()], queryFn: api.listLegalHolds, ...V })

// §14
export const useSystemSettings = () => useQuery({ queryKey: ['admin:','system-settings', useVersion()], queryFn: api.getSystemSettings, ...V })
export const useBackgroundJobs = () => useQuery({ queryKey: ['admin:','background-jobs', useVersion()], queryFn: api.listBackgroundJobs, ...V })
export const useOperationalNotifications = () => useQuery({ queryKey: ['admin:','op-notifications', useVersion()], queryFn: api.listOperationalNotifications, ...V })
export const useStoreOptions = () => useQuery({ queryKey: ['admin:','store-options', useVersion()], queryFn: api.listStoresOptions, ...V })
