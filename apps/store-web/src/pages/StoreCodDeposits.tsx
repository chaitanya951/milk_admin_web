// §6 COD Cash Deposits — two KPIs (today's total + count), record-deposit form with
// auto-suggested unique reference, and a simple searchable deposit history.
// Spec removes the reconciliation KPIs/tabs/summary card (backend gap noted in README).
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Banknote, CheckCircle2, ClipboardList, RefreshCcw, ShieldAlert, Clock } from 'lucide-react'
import { useDebouncedValue, useStagger } from '@dairydirect/shared/hooks/misc'
import { useActiveStoreId, useCodDeposits } from '@/api/storeQueries'
import { useCodActions } from '@/api/storeMutations'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { DEMO_NOW } from '@dairydirect/shared/mock-db/seed'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from '@dairydirect/shared/ui/base'
import { ConfirmDialog } from '@dairydirect/shared/ui/overlays'
import { Field, Select } from '@dairydirect/shared/ui/form'
import { EmptyState, PageHeader, SearchInput } from '@dairydirect/shared/ui/misc'
import { DataTable, Pagination, type Column } from '@dairydirect/shared/ui/DataTable'
import { KpiCard } from '@dairydirect/shared/ui/KpiCard'
import { InitialAvatar } from '@dairydirect/shared/assets/avatars'
import { PayoutsScene } from '@dairydirect/shared/assets/scenes'
import { cn, fmtDateTime, fmtINR } from '@dairydirect/shared/lib/utils'
import type { CodDeposit, DepositOutcome } from '@dairydirect/shared/types'

const PAGE_SIZE = 6

// Shared STATUS_TONE has no outcome keys — render the same pill look locally so the
// three outcomes stay colour-coded (shared files must not be modified).
const OUTCOME_STYLE: Record<DepositOutcome, { cls: string; dot: string; label: string }> = {
  received: { cls: 'bg-success-soft text-success', dot: 'bg-success', label: 'Received' },
  pending_verification: { cls: 'bg-warning-soft text-amber-600 dark:text-warning', dot: 'bg-warning', label: 'Pending Verification' },
  discrepancy: { cls: 'bg-destructive-soft text-destructive', dot: 'bg-destructive', label: 'Discrepancy' },
}
function OutcomePill({ outcome }: { outcome: DepositOutcome }) {
  const s = OUTCOME_STYLE[outcome]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold', s.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} /> {s.label}
    </span>
  )
}

const OUTCOMES: Array<{ value: DepositOutcome; label: string; active: string }> = [
  { value: 'received', label: 'Received', active: 'border-success/50 bg-success-soft text-success' },
  { value: 'pending_verification', label: 'Pending Verification', active: 'border-warning/50 bg-warning-soft text-amber-600 dark:text-warning' },
  { value: 'discrepancy', label: 'Discrepancy', active: 'border-destructive/50 bg-destructive-soft text-destructive' },
]

