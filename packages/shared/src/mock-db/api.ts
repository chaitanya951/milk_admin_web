import { useDB } from './db'
import { sleep } from '../lib/utils'
import type {
  RangeKey, Order, DashboardSummary, Store, Zone, LegalEntity, Product, Variant,
  VariantAvailability, StockLevel, InventoryMovement, Customer, Rider, WorkforceAccount,
  PaymentAttempt, Refund, WalletLedgerEntry, ReconciliationFinding, InvoiceFailure, Payout,
  PayoutCorrection, Coupon, PushCampaign, AdminNotification, SubscriptionRun, Ticket, Rating,
  Approval, FraudFinding, ErasureRequest, LegalHold, ExportJob, BackgroundJob,
  OperationalNotification, SystemSettings, ProductCategory, Brand, TicketMessage,
} from '../types'
import { getDashboardSummary, reportPreview } from './selectors'

// Configurable mock latency (VITE_MOCK_LATENCY ms fixed, or 60–120 ms random by default)
const FIXED_LATENCY = Number(import.meta.env.VITE_MOCK_LATENCY ?? '')
const latency = () => (Number.isFinite(FIXED_LATENCY) && FIXED_LATENCY > 0 ? FIXED_LATENCY : 60 + Math.random() * 60)
const delay = (_ms?: number) => sleep(latency())
const snapshot = () => useDB.getState().db

// ── §1 Dashboard (single aggregation entry-point) ───────────────
export async function getDashboard(range: RangeKey, storeId: string | 'all'): Promise<DashboardSummary> {
  await delay()
  return getDashboardSummary(snapshot(), range, storeId)
}

// ── §2 Stores & service areas ───────────────────────────────────
export async function listStores(): Promise<Store[]> { await delay(); return snapshot().stores }
export async function getStore(id: string) { await delay(); return snapshot().stores.find((s) => s.id === id) ?? null }
export async function listZones(): Promise<Zone[]> { await delay(); return snapshot().zones }
export async function listCities() { await delay(); return snapshot().cities }
export async function listLegalEntities(): Promise<LegalEntity[]> { await delay(); return snapshot().legalEntities }

// ── §3 Products & pricing ───────────────────────────────────────
export interface ProductFilters { search?: string; categoryId?: string; brandId?: string; state?: string; page?: number; pageSize?: number }
export interface ProductRow { product: Product; variants: Variant[]; storeCount: number; minPrice: number; maxPrice: number }
export async function listProducts(f: ProductFilters = {}): Promise<{ rows: ProductRow[]; total: number; categories: ProductCategory[]; brands: Brand[] }> {
  await delay()
  const db = snapshot()
  let prods = [...db.products]
  if (f.categoryId && f.categoryId !== 'all') prods = prods.filter((p) => p.categoryId === f.categoryId)
  if (f.brandId && f.brandId !== 'all') prods = prods.filter((p) => p.brandId === f.brandId)
  if (f.state && f.state !== 'all') prods = prods.filter((p) => p.publishState === f.state)
  if (f.search) {
    const q = f.search.toLowerCase()
    prods = prods.filter((p) => p.name.toLowerCase().includes(q) || db.variants.some((v) => v.productId === p.id && (v.sku.toLowerCase().includes(q) || v.barcode.includes(q))))
  }
  const rows: ProductRow[] = prods.map((p) => {
    const variants = db.variants.filter((v) => v.productId === p.id)
    const prices = variants.map((v) => v.price)
    return { product: p, variants, storeCount: db.storeVariants.filter((sv) => variants.some((v) => v.id === sv.variantId) && sv.available).length, minPrice: Math.min(...prices), maxPrice: Math.max(...prices) }
  })
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 8
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, categories: db.categories, brands: db.brands }
}
export async function getProduct(id: string) { await delay(); return snapshot().products.find((p) => p.id === id) ?? null }
export async function listVariants(productId?: string): Promise<Variant[]> { await delay(); const db = snapshot(); return productId ? db.variants.filter((v) => v.productId === productId) : db.variants }
export async function listStoreVariants(variantId?: string): Promise<VariantAvailability[]> { await delay(); const db = snapshot(); return variantId ? db.storeVariants.filter((sv) => sv.variantId === variantId) : db.storeVariants }

