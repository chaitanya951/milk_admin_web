import type { DB, RangeKey, DashboardSummary, Order } from '../types'
import { sameDay } from '../lib/utils'

// ── Shared window helper ────────────────────────────────────────
export function windowFor(range: RangeKey, now: Date): { start: Date; end: Date } {
  const end = new Date(now)
  const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90
  const start = new Date(now)
  if (range === 'today') start.setHours(0, 0, 0, 0)
  else start.setDate(start.getDate() - (days - 1)), start.setHours(0, 0, 0, 0)
  return { start, end }
}

export function ordersInRange(db: DB, range: RangeKey, storeId: string | 'all' = 'all'): Order[] {
  const { start, end } = windowFor(range, new Date(db.demoNow))
  return db.orders.filter((o) => {
    const t = new Date(o.placedAt)
    return t >= start && t <= end && (storeId === 'all' || o.storeId === storeId)
  })
}

// ── §1 Dashboard aggregation service ────────────────────────────
// Single function so it can later be swapped for a backend aggregation endpoint.
export function getDashboardSummary(db: DB, range: RangeKey, storeId: string | 'all'): DashboardSummary {
  const orders = ordersInRange(db, range, storeId)
  const storeScope = storeId === 'all' ? db.stores : db.stores.filter((s) => s.id === storeId)
  const inScope = (sid: string) => storeId === 'all' || sid === storeId

  const ordersPlaced = orders.filter((o) => o.status === 'placed').length
  const ordersInProgress = orders.filter((o) => ['confirmed', 'picking', 'ready', 'out_for_delivery'].includes(o.status)).length
  const ordersDelivered = orders.filter((o) => o.status === 'delivered').length
  const ordersCancelled = orders.filter((o) => o.status === 'cancelled').length

  const { start } = windowFor(range, new Date(db.demoNow))
  const refundsInRange = db.refunds.filter((r) => new Date(r.createdAt) >= start && inScope(db.orders.find((o) => o.id === r.orderId)?.storeId ?? ''))
  const ledgerInRange = db.walletLedger.filter((e) => new Date(e.at) >= start)

  const variantName = (vid: string) => {
    const v = db.variants.find((x) => x.id === vid)!
    const p = db.products.find((x) => x.id === v.productId)!
    return `${p.name} – ${v.label}`
  }
  const storeNameOf = (sid: string) => db.stores.find((s) => s.id === sid)?.name ?? '—'

  const lowStock = db.stockLevels
    .filter((s) => s.qty < s.lowStockThreshold && inScope(s.storeId))
    .map((s) => ({ storeName: storeNameOf(s.storeId), variantName: variantName(s.variantId), qty: s.qty, threshold: s.lowStockThreshold }))
    .slice(0, 8)
  const expiringStock = db.stockBatches
    .filter((b) => (new Date(b.expiryDate).getTime() - new Date(db.demoNow).getTime()) / 86400000 <= 7 && inScope(b.storeId))
    .map((b) => ({ storeName: storeNameOf(b.storeId), variantName: variantName(b.variantId), qty: b.qty, expiryDate: b.expiryDate }))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    .slice(0, 8)

  return {
    range, storeId,
    ordersPlaced, ordersInProgress, ordersDelivered, ordersCancelled,
    ordersRequiringAttention: db.orders.filter((o) => o.requiresAttention && inScope(o.storeId)).length,
    storesOnline: storeScope.filter((s) => s.status === 'online').length,
    storesPaused: storeScope.filter((s) => s.status === 'paused').length,
    highBacklogStores: storeScope.filter((s) => s.pickingBacklog >= 30).map((s) => ({ id: s.id, name: s.name, backlog: s.pickingBacklog })),
    pendingRiderApplications: db.riders.filter((r) => r.status === 'application_pending' && inScope(r.storeId)).length,
    pendingRefunds: refundsInRange.filter((r) => r.status === 'requested' || r.status === 'processing').length,
    pendingApprovals: db.approvals.filter((a) => a.status === 'pending').length,
    openTickets: db.tickets.filter((t) => t.status === 'open' || t.status === 'pending').length,
    lowStock, expiringStock,
    reconciliationIssues: db.reconciliationFindings.filter((f) => f.status !== 'resolved').length,
    failedJobs: db.backgroundJobs.filter((j) => j.status === 'failed').length,
    sales: orders.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + o.amount, 0),
    walletTopUps: ledgerInRange.filter((e) => e.type === 'topup').reduce((a, e) => a + e.amount, 0),
    refunds: refundsInRange.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amount, 0),
  }
}

// ── Label helpers ───────────────────────────────────────────────
export function variantLabel(db: DB, variantId: string): string {
  const v = db.variants.find((x) => x.id === variantId)
  if (!v) return variantId
  const p = db.products.find((x) => x.id === v.productId)
  return p ? `${p.name} – ${v.label}` : v.sku
}

export function storeName(db: DB, storeId: string): string {
  return db.stores.find((s) => s.id === storeId)?.name ?? storeId
}

