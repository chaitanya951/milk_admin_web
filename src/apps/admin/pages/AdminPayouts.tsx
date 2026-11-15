// ── §8 Rider payouts & COD ──────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BadgeIndianRupee, Banknote, CheckCircle2, Clock, MoreHorizontal, PauseCircle, Truck,
} from 'lucide-react'
import { cn, fmtDateTime, fmtINR, fmtNum } from '@/shared/lib/utils'
import { Badge, Button, Input } from '@/shared/components/ui/base'
import {
  Dialog, DialogContent, Drawer, DropdownItem, DropdownMenu, DropdownMenuContent,
  DropdownMenuTrigger, Tooltip,
} from '@/shared/components/ui/overlays'
import { Field, Select } from '@/shared/components/ui/form'
import { EmptyState, PageHeader, SearchInput, TabPills } from '@/shared/components/misc'
import { StatusPill } from '@/shared/components/misc'
import { DataTable, Pagination, type Column } from '@/shared/components/DataTable'
import { KpiCard } from '@/shared/components/KpiCard'
import { SectionCard } from '@/shared/components/domain'
import { PayoutsScene } from '@/shared/illustrations/scenes'
import { useDebouncedValue, useStagger } from '@/shared/hooks/misc'
import { useFeature } from '@/shared/hooks/flags'
import { usePayoutCorrections, usePayouts, useStores } from '@/apps/admin/api/queries'
import { usePayoutActions } from '@/apps/admin/api/mutations'
import { useDB } from '@/shared/data/db'
import type { Payout, PayoutCorrection } from '@/shared/types'

