import { useQuery } from '@tanstack/react-query'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { useStoreAuth, useActiveStore } from '@/login/authStore'
import * as storeApi from './storeApi'
import { getStoreDashboard } from '@/api/storeSelectors'

/** Store-portal query keys are prefixed 'store:' — never collide with admin keys. */
export function useVersion() {
  return useDB((s) => s.version)
}

const V = { meta: { staleTime: 10_000, gcTime: 5 * 60_000 } }

/** The manager's active store id (falls back to first assignment). */
export function useActiveStoreId(): string | null {
  const user = useStoreAuth((s) => s.user)
  const activeId = useActiveStore((s) => s.activeStoreId)
  if (!user) return null
  return activeId && user.assignedStoreIds.includes(activeId) ? activeId : user.assignedStoreIds[0] ?? null
}

// §1
export const useStoreDashboard = (storeId: string | null, date?: Date) =>
  useQuery({ queryKey: ['store', 'dashboard', useVersion(), storeId, date?.toDateString() ?? ''], queryFn: () => storeApi.getStoreDashboardSummary(storeId!, date), enabled: !!storeId, ...V })

// §2
export const usePickingTasks = (storeId: string | null, tab: 'queue' | 'all' | 'mine', filters: { status?: string; search?: string } = {}) => {
  const user = useStoreAuth((s) => s.user)
  return useQuery({
    queryKey: ['store', 'picking', useVersion(), storeId, tab, filters],
    queryFn: () => storeApi.listPickingTasks(storeId!, tab, user?.id ?? null, filters),
    enabled: !!storeId, ...V,
  })
}
export const usePickingTask = (id: string | null) =>
  useQuery({ queryKey: ['store', 'picking-task', useVersion(), id], queryFn: () => storeApi.getPickingTask(id!), enabled: !!id, ...V })

// §3
export const useStoreStock = (storeId: string | null, filters: { search?: string; status?: string } = {}) =>
  useQuery({ queryKey: ['store', 'stock', useVersion(), storeId, filters], queryFn: () => storeApi.listStoreStock(storeId!, filters), enabled: !!storeId, ...V })
export const useStoreReceipts = (storeId: string | null) =>
  useQuery({ queryKey: ['store', 'receipts', useVersion(), storeId], queryFn: () => storeApi.listStoreReceipts(storeId!), enabled: !!storeId, ...V })
export const useStoreAdjustments = (storeId: string | null) =>
  useQuery({ queryKey: ['store', 'adjustments', useVersion(), storeId], queryFn: () => storeApi.listStoreAdjustments(storeId!), enabled: !!storeId, ...V })
export const useStoreCounts = (storeId: string | null) =>
  useQuery({ queryKey: ['store', 'counts', useVersion(), storeId], queryFn: () => storeApi.listStoreCounts(storeId!), enabled: !!storeId, ...V })
export const useBinLocations = (storeId: string | null) =>
  useQuery({ queryKey: ['store', 'bins', useVersion(), storeId], queryFn: () => storeApi.listBinLocations(storeId!), enabled: !!storeId, ...V })

// §4
export const useReturns = (storeId: string | null, tab: string, filters: { search?: string; reason?: string } = {}) =>
  useQuery({ queryKey: ['store', 'returns', useVersion(), storeId, tab, filters], queryFn: () => storeApi.listReturns(storeId!, tab, filters), enabled: !!storeId, ...V })

// §5
export const useRiderApplicationsStore = (storeId: string | null, status?: string, search?: string) =>
  useQuery({ queryKey: ['store', 'rider-apps', useVersion(), storeId, status, search], queryFn: () => storeApi.listRiderApplicationsForStore(storeId!, status, search), enabled: !!storeId, ...V })

// §6
export const useCodDeposits = (storeId: string | null, filters: { search?: string } = {}) =>
  useQuery({ queryKey: ['store', 'cod', useVersion(), storeId, filters], queryFn: () => storeApi.listCodDeposits(storeId!, filters), enabled: !!storeId, ...V })

// §7
export const useStoreStatusInfo = (storeId: string | null) =>
  useQuery({ queryKey: ['store', 'status-info', useVersion(), storeId], queryFn: () => storeApi.getStoreStatusInfo(storeId!), enabled: !!storeId, ...V })

// §8
export const useStoreStaff = (storeId: string | null) =>
  useQuery({ queryKey: ['store', 'staff', useVersion(), storeId], queryFn: () => storeApi.listStoreStaff(storeId!), enabled: !!storeId, ...V })
export const useEligibleAssignees = (storeId: string | null, currentAssigneeId: string | null) =>
  useQuery({ queryKey: ['store', 'assignees', useVersion(), storeId, currentAssigneeId], queryFn: () => storeApi.listEligibleAssignees(storeId!, currentAssigneeId), enabled: !!storeId, ...V })

// §9
export const useStoreNotifications = () => {
  const storeId = useActiveStoreId()
  const user = useStoreAuth((s) => s.user)
  const prefsQuery = useQuery({
    queryKey: ['store', 'notif-prefs', user?.id],
    queryFn: () => storeApi.getStoreNotificationPrefs(user!.id),
    enabled: !!user, staleTime: Infinity,
  })
  const notificationsQuery = useQuery({
    queryKey: ['store', 'notifications', useVersion(), storeId, prefsQuery.data],
    queryFn: () => storeApi.listStoreNotifications(storeId!, prefsQuery.data),
    enabled: !!storeId, ...V,
  })
  return { data: notificationsQuery.data ?? [], prefs: prefsQuery.data, isLoading: notificationsQuery.isLoading }
}
