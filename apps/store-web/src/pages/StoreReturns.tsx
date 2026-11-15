// §4 Returns & Quality Checks — KPIs, parcel tabs, Record Return dialog for past
// failed-delivery orders, and the inspection drawer with per-item quality decisions.
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, BadgeCheck, Check, CheckCircle2, ChevronRight, Eye, Info,
  PackageX, Search, Undo2, XCircle,
} from 'lucide-react'
import { useDebouncedValue, useStagger } from '@dairydirect/shared/hooks/misc'
import { useActiveStoreId, useReturns, useStoreDashboard } from '@/api/storeQueries'
import { useReturnActions } from '@/api/storeMutations'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { DEMO_NOW } from '@dairydirect/shared/mock-db/seed'
import { toast } from '@dairydirect/shared/lib/toast'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from '@dairydirect/shared/ui/base'
import { Dialog, DialogContent, Drawer, Tooltip } from '@dairydirect/shared/ui/overlays'
import { Field, Select } from '@dairydirect/shared/ui/form'
import { EmptyState, PageHeader, SearchInput, StatusPill, TabPills } from '@dairydirect/shared/ui/misc'
import { DataTable, Pagination, type Column } from '@dairydirect/shared/ui/DataTable'
import { KpiCard } from '@dairydirect/shared/ui/KpiCard'
import { ProductTile } from '@dairydirect/shared/assets/productIcons'
import { SupportScene } from '@dairydirect/shared/assets/scenes'
import { cn, fmtDate, fmtDateTime } from '@dairydirect/shared/lib/utils'
import type { DB, Order, ProductIcon, QualityDecision, ReturnParcel, ReturnItemLine, ReturnReason } from '@dairydirect/shared/types'

const PAGE_SIZE = 6

