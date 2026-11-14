import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MoreVertical, Download, PauseCircle, PlayCircle, XCircle, Wrench, RefreshCcw,
  MapPinX, KeyRound, ExternalLink, ShoppingCart, Loader, Truck, XCircle as XIcon,
  AlertTriangle, ListFilter,
} from 'lucide-react'
import { useStagger, useDebouncedValue } from '@/hooks/misc'
import { useOrders, useStoreOptions, useRiders, useStores, useDashboard } from '@/hooks/queries'
import { useOrderActions } from '@/hooks/mutations'
import { useDB } from '@/store/db'
import { orderActionEligibility } from '@/data/selectors'
import { listOrders } from '@/data/api'
import { downloadCsv } from '@/services/exports'
import { PageHeader, TabPills, SearchInput, RangeToggle, StatusPill, EmptyState } from '@/components/shared/misc'
import { Select, Field } from '@/components/ui/form'
import { Button, Card, Badge, Textarea } from '@/components/ui/base'
import {
  Drawer, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownItem,
  DropdownSeparator, Tooltip, Dialog, DialogContent,
} from '@/components/ui/overlays'
import { DataTable, Pagination } from '@/components/shared/DataTable'
import { KpiCard } from '@/components/shared/KpiCard'
import { InitialAvatar } from '@/illustrations/avatars'
import { LazyMap } from '@/components/shared/map/LazyMap'
import { ScooterScene } from '@/illustrations/scenes'
import type { Order } from '@/types'
import { fmtDateTime, fmtINR } from '@/lib/utils'

/* ── Local helpers ─────────────────────────────────────────── */
const PAYMENT_LABEL: Record<string, string> = { online_upi: 'UPI', online_card: 'Card', online_netbanking: 'NB', wallet: 'Wallet', cod: 'COD' }
const ATTENTION_LABEL: Record<string, string> = { on_hold: 'On hold', wrong_address: 'Wrong address', code_locked: 'Code locked', payment_failed: 'Payment failed' }
const STORE_TINTS = ['#2E7D1A', '#5DAE2B', '#B05560', '#3B82F6', '#F59E0B', '#8B5CF6', '#14B8A6', '#EF4444']

type OrderAction = 'hold' | 'release' | 'cancel' | 'correction' | 'reassign' | 'resolveAddress' | 'resetCode'

function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Pseudo delivery route from a store coordinate toward a hashed destination. */
function pseudoRoute(origin: [number, number], orderId: string): [number, number][] {
  const h = hashStr(orderId)
  const dLat = origin[0] + (((h % 100) / 100) - 0.5) * 0.05
  const dLng = origin[1] + ((((h >> 7) % 100) / 100) - 0.5) * 0.05
  const points: [number, number][] = []
  const steps = 28
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const lat = origin[0] + (dLat - origin[0]) * t + Math.sin(t * Math.PI * 3) * 0.0035
    const lng = origin[1] + (dLng - origin[1]) * t + Math.cos(t * Math.PI * 2) * 0.0035
    points.push([+lat.toFixed(5), +lng.toFixed(5)])
  }
  return points
}

