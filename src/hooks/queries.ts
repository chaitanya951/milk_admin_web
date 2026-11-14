import { useQuery } from '@tanstack/react-query'
import { useDB } from '@/store/db'
import type { RangeKey } from '@/types'
import * as api from '@/data/api'

/** Include the store version in every key so queries refetch after any mutation. */
export function useVersion() {
  return useDB((s) => s.version)
}

const V = { meta: { staleTime: 15_000, gcTime: 5 * 60_000 } }

// §1
export const useDashboard = (range: RangeKey, storeId: string | 'all') =>
  useQuery({ queryKey: ['dashboard', useVersion(), range, storeId], queryFn: () => api.getDashboard(range, storeId), ...V })

// §2
export const useStores = () => useQuery({ queryKey: ['stores', useVersion()], queryFn: api.listStores, ...V })
export const useStore = (id: string | null) => useQuery({ queryKey: ['store', useVersion(), id], queryFn: () => api.getStore(id!), enabled: !!id, ...V })
export const useZones = () => useQuery({ queryKey: ['zones', useVersion()], queryFn: api.listZones, ...V })
export const useCities = () => useQuery({ queryKey: ['cities', useVersion()], queryFn: api.listCities, ...V })
export const useLegalEntities = () => useQuery({ queryKey: ['legal-entities', useVersion()], queryFn: api.listLegalEntities, ...V })

// §3
export const useProducts = (filters: api.ProductFilters) => useQuery({ queryKey: ['products', useVersion(), filters], queryFn: () => api.listProducts(filters), ...V })
export const useVariants = (productId?: string) => useQuery({ queryKey: ['variants', useVersion(), productId ?? 'all'], queryFn: () => api.listVariants(productId), ...V })
export const useStoreVariants = (variantId?: string) => useQuery({ queryKey: ['store-variants', useVersion(), variantId ?? 'all'], queryFn: () => api.listStoreVariants(variantId), ...V })

// §4
export const useStock = (filters: api.StockFilters) => useQuery({ queryKey: ['stock', useVersion(), filters], queryFn: () => api.listStock(filters), ...V })
export const useMovements = (filters: api.MovementFilters) => useQuery({ queryKey: ['movements', useVersion(), filters], queryFn: () => api.listMovements(filters), ...V })
export const useStockBatches = () => useQuery({ queryKey: ['stock-batches', useVersion()], queryFn: api.listStockBatches, ...V })

// §5
export const useOrders = (filters: api.OrderFilters) => useQuery({ queryKey: ['orders', useVersion(), filters], queryFn: () => api.listOrders(filters), ...V })
export const useOrderDetail = (id: string | null) => useQuery({ queryKey: ['order-detail', useVersion(), id], queryFn: () => api.getOrderDetail(id!), enabled: !!id, ...V })
export const useRiders = () => useQuery({ queryKey: ['riders', useVersion()], queryFn: api.listRiders, ...V })

// §6
export const useCustomers = (filters: api.CustomerFilters) => useQuery({ queryKey: ['customers', useVersion(), filters], queryFn: () => api.listCustomers(filters), ...V })
export const useCustomerOrders = (customerId: string | null) => useQuery({ queryKey: ['customer-orders', useVersion(), customerId], queryFn: () => api.getCustomerOrders(customerId!), enabled: !!customerId, ...V })
export const useRiderApplications = (filters: api.RiderFilters) => useQuery({ queryKey: ['rider-applications', useVersion(), filters], queryFn: () => api.listRiderApplications(filters), ...V })
export const useWorkforce = (filters: Parameters<typeof api.listWorkforce>[0]) => useQuery({ queryKey: ['workforce', useVersion(), filters], queryFn: () => api.listWorkforce(filters), ...V })

