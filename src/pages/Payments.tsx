// ── §7 Payments, refunds & wallets ──────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  BadgeIndianRupee, CheckCircle2, Clock, Download, Landmark, Loader2,
  MoreHorizontal, Paperclip, RefreshCcw, Search, SlidersHorizontal, Wallet, XCircle,
} from 'lucide-react'
import { cn, fmtCompactINR, fmtDateTime, fmtINR, fmtNum } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Badge, Button, Input, Textarea } from '@/components/ui/base'
import {
  Dialog, DialogContent, DropdownItem, DropdownMenu, DropdownMenuContent,
  DropdownMenuTrigger, Tooltip,
} from '@/components/ui/overlays'
import { Field, Select } from '@/components/ui/form'
import { EmptyState, PageHeader, SearchInput, TabPills } from '@/components/shared/misc'
import { StatusPill } from '@/components/shared/misc'
import { DataTable, Pagination, type Column } from '@/components/shared/DataTable'
import { KpiCard } from '@/components/shared/KpiCard'
import { FinanceScene } from '@/illustrations/scenes'
import { useDebouncedValue, useStagger } from '@/hooks/misc'
import { useFeature } from '@/hooks/flags'
import {
  useInvoiceFailures, useOrders, usePaymentAttempts, useReconciliation, useRefundList,
  useWalletLedger,
} from '@/hooks/queries'
import { usePaymentActions } from '@/hooks/mutations'
import { useDB } from '@/store/db'
import { useAuth } from '@/store/auth'
import { DEMO_NOW } from '@/data/seed'
import { isRefundEligible, orderRefundTotal } from '@/data/selectors'
import { listPaymentAttempts } from '@/data/api'
import { downloadCsv } from '@/services/exports'
import type { InvoiceFailure, PaymentAttempt, ReconciliationFinding, Refund, WalletEntryType } from '@/types'

const PAYMENT_TABS_BASE = [
  { value: 'payments', label: 'Payments' },
  { value: 'refunds', label: 'Refunds' },
]
const PAYMENT_TABS_TAIL = [
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'invoices', label: 'Invoice failures' },
]

