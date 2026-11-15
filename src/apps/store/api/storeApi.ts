import { useDB } from '@/shared/data/db'
import { getStoreDashboard, storeTasksFor } from './storeSelectors'
import { sleep } from '@/shared/lib/utils'
import type { PickingTask, ReturnParcel, RiderApplication, CodDeposit,
  InventoryBatch, StockReceipt, StockCount, StockAdjustment, StoreStatusChange,
  StoreNotification, StoreNotificationPrefs,
} from '@/shared/types'
import type { StoreDashboardSummary } from './storeSelectors'

const FIXED_LATENCY = Number(import.meta.env.VITE_MOCK_LATENCY ?? '')
const latency = () => (Number.isFinite(FIXED_LATENCY) && FIXED_LATENCY > 0 ? FIXED_LATENCY : 60 + Math.random() * 60)
const delay = () => sleep(latency())
const snapshot = () => useDB.getState().db

// ── §1 Store dashboard (one aggregation entry-point per spec) ──
export async function getStoreDashboardSummary(storeId: string, date?: Date): Promise<StoreDashboardSummary> {
  await delay()
  return getStoreDashboard(snapshot(), storeId, date)
}

// ── §2 Orders & picking ────────────────────────────────────────
export async function listPickingTasks(storeId: string, tab: 'queue' | 'all' | 'mine', assigneeId: string | null, filters: { status?: string; search?: string } = {}): Promise<Array<{ task: PickingTask; order: { customerName: string; itemCount: number } }>> {
  await delay()
  const db = snapshot()
  let tasks = storeTasksFor(db, storeId).filter((t) => sameDayFilter(t))
  function sameDayFilter(t: PickingTask) { return new Date(t.createdAt).toDateString() === new Date(db.demoNow).toDateString() }
  if (tab === 'queue') tasks = tasks.filter((t) => t.status === 'waiting_to_pick')
  if (tab === 'mine') tasks = tasks.filter((t) => t.assigneeId === assigneeId)
  if (filters.status && filters.status !== 'all') tasks = tasks.filter((t) => t.status === filters.status)
  if (filters.search) {
    const q = filters.search.toLowerCase()
    tasks = tasks.filter((t) => {
      const order = db.orders.find((o) => o.id === t.orderId)
      return t.id.toLowerCase().includes(q) || t.orderId.toLowerCase().includes(q) || (order?.customerName ?? '').toLowerCase().includes(q)
    })
  }
  tasks.sort((a, b) => a.deadline.localeCompare(b.deadline))
  return tasks.map((t) => ({
    task: t,
    order: {
      customerName: db.orders.find((o) => o.id === t.orderId)?.customerName ?? '—',
      itemCount: t.lines.reduce((a, l) => a + l.qtyOrdered, 0),
    },
  }))
}
export async function getPickingTask(id: string) { await delay(); return snapshot().pickingTasks.find((t) => t.id === id) ?? null }

// ── §3 Inventory ───────────────────────────────────────────────
export async function listStoreStock(storeId: string, filters: { search?: string; status?: string } = {}): Promise<Array<{ batch: InventoryBatch; variantName: string; sku: string; status: string }>> {
  await delay()
  const db = snapshot()
  const now = new Date(db.demoNow)
  const rows = db.inventoryBatches.filter((b) => b.storeId === storeId).map((b) => {
    const v = db.variants.find((x) => x.id === b.variantId)!
    const product = db.products.find((p) => p.id === v.productId)!
    const expiring = (new Date(b.expiryDate).getTime() - now.getTime()) / 86400000 <= 7
    const status = expiring ? 'expiring' : b.qty < product.reorderLevel ? 'low_stock' : 'in_stock'
    return { batch: b, variantName: `${product.name} – ${v.label}`, sku: v.sku, status }
  })
  let out = rows
  if (filters.search) {
    const q = filters.search.toLowerCase()
    out = out.filter((r) => r.variantName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.batch.id.toLowerCase().includes(q))
  }
  if (filters.status && filters.status !== 'all') out = out.filter((r) => r.status === filters.status)
  return out
}
export async function listStoreReceipts(storeId: string) { await delay(); return snapshot().stockReceipts.filter((r) => r.storeId === storeId) }
export async function listStoreAdjustments(storeId: string) { await delay(); return snapshot().stockAdjustments.filter((a) => a.storeId === storeId) }
export async function listStoreCounts(storeId: string) { await delay(); return snapshot().stockCounts.filter((c) => c.storeId === storeId) }
export async function listBinLocations(storeId: string): Promise<string[]> { await delay(); return db_binLocations(storeId) }
function db_binLocations(storeId: string) { return snapshot().binLocations.find((b) => b.storeId === storeId)?.bins ?? [] }