// ── §4 Inventory ────────────────────────────────────────────────
export interface StockFilters { storeId?: string; search?: string; lowOnly?: boolean; page?: number; pageSize?: number }
export interface StockRow { level: StockLevel; variantName: string; sku: string; storeName: string }
export async function listStock(f: StockFilters = {}): Promise<{ rows: StockRow[]; total: number }> {
  await delay()
  const db = snapshot()
  const vName = (vid: string) => { const v = db.variants.find((x) => x.id === vid)!; return `${db.products.find((p) => p.id === v.productId)!.name} – ${v.label}` }
  const sName = (sid: string) => db.stores.find((s) => s.id === sid)?.name ?? sid
  let rows: StockRow[] = db.stockLevels.map((level) => ({ level, variantName: vName(level.variantId), sku: db.variants.find((v) => v.id === level.variantId)!.sku, storeName: sName(level.storeId) }))
  if (f.storeId && f.storeId !== 'all') rows = rows.filter((r) => r.level.storeId === f.storeId)
  if (f.lowOnly) rows = rows.filter((r) => r.level.qty < r.level.lowStockThreshold)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((r) => r.variantName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q))
  }
  rows.sort((a, b) => a.level.qty / Math.max(1, a.level.lowStockThreshold) - b.level.qty / Math.max(1, b.level.lowStockThreshold))
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 10
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
}
export interface MovementFilters { storeId?: string; type?: string; flaggedOnly?: boolean; search?: string; page?: number; pageSize?: number }
export interface MovementRow { movement: InventoryMovement; variantName: string; storeName: string }
export async function listMovements(f: MovementFilters = {}): Promise<{ rows: MovementRow[]; total: number }> {
  await delay()
  const db = snapshot()
  const vName = (vid: string) => { const v = db.variants.find((x) => x.id === vid)!; return `${db.products.find((p) => p.id === v.productId)!.name} – ${v.label}` }
  let rows: MovementRow[] = db.movements.map((m) => ({ movement: m, variantName: vName(m.variantId), storeName: db.stores.find((s) => s.id === m.storeId)?.name ?? m.storeId }))
  if (f.storeId && f.storeId !== 'all') rows = rows.filter((r) => r.movement.storeId === f.storeId)
  if (f.type && f.type !== 'all') rows = rows.filter((r) => r.movement.type === f.type)
  if (f.flaggedOnly) rows = rows.filter((r) => r.movement.flagged)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((r) => r.variantName.toLowerCase().includes(q) || r.movement.reason.toLowerCase().includes(q) || r.movement.actor.toLowerCase().includes(q))
  }
  rows.sort((a, b) => b.movement.at.localeCompare(a.movement.at))
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 10
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
}
export async function listStockBatches() { await delay(); return snapshot().stockBatches }

// ── §5 Orders & delivery ────────────────────────────────────────
export interface OrderFilters { search?: string; storeId?: string; customerId?: string; status?: string; range?: RangeKey; page?: number; pageSize?: number }
export interface OrderRow { order: Order; storeName: string; riderName: string | null; refundTotal: number }
export async function listOrders(f: OrderFilters = {}): Promise<{ rows: OrderRow[]; total: number; counts: Record<string, number> }> {
  await delay()
  const db = snapshot()
  const now = new Date(db.demoNow)
  let rows = [...db.orders]
  if (f.range) {
    const days = f.range === 'today' ? 1 : f.range === '7d' ? 7 : f.range === '30d' ? 30 : 90
    const start = new Date(now); start.setDate(start.getDate() - (days - 1)); start.setHours(0, 0, 0, 0)
    rows = rows.filter((o) => new Date(o.placedAt) >= start)
  }
  if (f.storeId && f.storeId !== 'all') rows = rows.filter((o) => o.storeId === f.storeId)
  if (f.customerId) rows = rows.filter((o) => o.customerId === f.customerId)
  if (f.status && f.status !== 'all') rows = rows.filter((o) => o.status === f.status)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((o) => o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || o.deliveryCode.includes(q))
  }
  rows.sort((a, b) => b.placedAt.localeCompare(a.placedAt))
  const counts: Record<string, number> = { all: rows.length }
  for (const o of rows) counts[o.status] = (counts[o.status] ?? 0) + 1
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 8
  const slice = rows.slice((page - 1) * pageSize, page * pageSize)
  return {
    rows: slice.map((o) => ({
      order: o,
      storeName: db.stores.find((s) => s.id === o.storeId)?.name ?? '—',
      riderName: o.riderId ? db.riders.find((r) => r.id === o.riderId)?.name ?? null : null,
      refundTotal: db.refunds.filter((r) => r.orderId === o.id && r.status === 'paid').reduce((a, r) => a + r.amount, 0),
    })),
    total: rows.length, counts,
  }
}
export async function getOrderDetail(id: string) {
  await delay()
  const db = snapshot()
  const order = db.orders.find((o) => o.id === id)
  if (!order) return null
  return {
    order,
    store: db.stores.find((s) => s.id === order.storeId) ?? null,
    rider: order.riderId ? db.riders.find((r) => r.id === order.riderId) ?? null : null,
    attempts: db.paymentAttempts.filter((p) => p.orderId === order.id).sort((a, b) => a.attemptNo - b.attemptNo),
    refunds: db.refunds.filter((r) => r.orderId === order.id),
    tickets: db.tickets.filter((t) => t.orderId === order.id),
  }
}
export async function listRiders(): Promise<Rider[]> { await delay(); return snapshot().riders }