/* ── Order actions dropdown (eligibility + reason tooltips) ── */
export function OrderActionsMenu({ order, onAction }: { order: Order; onAction: (a: OrderAction) => void }) {
  const db = useDB((s) => s.db)
  const el = orderActionEligibility(db, order)
  const item = (enabled: boolean, reason: string | undefined, label: React.ReactNode, action: OrderAction) => (
    <Tooltip content={enabled ? label : (reason ?? 'Not available for this order')} side="left">
      <span className="block w-full">
        <DropdownItem disabled={!enabled} onSelect={() => onAction(action)}>{label}</DropdownItem>
      </span>
    </Tooltip>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span onClick={(e) => e.stopPropagation()}>
          <Button size="iconSm" variant="ghost" aria-label={`Actions for order ${order.id}`}><MoreVertical className="h-4 w-4" /></Button>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {item(el.hold, el.holdReason, <><PauseCircle className="h-3.5 w-3.5" /> Put on hold</>, 'hold')}
        {item(el.release, el.releaseReason, <><PlayCircle className="h-3.5 w-3.5" /> Release hold</>, 'release')}
        <DropdownSeparator />
        {item(el.cancel, el.cancelReason, <><XCircle className="h-3.5 w-3.5" /> Cancel order</>, 'cancel')}
        {item(true, undefined, <><Wrench className="h-3.5 w-3.5" /> Request correction</>, 'correction')}
        {item(el.reassign, el.reassignReason, <><RefreshCcw className="h-3.5 w-3.5" /> Reassign rider</>, 'reassign')}
        <DropdownSeparator />
        {item(el.resolveAddress, el.resolveAddressReason, <><MapPinX className="h-3.5 w-3.5" /> Resolve wrong-address</>, 'resolveAddress')}
        {item(el.resetCode, el.resetCodeReason, <><KeyRound className="h-3.5 w-3.5" /> Reset code lock</>, 'resetCode')}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ── Action dialogs (hold / cancel / correction / reassign) ── */
function OrderActionDialogs({ open, onClose }: { open: { action: OrderAction; order: Order } | null; onClose: () => void }) {
  const actions = useOrderActions()
  const ridersQ = useRiders()
  const [reason, setReason] = useState('')
  const [kind, setKind] = useState('address')
  const [riderId, setRiderId] = useState('')

  useEffect(() => {
    setReason('')
    setKind('address')
    setRiderId('')
  }, [open?.order.id, open?.action])

  if (!open) return null
  const { action, order } = open
  const reasonInvalid = reason.trim().length < 5
  const storeRiders = ridersQ.data?.filter((r) => r.storeId === order.storeId && r.status === 'active') ?? []

  const close = () => onClose()

  if (action === 'release') return null // release fires directly from the menu
  if (action === 'resolveAddress') return null
  if (action === 'resetCode') return null

  return (
    <Dialog open onOpenChange={(v) => { if (!v) close() }}>
      <DialogContent
        title={
          action === 'hold' ? `Put #${order.id} on hold`
          : action === 'cancel' ? `Cancel #${order.id}`
          : action === 'correction' ? `Request correction for #${order.id}`
          : `Reassign rider for #${order.id}`
        }
        description={
          action === 'hold' ? 'Held orders pause picking and keep the delivery code locked.'
          : action === 'cancel' ? 'Cancelling is final — the customer is notified and refunds flow per policy.'
          : action === 'correction' ? 'The store is notified to correct the order before dispatch.'
          : 'Pick another active rider at the same store.'
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (action === 'hold' && !reasonInvalid) { actions.hold(order.id, reason.trim()); close() }
            if (action === 'cancel' && !reasonInvalid) { actions.cancel(order.id, reason.trim()); close() }
            if (action === 'correction' && !reasonInvalid) { actions.requestCorrection(order.id, kind, reason.trim()); close() }
            if (action === 'reassign' && riderId) {
              const r = storeRiders.find((x) => x.id === riderId)
              if (r) actions.reassign(order.id, r.id, r.name)
              close()
            }
          }}
        >
          {action === 'correction' && (
            <Field label="What needs correcting?" required>
              <Select value={kind} onValueChange={setKind} options={[
                { value: 'address', label: 'Delivery address' },
                { value: 'items', label: 'Items / quantities' },
                { value: 'slot', label: 'Delivery slot' },
              ]} />
            </Field>
          )}

          {action === 'reassign' ? (
            <Field label="New rider" required>
              <Select value={riderId} onValueChange={setRiderId} placeholder="Pick rider…" options={storeRiders.map((r) => ({ value: r.id, label: r.name }))} />
              {storeRiders.length === 0 && <p className="mt-1 text-xs text-destructive">No active riders at this store</p>}
            </Field>
          ) : (
            <Field label="Reason" required error={reason && reasonInvalid ? 'Reason must be at least 5 characters' : undefined} hint="Shown to the store team and stored on the order">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'cancel' ? 'e.g. Customer double-ordered' : 'e.g. Waiting for payment retry confirmation'} />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={close}>Cancel</Button>
            <Button
              type="submit"
              variant={action === 'cancel' ? 'destructive' : 'primary'}
              size="md"
              disabled={action === 'reassign' ? !riderId : reasonInvalid}
            >
              {action === 'hold' ? 'Put on hold' : action === 'cancel' ? 'Cancel order' : action === 'correction' ? 'Send request' : 'Reassign'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Row summary drawer ────────────────────────────────────── */
function OrderDrawer({ order, storeName, riderName, onClose }: { order: Order; storeName: string; riderName: string | null; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <Drawer open onOpenChange={(v) => { if (!v) onClose() }} width="md" title={`Order #${order.id}`} subtitle={fmtDateTime(order.placedAt)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={order.status} dot />
          <Badge tone={order.paymentMethod === 'cod' ? 'amber' : 'blue'}>{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}</Badge>
          {order.requiresAttention && order.attentionReason && <Badge tone="amber"><AlertTriangle className="h-3 w-3" /> {ATTENTION_LABEL[order.attentionReason]}</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl border border-border/70 bg-muted/30 p-4 text-[13px]">
          <div className="flex gap-2"><dt className="font-semibold text-muted-foreground">Customer:</dt><dd className="min-w-0 flex-1 truncate font-medium">{order.customerName}</dd></div>
          <div className="flex gap-2"><dt className="font-semibold text-muted-foreground">Amount:</dt><dd className="font-bold">{fmtINR(order.amount)}</dd></div>
          <div className="flex gap-2"><dt className="font-semibold text-muted-foreground">Store:</dt><dd className="min-w-0 flex-1 truncate font-medium">{storeName}</dd></div>
          <div className="flex gap-2"><dt className="font-semibold text-muted-foreground">Rider:</dt><dd className="font-medium">{riderName ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="font-semibold text-muted-foreground">Items:</dt><dd className="font-medium">{order.items.length}</dd></div>
          <div className="flex gap-2"><dt className="font-semibold text-muted-foreground">Code:</dt><dd className="font-mono font-medium">{order.deliveryCode}</dd></div>
        </dl>
        <Button variant="primary" size="md" className="w-full" onClick={() => { onClose(); navigate(`/orders/${order.id}`) }}>
          <ExternalLink className="h-4 w-4" /> View full order
        </Button>
      </div>
    </Drawer>
  )
}

/* ── Live fleet map ────────────────────────────────────────── */
function LiveFleetMap() {
  const storesQ = useStores()
  const ridersQ = useRiders()
  const ofdQ = useOrders({ status: 'out_for_delivery', pageSize: 100000 })
  const [liveIdx, setLiveIdx] = useState(0)

  const stores = storesQ.data ?? []
  const riders = ridersQ.data ?? []
  const ofdRows = (ofdQ.data?.rows ?? []).map((r) => r.order)

  const tracked = ofdRows.find((o) => o.items.length > 0) ?? ofdRows[0] ?? null
  const trackedStore = tracked ? stores.find((s) => s.id === tracked.storeId) : undefined
  const route = useMemo(
    () => (tracked && trackedStore ? pseudoRoute(trackedStore.coords, tracked.id) : []),
    [tracked?.id, trackedStore?.coords[0], trackedStore?.coords[1]],
  )

  useEffect(() => {
    if (route.length === 0) return
    const t = setInterval(() => setLiveIdx((i) => (i + 1) % route.length), 900)
    return () => clearInterval(t)
  }, [route.length])

  const storeColor = (storeId: string) => {
    const idx = stores.findIndex((s) => s.id === storeId)
    return STORE_TINTS[(idx < 0 ? 0 : idx) % STORE_TINTS.length]!
  }

  const riderMarkers = riders.map((r, i) => {
    const store = stores.find((s) => s.id === r.storeId)
    const base = store?.coords ?? [19.076, 72.8777]
    // spread riders around their store so markers don't stack
    const spread: [number, number] = [base[0] + Math.sin(i * 1.3) * 0.012, base[1] + Math.cos(i * 0.9) * 0.012]
    return { coords: spread, color: storeColor(r.storeId), label: `${r.name} · ${store?.name ?? ''}` }
  })

  const otherDestinations = ofdRows.filter((o) => o.id !== tracked?.id).map((o) => {
    const store = stores.find((s) => s.id === o.storeId)
    const routePts = store ? pseudoRoute(store.coords, o.id) : []
    const last = routePts[routePts.length - 1]
    return { coords: last ?? store?.coords ?? [19.076, 72.8777] as [number, number], color: '#B05560', label: `#${o.id} · out for delivery` }
  })

  return (
    <Card className="overflow-hidden p-0">
      <div className="h-[480px] w-full">
        <LazyMap
          center={trackedStore?.coords ?? [19.076, 72.8777]}
          zoom={12}
          showZoom
          scrollWheelZoom
          markers={[...riderMarkers, ...otherDestinations]}
          origin={route[0] ?? null}
          destination={route[route.length - 1] ?? null}
          polyline={route.length > 1 ? route : undefined}
          liveMarker={route.length > 0 ? (route[liveIdx] ?? null) : null}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> Riders by store</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#B05560]" /> Out-for-delivery destinations</span>
        <span>{ofdRows.length} orders out for delivery · {riders.length} riders on the roster</span>
      </div>
    </Card>
  )
}

/* ── Page ──────────────────────────────────────────────────── */
export function Orders() {
  const container = useStagger()
  const [view, setView] = useState<'list' | 'map'>('list')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [storeId, setStoreId] = useState('all')
  const [status, setStatus] = useState('all')
  const [range, setRange] = useState('7d')
  const [page, setPage] = useState(1)

  const ordersQ = useOrders({ search: debouncedSearch || undefined, storeId, status, range: range as 'today' | '7d' | '30d' | '90d', page, pageSize: 8 })
  const dashQ = useDashboard(range as 'today' | '7d' | '30d' | '90d', storeId)
  const storeOptions = useStoreOptions()

  const counts = ordersQ.data?.counts ?? {}
  const total = ordersQ.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 8))

  useEffect(() => { setPage(1) }, [debouncedSearch, storeId, status, range])

  const [dialog, setDialog] = useState<{ action: OrderAction; order: Order } | null>(null)
  const [drawerRow, setDrawerRow] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const rowActions = useOrderActions()

  const drawerRowData = ordersQ.data?.rows.find((r) => r.order.id === drawerRow)

  const doExport = async () => {
    setExporting(true)
    try {
      const data = await listOrders({ search: debouncedSearch || undefined, storeId, status, range: range as 'today' | '7d' | '30d' | '90d', pageSize: 100000 })
      const rows = data.rows.map((r) => ({
        Order: `#${r.order.id}`,
        Placed: fmtDateTime(r.order.placedAt),
        Customer: r.order.customerName,
        Store: r.storeName,
        Amount: r.order.amount,
        Payment: PAYMENT_LABEL[r.order.paymentMethod] ?? r.order.paymentMethod,
        Status: r.order.status,
        Attention: r.order.requiresAttention ? (r.order.attentionReason ?? 'yes') : '',
        Rider: r.riderName ?? '',
        DeliveryCode: r.order.deliveryCode,
      }))
      await downloadCsv(rows, `orders-${status}-${range}.csv`)
    } finally {
      setExporting(false)
    }
  }

  const statusTabs = [
    { value: 'all', label: 'All', count: counts['all'] ?? 0 },
    { value: 'placed', label: 'Placed', count: counts['placed'] ?? 0 },
    { value: 'confirmed', label: 'Confirmed', count: counts['confirmed'] ?? 0 },
    { value: 'picking', label: 'Picking', count: counts['picking'] ?? 0 },
    { value: 'ready', label: 'Ready', count: counts['ready'] ?? 0 },
    { value: 'out_for_delivery', label: 'Out for delivery', count: counts['out_for_delivery'] ?? 0 },
    { value: 'delivered', label: 'Delivered', count: counts['delivered'] ?? 0 },
    { value: 'on_hold', label: 'On hold', count: counts['on_hold'] ?? 0 },
    { value: 'cancelled', label: 'Cancelled', count: counts['cancelled'] ?? 0 },
  ]

  const inProgress = (counts['confirmed'] ?? 0) + (counts['picking'] ?? 0) + (counts['ready'] ?? 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orders &"
        titleAccent="delivery"
        subtitle="Every order across the network with full dispatch controls and a live fleet view."
        illustration={<ScooterScene />}
        breadcrumb={['Orders']}
        actions={(
          <TabPills
            id="orders-view"
            value={view}
            onChange={(v) => setView(v as 'list' | 'map')}
            tabs={[{ value: 'list', label: 'Order list' }, { value: 'map', label: 'Live map' }]}
          />
        )}
      />

      <motion.div variants={container.container} initial="hidden" animate="show" className="space-y-4">
        {view === 'list' ? (
          <>
            {/* KPI row */}
            <motion.section variants={container.item} className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              <KpiCard label="Placed" value={counts['placed'] ?? 0} icon={ShoppingCart} tint="violet" />
              <KpiCard label="In progress" value={inProgress} icon={Loader} tint="blue" />
              <KpiCard label="Out for delivery" value={counts['out_for_delivery'] ?? 0} icon={Truck} tint="green" />
              <KpiCard label="Cancelled" value={counts['cancelled'] ?? 0} icon={XIcon} tint="red" />
              <KpiCard label="Requiring attention" value={dashQ.data?.ordersRequiringAttention ?? 0} icon={AlertTriangle} tint="amber" highlight={(dashQ.data?.ordersRequiringAttention ?? 0) > 0} />
            </motion.section>

            {/* toolbar */}
            <motion.section variants={container.item} className="flex flex-wrap items-center gap-2.5">
              <SearchInput value={search} onChange={setSearch} placeholder="Search id, customer or delivery code…" className="min-w-[220px] flex-1" />
              <div className="w-44">
                <Select value={storeId} onValueChange={setStoreId} options={[{ value: 'all', label: 'All stores' }, ...(storeOptions.data ?? [])]} />
              </div>
              <RangeToggle value={range} onChange={setRange} options={['today', '7d', '30d', '90d']} id="orders-range" />
              <Button variant="secondary" size="md" disabled={exporting} onClick={() => void doExport()}>
                <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
              </Button>
            </motion.section>

            <motion.section variants={container.item}>
              <TabPills id="orders-status" value={status} onChange={setStatus} tabs={statusTabs} className="pb-1" />
            </motion.section>

            {/* table */}
            <motion.section variants={container.item}>
              <Card className="overflow-hidden">
                <DataTable
                  keyId={(r) => r.order.id}
                  rows={ordersQ.data?.rows ?? []}
                  loading={ordersQ.isLoading}
                  onRowClick={(r) => setDrawerRow(r.order.id)}
                  empty={<EmptyState icon={ListFilter} title="No orders match" body="Adjust the search, store, status or date range." />}
                  columns={[
                    {
                      key: 'id', header: 'Order',
                      render: (r) => (
                        <span onClick={(e) => e.stopPropagation()}>
                          <Link to={`/orders/${r.order.id}`} className="font-mono text-[13px] font-bold text-brand-700 hover:underline dark:text-brand-300">#{r.order.id}</Link>
                        </span>
                      ),
                    },
                    {
                      key: 'customer', header: 'Customer',
                      render: (r) => (
                        <div className="flex items-center gap-2.5">
                          <InitialAvatar name={r.order.customerName} size={30} />
                          <span className="truncate font-medium">{r.order.customerName}</span>
                        </div>
                      ),
                    },
                    { key: 'store', header: 'Store', render: (r) => <span className="text-[13px]">{r.storeName}</span> },
                    { key: 'amount', header: 'Amount', render: (r) => <span className="font-bold tabular">{fmtINR(r.order.amount)}</span> },
                    {
                      key: 'payment', header: 'Payment',
                      render: (r) => <Badge tone={r.order.paymentMethod === 'cod' ? 'amber' : 'blue'}>{PAYMENT_LABEL[r.order.paymentMethod] ?? r.order.paymentMethod}</Badge>,
                    },
                    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.order.status} dot /> },
                    {
                      key: 'attention', header: 'Attention',
                      render: (r) => r.order.requiresAttention && r.order.attentionReason
                        ? <Badge tone="amber"><AlertTriangle className="h-3 w-3" /> {ATTENTION_LABEL[r.order.attentionReason]}</Badge>
                        : <span className="text-muted-foreground">—</span>,
                    },
                    { key: 'rider', header: 'Rider', render: (r) => r.riderName ?? '—' },
                    {
                      key: 'actions', header: '', align: 'right' as const,
                      render: (r) => (
                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <OrderActionsMenu
                            order={r.order}
                            onAction={(a) => {
                              // immediate actions run directly; dialog actions open the shared dialogs
                              if (a === 'release') rowActions.release(r.order.id)
                              else if (a === 'resolveAddress') rowActions.resolveAddress(r.order.id)
                              else if (a === 'resetCode') rowActions.resetCode(r.order.id)
                              else setDialog({ action: a, order: r.order })
                            }}
                          />
                        </div>
                      ),
                    },
                  ]}
                />
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={setPage}
                  showing={`Showing ${ordersQ.data?.rows.length ?? 0} of ${total.toLocaleString('en-IN')} orders`}
                />
              </Card>
            </motion.section>
          </>
        ) : (
          <motion.section variants={container.item}>
            <LiveFleetMap />
          </motion.section>
        )}
      </motion.div>

      {/* row drawer + action dialogs */}
      {drawerRowData && (
        <OrderDrawer
          order={drawerRowData.order}
          storeName={drawerRowData.storeName}
          riderName={drawerRowData.riderName}
          onClose={() => setDrawerRow(null)}
        />
      )}
      <OrderActionDialogs open={dialog} onClose={() => setDialog(null)} />
    </div>
  )
}

export default Orders

// re-exported for the detail page's shared action dialog wiring
export { OrderActionDialogs }
export type { OrderAction }
