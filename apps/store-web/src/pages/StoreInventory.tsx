// §3 Inventory — stock table w/ bins + CSV export, receive stock, low stock,
// expiring, counts & adjustments (counts create admin approvals for large/unusual deltas).
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, ClipboardCheck, Download,
  Layers, MoreVertical, PackageCheck, PackagePlus, Plus, Repeat, Truck,
} from 'lucide-react'
import { useStagger, useDebouncedValue } from '@dairydirect/shared/hooks/misc'
import { useStoreAuth } from '@/login/authStore'
import {
  useActiveStoreId, useStoreStock, useStoreAdjustments, useStoreCounts, useBinLocations,
} from '@/api/storeQueries'
import { useStoreInventoryActions } from '@/api/storeMutations'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { DEMO_NOW } from '@dairydirect/shared/mock-db/seed'
import { downloadCsv } from '@dairydirect/shared/services/exports'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton, Badge } from '@dairydirect/shared/ui/base'
import { Dialog, DialogContent, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownItem } from '@dairydirect/shared/ui/overlays'
import { Select, Field } from '@dairydirect/shared/ui/form'
import { PageHeader, TabPills, SearchInput, StatusPill, EmptyState } from '@dairydirect/shared/ui/misc'
import { KpiCard } from '@dairydirect/shared/ui/KpiCard'
import { DataTable, Pagination, type Column } from '@dairydirect/shared/ui/DataTable'
import { ProductTile } from '@dairydirect/shared/assets/productIcons'
import { InventoryScene } from '@dairydirect/shared/assets/scenes'
import { cn, fmtDate, fmtDateTime } from '@dairydirect/shared/lib/utils'
import { toast } from '@dairydirect/shared/lib/toast'
import type { ProductIcon, StockAdjustment } from '@dairydirect/shared/types'

type StockRow = Awaited<ReturnType<typeof import('@/api/storeApi').listStoreStock>>[number]