// ── §6 People ───────────────────────────────────────────────────
export interface CustomerFilters { search?: string; status?: string; page?: number; pageSize?: number }
export interface CustomerRow extends Customer { ordersCount: number; lastOrder?: string; openTickets: number }
export async function listCustomers(f: CustomerFilters = {}): Promise<{ rows: CustomerRow[]; total: number }> {
  await delay()
  const db = snapshot()
  const counts = new Map<string, { n: number; last?: string }>()
  for (const o of db.orders) {
    if (o.status === 'cancelled') continue
    const c = counts.get(o.customerId) ?? { n: 0 }
    c.n++
    if (!c.last || o.placedAt > c.last) c.last = o.placedAt
    counts.set(o.customerId, c)
  }
  let rows: CustomerRow[] = db.customers.map((c) => ({
    ...c, ordersCount: counts.get(c.id)?.n ?? 0, lastOrder: counts.get(c.id)?.last,
    openTickets: db.tickets.filter((t) => t.customerId === c.id && (t.status === 'open' || t.status === 'pending')).length,
  }))
  if (f.status && f.status !== 'all') rows = rows.filter((c) => c.status === f.status)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((c) => c.name.toLowerCase().includes(q) || c.email.includes(q) || c.phone.includes(q))
  }
  rows.sort((a, b) => b.ordersCount - a.ordersCount)
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 10
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
}
export async function getCustomerOrders(customerId: string): Promise<Order[]> {
  await delay()
  return snapshot().orders.filter((o) => o.customerId === customerId).sort((a, b) => b.placedAt.localeCompare(a.placedAt)).slice(0, 12)
}
export interface RiderFilters { search?: string; storeId?: string; status?: string; page?: number; pageSize?: number }
export async function listRiderApplications(f: RiderFilters = {}): Promise<{ rows: Rider[]; total: number }> {
  await delay()
  let rows = [...snapshot().riders]
  if (f.storeId && f.storeId !== 'all') rows = rows.filter((r) => r.storeId === f.storeId)
  if (f.status && f.status !== 'all') rows = rows.filter((r) => r.status === f.status)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.phone.includes(q))
  }
  rows.sort((a, b) => b.appliedOn.localeCompare(a.appliedOn))
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 8
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
}
export async function listWorkforce(f: { search?: string; role?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<{ rows: WorkforceAccount[]; total: number }> {
  await delay()
  let rows = [...snapshot().workforce]
  if (f.role && f.role !== 'all') rows = rows.filter((w) => w.role === f.role)
  if (f.status && f.status !== 'all') rows = rows.filter((w) => w.status === f.status)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((w) => w.name.toLowerCase().includes(q) || w.email.includes(q))
  }
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 8
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
}

// ── §7 Payments, refunds & wallets ──────────────────────────────
export interface PaymentFilters { search?: string; status?: string; method?: string; page?: number; pageSize?: number }
export async function listPaymentAttempts(f: PaymentFilters = {}): Promise<{ rows: PaymentAttempt[]; total: number; counts: { captured: number; failed: number; initiated: number } }> {
  await delay()
  let rows = [...snapshot().paymentAttempts]
  const counts = { captured: rows.filter((p) => p.status === 'captured').length, failed: rows.filter((p) => p.status === 'failed').length, initiated: rows.filter((p) => p.status === 'initiated').length }
  if (f.status && f.status !== 'all') rows = rows.filter((p) => p.status === f.status)
  if (f.method && f.method !== 'all') rows = rows.filter((p) => p.method === f.method)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((p) => p.orderId.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.gatewayRef ?? '').toLowerCase().includes(q))
  }
  rows.sort((a, b) => b.at.localeCompare(a.at))
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 8
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, counts }
}
export async function listRefunds(f: { search?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<{ rows: Refund[]; total: number }> {
  await delay()
  let rows = [...snapshot().refunds]
  if (f.status && f.status !== 'all') rows = rows.filter((r) => r.status === f.status)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((r) => r.orderId.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q))
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 8
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
}
export async function listWalletLedger(f: { search?: string; type?: string; page?: number; pageSize?: number } = {}): Promise<{ rows: WalletLedgerEntry[]; total: number }> {
  await delay()
  let rows = [...snapshot().walletLedger]
  if (f.type && f.type !== 'all') rows = rows.filter((e) => e.type === f.type)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((e) => e.customerName.toLowerCase().includes(q) || e.reason.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
  }
  rows.sort((a, b) => b.at.localeCompare(a.at))
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 10
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
}
export async function listReconciliation(): Promise<ReconciliationFinding[]> { await delay(); return snapshot().reconciliationFindings }
export async function listInvoiceFailures(): Promise<InvoiceFailure[]> { await delay(); return snapshot().invoiceFailures }

// ── §8 Rider payouts & COD ──────────────────────────────────────
export async function listPayouts(f: { search?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<{ rows: Payout[]; total: number; counts: Record<string, number> }> {
  await delay()
  let rows = [...snapshot().payouts]
  const counts: Record<string, number> = { all: rows.length }
  for (const p of rows) counts[p.status] = (counts[p.status] ?? 0) + 1
  if (f.status && f.status !== 'all') rows = rows.filter((p) => p.status === f.status)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((p) => p.riderName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.period.toLowerCase().includes(q))
  }
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 8
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, counts }
}
export async function listPayoutCorrections(): Promise<PayoutCorrection[]> { await delay(); return snapshot().payoutCorrections }

// ── §9 Offers & notifications ───────────────────────────────────
export async function listCoupons(): Promise<Coupon[]> { await delay(); return snapshot().coupons }
export async function listCampaigns(): Promise<PushCampaign[]> { await delay(); return snapshot().pushCampaigns }
export async function listAdminNotifications(): Promise<AdminNotification[]> { await delay(); return snapshot().adminNotifications }

// ── §10 Subscriptions ───────────────────────────────────────────
export async function listSubscriptionRuns(): Promise<SubscriptionRun[]> { await delay(); return [...snapshot().subscriptionRuns].sort((a, b) => b.date.localeCompare(a.date)) }
export async function getSubscriptionConfig() {
  await delay()
  const db = snapshot()
  return { slots: db.deliverySlots, holidays: db.subscriptionHolidays, settings: db.systemSettings.subscription, runs: db.subscriptionRuns, subscribable: db.products.filter((p) => p.subscribable) }
}

// ── §11 Support & reviews ───────────────────────────────────────
export interface TicketFilters { search?: string; status?: string; category?: string; orderId?: string; customerId?: string; page?: number; pageSize?: number }
export async function listTickets(f: TicketFilters = {}): Promise<{ rows: Ticket[]; total: number }> {
  await delay()
  let rows = [...snapshot().tickets]
  if (f.status && f.status !== 'all') rows = rows.filter((t) => t.status === f.status)
  if (f.category && f.category !== 'all') rows = rows.filter((t) => t.category === f.category)
  if (f.orderId) rows = rows.filter((t) => t.orderId === f.orderId)
  if (f.customerId) rows = rows.filter((t) => t.customerId === f.customerId)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((t) => t.ref.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.customerName.toLowerCase().includes(q))
  }
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 8
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
}
export async function getTicket(id: string) { await delay(); return snapshot().tickets.find((t) => t.id === id) ?? null }
export async function listSavedResponses(): Promise<Array<{ id: string; title: string; body: string }>> { await delay(); return snapshot().savedResponses }
export async function listRatings(f: { queueOnly?: boolean } = {}): Promise<Rating[]> {
  await delay()
  const rows = snapshot().ratings
  return f.queueOnly ? rows.filter((r) => r.moderationRequired && r.moderationStatus === 'pending') : rows
}

