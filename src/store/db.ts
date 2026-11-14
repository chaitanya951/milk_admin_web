import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildSeedData, DEMO_NOW } from '@/data/seed'
import type {
  DB, Store, Zone, LegalEntity, Product, Variant, VariantAvailability, WorkforceAccount,
  Rider, Order, Refund, WalletLedgerEntry, Payout, Coupon, PushCampaign, AdminNotification,
  Approval, ExportJob, TicketMessage, SystemSettings, ErasureRequest, LegalHold,
  InvoiceFailure, BackgroundJob, StockLevel,
} from '@/types'

// Journal-based persistence: the dataset is rebuilt from the deterministic seed on
// every load, then persisted mutations (journal ops) are replayed on top.
export type JournalOp =
  | { t: 'store.add'; store: Store }
  | { t: 'store.update'; id: string; patch: Partial<Store> }
  | { t: 'store.delete'; id: string }
  | { t: 'zone.add'; zone: Zone }
  | { t: 'zone.update'; id: string; patch: Partial<Zone> }
  | { t: 'zone.delete'; id: string }
  | { t: 'entity.add'; entity: LegalEntity }
  | { t: 'entity.update'; id: string; patch: Partial<LegalEntity> }
  | { t: 'entity.delete'; id: string }
  | { t: 'product.add'; product: Product; variants: Variant[] }
  | { t: 'product.update'; id: string; patch: Partial<Product> }
  | { t: 'product.delete'; id: string }
  | { t: 'variant.update'; id: string; patch: Partial<Variant> }
  | { t: 'variant.add'; variant: Variant }
  | { t: 'storeVariant.update'; variantId: string; storeId: string; patch: Partial<VariantAvailability> }
  | { t: 'stock.update'; storeId: string; variantId: string; patch: Partial<StockLevel> }
  | { t: 'order.hold'; id: string; reason: string; at: string }
  | { t: 'order.release'; id: string; at: string }
  | { t: 'order.cancel'; id: string; reason: string; at: string }
  | { t: 'order.correction'; id: string; kind: string; reason: string; by: string; at: string }
  | { t: 'order.reassign'; id: string; riderId: string; at: string }
  | { t: 'order.resolveAddress'; id: string; at: string }
  | { t: 'order.resetCode'; id: string; at: string }
  | { t: 'customer.block'; id: string; reason: string }
  | { t: 'customer.unblock'; id: string }
  | { t: 'workforce.add'; member: WorkforceAccount }
  | { t: 'workforce.update'; id: string; patch: Partial<WorkforceAccount> }
  | { t: 'rider.update'; id: string; patch: Partial<Rider> }
  | { t: 'refund.request'; orderId: string; amount: number; reason: string; source: Refund['source']; at: string; refundId: string }
  | { t: 'refund.status'; id: string; status: Refund['status']; at: string }
  | { t: 'refund.evidence'; id: string; reference: string; fileName: string }
  | { t: 'wallet.adjust'; entry: WalletLedgerEntry }
  | { t: 'reconciliation.status'; id: string; status: 'open' | 'investigating' | 'resolved'; note?: string }
  | { t: 'invoice.retry'; id: string; at: string }
  | { t: 'payout.approve'; id: string; at: string }
  | { t: 'payout.hold'; id: string; reason: string }
  | { t: 'payout.settle'; id: string; reference: string; fileName?: string; at: string }
  | { t: 'coupon.add'; coupon: Coupon }
  | { t: 'coupon.update'; id: string; patch: Partial<Coupon> }
  | { t: 'campaign.add'; campaign: PushCampaign }
  | { t: 'notif.read'; id?: string }
  | { t: 'subscription.retryRun'; id: string; at: string }
  | { t: 'subscription.config'; patch: Partial<SystemSettings['subscription']> }
  | { t: 'ticket.reply'; id: string; message: TicketMessage }
  | { t: 'ticket.status'; id: string; status: 'open' | 'pending' | 'resolved' | 'closed'; at: string }
  | { t: 'rating.moderate'; id: string; status: 'approved' | 'removed'; reason?: string }
  | { t: 'approval.decide'; id: string; status: 'completed' | 'rejected'; decidedBy: string; at: string; apply?: { variantId?: string; newPrice?: number; publish?: boolean; workforceId?: string; newRole?: string } }
  | { t: 'fraud.status'; id: string; status: 'open' | 'cleared' | 'confirmed' }
  | { t: 'erasure.update'; id: string; patch: Partial<ErasureRequest> }
  | { t: 'hold.add'; hold: LegalHold }
  | { t: 'hold.release'; id: string; at: string }
  | { t: 'export.add'; job: ExportJob }
  | { t: 'export.complete'; id: string; rowCount: number; fileName: string }
  | { t: 'export.fail'; id: string; error: string }
  | { t: 'job.retry'; id: string; at: string }
  | { t: 'flags'; features: SystemSettings['features'] }
  | { t: 'rules'; rules: SystemSettings['rules'] }
  | { t: 'approval.add'; approval: Approval }
  | { t: 'notification'; entry: AdminNotification }

