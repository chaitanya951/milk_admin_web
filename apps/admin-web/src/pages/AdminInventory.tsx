import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Boxes, AlertTriangle, CalendarClock, Flag, SearchX, ShieldAlert } from 'lucide-react'
import { useStagger, useDebouncedValue } from '@dairydirect/shared/hooks/misc'
import { useStock, useMovements, useStockBatches, useVariants, useProducts, useStoreOptions } from '@/api/queries'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { PageHeader, TabPills, SearchInput, EmptyState } from '@dairydirect/shared/ui/misc'
import { Select } from '@dairydirect/shared/ui/form'
import { Button, Card, Badge, Switch, Progress, Label } from '@dairydirect/shared/ui/base'
import { KpiCard } from '@dairydirect/shared/ui/KpiCard'
import { DataTable } from '@dairydirect/shared/ui/DataTable'
import { InventoryScene } from '@dairydirect/shared/assets/scenes'
import type { InventoryMovement, FlagReason, Product } from '@dairydirect/shared/types'
import { cn, fmtDate, fmtDateTime, fmtNum } from '@dairydirect/shared/lib/utils'

type MainTab = 'stock' | 'movements' | 'discrepancies' | 'shelf'

const MOVEMENT_TONE: Record<InventoryMovement['type'], { tone: 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'neutral'; label: string }> = {
  receipt: { tone: 'green', label: 'Receipt' },
  sale: { tone: 'blue', label: 'Sale' },
  adjustment: { tone: 'amber', label: 'Adjustment' },
  damage: { tone: 'red', label: 'Damage' },
  expiry: { tone: 'violet', label: 'Expiry' },
  transfer: { tone: 'neutral', label: 'Transfer' },
}

const FLAG_LABEL: Record<FlagReason, string> = {
  damage: 'Damage write-off',
  expiry: 'Expiry write-off',
  unusual_adjustment: 'Unusual adjustment',
}

function daysUntil(dateStr: string, demoNow: number) {
  return Math.round((new Date(dateStr).getTime() - demoNow) / 86400000)
}

