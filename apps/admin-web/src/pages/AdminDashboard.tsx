import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ShoppingCart, Loader, Truck, XCircle, AlertTriangle, Wallet, RotateCcw,
  BadgeIndianRupee, Store, ArrowRight, ClipboardList, PackageX, CalendarClock,
  ScrollText, Cog, ChevronRight, Check,
} from 'lucide-react'
import { useStagger } from '@dairydirect/shared/hooks/misc'
import { useDashboard, useStoreOptions } from '@/api/queries'
import { PageHeader, DateChip } from '@dairydirect/shared/ui/misc'
import { Select } from '@dairydirect/shared/ui/form'
import { Popover, PopoverTrigger, PopoverContent } from '@dairydirect/shared/ui/overlays'
import { Card } from '@dairydirect/shared/ui/base'
import { KpiCard } from '@dairydirect/shared/ui/KpiCard'
import { MeadowScene } from '@dairydirect/shared/assets/scenes'
import type { RangeKey } from '@dairydirect/shared/types'
import { fmtDate } from '@dairydirect/shared/lib/utils'

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

/** Pending-count row that deep-links into the owning page pre-filtered. */
function PendingLink({ to, label, count, icon: Icon }: { to: string; label: string; count: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary-soft"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-brand-700 dark:text-brand-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{label}</span>
      <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11.5px] font-bold tabular text-amber-600 dark:text-warning">{count}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

/** Small alert row used by the low-stock / expiring lists. */
function AlertRow({ title, sub, right, danger }: { title: string; sub: string; right: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${danger ? 'bg-destructive' : 'bg-warning'}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <span className={`shrink-0 text-[12px] font-bold tabular ${danger ? 'text-destructive' : 'text-amber-600 dark:text-warning'}`}>{right}</span>
    </div>
  )
}

export function AdminDashboard() {
  const container = useStagger()
  const [range, setRange] = useState<RangeKey>('30d')
  const [storeId, setStoreId] = useState<string>('all')

  const storeOptions = useStoreOptions()
  const dash = useDashboard(range, storeId)
  const d = dash.data

  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label ?? 'Last 30 days'
  const storeLabel = storeId === 'all' ? 'All stores' : storeOptions.data?.find((s) => s.value === storeId)?.label ?? 'All stores'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Operations"
          titleAccent="dashboard"
          subtitle="Live health of stores, orders and money movement across the network."
          illustration={<MeadowScene variant="dashboard" />}
          breadcrumb={['Dashboard']}
        />
        <div className="relative z-10 flex flex-wrap items-center gap-2.5">
          {/* Store filter */}
          <div className="w-44">
            <Select
              value={storeId}
              onValueChange={(v) => setStoreId(v || 'all')}
              options={[{ value: 'all', label: 'All stores' }, ...(storeOptions.data ?? [])]}
            />
          </div>
          {/* Date range chip + popover */}
          <Popover>
            <PopoverTrigger asChild>
              <span>
                <DateChip label={rangeLabel} active />
              </span>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1.5">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors hover:bg-primary-soft ${range === r.value ? 'font-bold text-brand-700 dark:text-brand-300' : ''}`}
                >
                  {r.label}
                  {range === r.value && <Check className="h-3.5 w-3.5 text-brand-600" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <motion.div variants={container.container} initial="hidden" animate="show" className="space-y-5">
        {/* ── KPI row 1: order pipeline ── */}
        <motion.section variants={container.item} className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard label="Orders placed" value={d?.ordersPlaced ?? 0} icon={ShoppingCart} tint="violet" />
          <KpiCard label="In progress" value={d?.ordersInProgress ?? 0} icon={Loader} tint="blue" />
          <KpiCard label="Delivered" value={d?.ordersDelivered ?? 0} icon={Truck} tint="green" />
          <KpiCard label="Cancelled" value={d?.ordersCancelled ?? 0} icon={XCircle} tint="red" />
          <KpiCard
            label="Requiring attention"
            value={d?.ordersRequiringAttention ?? 0}
            icon={AlertTriangle}
            tint="amber"
            delta={0}
            deltaGood="none"
            highlight={(d?.ordersRequiringAttention ?? 0) > 0}
          />
        </motion.section>

        {/* ── KPI row 2: three separate financial figures — never combined ── */}
        <motion.section variants={container.item} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Sales" value={d?.sales ?? 0} format="compact" icon={BadgeIndianRupee} tint="green" />
          <KpiCard label="Wallet top-ups" value={d?.walletTopUps ?? 0} format="compact" icon={Wallet} tint="amber" />
          <KpiCard label="Refunds" value={d?.refunds ?? 0} format="compact" icon={RotateCcw} tint="red" />
        </motion.section>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* col 7 — store status + pending links */}
          <motion.section variants={container.item} className="space-y-4 lg:col-span-7">
            <Card hoverable className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
                  <Store className="h-4 w-4 text-brand-600" /> Store status
                  <span className="text-xs font-medium text-muted-foreground">({storeLabel})</span>
                </h3>
                <Link to="/stores" className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline dark:text-brand-300">
                  Manage stores <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/70 bg-success-soft/60 px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground">Online</p>
                  <p className="text-[26px] font-extrabold tabular leading-tight text-success">{d?.storesOnline ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-warning-soft/60 px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground">Paused</p>
                  <p className="text-[26px] font-extrabold tabular leading-tight text-amber-600 dark:text-warning">{d?.storesPaused ?? 0}</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">High picking backlog (&ge;30 orders)</p>
                {(d?.highBacklogStores.length ?? 0) === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs font-medium text-muted-foreground">0 stores right now</p>
                ) : (
                  <div className="space-y-1.5">
                    {d!.highBacklogStores.map((s) => (
                      <Link
                        key={s.id}
                        to="/orders"
                        className="flex items-center justify-between gap-3 rounded-xl bg-destructive-soft px-3 py-2 text-[13px] transition hover:brightness-95"
                      >
                        <span className="font-semibold text-destructive">{s.name}</span>
                        <span className="font-bold tabular text-destructive">{s.backlog} orders in picking queue</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card hoverable className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
                  <ClipboardList className="h-4 w-4 text-brand-600" /> Pending work
                </h3>
              </div>
              <div className="space-y-1">
                <PendingLink to="/people?tab=riders&status=application_pending" label="Rider applications to review" count={d?.pendingRiderApplications ?? 0} icon={Truck} />
                <PendingLink to="/payments?tab=refunds&status=requested" label="Refund requests" count={d?.pendingRefunds ?? 0} icon={RotateCcw} />
                <PendingLink to="/approvals?status=pending" label="Approvals awaiting decision" count={d?.pendingApprovals ?? 0} icon={ScrollText} />
                <PendingLink to="/support?status=open" label="Open support tickets" count={d?.openTickets ?? 0} icon={ClipboardList} />
              </div>
            </Card>
          </motion.section>

          {/* col 5 — low stock + expiring stock */}
          <motion.section variants={container.item} className="space-y-4 lg:col-span-5">
            <Card hoverable className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
                  <PackageX className="h-4 w-4 text-amber-500" /> Low-stock alerts
                </h3>
                <Link to="/inventory" className="text-xs font-bold text-brand-700 hover:underline dark:text-brand-300">Inventory</Link>
              </div>
              {(d?.lowStock.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs font-medium text-muted-foreground">No low-stock variants — all good</p>
              ) : (
                <div className="space-y-1.5">
                  {d!.lowStock.map((r, i) => (
                    <AlertRow key={i} title={r.variantName} sub={r.storeName} right={`${r.qty} / ${r.threshold}`} />
                  ))}
                </div>
              )}
            </Card>

            <Card hoverable className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
                  <CalendarClock className="h-4 w-4 text-destructive" /> Expiring stock (next 7 days)
                </h3>
                <Link to="/inventory" className="text-xs font-bold text-brand-700 hover:underline dark:text-brand-300">Shelf life</Link>
              </div>
              {(d?.expiringStock.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs font-medium text-muted-foreground">Nothing expiring within 7 days</p>
              ) : (
                <div className="space-y-1.5">
                  {d!.expiringStock.map((r, i) => (
                    <AlertRow key={i} danger title={r.variantName} sub={`${r.storeName} · ${fmtDate(r.expiryDate)}`} right={`${r.qty} units`} />
                  ))}
                </div>
              )}
            </Card>
          </motion.section>
        </div>

        {/* ── Reconciliation + background jobs ── */}
        <motion.section variants={container.item} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link to="/payments?tab=reconciliation" className="group">
            <Card hoverable className="flex items-center gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-destructive-soft text-destructive">
                <BadgeIndianRupee className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">Payment reconciliation issues</p>
                <p className="text-xs text-muted-foreground">{d?.reconciliationIssues ?? 0} open findings need review</p>
              </div>
              <span className="rounded-full bg-destructive-soft px-3 py-1.5 text-sm font-extrabold tabular text-destructive">{d?.reconciliationIssues ?? 0}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Card>
          </Link>
          <Link to="/settings#jobs" className="group">
            <Card hoverable className="flex items-center gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warning-soft text-amber-600 dark:text-warning">
                <Cog className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">Failed background jobs</p>
                <p className="text-xs text-muted-foreground">{d?.failedJobs ?? 0} jobs failed and await recovery</p>
              </div>
              <span className="rounded-full bg-warning-soft px-3 py-1.5 text-sm font-extrabold tabular text-amber-600 dark:text-warning">{d?.failedJobs ?? 0}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Card>
          </Link>
        </motion.section>
      </motion.div>
    </div>
  )
}