export function StoreCodDeposits() {
  const storeId = useActiveStoreId()
  const stagger = useStagger()
  const cod = useCodActions()
  const db = useDB((s) => s.db)

  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search)
  const [page, setPage] = useState(1)

  const [riderId, setRiderId] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState(() => cod.suggestReference())
  const [outcome, setOutcome] = useState<DepositOutcome>('received')
  const [remarks, setRemarks] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const store = db.stores.find((s) => s.id === storeId) ?? null
  const riders = useMemo(() => db.riders.filter((r) => r.storeId === storeId && r.status === 'active'), [db.riders, storeId])
  const dash = useMemo(() => {
    const now = new Date(db.demoNow)
    const today = db.codDeposits.filter((d) => d.storeId === storeId && new Date(d.at).toDateString() === now.toDateString())
    return { total: today.reduce((a, d) => a + d.amount, 0), count: today.length }
  }, [db, storeId])

  const history = useCodDeposits(storeId, { search: debounced })
  const rows = history.data ?? []
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const parsedAmount = Number(amount)
  const refTrim = reference.trim().toUpperCase()
  const refTaken = refTrim.length > 0 && db.codDeposits.some((d) => d.id.toUpperCase() === refTrim || d.reference.toUpperCase() === refTrim)
  const amountInvalid = amount.trim() === '' || Number.isNaN(parsedAmount) || parsedAmount <= 0
  const rider = riders.find((r) => r.id === riderId) ?? null
  const valid = !!rider && !amountInvalid && refTrim.length > 0 && !refTaken

  const resetForm = () => {
    setRiderId(''); setAmount(''); setOutcome('received'); setRemarks(''); setReference(cod.suggestReference())
  }

  const record = () => {
    if (!valid || !storeId || !rider) return
    cod.record({
      id: refTrim,
      storeId,
      riderId: rider.id,
      riderName: rider.name,
      amount: Math.round(parsedAmount),
      reference: refTrim,
      outcome,
      remarks: remarks.trim() || undefined,
      at: DEMO_NOW.toISOString(),
    })
    setConfirmOpen(false)
    resetForm()
  }

  const columns: Column<CodDeposit>[] = [
    { key: 'id', header: 'Deposit ID', render: (d) => <span className="font-semibold tabular">{d.id}</span> },
    {
      key: 'rider', header: 'Rider',
      render: (d) => (
        <span className="flex items-center gap-2.5">
          <InitialAvatar name={d.riderName} size={28} />
          <span className="font-medium">{d.riderName}</span>
        </span>
      ),
    },
    { key: 'amount', header: 'Amount (₹)', align: 'right', render: (d) => <span className={cn('font-bold tabular', d.amount < 0 && 'text-destructive')}>{fmtINR(d.amount)}</span> },
    { key: 'at', header: 'Deposited At', render: (d) => <span className="whitespace-nowrap text-muted-foreground">{fmtDateTime(d.at)}</span> },
    { key: 'outcome', header: 'Outcome', render: (d) => <OutcomePill outcome={d.outcome} /> },
  ]

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
      <PageHeader
        breadcrumb={['COD Cash Deposits']}
        title="COD Cash"
        titleAccent="Deposits"
        subtitle="Record cash collected by riders and keep deposit references for reconciliation."
        illustration={<PayoutsScene />}
      />

      <motion.section variants={stagger.item} className="grid gap-4 sm:grid-cols-2 xl:max-w-2xl">
        <KpiCard label="Deposits Today" value={dash.total} format="compact" icon={Banknote} tint="green" />
        <KpiCard label="No. of Deposits" value={dash.count} icon={ClipboardList} tint="blue" />
      </motion.section>

      <motion.section variants={stagger.item} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ── Record deposit ── */}
        <Card hoverable className="lg:col-span-5">
          <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-4 w-4 text-brand-600" /> Record COD Cash Deposit</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Store" required>
              <Select
                value={storeId ?? ''}
                onValueChange={() => {}}
                disabled
                options={[{ value: storeId ?? '', label: `${store?.name ?? 'Store'} (${store?.code ?? ''})` }]}
              />
            </Field>

            <Field label="Rider" required error={!riderId && riders.length > 0 ? 'Pick the rider handing over cash' : undefined}>
              <Select
                value={riderId}
                onValueChange={setRiderId}
                placeholder="Active riders of this store…"
                options={riders.map((r) => ({ value: r.id, label: `${r.name} (${r.id})` }))}
              />
            </Field>

            <Field label="Deposit Amount (₹)" required error={amountInvalid && amount !== '' ? 'Amount must be greater than 0' : undefined}>
              <Input
                type="number" min={1} step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 4500"
                aria-label="Deposit amount"
              />
            </Field>

            <Field
              label="Deposit Reference"
              required
              error={refTaken ? 'This reference already exists — references must be unique' : undefined}
              hint={`Auto-suggested (DEP-YYYYMMDD-NN) — editable before recording.`}
            >
              <div className="flex items-center gap-2">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Deposit reference" className="tabular" />
                <Button variant="secondary" size="icon" aria-label="Re-suggest reference" onClick={() => setReference(cod.suggestReference())}>
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>
            </Field>

            <div>
              <Label required>Outcome</Label>
              <div role="radiogroup" aria-label="Deposit outcome" className="flex flex-wrap gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    role="radio"
                    aria-checked={outcome === o.value}
                    onClick={() => setOutcome(o.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-bold transition',
                      outcome === o.value ? o.active : 'border-border bg-card text-muted-foreground hover:border-brand-300',
                    )}
                  >
                    {o.value === 'received' && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {o.value === 'pending_verification' && <Clock className="h-3.5 w-3.5" />}
                    {o.value === 'discrepancy' && <ShieldAlert className="h-3.5 w-3.5" />}
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Remarks (Optional)">
              <Textarea
                value={remarks}
                maxLength={200}
                onChange={(e) => setRemarks(e.target.value.slice(0, 200))}
                placeholder="e.g. COD collection for 12 orders (ORD-78211 to ORD-78222)."
                aria-label="Deposit remarks"
              />
              <div className="mt-1 text-right text-[11px] tabular text-muted-foreground">{remarks.length} / 200</div>
            </Field>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={resetForm}><RefreshCcw className="h-4 w-4" /> Clear</Button>
              <Button disabled={!valid} onClick={() => setConfirmOpen(true)}>
                <CheckCircle2 className="h-4 w-4" /> Record Deposit
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Deposit history ── */}
        <Card hoverable className="lg:col-span-7">
          <CardHeader className="flex-wrap">
            <CardTitle>Deposit History ({rows.length})</CardTitle>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by rider, deposit ID or reference…" className="w-full sm:w-72" />
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              rows={pageRows}
              keyId={(d) => d.id}
              loading={history.isLoading}
              skeletonRows={6}
              empty={<EmptyState icon={Banknote} title="No deposits found" body="Recorded cash deposits will appear here for reconciliation." />}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              showing={`Showing ${rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, rows.length)} of ${rows.length} deposits`}
            />
          </CardContent>
        </Card>
      </motion.section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Record this deposit?"
        description={rider ? `${fmtINR(parsedAmount || 0)} from ${rider.name} · reference ${refTrim || '—'} · outcome ${OUTCOME_STYLE[outcome].label}.` : ''}
        confirmLabel="Record Deposit"
        onConfirm={record}
      />
    </motion.div>
  )
}