function applyOp(db: DB, op: JournalOp): void {
  switch (op.t) {
    case 'store.add': db.stores = [op.store, ...db.stores]; break
    case 'store.update': db.stores = db.stores.map((s) => (s.id === op.id ? { ...s, ...op.patch } : s)); break
    case 'store.delete':
      db.stores = db.stores.filter((s) => s.id !== op.id)
      db.zones = db.zones.filter((z) => z.storeId !== op.id)
      break
    case 'zone.add': db.zones = [...db.zones, op.zone]; break
    case 'zone.update': db.zones = db.zones.map((z) => (z.id === op.id ? { ...z, ...op.patch } : z)); break
    case 'zone.delete': db.zones = db.zones.filter((z) => z.id !== op.id); break
    case 'entity.add': db.legalEntities = [...db.legalEntities, op.entity]; break
    case 'entity.update': db.legalEntities = db.legalEntities.map((e) => (e.id === op.id ? { ...e, ...op.patch } : e)); break
    case 'entity.delete': db.legalEntities = db.legalEntities.filter((e) => e.id !== op.id); break
    case 'product.add': db.products = [op.product, ...db.products]; db.variants = [...db.variants, ...op.variants]; break
    case 'product.update': db.products = db.products.map((p) => (p.id === op.id ? { ...p, ...op.patch } : p)); break
    case 'product.delete':
      db.products = db.products.filter((p) => p.id !== op.id)
      db.variants = db.variants.filter((v) => v.productId !== op.id)
      break
    case 'variant.update': db.variants = db.variants.map((v) => (v.id === op.id ? { ...v, ...op.patch } : v)); break
    case 'variant.add': db.variants = [...db.variants, op.variant]; break
    case 'storeVariant.update':
      db.storeVariants = db.storeVariants.map((sv) => (sv.variantId === op.variantId && sv.storeId === op.storeId ? { ...sv, ...op.patch } : sv))
      break
    case 'stock.update':
      db.stockLevels = db.stockLevels.map((s) => (s.storeId === op.storeId && s.variantId === op.variantId ? { ...s, ...op.patch } : s))
      break
    case 'order.hold':
      db.orders = db.orders.map((o) => (o.id === op.id ? { ...o, status: 'on_hold', holdReason: op.reason, timeline: { ...o.timeline, held: op.at }, requiresAttention: true, attentionReason: 'on_hold' } : o))
      break
    case 'order.release':
      db.orders = db.orders.map((o) => (o.id === op.id ? { ...o, status: 'confirmed', holdReason: undefined, timeline: { ...o.timeline, released: op.at } } : o))
      break
    case 'order.cancel':
      db.orders = db.orders.map((o) => (o.id === op.id ? { ...o, status: 'cancelled', cancelReason: op.reason, timeline: { ...o.timeline, cancelled: op.at } } : o))
      break
    case 'order.correction':
      db.orders = db.orders.map((o) => (o.id === op.id ? { ...o, correctionRequests: [{ id: `cr-${Date.now()}`, kind: op.kind, reason: op.reason, requestedBy: op.by, status: 'requested', at: op.at }, ...o.correctionRequests] } : o))
      break
    case 'order.reassign':
      db.orders = db.orders.map((o) => (o.id === op.id ? { ...o, riderId: op.riderId } : o))
      break
    case 'order.resolveAddress':
      db.orders = db.orders.map((o) => (o.id === op.id ? { ...o, wrongAddressResolvedAt: op.at } : o))
      break
    case 'order.resetCode':
      db.orders = db.orders.map((o) => (o.id === op.id ? { ...o, deliveryCodeLocked: false, deliveryCode: String(Math.floor(1000 + Math.random() * 9000)) } : o))
      break
    case 'customer.block': db.customers = db.customers.map((c) => (c.id === op.id ? { ...c, status: 'blocked', blockedReason: op.reason } : c)); break
    case 'customer.unblock': db.customers = db.customers.map((c) => (c.id === op.id ? { ...c, status: 'active', blockedReason: undefined } : c)); break
    case 'workforce.add': db.workforce = [op.member, ...db.workforce]; break
    case 'workforce.update': db.workforce = db.workforce.map((w) => (w.id === op.id ? { ...w, ...op.patch } : w)); break
    case 'rider.update': db.riders = db.riders.map((r) => (r.id === op.id ? { ...r, ...op.patch } : r)); break
    case 'refund.request': {
      const order = db.orders.find((o) => o.id === op.orderId)
      db.refunds = [{ id: op.refundId, orderId: op.orderId, amount: op.amount, status: 'requested', reason: op.reason, source: op.source, createdAt: op.at }, ...db.refunds]
      if (order) order.discount = order.discount // no-op keeps immutability simple
      break
    }
    case 'refund.status': db.refunds = db.refunds.map((r) => (r.id === op.id ? { ...r, status: op.status, paidAt: op.status === 'paid' ? op.at : r.paidAt } : r)); break
    case 'refund.evidence': db.refunds = db.refunds.map((r) => (r.id === op.id ? { ...r, evidence: { reference: op.reference, fileName: op.fileName } } : r)); break
    case 'wallet.adjust': {
      db.walletLedger = [op.entry, ...db.walletLedger]
      const balances = { ...db.meta.walletBalances }
      balances[op.entry.customerId] = (balances[op.entry.customerId] ?? 0) + op.entry.amount
      db.meta = { ...db.meta, walletBalances: balances }
      break
    }
    case 'reconciliation.status': db.reconciliationFindings = db.reconciliationFindings.map((f) => (f.id === op.id ? { ...f, status: op.status, note: op.note ?? f.note } : f)); break
    case 'invoice.retry': db.invoiceFailures = db.invoiceFailures.map((f) => (f.id === op.id ? { ...f, status: 'rendering' } : f)); break
    case 'payout.approve': db.payouts = db.payouts.map((p) => (p.id === op.id ? { ...p, status: 'approved', canApprove: false, approvedAt: op.at } : p)); break
    case 'payout.hold': db.payouts = db.payouts.map((p) => (p.id === op.id ? { ...p, status: 'on_hold', holdReason: op.reason } : p)); break
    case 'payout.settle': db.payouts = db.payouts.map((p) => (p.id === op.id ? { ...p, status: 'paid', paymentReference: op.reference, evidenceFileName: op.fileName, paidAt: op.at } : p)); break
    case 'coupon.add': db.coupons = [op.coupon, ...db.coupons]; break
    case 'coupon.update': db.coupons = db.coupons.map((c) => (c.id === op.id ? { ...c, ...op.patch } : c)); break
    case 'campaign.add': db.pushCampaigns = [op.campaign, ...db.pushCampaigns]; break
    case 'notif.read': db.adminNotifications = db.adminNotifications.map((n) => (!op.id || n.id === op.id ? { ...n, read: true } : n)); break
    case 'subscription.retryRun': {
      db.subscriptionRuns = db.subscriptionRuns.map((r) => (r.id === op.id
        ? { ...r, status: r.failures.every((f) => !f.retryable) ? r.status : 'completed', failures: r.failures.filter((f) => !f.retryable) }
        : r))
      break
    }
    case 'subscription.config': db.systemSettings = { ...db.systemSettings, subscription: { ...db.systemSettings.subscription, ...op.patch } }; break
    case 'ticket.reply': db.tickets = db.tickets.map((t) => (t.id === op.id ? { ...t, messages: [...t.messages, op.message], updatedAt: op.message.at, status: t.status === 'open' ? 'pending' : t.status } : t)); break
    case 'ticket.status': db.tickets = db.tickets.map((t) => (t.id === op.id ? { ...t, status: op.status, updatedAt: op.at } : t)); break
    case 'rating.moderate': db.ratings = db.ratings.map((r) => (r.id === op.id ? { ...r, moderationStatus: op.status, moderationReason: op.reason ?? r.moderationReason } : r)); break
    case 'approval.decide': {
      db.approvals = db.approvals.map((a) => (a.id === op.id ? { ...a, status: op.status, decidedAt: op.at, decidedBy: op.decidedBy } : a))
      if (op.apply?.variantId && op.apply.newPrice != null) {
        db.variants = db.variants.map((v) => (v.id === op.apply!.variantId ? { ...v, price: op.apply!.newPrice! } : v))
        const variant = db.variants.find((v) => v.id === op.apply!.variantId)
        if (variant) db.products = db.products.map((p) => (p.id === variant.productId ? { ...p, pendingApprovalId: undefined, pendingChangeLabel: undefined } : p))
      }
      if (op.apply?.publish != null && op.apply.variantId) {
        const variantId = op.apply.variantId
        const publish = op.apply.publish
        const variant = db.variants.find((v) => v.id === variantId)
        if (variant) db.products = db.products.map((p) => (p.id === variant.productId ? { ...p, publishState: publish ? 'published' : 'unpublished', pendingApprovalId: undefined, pendingChangeLabel: undefined } : p))
      }
      if (op.apply?.workforceId && op.apply.newRole) {
        db.workforce = db.workforce.map((w) => (w.id === op.apply!.workforceId ? { ...w, role: op.apply!.newRole as WorkforceAccount['role'], pendingRoleChangeApprovalId: undefined } : w))
      }
      break
    }
    case 'fraud.status': db.fraudFindings = db.fraudFindings.map((f) => (f.id === op.id ? { ...f, status: op.status } : f)); break
    case 'erasure.update': db.erasureRequests = db.erasureRequests.map((e) => (e.id === op.id ? { ...e, ...op.patch } : e)); break
    case 'hold.add': db.legalHolds = [op.hold, ...db.legalHolds]; break
    case 'hold.release': db.legalHolds = db.legalHolds.map((h) => (h.id === op.id ? { ...h, status: 'released', releasedAt: op.at } : h)); break
    case 'export.add': db.exportJobs = [op.job, ...db.exportJobs]; break
    case 'export.complete': db.exportJobs = db.exportJobs.map((j) => (j.id === op.id ? { ...j, status: 'complete', rowCount: op.rowCount, fileName: op.fileName, completedAt: new Date().toISOString() } : j)); break
    case 'export.fail': db.exportJobs = db.exportJobs.map((j) => (j.id === op.id ? { ...j, status: 'failed', error: op.error } : j)); break
    case 'job.retry': db.backgroundJobs = db.backgroundJobs.map((j) => (j.id === op.id ? { ...j, status: 'retrying', attempts: j.attempts + 1, lastRunAt: op.at } : j)); break
    case 'flags': db.systemSettings = { ...db.systemSettings, features: op.features }; break
    case 'rules': db.systemSettings = { ...db.systemSettings, rules: op.rules }; break
    case 'approval.add': db.approvals = [op.approval, ...db.approvals]; break
    case 'notification': db.adminNotifications = [op.entry, ...db.adminNotifications]; break
  }
}

interface DBState {
  db: DB
  journal: JournalOp[]
  version: number
  apply: (op: JournalOp) => void
  resetDemoData: () => void
}

export const useDB = create<DBState>()(
  persist(
    (set, get) => ({
      db: buildSeedData(),
      journal: [],
      version: 0,
      apply: (op) => {
        const { db, journal } = get()
        const next = { ...db }
        applyOp(next, op)
        const nextJournal = op.t === 'notif.read' ? journal : [...journal, op].slice(-250)
        set({ db: next, journal: nextJournal, version: get().version + 1 })
      },
      resetDemoData: () => set({ db: buildSeedData(), journal: [], version: get().version + 1 }),
    }),
    {
      name: 'dairydirect-journal-v2',
      partialize: (s) => ({ journal: s.journal }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const fresh = buildSeedData()
        for (const op of state.journal ?? []) applyOp(fresh, op)
        state.db = fresh
        state.version = (state.version ?? 0) + 1
      },
    },
  ),
)

export const demoNow = () => new Date(useDB.getState().db.demoNow)
export { DEMO_NOW }