const REASON_LABEL: Record<ReturnReason, string> = {
  customer_unavailable: 'Customer unavailable',
  wrong_address: 'Wrong address',
  delivery_refused: 'Delivery refused',
  rider_could_not_deliver: 'Rider could not deliver',
  other: 'Other',
}
const REASON_TONE: Record<ReturnReason, 'blue' | 'amber' | 'red' | 'violet' | 'neutral'> = {
  customer_unavailable: 'blue',
  wrong_address: 'amber',
  delivery_refused: 'red',
  rider_could_not_deliver: 'violet',
  other: 'neutral',
}
const REASON_OPTIONS = [
  { value: 'all', label: 'All Reasons' },
  ...(Object.keys(REASON_LABEL) as ReturnReason[]).map((r) => ({ value: r, label: REASON_LABEL[r] })),
]
// under_inspection has no dedicated StatusPill tone — 'processing' renders amber.
const RETURN_STATUS_KEY: Record<ReturnParcel['status'], string> = {
  pending: 'pending',
  under_inspection: 'processing',
  processed: 'processed',
}
const DECISIONS: Array<{ d: QualityDecision; label: string; on: string }> = [
  { d: 'saleable', label: 'Saleable', on: 'border-success/40 bg-success-soft text-success' },
  { d: 'damaged', label: 'Damaged', on: 'border-destructive/40 bg-destructive-soft text-destructive' },
  { d: 'expired', label: 'Expired', on: 'border-violet-300/60 bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
]

/* ── Local helpers ─────────────────────────────────────────── */
function iconFor(productName: string): ProductIcon {
  const n = productName.toLowerCase()
  if (n.includes('milk') && !n.includes('flavored')) return 'milk'
  if (n.includes('paneer') || n.includes('tofu')) return 'paneer'
  if (n.includes('ghee')) return 'ghee'
  if (n.includes('curd')) return 'curd'
  if (n.includes('butter')) return 'butter'
  if (n.includes('lassi')) return 'lassi'
  if (n.includes('chaas') || n.includes('buttermilk')) return 'buttermilk'
  if (n.includes('cream')) return 'cream'
  if (n.includes('cheese')) return 'cheese'
  if (n.includes('khoya')) return 'khoya'
  return 'flavored_milk'
}

/** Batch expiry for a return item: real batch when it exists, else a deterministic
 *  pseudo-expiry derived from the batch id (seeded return batch ids are synthetic). */
function batchExpiryPast(db: DB, batchId: string): boolean {
  const real = db.inventoryBatches.find((b) => b.id === batchId)
  const iso = real
    ? real.expiryDate
    : new Date(new Date(db.demoNow).getTime() + (((Number(batchId.replace(/\D/g, '')) || 0) % 25) - 8) * 86400000).toISOString()
  return new Date(iso).getTime() < new Date(db.demoNow).getTime()
}

/** Tooltip wrapper that also works around disabled buttons (no pointer events). */
function Tip({ tip, children }: { tip?: string; children: React.ReactNode }) {
  if (!tip) return <>{children}</>
  return (
    <Tooltip content={tip}>
      <span className="inline-flex cursor-not-allowed">{children}</span>
    </Tooltip>
  )
}

/* ── Quality decision radio group for one returned item ────── */
function DecisionGroup({ parcel, item, db, onDecide }: {
  parcel: ReturnParcel
  item: ReturnItemLine
  db: DB
  onDecide: (item: ReturnItemLine, d: QualityDecision) => void
}) {
  const locked = parcel.status === 'processed'
  return (
    <div role="radiogroup" aria-label={`Quality decision for ${item.name}`} className="flex flex-wrap items-center gap-1.5">
      {DECISIONS.map(({ d, label, on }) => {
        const expiredBlocked = d === 'expired' && !batchExpiryPast(db, item.batchId)
        const selected = item.decision === d
        const btn = (
          <button
            key={d}
            role="radio"
            aria-checked={selected}
            disabled={locked || expiredBlocked}
            onClick={() => onDecide(item, d)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
              selected ? on : 'border-border bg-card text-muted-foreground hover:border-brand-300',
              (locked || expiredBlocked) && 'cursor-not-allowed opacity-40',
            )}
          >
            {selected && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            {label}
          </button>
        )
        return expiredBlocked ? <Tip key={d} tip="Not yet expired">{btn}</Tip> : btn
      })}
    </div>
  )
}

/* ── Record Return dialog (past failed-delivery order → parcel) ── */
interface DraftItem { variantId: string; name: string; icon: ProductIcon; qty: number; max: number; batchId: string }

function RecordReturnDialog({ open, onOpenChange, orders, storeId }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  orders: Order[]
  storeId: string | null
}) {
  const returns = useReturnActions()
  const [orderId, setOrderId] = useState('')
  const [reason, setReason] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])

  useEffect(() => {
    if (open) { setOrderId(''); setReason(''); setItems([]) }
  }, [open])

  const selectOrder = (id: string) => {
    setOrderId(id)
    const o = orders.find((x) => x.id === id)
    setItems(o ? o.items.map((it) => ({
      variantId: it.variantId, name: it.name, icon: iconFor(it.name),
      qty: it.qty, max: it.qty, batchId: `B${Math.floor(1000 + Math.random() * 9000)}`,
    })) : [])
  }
  const setQty = (idx: number, qty: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, qty: Math.max(0, Math.min(it.max, Math.floor(qty || 0))) } : it)))

  const valid = !!orderId && !!reason && items.some((i) => i.qty > 0)

  const submit = () => {
    if (!valid || !storeId) return
    const parcel: ReturnParcel = {
      id: returns.newParcelId(),
      orderId,
      storeId,
      returnedAt: DEMO_NOW.toISOString(),
      reason: reason as ReturnReason,
      status: 'pending',
      items: items.filter((i) => i.qty > 0).map(({ variantId, name, icon, qty, batchId }): ReturnItemLine => ({ variantId, name, icon, qty, batchId })),
      draft: false,
    }
    returns.record(parcel) // toast comes from the mutation
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Record Return"
        description="Log a parcel returned from a past failed delivery — it will land in the inspection queue."
        wide
      >
        <div className="space-y-4">
          <Field label="Failed delivery order" required>
            <Select
              value={orderId}
              onValueChange={selectOrder}
              placeholder="Pick the cancelled order…"
              options={orders.map((o) => ({ value: o.id, label: `${o.id} · ${o.customerName} · ${fmtDate(o.placedAt)}` }))}
            />
          </Field>
          <Field label="Return reason" required error={!reason && orderId ? 'Return reason is required' : undefined}>
            <Select
              value={reason}
              onValueChange={setReason}
              placeholder="Why did the parcel come back?"
              options={(Object.keys(REASON_LABEL) as ReturnReason[]).map((r) => ({ value: r, label: REASON_LABEL[r] }))}
            />
          </Field>

          <div className="rounded-xl border border-border/70">
            <div className="border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[13px] font-bold">
              Returned items {items.length > 0 && <span className="font-medium text-muted-foreground">— quantity editable, batch auto-assigned</span>}
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Select an order to pre-fill its items.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {items.map((it, i) => (
                  <div key={`${it.variantId}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                    <ProductTile icon={it.icon} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{it.name}</div>
                      <div className="text-[11px] text-muted-foreground">Batch {it.batchId}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Input
                        type="number" min={0} max={it.max} value={it.qty}
                        onChange={(e) => setQty(i, Number(e.target.value))}
                        aria-label={`Quantity for ${it.name}`}
                        className="h-8 w-16 px-2 text-center text-[13px]"
                      />
                      <span>of {it.max}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Tip tip={!orderId ? 'Pick an order first' : !reason ? 'Each return needs a reason' : undefined}>
              <Button disabled={!valid} onClick={submit}><Undo2 className="h-4 w-4" /> Record Return</Button>
            </Tip>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Page ──────────────────────────────────────────────────── */
export function StoreReturns() {
  const storeId = useActiveStoreId()
  const stagger = useStagger()
  const returns = useReturnActions()

  const [tab, setTab] = useState('parcels')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [reason, setReason] = useState('all')
  const [page, setPage] = useState(1)
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [stockAction, setStockAction] = useState<'quarantine' | 'write_off'>('quarantine')
  const [note, setNote] = useState('')
  const [recordOpen, setRecordOpen] = useState(false)

  const db = useDB((s) => s.db)
  const dash = useStoreDashboard(storeId)
  const list = useReturns(storeId, tab, { search: debouncedSearch, reason })

  const storeReturns = useMemo(() => db.returns.filter((r) => r.storeId === storeId), [db.returns, storeId])
  const failedOrders = useMemo(
    () => db.orders.filter((o) => o.storeId === storeId && o.status === 'cancelled' && o.cancelReason === 'Delivery failed'),
    [db.orders, storeId],
  )
  const orderById = useMemo(() => new Map(db.orders.map((o) => [o.id, o as Order])), [db.orders])

  // Tab counts come from the dataset (never hardcoded); the "Processed" tab holds
  // every processed parcel, while the KPI above counts today's only.
  const counts = useMemo(() => ({
    parcels: storeReturns.filter((r) => r.status !== 'processed').length,
    inspection: storeReturns.filter((r) => r.status === 'under_inspection').length,
    processed: storeReturns.filter((r) => r.status === 'processed').length,
    quarantine: storeReturns.filter((r) => r.stockAction === 'quarantine').length,
  }), [storeReturns])

  const rows = list.data ?? []
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [tab, debouncedSearch, reason])

  const parcel = inspectionId ? storeReturns.find((r) => r.id === inspectionId) ?? null : null
  useEffect(() => {
    if (parcel) { setNote(parcel.note ?? ''); setStockAction('quarantine') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId])

  const hasNonSaleable = !!parcel && parcel.items.some((i) => i.decision === 'damaged' || i.decision === 'expired')
  const allDecided = !!parcel && parcel.items.length > 0 && parcel.items.every((i) => !!i.decision)

  const decide = (item: ReturnItemLine, d: QualityDecision) => {
    if (!parcel) return
    returns.decide(parcel.id, item.batchId, d)
    toast.success(`${item.name} marked ${DECISIONS.find((x) => x.d === d)?.label.toLowerCase()}`)
  }
  const complete = () => {
    if (!parcel) return
    // Mock backend always persists stockAction; when everything is saleable we pass
    // write_off so the parcel never leaks into the Quarantined view.
    returns.complete(parcel.id, hasNonSaleable ? stockAction : 'write_off', note.trim() || undefined)
    setInspectionId(null)
  }

  const columns: Column<ReturnParcel>[] = [
    { key: 'id', header: 'Return ID', render: (r) => <span className="font-semibold">{r.id}</span> },
    { key: 'orderId', header: 'Order ID', render: (r) => <span className="font-semibold text-brand-700 dark:text-brand-300">#{r.orderId}</span> },
    { key: 'customer', header: 'Customer', render: (r) => orderById.get(r.orderId)?.customerName ?? '—' },
    { key: 'returnedAt', header: 'Returned On', render: (r) => <span className="whitespace-nowrap text-muted-foreground">{fmtDateTime(r.returnedAt)}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <Badge tone={REASON_TONE[r.reason]}>{REASON_LABEL[r.reason]}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={RETURN_STATUS_KEY[r.status]} /> },
    {
      key: 'action', header: 'Action',
      render: (r) => (
        <Button
          variant="outline" size="sm"
          onClick={(e) => { e.stopPropagation(); setInspectionId(r.id) }}
          aria-label={`${r.status === 'processed' ? 'View' : 'Inspect'} return ${r.id}`}
        >
          {r.status === 'processed' ? <>View <Eye className="h-3.5 w-3.5" /></> : <>Inspect <ChevronRight className="h-3.5 w-3.5" /></>}
        </Button>
      ),
    },
  ]

  const TAB_LABEL: Record<string, string> = {
    parcels: 'Returned Parcels', inspection: 'Under Inspection', processed: 'Processed', quarantine: 'Quarantined',
  }

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
      <PageHeader
        breadcrumb={['Returns & Quality Checks']}
        title="Returns &"
        titleAccent="Quality Checks"
        subtitle="Handle returned orders, inspect product quality and update stock status."
        illustration={<SupportScene />}
        actions={
          <Button onClick={() => setRecordOpen(true)}><Undo2 className="h-4 w-4" /> Record Return</Button>
        }
      />

      <motion.section variants={stagger.item} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pending Returns" value={dash.data?.pendingReturns ?? 0} icon={Undo2} tint="amber" />
        <KpiCard label="Under Inspection" value={dash.data?.underInspection ?? 0} icon={Search} tint="blue" />
        <KpiCard label="Processed Today" value={dash.data?.processedToday ?? 0} icon={CheckCircle2} tint="green" />
        <KpiCard label="In Quarantine" value={dash.data?.inQuarantine ?? 0} icon={PackageX} tint="red" />
      </motion.section>

      <motion.section variants={stagger.item} className="space-y-4">
        <TabPills
          id="returns-tabs"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'parcels', label: 'Returned Parcels', count: counts.parcels },
            { value: 'inspection', label: 'Under Inspection', count: counts.inspection },
            { value: 'processed', label: 'Processed', count: counts.processed },
            { value: 'quarantine', label: 'Quarantined', count: counts.quarantine },
          ]}
        />
        <Card hoverable>
          <CardHeader className="flex-wrap">
            <CardTitle>{TAB_LABEL[tab]}</CardTitle>
            {tab === 'parcels' && (
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Search by Order ID or Return ID…" className="w-64" />
                <Select value={reason} onValueChange={setReason} options={REASON_OPTIONS} className="w-48" />
              </div>
            )}
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              rows={pageRows}
              keyId={(r) => r.id}
              loading={list.isLoading}
              onRowClick={(r) => setInspectionId(r.id)}
              skeletonRows={6}
              empty={
                <EmptyState
                  icon={Undo2}
                  title="No returns here"
                  body={tab === 'parcels' ? 'Returned parcels from failed deliveries will appear in this queue.' : 'Nothing matches this view yet.'}
                />
              }
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              showing={`Showing ${rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, rows.length)} of ${rows.length} returns`}
            />
          </CardContent>
        </Card>
      </motion.section>

      {/* ── Inspection drawer ── */}
      {parcel && (
        <Drawer
          open
          onOpenChange={(v) => { if (!v) setInspectionId(null) }}
          width="lg"
          title={
            <span className="flex flex-wrap items-center gap-2">
              Return Inspection – {parcel.id}
              <StatusPill status={RETURN_STATUS_KEY[parcel.status]} />
            </span>
          }
          subtitle={`${parcel.orderId} · ${orderById.get(parcel.orderId)?.customerName ?? 'Unknown customer'}`}
          footer={
            parcel.status !== 'processed' ? (
              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => returns.saveDraft(parcel.id)}>Save as Draft</Button>
                <Tip tip={allDecided ? undefined : 'Each item needs a decision'}>
                  <Button disabled={!allDecided} onClick={complete}>
                    <Check className="h-4 w-4" /> Complete Processing
                  </Button>
                </Tip>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/70 bg-muted/40 p-4 text-[13px]">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Order</div>
                <div className="mt-0.5 font-semibold text-brand-700 dark:text-brand-300">#{parcel.orderId}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Customer</div>
                <div className="mt-0.5 font-semibold">{orderById.get(parcel.orderId)?.customerName ?? '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Returned On</div>
                <div className="mt-0.5">{fmtDateTime(parcel.returnedAt)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Return Reason</div>
                <div className="mt-0.5"><Badge tone={REASON_TONE[parcel.reason]}>{REASON_LABEL[parcel.reason]}</Badge></div>
              </div>
            </div>

            <Card>
              <CardHeader><CardTitle>Returned Items ({parcel.items.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {parcel.items.map((item) => (
                  <div key={`${item.variantId}-${item.batchId}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3">
                    <ProductTile icon={item.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">{item.name}</div>
                      <div className="text-xs text-muted-foreground">Batch {item.batchId} · Qty {item.qty}</div>
                    </div>
                    <DecisionGroup parcel={parcel} item={item} db={db} onDecide={decide} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {parcel.status !== 'processed' ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-brand-600" /> Quality Decision & Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {hasNonSaleable ? (
                    <Field label="Stock Action for Damaged/Expired items">
                      <Select
                        value={stockAction}
                        onValueChange={(v) => setStockAction(v as 'quarantine' | 'write_off')}
                        options={[
                          { value: 'quarantine', label: 'Move to Quarantine' },
                          { value: 'write_off', label: 'Write off' },
                        ]}
                      />
                    </Field>
                  ) : (
                    <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      No damaged or expired items yet — saleable stock returns to the shelf once processing completes.
                    </p>
                  )}
                  <Field label="Inspection Note (Optional)">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={200}
                      placeholder="Condition observations, pack state, customer remarks…"
                      aria-label="Inspection note"
                    />
                  </Field>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-xl border border-border/70 bg-muted/40 p-4 text-[13px]">
                <div className="font-bold">Processing Outcome</div>
                <p className="mt-1">
                  Stock action:{' '}
                  {parcel.items.every((i) => i.decision === 'saleable')
                    ? 'Returned to saleable stock'
                    : parcel.stockAction === 'quarantine' ? 'Moved to quarantine' : 'Written off'}
                </p>
                {parcel.note && <p className="mt-1 text-muted-foreground">Note: {parcel.note}</p>}
              </div>
            )}
          </div>
        </Drawer>
      )}

      <RecordReturnDialog open={recordOpen} onOpenChange={setRecordOpen} orders={failedOrders} storeId={storeId} />
    </motion.div>
  )
}