const PAYOUT_TABS = [
  { value: 'payouts', label: 'Payouts' },
  { value: 'corrections', label: 'Corrections & COD offsets' },
]
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtINR(Math.abs(n))}`

function RowActions({ children, label = 'Actions' }: { children: React.ReactNode; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="iconSm" aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="contents" onClick={(e) => e.stopPropagation()}>{children}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ── Put on hold dialog ─────────────────────────────────────── */
function HoldDialog({ payout, onClose }: { payout: Payout; onClose: () => void }) {
  const payoutActions = usePayoutActions()
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={`Put ${payout.id} on hold`} description="Held payouts are excluded from the next settlement run until released.">
        <Field label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Rider documents under re-verification" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive" size="md" disabled={reason.trim().length < 3}
            onClick={() => { payoutActions.hold(payout.id, reason.trim()); onClose() }}
          >
            <PauseCircle className="h-4 w-4" /> Put on hold
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Record payment (manual settlement) dialog ──────────────── */
function SettleDialog({ payout, onClose }: { payout: Payout; onClose: () => void }) {
  const payoutActions = usePayoutActions()
  const [reference, setReference] = useState('')
  const [fileName, setFileName] = useState('')
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={`Record payment — ${payout.id}`} description="Manual settlement is recorded here; no bank transfer is initiated.">
        <div className="space-y-3">
          <Field label="Payment reference" required>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI/NDTL/482910" />
          </Field>
          <Field label="Evidence file name">
            <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="e.g. payout-proof.pdf" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary" size="md" disabled={reference.trim().length < 2}
              onClick={() => { payoutActions.settle(payout.id, reference.trim(), fileName.trim() || undefined); onClose() }}
            >
              <Banknote className="h-4 w-4" /> Record payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Payout detail drawer (lg) ──────────────────────────────── */
function PayoutDrawer({ payout, onClose, storeName, codOn }: { payout: Payout; onClose: () => void; storeName: string; codOn: boolean }) {
  const payoutActions = usePayoutActions()
  const correctionsQuery = usePayoutCorrections()
  const corrections = (correctionsQuery.data ?? []).filter((c) => c.payoutId === payout.id)
  const rows: Array<[string, string]> = [
    ['Period', payout.period],
    ['Deliveries', fmtNum(payout.deliveriesCount)],
    ['Gross', fmtINR(payout.grossAmount)],
    ...(codOn ? [['COD collected', fmtINR(payout.codCollected)] as [string, string]] : []),
    ['Adjustments', signed(payout.adjustments)],
    ['Net', fmtINR(payout.netAmount)],
    ['Status', payout.status.replace(/_/g, ' ')],
    ['Approved at', payout.approvedAt ? fmtDateTime(payout.approvedAt) : '—'],
    ['Paid at', payout.paidAt ? fmtDateTime(payout.paidAt) : '—'],
    ['Payment reference', payout.paymentReference ?? '—'],
    ['Evidence file', payout.evidenceFileName ?? '—'],
    ['Hold reason', payout.holdReason ?? '—'],
  ]
  return (
    <Drawer open onOpenChange={(v) => { if (!v) onClose() }} width="lg" title={payout.id} subtitle={`${payout.riderName} · ${storeName}`}>
      <div className="space-y-4">
        <p className="rounded-card border border-amber-200/70 bg-warning-soft px-4 py-3 text-[12.5px] font-semibold text-amber-800 dark:text-amber-200">
          Manual settlement is recorded here; no bank transfer is initiated.
        </p>
        <dl className="overflow-hidden rounded-xl border border-border/70 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className={cn('text-right font-semibold', k === 'Net' && 'text-[14px] font-extrabold')}>{v}</dd>
            </div>
          ))}
        </dl>
        <SectionCard
          title="Corrections & COD records"
          subtitle={`${corrections.length} record${corrections.length === 1 ? '' : 's'} linked to this payout · ${fmtNum(payout.deliveriesCount)} deliveries in period`}
        >
          {corrections.length === 0 ? (
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-[12.5px] text-muted-foreground">No corrections or COD offsets recorded for this payout.</p>
          ) : (
            <ul className="space-y-2">
              {corrections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 px-3.5 py-2.5 text-[13px]">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.kind === 'correction' ? 'blue' : 'amber'}>{c.kind === 'correction' ? 'Correction' : 'COD offset'}</Badge>
                    <span className="text-muted-foreground">{c.reason}</span>
                  </div>
                  <span className={cn('font-bold tabular', c.amount >= 0 ? 'text-success' : 'text-destructive')}>{signed(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="primary" size="md" disabled={!payout.canApprove}
            onClick={() => { payoutActions.approve(payout) }}
          >
            <CheckCircle2 className="h-4 w-4" /> Approve
          </Button>
          {payout.status === 'paid' && (
            <Button variant="secondary" size="md" onClick={() => payoutActions.settle(payout.id, payout.paymentReference ?? `UPI/NDTL/${Date.now() % 1000000}`, payout.evidenceFileName)}>
              <Banknote className="h-4 w-4" /> Update payment reference
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
export function AdminPayouts() {
  const stagger = useStagger()
  const db = useDB((s) => s.db)
  const codOn = useFeature('cod')
  const payoutActions = usePayoutActions()
  const [searchParams] = useSearchParams()
  const storesQuery = useStores()

  const [search, setSearch] = useState(searchParams.get('riderName') ?? '')
  const debSearch = useDebouncedValue(search)
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [debSearch, status])

  const query = usePayouts({ search: debSearch || undefined, status, page, pageSize: 8 })
  const correctionsQuery = usePayoutCorrections()
  const [tab, setTab] = useState('payouts')

  const storeNameOf = (storeId: string) => storesQuery.data?.find((s) => s.id === storeId)?.name ?? storeId

  // KPIs (counts cover the whole dataset — computed before filters in the API)
  const counts = query.data?.counts ?? {}
  const paidSum = db.payouts.filter((p) => p.status === 'paid').reduce((a, p) => a + p.netAmount, 0)
  const codSum = db.payouts.reduce((a, p) => a + p.codCollected, 0)

  const [openId, setOpenId] = useState<string | null>(null)
  const [holdTarget, setHoldTarget] = useState<Payout | null>(null)
  const [settleTarget, setSettleTarget] = useState<Payout | null>(null)
  const openPayout = openId ? db.payouts.find((p) => p.id === openId) ?? query.data?.rows.find((p) => p.id === openId) ?? null : null

  const cols: Array<Column<Payout>> = [
    { key: 'id', header: 'Payout', render: (r) => <span className="font-mono text-xs font-semibold">{r.id}</span> },
    { key: 'riderName', header: 'Rider', render: (r) => <span className="font-semibold">{r.riderName}</span> },
    { key: 'store', header: 'Store', render: (r) => storeNameOf(r.storeId) },
    { key: 'period', header: 'Period', render: (r) => <span className="text-muted-foreground">{r.period}</span> },
    { key: 'deliveries', header: 'Deliveries', align: 'right', render: (r) => <span className="tabular">{fmtNum(r.deliveriesCount)}</span> },
    { key: 'gross', header: 'Gross', align: 'right', render: (r) => <span className="tabular">{fmtINR(r.grossAmount)}</span> },
    ...(codOn ? [{
      key: 'cod', header: 'COD collected', align: 'right' as const,
      render: (r: Payout) => <span className="tabular">{fmtINR(r.codCollected)}</span>,
    }] : []),
    {
      key: 'adjustments', header: 'Adjustments', align: 'right',
      render: (r) => <span className={cn('tabular font-medium', r.adjustments > 0 && 'text-success', r.adjustments < 0 && 'text-destructive')}>{signed(r.adjustments)}</span>,
    },
    { key: 'net', header: 'Net', align: 'right', render: (r) => <span className="font-extrabold tabular">{fmtINR(r.netAmount)}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.canApprove || r.status === 'on_hold'} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <RowActions>
          <Tooltip content={r.canApprove ? 'Approve this payout for settlement' : 'Only payouts pending review can be approved'}>
            <span>
              <DropdownItem disabled={!r.canApprove} onSelect={() => payoutActions.approve(r)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </DropdownItem>
            </span>
          </Tooltip>
          <DropdownItem
            disabled={r.status === 'on_hold' || r.status === 'paid'}
            onSelect={() => setHoldTarget(r)}
          >
            <PauseCircle className="h-3.5 w-3.5" /> Put on hold…
          </DropdownItem>
          <Tooltip content={r.status === 'paid' ? 'Record the payment reference after bank settlement' : 'Available after the payout is actually paid'}>
            <span>
              <DropdownItem disabled={r.status !== 'paid'} onSelect={() => setSettleTarget(r)}>
                <Banknote className="h-3.5 w-3.5" /> Record payment
              </DropdownItem>
            </span>
          </Tooltip>
        </RowActions>
      ),
    },
  ]

  const correctionRows = (correctionsQuery.data ?? []).map((c) => {
    const payout = db.payouts.find((p) => p.id === c.payoutId)
    return { ...c, riderName: payout?.riderName ?? '—' }
  })
  const correctionCols: Array<Column<PayoutCorrection & { riderName: string }>> = [
    { key: 'payoutId', header: 'Payout', render: (r) => <span className="font-mono text-xs font-semibold">{r.payoutId}</span> },
    { key: 'riderName', header: 'Rider', render: (r) => <span className="font-medium">{r.riderName}</span> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge tone={r.kind === 'correction' ? 'blue' : 'amber'}>{r.kind === 'correction' ? 'Correction' : 'COD offset'}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className={cn('font-bold tabular', r.amount >= 0 ? 'text-success' : 'text-destructive')}>{signed(r.amount)}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-[280px] text-xs text-muted-foreground">{r.reason}</span> },
    { key: 'at', header: 'When', render: (r) => <span className="tabular text-muted-foreground">{fmtDateTime(r.at)}</span> },
  ]

  const total = query.data?.total ?? 0
  const totalPages = Math.ceil(total / 8)
  const start = total === 0 ? 0 : (page - 1) * 8 + 1

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rider payouts"
        titleAccent="& COD"
        breadcrumb={['Payouts']}
        subtitle="Weekly delivery payouts, review workflow and COD offsets — manual settlement only, no bank transfers are initiated here."
        illustration={<PayoutsScene />}
      />
      <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
        <motion.section variants={stagger.item} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Pending review" value={counts.pending_review ?? 0} format="num" icon={Clock} tint="amber" />
          <KpiCard label="Approved" value={counts.approved ?? 0} format="num" icon={CheckCircle2} tint="blue" />
          <KpiCard label="Paid" value={paidSum} format="compact" icon={BadgeIndianRupee} tint="green" />
          {codOn && <KpiCard label="COD collected" value={codSum} format="compact" icon={Truck} tint="violet" />}
        </motion.section>
        <motion.section variants={stagger.item}>
          <TabPills id="payouts-tabs" tabs={PAYOUT_TABS} value={tab} onChange={setTab} />
        </motion.section>

        {tab === 'payouts' && (
          <motion.section variants={stagger.item} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput className="w-full sm:w-72" value={search} onChange={setSearch} placeholder="Search rider, payout id or period…" />
              <Select
                className="w-48"
                value={status}
                onValueChange={setStatus}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'pending_review', label: 'Pending review' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'processing', label: 'Processing' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'on_hold', label: 'On hold' },
                ]}
              />
            </div>
            <div className="rounded-card border border-border/70 bg-card shadow-soft">
              <DataTable
                columns={cols}
                rows={query.data?.rows ?? []}
                keyId={(r) => r.id}
                loading={query.isLoading}
                onRowClick={(r) => setOpenId(r.id)}
                skeletonRows={6}
                empty={<EmptyState title="No payouts match" body="Try a different search or status filter." />}
                footer={
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    onChange={setPage}
                    showing={total > 0 ? `Showing ${start}–${Math.min(page * 8, total)} of ${fmtNum(total)}` : 'No results'}
                  />
                }
              />
            </div>
          </motion.section>
        )}

        {tab === 'corrections' && (
          <motion.section variants={stagger.item} className="space-y-4">
            <p className="text-[13px] text-muted-foreground">
              Corrections and COD offsets are adjusted against the referenced payout cycle.
            </p>
            <div className="rounded-card border border-border/70 bg-card shadow-soft">
              <DataTable
                columns={correctionCols}
                rows={correctionRows}
                keyId={(r) => r.id}
                loading={correctionsQuery.isLoading}
                skeletonRows={6}
                empty={<EmptyState title="No corrections recorded" body="Corrections and COD offsets will appear here." />}
              />
            </div>
          </motion.section>
        )}
      </motion.div>

      {openPayout && (
        <PayoutDrawer payout={openPayout} onClose={() => setOpenId(null)} storeName={storeNameOf(openPayout.storeId)} codOn={codOn} />
      )}
      {holdTarget && <HoldDialog payout={holdTarget} onClose={() => setHoldTarget(null)} />}
      {settleTarget && <SettleDialog payout={settleTarget} onClose={() => setSettleTarget(null)} />}
    </div>
  )
}