// ── §12 Reports & exports ───────────────────────────────────────
export async function getReportPreview(tab: string) { await delay(); return reportPreview(snapshot(), tab) }
export async function listExportJobs(): Promise<ExportJob[]> { await delay(); return [...snapshot().exportJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }

// ── §13 Approvals & compliance ──────────────────────────────────
export async function listApprovals(f: { status?: string; search?: string } = {}): Promise<Approval[]> {
  await delay()
  let rows = [...snapshot().approvals]
  if (f.status && f.status !== 'all') rows = rows.filter((a) => a.status === f.status)
  if (f.search) {
    const q = f.search.toLowerCase()
    rows = rows.filter((a) => a.action.toLowerCase().includes(q) || a.targetLabel.toLowerCase().includes(q) || a.requesterName.toLowerCase().includes(q))
  }
  rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  return rows
}
export async function listFraudFindings(): Promise<FraudFinding[]> { await delay(); return snapshot().fraudFindings }
export async function listErasureRequests(): Promise<ErasureRequest[]> { await delay(); return snapshot().erasureRequests }
export async function listLegalHolds(): Promise<LegalHold[]> { await delay(); return snapshot().legalHolds }

// ── §14 Settings & system ───────────────────────────────────────
export async function getSystemSettings(): Promise<SystemSettings> { await delay(); return snapshot().systemSettings }
export async function listBackgroundJobs(): Promise<BackgroundJob[]> { await delay(); return snapshot().backgroundJobs }
export async function listOperationalNotifications(): Promise<OperationalNotification[]> { await delay(); return snapshot().operationalNotifications }
export async function listStoresOptions(): Promise<Array<{ value: string; label: string }>> { await delay(); return snapshot().stores.map((s) => ({ value: s.id, label: s.name })) }

// ── Command palette search ──────────────────────────────────────
export interface PaletteHit { group: string; id: string; title: string; sub?: string; to: string }
export async function paletteSearch(q: string): Promise<PaletteHit[]> {
  await delay()
  const db = snapshot()
  const query = q.trim().toLowerCase()
  if (!query) return []
  const out: PaletteHit[] = []
  for (const s of db.stores) if (s.name.toLowerCase().includes(query)) out.push({ group: 'Stores', id: s.id, title: s.name, sub: `${s.status} · ${db.cities.find((c) => c.id === s.cityId)?.name}`, to: `/stores?focus=${s.id}` })
  for (const p of db.products) if (p.name.toLowerCase().includes(query)) out.push({ group: 'Products', id: p.id, title: p.name, sub: p.publishState, to: `/products?focus=${p.id}` })
  for (const o of db.orders) if (o.id.toLowerCase().includes(query) || o.customerName.toLowerCase().includes(query)) { out.push({ group: 'Orders', id: o.id, title: `#${o.id}`, sub: `${o.customerName} · ₹${o.amount.toLocaleString('en-IN')} · ${o.status.replace(/_/g, ' ')}`, to: `/orders/${o.id}` }); if (out.filter((r) => r.group === 'Orders').length >= 6) break }
  for (const c of db.customers) if (c.name.toLowerCase().includes(query)) { out.push({ group: 'Customers', id: c.id, title: c.name, sub: c.status, to: `/people?tab=customers&focus=${c.id}` }); if (out.filter((r) => r.group === 'Customers').length >= 5) break }
  for (const r of db.riders) if (r.name.toLowerCase().includes(query)) { out.push({ group: 'Riders', id: r.id, title: r.name, sub: `${r.status.replace(/_/g, ' ')} · ${db.stores.find((s) => s.id === r.storeId)?.name}`, to: `/people?tab=riders&focus=${r.id}` }) }
  for (const t of db.tickets) if (t.ref.toLowerCase().includes(query) || t.subject.toLowerCase().includes(query)) { out.push({ group: 'Tickets', id: t.id, title: `${t.ref} — ${t.subject}`, sub: t.status, to: `/support?focus=${t.id}` }); if (out.filter((r) => r.group === 'Tickets').length >= 5) break }
  return out.slice(0, 18)
}

export function newTicketMessage(m: Omit<TicketMessage, 'id'>): TicketMessage { return { ...m, id: `m-${Date.now()}` } }