// ── Report preview builders (§12) ───────────────────────────────
export function reportPreview(db: DB, tab: string): Array<Record<string, string | number>> {
  const sName = (sid: string) => storeName(db, sid)
  switch (tab) {
    case 'catalog_stock': {
      return db.storeVariants.slice(0, 40).map((sv) => {
        const lvl = db.stockLevels.find((s) => s.storeId === sv.storeId && s.variantId === sv.variantId)
        const v = db.variants.find((x) => x.id === sv.variantId)!
        return {
          Product: variantLabel(db, sv.variantId), SKU: v.sku, Store: sName(sv.storeId),
          Available: sv.available ? 'Yes' : 'No', Price: v.price,
          Stock: lvl?.qty ?? 0, Threshold: lvl?.lowStockThreshold ?? 0,
          Status: (lvl?.qty ?? 0) < (lvl?.lowStockThreshold ?? 0) ? 'LOW' : 'OK',
        }
      })
    }
    case 'financial': {
      return db.orders.slice(0, 40).map((o) => ({
        Order: `#${o.id}`, Store: sName(o.storeId), Customer: o.customerName,
        Amount: o.amount, Method: o.paymentMethod.replace('online_', '').toUpperCase(),
        Status: o.status.replace(/_/g, ' '),
        Refunded: db.refunds.filter((r) => r.orderId === o.id && r.status === 'paid').reduce((a, r) => a + r.amount, 0),
      }))
    }
    case 'picking': {
      return db.stores.map((s) => {
        const todayOrders = db.orders.filter((o) => o.storeId === s.id && sameDay(new Date(o.placedAt), new Date(db.demoNow)))
        return {
          Store: s.name, Capacity: s.capacityOrdersPerDay, OrdersToday: todayOrders.length,
          PickingBacklog: s.pickingBacklog, Status: s.status.toUpperCase(),
          'Delivered today': todayOrders.filter((o) => o.status === 'delivered').length,
          'On time %': s.pickingBacklog > 30 ? 88.4 : 96.2,
        }
      })
    }
    case 'rider_activity': {
      return db.riders.map((r) => {
        const p = db.payouts.find((x) => x.riderId === r.id && x.status === 'pending_review') ?? db.payouts.find((x) => x.riderId === r.id)!
        return {
          Rider: r.name, Store: sName(r.storeId), Status: r.status.replace(/_/g, ' '),
          Deliveries: r.deliveriesPeriod, Rating: r.rating,
          'Latest payout': p ? `${p.period} · ₹${p.netAmount.toLocaleString('en-IN')} (${p.status.replace(/_/g, ' ')})` : '—',
        }
      })
    }
    case 'subscriptions': {
      return db.subscriptionRuns.map((r) => ({
        Date: r.date.slice(0, 10), Generated: r.generated, Status: r.status.toUpperCase(),
        Failures: r.failures.length, Retryable: r.failures.filter((f) => f.retryable).length,
      }))
    }
    case 'support': {
      return db.tickets.map((t) => ({
        Ref: t.ref, Subject: t.subject, Category: t.category.replace(/_/g, ' '),
        Status: t.status, Priority: t.priority, Customer: t.customerName,
        Created: t.createdAt.slice(0, 10), Messages: t.messages.length,
      }))
    }
    default:
      return []
  }
}

// ── Small derived facts used across pages ───────────────────────
export function orderRefundTotal(db: DB, orderId: string): number {
  return db.refunds.filter((r) => r.orderId === orderId).reduce((a, r) => a + r.amount, 0)
}

export function isRefundEligible(db: DB, orderId: string): { eligible: boolean; reason?: string } {
  const o = db.orders.find((x) => x.id === orderId)
  if (!o) return { eligible: false, reason: 'Order not found' }
  if (o.status === 'cancelled') return { eligible: false, reason: 'Order already cancelled — refunds are handled by the cancellation flow' }
  if (o.paymentMethod === 'cod') return { eligible: false, reason: 'COD order — nothing to refund until collection is reconciled' }
  if (o.paymentMethod === 'wallet') return { eligible: false, reason: 'Wallet orders refund via wallet credit adjustment' }
  if (new Date(db.demoNow).getTime() - new Date(o.placedAt).getTime() > db.systemSettings.rules.refundWindowDays * 86400000) {
    return { eligible: false, reason: `Outside the ${db.systemSettings.rules.refundWindowDays}-day refund window` }
  }
  const refunded = orderRefundTotal(db, orderId)
  if (refunded >= o.amount) return { eligible: false, reason: 'Order already fully refunded' }
  return { eligible: true }
}

export function orderActionEligibility(db: DB, o: Order): {
  hold: boolean; holdReason?: string
  release: boolean; releaseReason?: string
  cancel: boolean; cancelReason?: string
  reassign: boolean; reassignReason?: string
  resolveAddress: boolean; resolveAddressReason?: string
  resetCode: boolean; resetCodeReason?: string
} {
  const terminal = o.status === 'delivered' || o.status === 'cancelled'
  return {
    hold: !terminal && o.status !== 'on_hold',
    holdReason: terminal ? `Order is already ${o.status}` : o.status === 'on_hold' ? 'Order is already on hold' : undefined,
    release: o.status === 'on_hold',
    releaseReason: o.status !== 'on_hold' ? 'Order is not on hold' : undefined,
    cancel: !terminal && o.status !== 'on_hold',
    cancelReason: terminal ? `Order is already ${o.status}` : o.status === 'on_hold' ? 'Release the hold before cancelling' : undefined,
    reassign: !!(o.riderId && (o.status === 'confirmed' || o.status === 'picking' || o.status === 'ready')),
    reassignReason: !o.riderId ? 'No rider assigned yet' : o.status === 'out_for_delivery' || o.status === 'delivered' ? 'Rider has already picked up — reassignment only before pickup' : terminal || o.status === 'on_hold' || o.status === 'placed' ? `Order is ${o.status.replace(/_/g, ' ')}` : undefined,
    resolveAddress: !!o.wrongAddressReportedAt && !o.wrongAddressResolvedAt,
    resolveAddressReason: !o.wrongAddressReportedAt ? 'No wrong-address report on this order' : o.wrongAddressResolvedAt ? 'Report already resolved' : undefined,
    resetCode: o.deliveryCodeLocked,
    resetCodeReason: !o.deliveryCodeLocked ? 'Delivery code is not locked' : undefined,
  }
}