// §7
export const usePaymentAttempts = (filters: api.PaymentFilters) => useQuery({ queryKey: ['payments', useVersion(), filters], queryFn: () => api.listPaymentAttempts(filters), ...V })
export const useRefundList = (filters: { search?: string; status?: string; page?: number; pageSize?: number }) => useQuery({ queryKey: ['refunds', useVersion(), filters], queryFn: () => api.listRefunds(filters), ...V })
export const useWalletLedger = (filters: { search?: string; type?: string; page?: number; pageSize?: number }) => useQuery({ queryKey: ['wallet', useVersion(), filters], queryFn: () => api.listWalletLedger(filters), ...V })
export const useReconciliation = () => useQuery({ queryKey: ['reconciliation', useVersion()], queryFn: api.listReconciliation, ...V })
export const useInvoiceFailures = () => useQuery({ queryKey: ['invoice-failures', useVersion()], queryFn: api.listInvoiceFailures, ...V })

// §8
export const usePayouts = (filters: { search?: string; status?: string; page?: number; pageSize?: number }) => useQuery({ queryKey: ['payouts', useVersion(), filters], queryFn: () => api.listPayouts(filters), ...V })
export const usePayoutCorrections = () => useQuery({ queryKey: ['payout-corrections', useVersion()], queryFn: api.listPayoutCorrections, ...V })

// §9
export const useCoupons = () => useQuery({ queryKey: ['coupons', useVersion()], queryFn: api.listCoupons, ...V })
export const useCampaigns = () => useQuery({ queryKey: ['campaigns', useVersion()], queryFn: api.listCampaigns, ...V })
export const useAdminNotifications = () => useQuery({ queryKey: ['admin-notifications', useVersion()], queryFn: api.listAdminNotifications, ...V })

// §10
export const useSubscriptionRuns = () => useQuery({ queryKey: ['sub-runs', useVersion()], queryFn: api.listSubscriptionRuns, ...V })
export const useSubscriptionConfig = () => useQuery({ queryKey: ['sub-config', useVersion()], queryFn: api.getSubscriptionConfig, ...V })

// §11
export const useTickets = (filters: api.TicketFilters) => useQuery({ queryKey: ['tickets', useVersion(), filters], queryFn: () => api.listTickets(filters), ...V })
export const useTicket = (id: string | null) => useQuery({ queryKey: ['ticket', useVersion(), id], queryFn: () => api.getTicket(id!), enabled: !!id, ...V })
export const useSavedResponses = () => useQuery({ queryKey: ['saved-responses', useVersion()], queryFn: api.listSavedResponses, ...V })
export const useRatings = (queueOnly = false) => useQuery({ queryKey: ['ratings', useVersion(), queueOnly], queryFn: () => api.listRatings({ queueOnly }), ...V })

// §12
export const useReportPreview = (tab: string) => useQuery({ queryKey: ['report-preview', useVersion(), tab], queryFn: () => api.getReportPreview(tab), ...V })
export const useExportJobs = () => useQuery({ queryKey: ['export-jobs', useVersion()], queryFn: api.listExportJobs, ...V })

// §13
export const useApprovals = (filters: { status?: string; search?: string }) => useQuery({ queryKey: ['approvals', useVersion(), filters], queryFn: () => api.listApprovals(filters), ...V })
export const useFraudFindings = () => useQuery({ queryKey: ['fraud', useVersion()], queryFn: api.listFraudFindings, ...V })
export const useErasureRequests = () => useQuery({ queryKey: ['erasure', useVersion()], queryFn: api.listErasureRequests, ...V })
export const useLegalHolds = () => useQuery({ queryKey: ['legal-holds', useVersion()], queryFn: api.listLegalHolds, ...V })

// §14
export const useSystemSettings = () => useQuery({ queryKey: ['system-settings', useVersion()], queryFn: api.getSystemSettings, ...V })
export const useBackgroundJobs = () => useQuery({ queryKey: ['background-jobs', useVersion()], queryFn: api.listBackgroundJobs, ...V })
export const useOperationalNotifications = () => useQuery({ queryKey: ['op-notifications', useVersion()], queryFn: api.listOperationalNotifications, ...V })
export const useStoreOptions = () => useQuery({ queryKey: ['store-options', useVersion()], queryFn: api.listStoresOptions, ...V })