const METHOD_BADGE: Record<PaymentAttempt['method'], { label: string; tone: 'blue' | 'violet' | 'amber' | 'green' }> = {
  online_upi: { label: 'UPI', tone: 'blue' },
  online_card: { label: 'Card', tone: 'violet' },
  online_netbanking: { label: 'Net banking', tone: 'amber' },
  wallet: { label: 'Wallet', tone: 'green' },
}
const SOURCE_TONE: Record<Refund['source'], 'blue' | 'violet' | 'neutral' | 'amber'> = {
  admin: 'blue', support: 'violet', system: 'neutral', customer: 'amber',
}
const WALLET_TONE: Record<WalletEntryType, { label: string; tone: 'green' | 'blue' | 'violet' | 'amber' }> = {
  topup: { label: 'Top-up', tone: 'green' },
  order_payment: { label: 'Order payment', tone: 'blue' },
  refund_credit: { label: 'Refund credit', tone: 'violet' },
  adjustment: { label: 'Adjustment', tone: 'amber' },
}
const RECON_KIND: Record<string, { label: string; tone: 'red' | 'amber' | 'blue' }> = {
  mismatch: { label: 'Mismatch', tone: 'red' },
  unresolved_payment: { label: 'Unresolved payment', tone: 'amber' },
  missing_payout: { label: 'Missing payout', tone: 'blue' },
}
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtINR(Math.abs(n))}`

/* ── shared local bits ──────────────────────────────────────── */
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

function NoteDialog({
  title, description, confirmLabel = 'Confirm', required = false, onClose, onSubmit,
}: {
  title: string
  description: string
  confirmLabel?: string
  required?: boolean
  onClose: () => void
  onSubmit: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const ready = required ? note.trim().length >= 3 : true
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={title} description={description}>
        <Field label="Note" required={required}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={required ? 'Describe why…' : 'Optional note — recorded with the finding…'} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" disabled={!ready} onClick={() => { onSubmit(note.trim()); onClose() }}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── PAYMENTS tab ───────────────────────────────────────────── */
function PaymentsTab() {
  const db = useDB((s) => s.db)
  const [search, setSearch] = useState('')
  const debSearch = useDebouncedValue(search)
  const [status, setStatus] = useState('all')
  const [method, setMethod] = useState('all')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { setPage(1) }, [debSearch, status, method])

  const query = usePaymentAttempts({
    search: debSearch || undefined,
    status,
    method: method === 'all' ? undefined : `online_${method}`,
    page,
    pageSize: 8,
  })

  // KPIs computed from the live dataset (not the paged slice)
  const captured = db.paymentAttempts.filter((p) => p.status === 'captured')
  const capturedValue = captured.reduce((a, p) => a + p.amount, 0)
  const failedCount = db.paymentAttempts.filter((p) => p.status === 'failed').length

  const exportCsv = async () => {
    setExporting(true)
    try {
      const { rows } = await listPaymentAttempts({
        search: debSearch || undefined,
        status,
        method: method === 'all' ? undefined : `online_${method}`,
        page: 1,
        pageSize: 1000000,
      })
      await downloadCsv(
        rows.map((r) => ({
          txn: r.id, order: r.orderId, attempt: r.attemptNo, method: r.method, amount: r.amount,
          status: r.status, gateway: r.gateway, gatewayRef: r.gatewayRef ?? '', failureReason: r.failureReason ?? '', at: r.at,
        })),
        `payments-${DEMO_NOW.toISOString().slice(0, 10)}.csv`,
      )
      toast.success(`Exported ${rows.length} payment rows`)
    } finally {
      setExporting(false)
    }
  }

  const cols: Array<Column<PaymentAttempt>> = [
    { key: 'id', header: 'Txn', render: (r) => <span className="font-mono text-xs font-semibold">{r.id}</span> },
    {
      key: 'orderId', header: 'Order',
      render: (r) => (
        <Link className="font-semibold text-brand-700 hover:underline dark:text-brand-300" to={`/orders/${r.orderId}`}>#{r.orderId}</Link>
      ),
    },
    { key: 'method', header: 'Method', render: (r) => <Badge tone={METHOD_BADGE[r.method].tone}>{METHOD_BADGE[r.method].label}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="font-semibold tabular">{fmtINR(r.amount)}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'captured'} /> },
    {
      key: 'gateway', header: 'Gateway',
      render: (r) => (
        <div className="text-xs">
          <p className="font-medium">{r.gateway}</p>
          <p className="text-muted-foreground">{r.gatewayRef ?? '—'}</p>
        </div>
      ),
    },
    { key: 'at', header: 'When', render: (r) => <span className="tabular text-muted-foreground">{fmtDateTime(r.at)}</span> },
    {
      key: 'failureReason', header: 'Failure reason',
      render: (r) => (r.status === 'failed' && r.failureReason
        ? <span className="text-xs font-medium text-destructive">{r.failureReason}</span>
        : <span className="text-muted-foreground">—</span>),
    },
  ]

  const total = query.data?.total ?? 0
  const totalPages = Math.ceil(total / 8)
  const start = total === 0 ? 0 : (page - 1) * 8 + 1

  return (
    <motion.div variants={{}} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Captured payments" value={captured.length} format="num" icon={CheckCircle2} tint="green" />
        <KpiCard label="Failed attempts" value={failedCount} format="num" icon={XCircle} tint="red" />
        <KpiCard label="Captured value" value={capturedValue} format="compact" icon={Landmark} tint="blue" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput className="w-full sm:w-72" value={search} onChange={setSearch} placeholder="Search order id, txn id or gateway ref…" />
        <Select
          className="w-40"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'captured', label: 'Captured' },
            { value: 'failed', label: 'Failed' },
            { value: 'initiated', label: 'Initiated' },
          ]}
        />
        <Select
          className="w-40"
          value={method}
          onValueChange={setMethod}
          options={[
            { value: 'all', label: 'All methods' },
            { value: 'upi', label: 'UPI' },
            { value: 'card', label: 'Card' },
            { value: 'netbanking', label: 'Net banking' },
          ]}
        />
        <div className="ml-auto">
          <Button variant="secondary" size="md" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
          </Button>
        </div>
      </div>
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={query.data?.rows ?? []}
          keyId={(r) => r.id}
          loading={query.isLoading}
          skeletonRows={6}
          empty={<EmptyState title="No payment attempts match" body="Try a different search, status or method filter." />}
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
    </motion.div>
  )
}

/* ── Request refund dialog (admin) ──────────────────────────── */
function RequestRefundDialog({ onClose }: { onClose: () => void }) {
  const db = useDB((s) => s.db)
  const paymentActions = usePaymentActions()
  const ordersQuery = useOrders({ page: 1, pageSize: 100000 })

  const eligibleOrders = useMemo(
    () => (ordersQuery.data?.rows ?? []).filter((r) => r.order.status === 'delivered' && isRefundEligible(db, r.order.id).eligible),
    [ordersQuery.data, db],
  )

  const schema = z.object({
    orderId: z.string().min(1, 'Choose an order'),
    amount: z.coerce.number().positive('Enter an amount above zero'),
    reason: z.string().min(3, 'Reason is required'),
  }).superRefine((v, ctx) => {
    if (!v.orderId) return
    const order = db.orders.find((o) => o.id === v.orderId)
    if (!order) return
    const max = order.amount - orderRefundTotal(db, order.id)
    if (v.amount > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: `Max refundable is ${fmtINR(max)}` })
    }
  })

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { orderId: '', amount: 0, reason: '' },
  })
  const orderId = watch('orderId')
  const selected = eligibleOrders.find((r) => r.order.id === orderId)

  const submit = handleSubmit((v) => {
    paymentActions.requestRefund(v.orderId, Math.round(v.amount), v.reason.trim(), 'admin')
    onClose()
  })

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title="Request refund" description="Creates a refund request — it lands in the Refunds tab with status 'Requested'.">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <Field label="Order" required error={errors.orderId?.message}>
            <Select
              value={orderId || 'choose'}
              onValueChange={(v) => setValue('orderId', v === 'choose' ? '' : v, { shouldValidate: true })}
              placeholder="Choose a delivered, non-refunded order…"
              options={[
                { value: 'choose', label: 'Choose an order…' },
                ...eligibleOrders.map((r) => ({
                  value: r.order.id,
                  label: `#${r.order.id} — ${fmtINR(r.order.amount)} (${r.order.customerName})`,
                })),
              ]}
            />
          </Field>
          <Field
            label="Amount" required error={errors.amount?.message}
            hint={selected ? `Order ${fmtINR(selected.order.amount)} · already refunded ${fmtINR(orderRefundTotal(db, selected.order.id))} · max ${fmtINR(selected.order.amount - orderRefundTotal(db, selected.order.id))}` : undefined}
          >
            <Input type="number" min={1} {...register('amount')} placeholder="e.g. 120" />
          </Field>
          <Field label="Reason" required error={errors.reason?.message}>
            <Textarea {...register('reason')} placeholder="Why is this refund being requested?" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="md">Request refund</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Record evidence dialog ─────────────────────────────────── */