export function AdminInventory() {
  const container = useStagger()
  const db = useDB((s) => s.db)
  const demoNowMs = new Date(db.demoNow).getTime()

  const [tab, setTab] = useState<MainTab>('stock')

  // ── KPI inputs ──
  const allStockQ = useStock({ pageSize: 100000 })
  const batchesQ = useStockBatches()
  const flaggedQ = useMovements({ flaggedOnly: true, pageSize: 1 })
  const storeOptions = useStoreOptions()
  const variantsQ = useVariants()
  const productsQ = useProducts({ pageSize: 100 })

  const allStock = allStockQ.data?.rows ?? []
  const totalSkus = useMemo(() => allStock.filter((r) => r.level.qty > 0).length, [allStock])
  const lowCount = useMemo(() => allStock.filter((r) => r.level.qty < r.level.lowStockThreshold).length, [allStock])
  const expiringBatches = useMemo(
    () => (batchesQ.data ?? [])
      .filter((b) => daysUntil(b.expiryDate, demoNowMs) <= 7)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    [batchesQ.data, demoNowMs],
  )
  const flaggedCount = flaggedQ.data?.total ?? 0

  // ── stock tab filters ──
  const [storeId, setStoreId] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [lowOnly, setLowOnly] = useState(false)
  const [stockPage, setStockPage] = useState(1)
  const stockQ = useStock({ storeId, search: debouncedSearch || undefined, lowOnly, page: stockPage, pageSize: 10 })
  const stockTotal = stockQ.data?.total ?? 0

  // ── movements tab filters ──
  const [mStoreId, setMStoreId] = useState('all')
  const [mType, setMType] = useState('all')
  const [mFlaggedOnly, setMFlaggedOnly] = useState(false)
  const [mSearch, setMSearch] = useState('')
  const debouncedMSearch = useDebouncedValue(mSearch, 250)
  const [mPage, setMPage] = useState(1)
  const movementsQ = useMovements({ storeId: mStoreId, type: mType, flaggedOnly: mFlaggedOnly, search: debouncedMSearch || undefined, page: mPage, pageSize: 10 })
  const [dPage, setDPage] = useState(1)
  const discrepancyQ = useMovements({ flaggedOnly: true, page: dPage, pageSize: 10 })

  useEffect(() => { setStockPage(1) }, [storeId, debouncedSearch, lowOnly])
  useEffect(() => { setMPage(1) }, [mStoreId, mType, mFlaggedOnly, debouncedMSearch])

  const productNameOf = (variantId: string) => {
    const v = variantsQ.data?.find((x) => x.id === variantId)
    if (!v) return variantId
    return db.products.find((p) => p.id === v.productId)?.name ?? v.sku
  }
  const variantFull = (variantId: string) => {
    const v = variantsQ.data?.find((x) => x.id === variantId)
    if (!v) return variantId
    return `${productNameOf(variantId)} – ${v.label}`
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        titleAccent="oversight"
        subtitle="Network-wide stock levels, flagged movements and shelf life. Receiving, counting and quality handling live with the store managers."
        illustration={<InventoryScene />}
        breadcrumb={['Inventory']}
      />

      <motion.div variants={container.container} initial="hidden" animate="show" className="space-y-5">
        {/* ── KPI row ── */}
        <motion.section variants={container.item} className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard label="SKUs in stock" value={totalSkus} icon={Boxes} tint="green" format="num" />
          <KpiCard label="Low-stock positions" value={lowCount} icon={AlertTriangle} tint="amber" format="num" />
          <KpiCard label="Expiring ≤7 days" value={expiringBatches.length} icon={CalendarClock} tint="red" format="num" />
          <KpiCard label="Flagged movements" value={flaggedCount} icon={Flag} tint="violet" format="num" />
        </motion.section>

        <motion.div variants={container.item}>
          <TabPills
            id="inventory-tabs"
            value={tab}
            onChange={(v) => setTab(v as MainTab)}
            tabs={[
              { value: 'stock', label: 'Stock levels' },
              { value: 'movements', label: 'Movements' },
              { value: 'discrepancies', label: 'Discrepancies', count: flaggedCount },
              { value: 'shelf', label: 'Shelf life' },
            ]}
          />
        </motion.div>

        {/* ── STOCK LEVELS ── */}
        {tab === 'stock' && (
          <motion.section variants={container.item} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-48">
                <Select value={storeId} onValueChange={setStoreId} options={[{ value: 'all', label: 'All stores' }, ...(storeOptions.data ?? [])]} />
              </div>
              <SearchInput value={search} onChange={setSearch} placeholder="Search product or SKU…" className="min-w-[220px] flex-1" />
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2">
                <Switch checked={lowOnly} onCheckedChange={setLowOnly} />
                <Label htmlFor="low-only" className="mb-0 cursor-pointer text-[13px]">Low stock only</Label>
              </div>
            </div>
            <Card className="overflow-hidden">
              <DataTable
                keyId={(r) => `${r.level.storeId}-${r.level.variantId}`}
                rows={stockQ.data?.rows ?? []}
                loading={stockQ.isLoading}
                empty={<EmptyState icon={SearchX} title="No stock rows match" body="Adjust the store, search or low-stock filter." />}
                columns={[
                  {
                    key: 'product', header: 'Product',
                    render: (r) => (
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{r.variantName}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{r.sku}</p>
                      </div>
                    ),
                  },
                  { key: 'store', header: 'Store', render: (r) => r.storeName },
                  { key: 'qty', header: 'Stock', render: (r) => <span className="font-bold tabular">{fmtNum(r.level.qty)}</span> },
                  { key: 'threshold', header: 'Threshold', render: (r) => <span className="tabular text-muted-foreground">{fmtNum(r.level.lowStockThreshold)}</span> },
                  {
                    key: 'status', header: 'Status',
                    render: (r) => r.level.qty < r.level.lowStockThreshold
                      ? <Badge tone="red">LOW</Badge>
                      : <Badge tone="green">OK</Badge>,
                  },
                  {
                    key: 'coverage', header: 'Coverage', align: 'right' as const,
                    render: (r) => {
                      const coverage = Math.round((r.level.qty / Math.max(1, r.level.lowStockThreshold)) * 100)
                      const pct = Math.min(100, Math.max(0, coverage))
                      const low = r.level.qty < r.level.lowStockThreshold
                      return (
                        <div className="flex min-w-[120px] items-center justify-end gap-2">
                          <Progress value={pct} className="h-1.5 w-20" barClassName={cn(low && 'bg-destructive bg-none')} />
                          <span className={cn('w-12 text-right text-xs font-bold tabular', low ? 'text-destructive' : 'text-muted-foreground')}>
                            {coverage}%
                          </span>
                        </div>
                      )
                    },
                  },
                ]}
              />
              {(stockTotal > 10) && (
                <div className="flex items-center justify-between border-t border-border/60 px-5 py-3.5 text-xs text-muted-foreground">
                  <span>Showing {stockQ.data?.rows.length ?? 0} of {fmtNum(stockTotal)} stock rows</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={stockPage === 1} onClick={() => setStockPage((p) => Math.max(1, p - 1))}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={stockPage >= Math.ceil(stockTotal / 10)} onClick={() => setStockPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </Card>
          </motion.section>
        )}

        {/* ── MOVEMENTS ── */}
        {tab === 'movements' && (
          <motion.section variants={container.item} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-48">
                <Select value={mStoreId} onValueChange={setMStoreId} options={[{ value: 'all', label: 'All stores' }, ...(storeOptions.data ?? [])]} />
              </div>
              <div className="w-44">
                <Select value={mType} onValueChange={setMType} options={[
                  { value: 'all', label: 'All types' },
                  { value: 'receipt', label: 'Receipt' }, { value: 'sale', label: 'Sale' }, { value: 'adjustment', label: 'Adjustment' },
                  { value: 'damage', label: 'Damage' }, { value: 'expiry', label: 'Expiry' }, { value: 'transfer', label: 'Transfer' },
                ]} />
              </div>
              <SearchInput value={mSearch} onChange={setMSearch} placeholder="Search product, reason or actor…" className="min-w-[200px] flex-1" />
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2">
                <Switch checked={mFlaggedOnly} onCheckedChange={setMFlaggedOnly} />
                <Label htmlFor="flagged-only" className="mb-0 cursor-pointer text-[13px]">Flagged only</Label>
              </div>
            </div>
            <Card className="overflow-hidden">
              <DataTable
                keyId={(r) => r.movement.id}
                rows={movementsQ.data?.rows ?? []}
                loading={movementsQ.isLoading}
                empty={<EmptyState icon={SearchX} title="No movements match" body="Adjust the filters to see stock movements." />}
                columns={[
                  { key: 'when', header: 'When', render: (r) => <span className="whitespace-nowrap text-[13px]">{fmtDateTime(r.movement.at)}</span> },
                  { key: 'store', header: 'Store', render: (r) => r.storeName },
                  { key: 'product', header: 'Product', render: (r) => <span className="block max-w-[220px] truncate font-medium">{r.variantName}</span> },
                  { key: 'type', header: 'Type', render: (r) => <Badge tone={MOVEMENT_TONE[r.movement.type].tone}>{MOVEMENT_TONE[r.movement.type].label}</Badge> },
                  {
                    key: 'qty', header: 'Qty',
                    render: (r) => (
                      <span className={cn('font-bold tabular', r.movement.qtyDelta >= 0 ? 'text-success' : 'text-destructive')}>
                        {r.movement.qtyDelta >= 0 ? '+' : '−'}{fmtNum(Math.abs(r.movement.qtyDelta))}
                      </span>
                    ),
                  },
                  { key: 'reason', header: 'Reason', render: (r) => <span className="block max-w-[200px] truncate text-[13px] text-muted-foreground">{r.movement.reason}</span> },
                  { key: 'by', header: 'By', render: (r) => <span className="text-[13px]">{r.movement.actor}</span> },
                ]}
              />
              {(movementsQ.data?.total ?? 0) > 10 && (
                <div className="flex items-center justify-between border-t border-border/60 px-5 py-3.5 text-xs text-muted-foreground">
                  <span>Showing {movementsQ.data?.rows.length ?? 0} of {fmtNum(movementsQ.data?.total ?? 0)} movements</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={mPage === 1} onClick={() => setMPage((p) => Math.max(1, p - 1))}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={mPage >= Math.ceil((movementsQ.data?.total ?? 0) / 10)} onClick={() => setMPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </Card>
          </motion.section>
        )}

        {/* ── DISCREPANCIES ── */}
        {tab === 'discrepancies' && (
          <motion.section variants={container.item} className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-warning-soft px-4 py-3 dark:border-amber-500/30">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-warning" />
              <p className="text-[13px] font-medium leading-relaxed text-amber-800 dark:text-amber-200">
                Damaged stock, expiry write-offs and unusual adjustments are flagged automatically for investigation — receiving, counting and quality handling is the store manager's job.
              </p>
            </div>
            <Card className="overflow-hidden">
              <DataTable
                keyId={(r) => r.movement.id}
                rows={discrepancyQ.data?.rows ?? []}
                loading={discrepancyQ.isLoading}
                empty={<EmptyState icon={Flag} title="No flagged movements" body="Automatic flags will appear here for investigation." />}
                columns={[
                  { key: 'when', header: 'When', render: (r) => <span className="whitespace-nowrap text-[13px]">{fmtDateTime(r.movement.at)}</span> },
                  { key: 'store', header: 'Store', render: (r) => r.storeName },
                  { key: 'product', header: 'Product', render: (r) => <span className="block max-w-[220px] truncate font-medium">{r.variantName}</span> },
                  { key: 'type', header: 'Type', render: (r) => <Badge tone={MOVEMENT_TONE[r.movement.type].tone}>{MOVEMENT_TONE[r.movement.type].label}</Badge> },
                  {
                    key: 'qty', header: 'Qty',
                    render: (r) => (
                      <span className={cn('font-bold tabular', r.movement.qtyDelta >= 0 ? 'text-success' : 'text-destructive')}>
                        {r.movement.qtyDelta >= 0 ? '+' : '−'}{fmtNum(Math.abs(r.movement.qtyDelta))}
                      </span>
                    ),
                  },
                  { key: 'reason', header: 'Reason', render: (r) => <span className="block max-w-[180px] truncate text-[13px] text-muted-foreground">{r.movement.reason}</span> },
                  {
                    key: 'flag', header: 'Flag',
                    render: (r) => <Badge tone={r.movement.flagReason === 'expiry' ? 'violet' : r.movement.flagReason === 'damage' ? 'red' : 'amber'}>{FLAG_LABEL[r.movement.flagReason ?? 'damage']}</Badge>,
                  },
                  { key: 'by', header: 'By', render: (r) => <span className="text-[13px]">{r.movement.actor}</span> },
                ]}
              />
              {(discrepancyQ.data?.total ?? 0) > 10 && (
                <div className="flex items-center justify-between border-t border-border/60 px-5 py-3.5 text-xs text-muted-foreground">
                  <span>Showing {discrepancyQ.data?.rows.length ?? 0} of {fmtNum(discrepancyQ.data?.total ?? 0)} flagged movements</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={dPage === 1} onClick={() => setDPage((p) => Math.max(1, p - 1))}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={dPage >= Math.ceil((discrepancyQ.data?.total ?? 0) / 10)} onClick={() => setDPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </Card>
          </motion.section>
        )}

        {/* ── SHELF LIFE ── */}
        {tab === 'shelf' && (
          <motion.section variants={container.item} className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Card className="overflow-hidden xl:col-span-7">
              <div className="px-5 pt-5 pb-3">
                <h3 className="text-[15px] font-bold tracking-tight">Product shelf life</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Storage class and expiry windows per catalog product</p>
              </div>
              <DataTable
                keyId={(r) => r.product.id}
                rows={productsQ.data?.rows ?? []}
                loading={productsQ.isLoading}
                columns={[
                  { key: 'name', header: 'Product', render: (r: { product: Product }) => <span className="font-semibold">{r.product.name}</span> },
                  { key: 'storage', header: 'Storage', render: (r: { product: Product }) => <Badge tone={r.product.storage === 'chilled' ? 'blue' : r.product.storage === 'frozen' ? 'violet' : 'neutral'}>{r.product.storage}</Badge> },
                  { key: 'shelf', header: 'Shelf life', render: (r: { product: Product }) => <span className="tabular">{r.product.shelfLifeDays} days</span> },
                  { key: 'tax', header: 'Tax', render: (r: { product: Product }) => <span className="tabular">{r.product.taxRatePct}%</span> },
                  { key: 'sub', header: 'Subscribable', render: (r: { product: Product }) => r.product.subscribable ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge> },
                ]}
              />
            </Card>
            <Card className="overflow-hidden xl:col-span-5">
              <div className="px-5 pt-5 pb-3">
                <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight"><CalendarClock className="h-4 w-4 text-destructive" /> Expiring batches</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Sorted by expiry — red batches expire within 7 days</p>
              </div>
              <div className="scrollbar-thin max-h-[420px] overflow-y-auto px-5 pb-5">
                {batchesQ.isLoading ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Loading batches…</p>
                ) : (batchesQ.data ?? []).length === 0 ? (
                  <EmptyState icon={CalendarClock} title="No stock batches" />
                ) : (
                  <div className="space-y-1.5">
                    {(batchesQ.data ?? [])
                      .slice()
                      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
                      .map((b) => {
                        const d = daysUntil(b.expiryDate, demoNowMs)
                        const red = d <= 7
                        const v = variantsQ.data?.find((x) => x.id === b.variantId)
                        return (
                          <div key={b.id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', red ? 'border-destructive/40 bg-destructive-soft/60' : 'border-border/70')}>
                            <div className="min-w-0 flex-1">
                              <p className={cn('truncate text-[13px] font-semibold', red && 'text-destructive')}>{v ? `${productNameOf(b.variantId)} – ${v.label}` : b.variantId}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{db.stores.find((s) => s.id === b.storeId)?.name ?? b.storeId}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={cn('text-[12.5px] font-bold tabular', red ? 'text-destructive' : 'text-foreground/80')}>{fmtDate(b.expiryDate)}</p>
                              <p className={cn('text-[10.5px] font-semibold', red ? 'text-destructive' : 'text-muted-foreground')}>{d <= 0 ? 'expired' : `${d}d left`} · {fmtNum(b.qty)} units</p>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </Card>
          </motion.section>
        )}
      </motion.div>
    </div>
  )
}