// ── §4 Returns ─────────────────────────────────────────────────
export async function listReturns(storeId: string, tab: string, filters: { search?: string; reason?: string } = {}): Promise<ReturnParcel[]> {
  await delay()
  let rows = snapshot().returns.filter((r) => r.storeId === storeId)
  if (tab === 'parcels') rows = rows.filter((r) => r.status !== 'processed')
  else if (tab === 'inspection') rows = rows.filter((r) => r.status === 'under_inspection')
  else if (tab === 'processed') rows = rows.filter((r) => r.status === 'processed')
  else if (tab === 'quarantine') rows = rows.filter((r) => r.stockAction === 'quarantine')
  if (filters.reason && filters.reason !== 'all') rows = rows.filter((r) => r.reason === filters.reason)
  if (filters.search) {
    const q = filters.search.toLowerCase()
    rows = rows.filter((r) => r.id.toLowerCase().includes(q) || r.orderId.toLowerCase().includes(q))
  }
  return rows.sort((a, b) => b.returnedAt.localeCompare(a.returnedAt))
}

// ── §5 Rider applications ──────────────────────────────────────
export async function listRiderApplicationsForStore(storeId: string, status?: string, search?: string): Promise<RiderApplication[]> {
  await delay()
  let rows = snapshot().riderApplications.filter((a) => a.storeId === storeId)
  if (status && status !== 'all') rows = rows.filter((a) => a.status === status)
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter((a) => a.riderName.toLowerCase().includes(q) || a.phone.includes(q) || a.id.toLowerCase().includes(q) || a.vehicle.registration.toLowerCase().includes(q))
  }
  return rows.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
}

// ── §6 COD deposits ────────────────────────────────────────────
export async function listCodDeposits(storeId: string, filters: { search?: string } = {}): Promise<CodDeposit[]> {
  await delay()
  let rows = snapshot().codDeposits.filter((d) => d.storeId === storeId)
  if (filters.search) {
    const q = filters.search.toLowerCase()
    rows = rows.filter((d) => d.id.toLowerCase().includes(q) || d.riderName.toLowerCase().includes(q) || d.reference.toLowerCase().includes(q))
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at))
}

// ── §7 Store status ────────────────────────────────────────────
export async function getStoreStatusInfo(storeId: string) {
  await delay()
  const db = snapshot()
  const store = db.stores.find((s) => s.id === storeId)!
  return {
    store, statusChanges: db.storeStatusChanges.filter((c) => c.storeId === storeId).sort((a, b) => b.at.localeCompare(a.at)),
  }
}

// ── §8 Staff & workload ────────────────────────────────────────
export async function listStoreStaff(storeId: string) {
  await delay()
  const db = snapshot()
  const store = db.stores.find((s) => s.id === storeId)!
  const now = new Date(db.demoNow)
  return store.managerIds.map((id) => {
    const w = db.workforce.find((x) => x.id === id)!
    const activeTasks = db.pickingTasks.filter((t) => t.storeId === storeId && t.status === 'being_picked' && t.assigneeId === id)
    return {
      id, name: w?.name ?? id, email: w?.email ?? '', status: w?.status ?? 'active',
      activeTasks: activeTasks.length,
      overdueTasks: activeTasks.filter((t) => isOverdueTask(t, now)).length,
      level: (activeTasks.length >= 4 ? 'High' : activeTasks.length >= 2 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
    }
  })
}
function isOverdueTask(t: PickingTask, now: Date) { return (t.status === 'waiting_to_pick' || t.status === 'being_picked') && new Date(t.deadline).getTime() < now.getTime() }
export async function listEligibleAssignees(storeId: string, currentAssigneeId: string | null) {
  await delay()
  const db = snapshot()
  return db.workforce
    .filter((w) => db.stores.find((s) => s.id === storeId)?.managerIds.includes(w.id) && w.status === 'active' && w.id !== currentAssigneeId)
    .map((w) => ({ id: w.id, name: w.name, activeTasks: db.pickingTasks.filter((t) => t.storeId === storeId && t.status === 'being_picked' && t.assigneeId === w.id).length }))
}

// ── §9 Notifications & account ─────────────────────────────────
export async function listStoreNotifications(storeId: string, prefs?: StoreNotificationPrefs): Promise<StoreNotification[]> {
  await delay()
  const rows = snapshot().storeNotifications.filter((n) => n.storeId === storeId || n.storeId === null)
  if (!prefs) return rows
  // preferences gate operational categories
  return rows.filter((n) => {
    if (n.kind !== 'operational') return true
    if (n.title.toLowerCase().includes('cod')) return prefs.codDeposits
    if (n.title.toLowerCase().includes('rider')) return prefs.riderApplications
    if (n.title.toLowerCase().includes('stock') || n.title.toLowerCase().includes('expir')) return prefs.inventoryAlerts
    return prefs.pickingOrders
  })
}
export async function getStoreNotificationPrefs(workforceId: string): Promise<StoreNotificationPrefs> {
  await delay()
  const row = snapshot().storeNotificationPrefs.find((p) => p.workforceId === workforceId)
  return row?.prefs ?? { pickingOrders: true, inventoryAlerts: true, riderApplications: true, codDeposits: true, storeStatus: true }
}