function EvidenceDialog({ refund, onClose }: { refund: Refund; onClose: () => void }) {
  const paymentActions = usePaymentActions()
  const [reference, setReference] = useState('')
  const [fileName, setFileName] = useState('')
  const valid = reference.trim().length >= 2 && fileName.trim().length >= 2
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={`Record manual evidence — ${refund.id}`} description="Attach the bank/UPI reference and proof file for this manual refund.">
        <div className="space-y-3">
          <Field label="Payment reference" required>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI/NDTL/482910" />
          </Field>
          <Field label="Evidence file name" required>
            <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="e.g. refund-proof.pdf" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary" size="md" disabled={!valid}
              onClick={() => { paymentActions.recordRefundEvidence(refund.id, reference.trim(), fileName.trim()); onClose() }}
            >
              <Paperclip className="h-4 w-4" /> Save evidence
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── REFUNDS tab ────────────────────────────────────────────── */
function RefundsTab({ initialStatus }: { initialStatus?: string }) {
  const db = useDB((s) => s.db)
  const paymentActions = usePaymentActions()
  const [search, setSearch] = useState('')
  const debSearch = useDebouncedValue(search)
  const [status, setStatus] = useState(
    ['requested', 'processing', 'paid', 'failed'].includes(initialStatus ?? '') ? initialStatus! : 'all',
  )
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [debSearch, status])

  const query = useRefundList({ search: debSearch || undefined, status, page, pageSize: 8 })

  // KPIs — statuses EXACTLY as returned; never "Paid" for requested rows
  const requestedCount = db.refunds.filter((r) => r.status === 'requested').length
  const processingCount = db.refunds.filter((r) => r.status === 'processing').length
  const paidSum = db.refunds.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amount, 0)

  const [evidenceTarget, setEvidenceTarget] = useState<Refund | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [failTarget, setFailTarget] = useState<Refund | null>(null)

  const cols: Array<Column<Refund>> = [
    { key: 'id', header: 'Refund id', render: (r) => <span className="font-mono text-xs font-semibold">{r.id}</span> },
    {
      key: 'orderId', header: 'Order',
      render: (r) => <Link className="font-semibold text-brand-700 hover:underline dark:text-brand-300" to={`/orders/${r.orderId}`}>#{r.orderId}</Link>,
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="font-semibold tabular">{fmtINR(r.amount)}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'requested'} /> },
    { key: 'source', header: 'Source', render: (r) => <Badge tone={SOURCE_TONE[r.source]} className="capitalize">{r.source}</Badge> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-[220px] text-xs text-muted-foreground">{r.reason}</span> },
    { key: 'createdAt', header: 'Created', render: (r) => <span className="tabular text-muted-foreground">{fmtDateTime(r.createdAt)}</span> },
    { key: 'paidAt', header: 'Paid at', render: (r) => (r.paidAt ? <span className="tabular">{fmtDateTime(r.paidAt)}</span> : <span className="text-muted-foreground">—</span>) },
    {
      key: 'evidence', header: 'Evidence',
      render: (r) => {
        if (r.evidence) {
          return (
            <Badge tone="green" className="max-w-[150px] gap-1">
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{r.evidence.fileName}</span>
            </Badge>
          )
        }
        if (r.status === 'requested' || r.status === 'processing') {
          return (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEvidenceTarget(r) }}>
              <Paperclip className="h-3.5 w-3.5" /> Record evidence
            </Button>
          )
        }
        return <span className="text-muted-foreground">—</span>
      },
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <RowActions>
          <DropdownItem disabled={r.status !== 'requested'} onSelect={() => paymentActions.updateRefundStatus(r.id, 'processing')}>
            <Loader2 className="h-3.5 w-3.5" /> Mark processing
          </DropdownItem>
          <DropdownItem disabled={r.status !== 'requested' && r.status !== 'processing'} onSelect={() => paymentActions.updateRefundStatus(r.id, 'paid')}>
            <BadgeIndianRupee className="h-3.5 w-3.5" /> Mark paid
          </DropdownItem>
          <DropdownItem danger disabled={r.status !== 'requested' && r.status !== 'processing'} onSelect={() => setFailTarget(r)}>
            <XCircle className="h-3.5 w-3.5" /> Mark failed…
          </DropdownItem>
          <DropdownItem onSelect={() => setEvidenceTarget(r)}>
            <Paperclip className="h-3.5 w-3.5" /> Record manual evidence
          </DropdownItem>
        </RowActions>
      ),
    },
  ]

  const total = query.data?.total ?? 0
  const totalPages = Math.ceil(total / 8)
  const start = total === 0 ? 0 : (page - 1) * 8 + 1

  return (
    <motion.div variants={{}} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Requested" value={requestedCount} format="num" icon={Clock} tint="amber" />
        <KpiCard label="Processing" value={processingCount} format="num" icon={Loader2} tint="blue" />
        <KpiCard label="Paid" value={paidSum} format="compact" icon={BadgeIndianRupee} tint="green" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput className="w-full sm:w-72" value={search} onChange={setSearch} placeholder="Search order id or reason…" />
        <Select
          className="w-40"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'requested', label: 'Requested' },
            { value: 'processing', label: 'Processing' },
            { value: 'paid', label: 'Paid' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
        <div className="ml-auto">
          <Button variant="primary" size="md" onClick={() => setRequestOpen(true)}>Request refund</Button>
        </div>
      </div>
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={query.data?.rows ?? []}
          keyId={(r) => r.id}
          loading={query.isLoading}
          onRowClick={(r) => { if (r.status === 'requested' || r.status === 'processing') setEvidenceTarget(r) }}
          skeletonRows={6}
          empty={<EmptyState title="No refunds match" body="Try a different search or status filter." />}
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

      {requestOpen && <RequestRefundDialog onClose={() => setRequestOpen(false)} />}
      {evidenceTarget && <EvidenceDialog refund={evidenceTarget} onClose={() => setEvidenceTarget(null)} />}
      {failTarget && (
        <NoteDialog
          title={`Mark ${failTarget.id} failed`}
          description="Use this when the gateway refund failed permanently."
          confirmLabel="Mark failed"
          required
          onClose={() => setFailTarget(null)}
          onSubmit={(note) => { paymentActions.updateRefundStatus(failTarget.id, 'failed'); if (note) toast.info(`Failed note: ${note}`) }}
        />
      )}
    </motion.div>
  )
}