const TABS = [
  { value: 'stock', label: 'Stock' },
  { value: 'receive', label: 'Receive stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'adjustments', label: 'Counts & adjustments' },
]
const TAB_VALUES = TABS.map((t) => t.value)

const ADJUSTMENT_REASONS = ['Damaged write-off', 'Expired write-off', 'Unexplained variance', 'Cycle correction', 'Found stock']
const UNAVAILABLE_FREE = 5 // min reason length

function iconFor(productName: string): ProductIcon {
  const n = productName.toLowerCase()
  if (n.includes('milk') && !n.includes('flavored')) return 'milk'
  if (n.includes('paneer')) return 'paneer'
  if (n.includes('ghee')) return 'ghee'
  if (n.includes('curd')) return 'curd'
  if (n.includes('butter')) return 'butter'
  if (n.includes('lassi')) return 'lassi'
  if (n.includes('chaas') || n.includes('buttermilk')) return 'buttermilk'
  if (n.includes('cream')) return 'cream'
  if (n.includes('cheese')) return 'cheese'
  if (n.includes('khoya')) return 'khoya'
  if (n.includes('tofu')) return 'paneer'
  return 'flavored_milk'
}

function daysLeft(expiryDate: string) {
  return Math.ceil((new Date(expiryDate).getTime() - DEMO_NOW.getTime()) / 86400000)
}

/* ── Record adjustment dialog (shared by stock-row ⋮ and adjustments tab) ── */
function AdjustDialog({ open, onOpenChange, options, defaultVariantId, onConfirm }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  options: Array<{ value: string; label: string }>
  defaultVariantId?: string
  onConfirm: (variantId: string, delta: number, reason: string) => void
}) {
  const [variantId, setVariantId] = useState(defaultVariantId ?? '')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) { setVariantId(defaultVariantId ?? ''); setDelta(''); setReason('') }
  }, [open, defaultVariantId])

  const numDelta = Number(delta)
  const needsApproval = Number.isFinite(numDelta) && (Math.abs(numDelta) >= 20 || reason.toLowerCase().includes('unexplained'))
  const valid = !!variantId && delta !== '' && Number.isFinite(numDelta) && numDelta !== 0 && reason.trim().length >= UNAVAILABLE_FREE

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Record adjustment"
        description="Correct stock for a variant. Signed delta: negative = write-off, positive = found stock."
      >
        <div className="space-y-4">
          <Field label="Variant" required>
            <Select value={variantId} onValueChange={setVariantId} placeholder="Select variant…" options={options} />
          </Field>
          <Field label="Delta (signed)" required hint="e.g. −4 for damaged units, +6 for found stock">
            <Input
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="0"
              aria-label="Adjustment delta"
            />
          </Field>
          <Field label="Reason" required error={reason && reason.trim().length < UNAVAILABLE_FREE ? 'Reason must be at least 5 characters' : undefined}>
            <Select value={reason} onValueChange={setReason} placeholder="Select reason…" options={ADJUSTMENT_REASONS.map((r) => ({ value: r, label: r }))} />
          </Field>
          <p className={cn(
            'rounded-lg px-3 py-2 text-[11.5px] font-medium',
            needsApproval ? 'bg-warning-soft text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground',
          )}>
            Large (≥ 20 units) or unusual adjustments are sent to the admin for approval.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              size="md"
              disabled={!valid}
              onClick={() => { onConfirm(variantId, numDelta, reason.trim()); onOpenChange(false) }}
            >
              <ClipboardCheck className="h-4 w-4" /> Record adjustment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function StoreInventory() {
  const container = useStagger()
  const storeId = useActiveStoreId()
  const user = useStoreAuth((s) => s.user)
  const managerName = user?.name ?? 'Store Manager'
  const db = useDB((s) => s.db)
  const invActions = useStoreInventoryActions()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── tab (deep-linkable via ?tab=) ──
  const [tab, setTabState] = useState(() => {
    const t = searchParams.get('tab')
    return t && TAB_VALUES.includes(t) ? t : 'stock'
  })
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && TAB_VALUES.includes(t)) setTabState((prev) => (prev === t ? prev : t))
  }, [searchParams])
  const setTab = (t: string) => {
    setTabState(t)
    const sp = new URLSearchParams(searchParams)
    if (t === 'stock') sp.delete('tab')
    else sp.set('tab', t)
    setSearchParams(sp, { replace: true })
  }

  // ── data ──
  const stockQ = useStoreStock(storeId)
  const adjQ = useStoreAdjustments(storeId)
  const countsQ = useStoreCounts(storeId)
  const binsQ = useBinLocations(storeId)
  const allStock = stockQ.data ?? []
  const adjustments = adjQ.data ?? []
  const bins = binsQ.data ?? []

  const [search, setSearch] = useState('')
  const debSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => { setPage(1) }, [tab, debSearch])

  // ── KPI inputs ──
  const lowRows = useMemo(() => allStock.filter((r) => r.status === 'low_stock'), [allStock])
  const expiringRows = useMemo(
    () => allStock.filter((r) => r.status === 'expiring').sort((a, b) => a.batch.expiryDate.localeCompare(b.batch.expiryDate)),
    [allStock],
  )
  const pendingAdjCount = adjustments.filter((a) => a.approvalStatus === 'pending').length

  // stock table rows (search is client-side over the single store-scoped query)
  const stockRows = useMemo(() => {
    const q = debSearch.trim().toLowerCase()
    if (!q) return allStock
    return allStock.filter((r) => r.variantName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.batch.id.toLowerCase().includes(q))
  }, [allStock, debSearch])

  // unique carried variants (receive form + adjustment dialog options)
  const variantOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ value: string; label: string }> = []
    for (const r of allStock) {
      if (seen.has(r.batch.variantId)) continue
      seen.add(r.batch.variantId)
      out.push({ value: r.batch.variantId, label: r.variantName })
    }
    return out
  }, [allStock])

  const variantNameOf = (vid: string) => variantOptions.find((o) => o.value === vid)?.label ?? vid

  // ── set bin dialog ──
  const [binRow, setBinRow] = useState<StockRow | null>(null)
  const [binChoice, setBinChoice] = useState('')

  // ── adjustment dialog ──
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustVariant, setAdjustVariant] = useState<string | undefined>(undefined)

  // ── receive form ──
  const [rcProduct, setRcProduct] = useState('')
  const [rcBatchNo, setRcBatchNo] = useState('')
  const [rcExpiry, setRcExpiry] = useState('')
  const [rcQty, setRcQty] = useState('')
  const [rcBin, setRcBin] = useState('')

  const receiveValid = !!rcProduct && rcBatchNo.trim().length > 0 && !!rcExpiry && Number(rcQty) > 0 && !!rcBin

  // ── stock count ──
  const activeCount = (countsQ.data ?? []).find((c) => c.status === 'open')
  const [countInputs, setCountInputs] = useState<Record<string, string>>({})
  useEffect(() => {
    if (activeCount) {
      const init: Record<string, string> = {}
      for (const l of activeCount.lines) init[l.variantId] = l.counted === null ? '' : String(l.counted)
      setCountInputs(init)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCount?.id])

  const commitCountLine = (variantId: string) => {
    if (!activeCount) return
    const raw = countInputs[variantId]?.trim() ?? ''
    const n = Number(raw)
    if (raw === '' || Number.isNaN(n) || n < 0) return
    const line = activeCount.lines.find((l) => l.variantId === variantId)
    if (line && line.counted === n) return
    invActions.updateCountLine(activeCount.id, variantId, n)
  }

  const startStockCount = () => {
    if (!storeId || !allStock.length) return
    const picked = new Map<string, string>()
    for (const r of allStock) {
      if (!picked.has(r.batch.variantId) && picked.size < 5) picked.set(r.batch.variantId, r.variantName)
    }
    const lines = [...picked.entries()].map(([vid, name]) => ({
      variantId: vid,
      name,
      expected: allStock.filter((x) => x.batch.variantId === vid).reduce((a, x) => a + x.batch.qty, 0),
      counted: null,
    }))
    invActions.startCount({ id: `SC-${String(Date.now()).slice(-4)}`, storeId, startedAt: DEMO_NOW.toISOString(), status: 'open', lines })
  }

  const completeStockCount = () => {
    if (!activeCount) return
    for (const l of activeCount.lines) commitCountLine(l.variantId)
    invActions.completeCount(activeCount.id)
  }

  const submitAdjustment = (variantId: string, delta: number, reason: string) => {
    if (!storeId) return
    const needsApproval = Math.abs(delta) >= 20 || reason.toLowerCase().includes('unexplained')
    invActions.createAdjustment({
      id: `ADJ-${String(Date.now()).slice(-6)}`,
      storeId, variantId, delta, reason,
      by: managerName, at: DEMO_NOW.toISOString(),
      approvalStatus: needsApproval ? 'pending' : 'approved',
    })
  }

  const exportCsv = () => {
    void downloadCsv(
      allStock.map((r) => ({
        Product: r.variantName, SKU: r.sku, Batch: r.batch.id, Expiry: r.batch.expiryDate,
        Bin: r.batch.binLocation, 'Qty On Hand': r.batch.qty, Status: r.status,
      })),
      `inventory-stock-${DEMO_NOW.toISOString().slice(0, 10)}.csv`,
    )
    toast.success('Stock exported as CSV')
  }

  /* ── shared table column builders ── */
  const productCol = (key = 'product'): Column<StockRow> => ({
    key,
    header: 'Product',
    render: (r) => {
      const v = db.variants.find((x) => x.id === r.batch.variantId)
      const product = v ? db.products.find((p) => p.id === v.productId) : undefined
      const category = product ? db.categories.find((c) => c.id === product.categoryId)?.name : undefined
      return (
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/70 ring-1 ring-border/60">
            <ProductTile icon={iconFor(product?.name ?? r.variantName)} size={26} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-bold">{r.variantName}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">{category ?? '—'}</div>
          </div>
        </div>
      )
    },
  })
  const skuCol: Column<StockRow> = { key: 'sku', header: 'SKU', render: (r) => <span className="font-medium tabular text-muted-foreground">{r.sku}</span> }
  const batchCol: Column<StockRow> = { key: 'batch', header: 'Batch', render: (r) => <span className="tabular">{r.batch.id}</span> }
  const expiryCol: Column<StockRow> = { key: 'expiry', header: 'Expiry', render: (r) => <span className="tabular">{fmtDate(r.batch.expiryDate)}</span> }
  const binCol = (onSetBin: (r: StockRow) => void): Column<StockRow> => ({
    key: 'bin', header: 'Location / Bin',
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-bold tabular">{r.batch.binLocation || '—'}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onSetBin(r) }}
          className="text-[11px] font-bold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
          aria-label={`Set bin for ${r.variantName}`}
        >
          Set bin
        </button>
      </span>
    ),
  })
  const qtyCol: Column<StockRow> = { key: 'qty', header: 'Qty On Hand', align: 'right', render: (r) => <span className="font-bold tabular">{r.batch.qty}</span> }
  const statusCol = (extra?: (r: StockRow) => React.ReactNode): Column<StockRow> => ({
    key: 'status', header: 'Status',
    render: (r) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={r.status} />
        {extra?.(r)}
      </span>
    ),
  })
  const actionsCol = (onSetBin: (r: StockRow) => void, onAdjust: (r: StockRow) => void): Column<StockRow> => ({
    key: 'actions', header: 'Actions', align: 'right',
    render: (r) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label={`Actions for ${r.variantName}`} onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownItem onClick={() => onSetBin(r)}><Layers className="h-3.5 w-3.5" /> Set bin</DropdownItem>
          <DropdownItem onClick={() => onAdjust(r)}><ClipboardCheck className="h-3.5 w-3.5" /> Adjust stock</DropdownItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  })

  const openSetBin = (r: StockRow) => { setBinRow(r); setBinChoice(r.batch.binLocation || '') }
  const openAdjust = (r: StockRow) => { setAdjustVariant(r.batch.variantId); setAdjustOpen(true) }

  const paginate = (rows: StockRow[], size: number) => rows.slice((page - 1) * size, page * size)
  const showing = (rows: number, size: number) =>
    rows ? `Showing ${(page - 1) * size + 1} – ${Math.min(page * size, rows)} of ${rows} items` : undefined

  return (
    <motion.div variants={container.container} initial="hidden" animate="show" className="space-y-5">
      <PageHeader
        title="Inventory"
        subtitle="Manage store stock, receive items, track expiry and record adjustments."
        illustration={<InventoryScene />}
        breadcrumb={['Inventory']}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Stock (SKUs)" value={stockQ.isLoading ? 0 : allStock.length} icon={Boxes} tint="green" highlight />
        <KpiCard label="Low Stock Items" value={stockQ.isLoading ? 0 : lowRows.length} icon={Layers} tint="amber" />
        <KpiCard label="Expiring Items" value={stockQ.isLoading ? 0 : expiringRows.length} icon={AlertTriangle} tint="red" />
        <KpiCard label="Adjustment Requests" value={adjQ.isLoading ? 0 : pendingAdjCount} icon={Repeat} tint="violet" />
      </div>

      <motion.div variants={container.item}>
        <Card>
          <div className="border-b border-border/70 px-5 pb-1 pt-3">
            <TabPills id="inventory-tabs" value={tab} onChange={setTab} tabs={TABS} />
          </div>

          {/* ───────────────── STOCK ───────────────── */}
          {tab === 'stock' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <CardTitle className="text-[15px]">Current Stock ({stockRows.length})</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <SearchInput value={search} onChange={setSearch} placeholder="Search product, SKU or batch…" className="w-56" />
                  <Button variant="secondary" size="md" onClick={exportCsv} aria-label="Export stock as CSV">
                    <Download className="h-4 w-4" /> Export CSV
                  </Button>
                  <Button size="md" onClick={() => setTab('receive')}>
                    <Plus className="h-4 w-4" /> Add Stock
                  </Button>
                </div>
              </div>
              <DataTable<StockRow>
                columns={[
                  productCol(),
                  skuCol,
                  batchCol,
                  expiryCol,
                  binCol(openSetBin),
                  qtyCol,
                  statusCol(),
                  actionsCol(openSetBin, openAdjust),
                ]}
                rows={paginate(stockRows, 10)}
                keyId={(r) => r.batch.id}
                loading={stockQ.isLoading}
                selectable
                selected={selected}
                onSelectedChange={setSelected}
                skeletonRows={8}
                empty={<EmptyState icon={Boxes} title="No stock found" body="Try a different search, or receive stock to fill the shelves." />}
              />
              <Pagination page={page} totalPages={Math.max(1, Math.ceil(stockRows.length / 10))} onChange={setPage} showing={showing(stockRows.length, 10)} />
            </>
          )}

          {/* ───────────────── RECEIVE ───────────────── */}
          {tab === 'receive' && (
            <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
              <Card hoverable className="border-border/70 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-brand-700 dark:text-brand-300"><Truck className="h-4 w-4" /></span>
                    Record Incoming Stock
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Product" required>
                    <Select
                      value={rcProduct}
                      onValueChange={setRcProduct}
                      placeholder="Select product…"
                      options={variantOptions}
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Batch No." required>
                      <Input value={rcBatchNo} onChange={(e) => setRcBatchNo(e.target.value)} placeholder="e.g., ML-2408" aria-label="Batch number" />
                    </Field>
                    <Field label="Expiry Date" required>
                      <Input type="date" value={rcExpiry} onChange={(e) => setRcExpiry(e.target.value)} aria-label="Expiry date" />
                    </Field>
                    <Field label="Quantity" required>
                      <Input type="number" min={1} value={rcQty} onChange={(e) => setRcQty(e.target.value)} placeholder="Enter quantity" aria-label="Quantity" />
                    </Field>
                    <Field label="Location / Bin">
                      <Select
                        value={rcBin}
                        onValueChange={setRcBin}
                        placeholder="Select location…"
                        options={bins.map((b) => ({ value: b, label: b }))}
                      />
                    </Field>
                  </div>
                  <Button
                    size="md"
                    className="w-full"
                    disabled={!receiveValid}
                    onClick={() => {
                      if (!storeId) return
                      invActions.receiveStock({
                        id: `SR-${String(Date.now()).slice(-6)}`,
                        storeId,
                        variantId: rcProduct,
                        batchNo: rcBatchNo.trim(),
                        expiryDate: new Date(rcExpiry).toISOString(),
                        qty: Math.round(Number(rcQty)),
                        binLocation: rcBin,
                        at: DEMO_NOW.toISOString(),
                        by: managerName,
                      })
                      setRcProduct(''); setRcBatchNo(''); setRcExpiry(''); setRcQty(''); setRcBin('')
                    }}
                  >
                    <PackagePlus className="h-4 w-4" /> Record Stock
                  </Button>
                </CardContent>
              </Card>

              <Card hoverable className="border-border/70 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-warning-soft text-amber-600 dark:text-warning"><Repeat className="h-4 w-4" /></span>
                    Recent Adjustments
                  </CardTitle>
                  <button onClick={() => setTab('adjustments')} className="text-[12px] font-bold text-brand-700 hover:underline dark:text-brand-300">View All →</button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {adjQ.isLoading
                    ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)
                    : [...adjustments].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((a) => (
                      <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5">
                        <span className={cn(
                          'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                          a.delta >= 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
                        )}>
                          {a.delta >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">{variantNameOf(a.variantId)}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{a.reason} · {a.by} · {fmtDateTime(a.at)}</p>
                        </div>
                        <span className={cn('shrink-0 text-[13px] font-bold tabular', a.delta >= 0 ? 'text-success' : 'text-destructive')}>
                          {a.delta > 0 ? '+' : ''}{a.delta}
                        </span>
                      </div>
                    ))}
                  {!adjQ.isLoading && adjustments.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No adjustments recorded yet.</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ───────────────── LOW STOCK ───────────────── */}
          {tab === 'low' && (
            <>
              <div className="px-5 py-3.5">
                <CardTitle className="text-[15px]">Low Stock — below reorder level ({lowRows.length})</CardTitle>
              </div>
              <DataTable<StockRow>
                columns={[
                  productCol(),
                  skuCol,
                  batchCol,
                  expiryCol,
                  binCol(openSetBin),
                  qtyCol,
                  {
                    key: 'reorder', header: 'Reorder Level', align: 'right',
                    render: (r) => {
                      const v = db.variants.find((x) => x.id === r.batch.variantId)
                      const product = v ? db.products.find((p) => p.id === v.productId) : undefined
                      return <span className="tabular">{product?.reorderLevel ?? '—'}</span>
                    },
                  },
                  statusCol((r) => <Badge tone="red">Reorder needed</Badge>),
                  actionsCol(openSetBin, openAdjust),
                ]}
                rows={paginate(lowRows, 10)}
                keyId={(r) => r.batch.id}
                loading={stockQ.isLoading}
                skeletonRows={6}
                empty={<EmptyState icon={PackageCheck} title="Nothing is running low" body="Every stocked variant is above its reorder level." />}
              />
              <Pagination page={page} totalPages={Math.max(1, Math.ceil(lowRows.length / 10))} onChange={setPage} showing={showing(lowRows.length, 10)} />
            </>
          )}

          {/* ───────────────── EXPIRING ───────────────── */}
          {tab === 'expiring' && (
            <>
              <div className="px-5 py-3.5">
                <CardTitle className="text-[15px]">Expiring in ≤ 7 days ({expiringRows.length}) — sorted by expiry</CardTitle>
              </div>
              <DataTable<StockRow>
                columns={[
                  productCol(),
                  skuCol,
                  batchCol,
                  expiryCol,
                  {
                    key: 'days', header: 'Shelf Life',
                    render: (r) => {
                      const days = Math.max(0, daysLeft(r.batch.expiryDate))
                      return (
                        <span className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-bold tabular',
                          days <= 2 ? 'bg-destructive-soft text-destructive' : 'bg-warning-soft text-amber-600 dark:text-warning',
                        )}>
                          {days} day{days === 1 ? '' : 's'} left
                        </span>
                      )
                    },
                  },
                  binCol(openSetBin),
                  qtyCol,
                  statusCol(),
                  actionsCol(openSetBin, openAdjust),
                ]}
                rows={paginate(expiringRows, 10)}
                keyId={(r) => r.batch.id}
                loading={stockQ.isLoading}
                skeletonRows={6}
                empty={<EmptyState icon={PackageCheck} title="No expiring stock" body="Nothing expires in the next 7 days — nice." />}
              />
              <Pagination page={page} totalPages={Math.max(1, Math.ceil(expiringRows.length / 10))} onChange={setPage} showing={showing(expiringRows.length, 10)} />
            </>
          )}

          {/* ───────────────── COUNTS & ADJUSTMENTS ───────────────── */}
          {tab === 'adjustments' && (
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-[15px]">Stock counts &amp; adjustments</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="md" onClick={startStockCount} disabled={!allStock.length}>
                    <ClipboardCheck className="h-4 w-4" /> Start stock count
                  </Button>
                  <Button size="md" onClick={() => { setAdjustVariant(undefined); setAdjustOpen(true) }}>
                    <Plus className="h-4 w-4" /> Record adjustment
                  </Button>
                </div>
              </div>

              {/* active count card */}
              {activeCount ? (
                <Card hoverable className="border-brand-200 bg-gradient-to-br from-brand-50/60 to-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      Active stock count <Badge tone="blue">{activeCount.id}</Badge>
                    </CardTitle>
                    <span className="text-[11.5px] text-muted-foreground">Started {fmtDateTime(activeCount.startedAt)}</span>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {activeCount.lines.map((l) => {
                        const input = countInputs[l.variantId] ?? (l.counted === null ? '' : String(l.counted))
                        const countedNum = input.trim() !== '' && Number.isFinite(Number(input)) ? Number(input) : null
                        const variance = countedNum === null ? null : countedNum - l.expected
                        return (
                          <div key={l.variantId} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-2.5">
                            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{l.name}</span>
                            <span className="text-[12px] text-muted-foreground">Expected: <span className="font-bold tabular text-foreground">{l.expected}</span></span>
                            <input
                              value={input}
                              onChange={(e) => setCountInputs((s) => ({ ...s, [l.variantId]: e.target.value.replace(/\D/g, '') }))}
                              onBlur={() => commitCountLine(l.variantId)}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              placeholder="Counted"
                              aria-label={`Counted quantity for ${l.name}`}
                              className="h-9 w-24 rounded-xl border border-input bg-card px-3 text-center text-[13px] font-bold tabular shadow-innersoft focus:outline-none focus:ring-2 focus:ring-ring/60"
                            />
                            <span className={cn(
                              'w-20 text-right text-[12.5px] font-bold tabular',
                              variance === null ? 'text-muted-foreground' : variance === 0 ? 'text-success' : variance > 0 ? 'text-info' : 'text-destructive',
                            )}>
                              {variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance} var`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button size="md" onClick={completeStockCount}>
                        <PackageCheck className="h-4 w-4" /> Complete count
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-5 py-6 text-center text-[13px] text-muted-foreground">
                  No open count. <span className="font-semibold text-foreground">Start stock count</span> to count 5 stocked variants against expected quantities.
                </div>
              )}

              {/* adjustments history */}
              <Card>
                <CardHeader>
                  <CardTitle>Adjustments ({adjustments.length})</CardTitle>
                  <span className="text-[11.5px] text-muted-foreground">{pendingAdjCount} pending admin approval</span>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <DataTable<StockAdjustment>
                    columns={[
                      { key: 'variant', header: 'Variant', render: (a) => <span className="font-semibold">{variantNameOf(a.variantId)}</span> },
                      {
                        key: 'delta', header: 'Delta', align: 'right',
                        render: (a) => (
                          <span className={cn('font-bold tabular', a.delta >= 0 ? 'text-success' : 'text-destructive')}>
                            {a.delta > 0 ? '+' : ''}{a.delta}
                          </span>
                        ),
                      },
                      { key: 'reason', header: 'Reason', render: (a) => <span className="text-muted-foreground">{a.reason}</span> },
                      { key: 'by', header: 'By', render: (a) => a.by },
                      { key: 'at', header: 'When', render: (a) => <span className="tabular text-muted-foreground">{fmtDateTime(a.at)}</span> },
                      {
                        key: 'approvalStatus', header: 'Status',
                        render: (a) => (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <StatusPill status={a.approvalStatus} />
                            {a.approvalStatus === 'pending' && <Badge tone="amber">Pending admin approval</Badge>}
                          </span>
                        ),
                      },
                    ]}
                    rows={adjustments}
                    keyId={(a) => a.id}
                    loading={adjQ.isLoading}
                    skeletonRows={6}
                    empty={<EmptyState icon={ClipboardCheck} title="No adjustments yet" body="Record an adjustment to correct stock counts." />}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </Card>
      </motion.div>

      {/* set bin dialog */}
      <Dialog open={!!binRow} onOpenChange={(v) => { if (!v) setBinRow(null) }}>
        <DialogContent
          title="Set bin location"
          description={binRow ? `${binRow.variantName} — all batches of this variant move to the chosen bin.` : ''}
        >
          <div className="space-y-4">
            <Field label="Location / Bin" required>
              <Select value={binChoice} onValueChange={setBinChoice} placeholder="Select bin…" options={bins.map((b) => ({ value: b, label: b }))} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setBinRow(null)}>Cancel</Button>
              <Button
                size="md"
                disabled={!binChoice || !binRow}
                onClick={() => {
                  if (storeId && binRow) invActions.setBin(storeId, binRow.batch.variantId, binChoice)
                  setBinRow(null)
                }}
              >
                Set bin
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* record adjustment dialog */}
      <AdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        options={variantOptions}
        defaultVariantId={adjustVariant}
        onConfirm={submitAdjustment}
      />
    </motion.div>
  )
}