/* ── WALLET LEDGER tab (flag-gated) ─────────────────────────── */
function WalletTab() {
  const db = useDB((s) => s.db)
  const user = useAuth((s) => s.user)
  const paymentActions = usePaymentActions()
  const [search, setSearch] = useState('')
  const debSearch = useDebouncedValue(search)
  const [type, setType] = useState('all')
  const [page, setPage] = useState(1)
  const [adjustOpen, setAdjustOpen] = useState(false)
  useEffect(() => { setPage(1) }, [debSearch, type])

  const query = useWalletLedger({ search: debSearch || undefined, type, page, pageSize: 10 })
  const topupsSum = db.walletLedger.filter((e) => e.type === 'topup').reduce((a, e) => a + e.amount, 0)
  const adjustmentsCount = db.walletLedger.filter((e) => e.type === 'adjustment').length

  const cols: Array<Column<(typeof db.walletLedger)[number]>> = [
    { key: 'id', header: 'Entry', render: (r) => <span className="font-mono text-xs font-semibold">{r.id}</span> },
    { key: 'customerName', header: 'Customer', render: (r) => <span className="font-medium">{r.customerName}</span> },
    { key: 'type', header: 'Type', render: (r) => <Badge tone={WALLET_TONE[r.type].tone}>{WALLET_TONE[r.type].label}</Badge> },
    {
      key: 'amount', header: 'Amount', align: 'right',
      render: (r) => (
        <span className={cn('font-bold tabular', r.amount >= 0 ? 'text-success' : 'text-destructive')}>{signed(r.amount)}</span>
      ),
    },
    { key: 'balanceAfter', header: 'Balance after', align: 'right', render: (r) => <span className="tabular">{fmtINR(r.balanceAfter)}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-[220px] text-xs text-muted-foreground">{r.reason}</span> },
    { key: 'authorizedBy', header: 'Authorized by', render: (r) => (r.type === 'adjustment' && r.authorizedBy ? <span className="font-medium">{r.authorizedBy}</span> : <span className="text-muted-foreground">—</span>) },
    { key: 'at', header: 'When', render: (r) => <span className="tabular text-muted-foreground">{fmtDateTime(r.at)}</span> },
  ]

  const total = query.data?.total ?? 0
  const totalPages = Math.ceil(total / 10)
  const start = total === 0 ? 0 : (page - 1) * 10 + 1

  return (
    <motion.div variants={{}} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label="Top-ups" value={topupsSum} format="compact" icon={Wallet} tint="green" />
        <KpiCard label="Authorized adjustments" value={adjustmentsCount} format="num" icon={SlidersHorizontal} tint="amber" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput className="w-full sm:w-72" value={search} onChange={setSearch} placeholder="Search customer, reason or entry id…" />
        <Select
          className="w-44"
          value={type}
          onValueChange={setType}
          options={[
            { value: 'all', label: 'All types' },
            { value: 'topup', label: 'Top-up' },
            { value: 'order_payment', label: 'Order payment' },
            { value: 'refund_credit', label: 'Refund credit' },
            { value: 'adjustment', label: 'Adjustment' },
          ]}
        />
        <div className="ml-auto">
          <Button variant="primary" size="md" onClick={() => setAdjustOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" /> Authorized adjustment
          </Button>
        </div>
      </div>
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={query.data?.rows ?? []}
          keyId={(r) => r.id}
          loading={query.isLoading}
          skeletonRows={8}
          empty={<EmptyState title="No wallet entries match" body="Try a different search or type filter." />}
          footer={
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              showing={total > 0 ? `Showing ${start}–${Math.min(page * 10, total)} of ${fmtNum(total)}` : 'No results'}
            />
          }
        />
      </div>
      {adjustOpen && <WalletAdjustDialog onClose={() => setAdjustOpen(false)} />}
    </motion.div>
  )
}

/* ── Authorized adjustment dialog ───────────────────────────── */
function WalletAdjustDialog({ onClose }: { onClose: () => void }) {
  const db = useDB((s) => s.db)
  const user = useAuth((s) => s.user)
  const paymentActions = usePaymentActions()
  const [customerId, setCustomerId] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [reason, setReason] = useState('')

  const amount = Number(amountRaw)
  const customer = db.customers.find((c) => c.id === customerId)
  const valid = !!customer && Number.isFinite(amount) && amount !== 0 && reason.trim().length >= 5
  const balance = customer ? db.meta.walletBalances[customer.id] ?? 0 : 0

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title="Authorized wallet adjustment" description="Credit or debit a customer wallet. Every adjustment is recorded against your name.">
        <div className="space-y-3">
          <Field label="Customer" required>
            <Select
              value={customerId || 'choose'}
              onValueChange={(v) => setCustomerId(v === 'choose' ? '' : v)}
              placeholder="Choose a customer…"
              options={[{ value: 'choose', label: 'Choose a customer…' }, ...db.customers.map((c) => ({ value: c.id, label: `${c.name} · ${c.id}` }))]}
            />
          </Field>
          <Field label="Amount (negative to debit)" required hint={customer ? `Current balance: ${fmtINR(balance)} → new balance ${fmtINR(balance + (Number.isFinite(amount) ? amount : 0))}` : undefined}>
            <Input type="number" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} placeholder="e.g. 100 or -50" />
          </Field>
          <Field label="Reason" required error={reason.trim().length > 0 && reason.trim().length < 5 ? 'Reason must be at least 5 characters' : undefined}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goodwill credit — late delivery" />
          </Field>
          <p className="rounded-lg bg-primary-softer px-3 py-2 text-[11.5px] font-medium text-brand-700 dark:text-brand-300">
            Authorized admin action; reason recorded.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary" size="md" disabled={!valid}
              onClick={() => {
                if (!customer || !Number.isFinite(amount)) return
                paymentActions.walletAdjust({
                  id: `WL${Date.now()}`,
                  customerId: customer.id,
                  customerName: customer.name,
                  type: 'adjustment',
                  amount,
                  balanceAfter: (db.meta.walletBalances[customer.id] ?? 0) + amount,
                  reason: reason.trim(),
                  at: DEMO_NOW.toISOString(),
                  authorizedBy: user?.name,
                })
                onClose()
              }}
            >
              Apply adjustment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── RECONCILIATION tab ─────────────────────────────────────── */
function ReconciliationTab({ intro = true }: { intro?: boolean }) {
  const paymentActions = usePaymentActions()
  const query = useReconciliation()
  const [noteTarget, setNoteTarget] = useState<null | { id: string; kind: 'investigating' | 'resolved' }>(null)

  const cols: Array<Column<ReconciliationFinding>> = [
    { key: 'id', header: 'Finding', render: (r) => <span className="font-mono text-xs font-semibold">{r.id}</span> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge tone={RECON_KIND[r.kind]?.tone ?? 'neutral'}>{RECON_KIND[r.kind]?.label ?? r.kind}</Badge> },
    { key: 'ref', header: 'Ref', render: (r) => <span className="font-medium">{r.ref}</span> },
    { key: 'summary', header: 'Summary', render: (r) => <span className="line-clamp-2 max-w-[260px] text-xs text-muted-foreground">{r.summary}</span> },
    {
      key: 'expected', header: 'Expected vs Actual',
      render: (r) => (
        <span className="tabular text-[13px] font-semibold">
          {fmtINR(r.expected)} <span className="text-muted-foreground">vs</span> {fmtINR(r.actual)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'open'} /> },
    { key: 'at', header: 'When', render: (r) => <span className="tabular text-muted-foreground">{fmtDateTime(r.at)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <RowActions>
          <DropdownItem disabled={r.status !== 'open'} onSelect={() => paymentActions.setReconciliationStatus(r.id, 'investigating')}>
            <Search className="h-3.5 w-3.5" /> Mark investigating
          </DropdownItem>
          <DropdownItem disabled={r.status === 'resolved'} onSelect={() => setNoteTarget({ id: r.id, kind: 'resolved' })}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved…
          </DropdownItem>
        </RowActions>
      ),
    },
  ]

  const rows = query.data ?? []
  return (
    <motion.div variants={{}} className="space-y-4">
      {intro && (
        <p className="text-[13px] text-muted-foreground">
          Gateway settlements, payouts and wallet remittances are matched daily — open findings block clean settlement.
        </p>
      )}
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={rows}
          keyId={(r) => r.id}
          loading={query.isLoading}
          skeletonRows={5}
          empty={<EmptyState title="No reconciliation findings" body="Everything is matched — nothing to review." />}
        />
      </div>
      {noteTarget && (
        <NoteDialog
          title="Resolve finding"
          description="An optional note is stored with the resolution."
          confirmLabel="Mark resolved"
          onClose={() => setNoteTarget(null)}
          onSubmit={(note) => paymentActions.setReconciliationStatus(noteTarget.id, 'resolved', note || undefined)}
        />
      )}
    </motion.div>
  )
}

/* ── INVOICE FAILURES tab ───────────────────────────────────── */
function InvoicesTab() {
  const paymentActions = usePaymentActions()
  const query = useInvoiceFailures()

  const cols: Array<Column<InvoiceFailure>> = [
    { key: 'invoiceId', header: 'Invoice', render: (r) => <span className="font-mono text-xs font-semibold">{r.invoiceId}</span> },
    { key: 'orderId', header: 'Order', render: (r) => <span className="font-semibold">#{r.orderId}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-[260px] text-xs text-muted-foreground">{r.reason}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'rendering'} /> },
    {
      key: 'causeFixed', header: 'Cause fixed',
      render: (r) => (r.causeFixed ? <Badge tone="green">Yes</Badge> : <Badge tone="red">No</Badge>),
    },
    { key: 'at', header: 'When', render: (r) => <span className="tabular text-muted-foreground">{fmtDateTime(r.at)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => {
        const btn = (
          <Button
            variant="outline" size="sm" disabled={!r.causeFixed}
            onClick={() => paymentActions.retryInvoice(r.id)}
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        )
        return r.causeFixed ? btn : (
          <Tooltip content="Fix the cause first — see reason"><span>{btn}</span></Tooltip>
        )
      },
    },
  ]

  return (
    <motion.div variants={{}} className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Invoices that failed to render are suspended here. Retry is enabled only once the underlying cause is fixed.
      </p>
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={query.data ?? []}
          keyId={(r) => r.id}
          loading={query.isLoading}
          skeletonRows={4}
          empty={<EmptyState title="No invoice failures" body="All invoices rendered successfully." />}
        />
      </div>
    </motion.div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
export function Payments() {
  const stagger = useStagger()
  const walletsOn = useFeature('wallets')
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = useMemo(
    () => [...PAYMENT_TABS_BASE, ...(walletsOn ? [{ value: 'wallets', label: 'Wallet ledger' }] : []), ...PAYMENT_TABS_TAIL],
    [walletsOn],
  )
  const tabParam = searchParams.get('tab') ?? 'payments'
  const tab = tabs.some((t) => t.value === tabParam) ? tabParam : 'payments'
  const statusParam = searchParams.get('status') ?? undefined

  const switchTab = (v: string) => {
    const sp = new URLSearchParams(searchParams)
    sp.set('tab', v)
    setSearchParams(sp, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments, refunds"
        titleAccent="& wallets"
        breadcrumb={['Payments']}
        subtitle="Gateway attempts, refund requests, wallet ledger and reconciliation — COD is collected by riders and lives in Payouts."
        illustration={<FinanceScene />}
      />
      <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
        <motion.section variants={stagger.item}>
          <TabPills id="payments-tabs" tabs={tabs} value={tab} onChange={switchTab} />
        </motion.section>
        <motion.section variants={stagger.item} key={tab}>
          {tab === 'payments' && <PaymentsTab />}
          {tab === 'refunds' && <RefundsTab initialStatus={statusParam} />}
          {tab === 'wallets' && walletsOn && <WalletTab />}
          {tab === 'reconciliation' && <ReconciliationTab />}
          {tab === 'invoices' && <InvoicesTab />}
        </motion.section>
      </motion.div>
    </div>
  )
}
