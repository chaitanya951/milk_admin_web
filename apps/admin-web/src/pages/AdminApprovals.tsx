// ── §13 Approvals & compliance ──────────────────────────────────────────────
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckCircle2, CircleSlash, ExternalLink, FileWarning, MoreHorizontal, PauseCircle,
  ShieldAlert, ShieldCheck, Trash2,
} from 'lucide-react'
import { cn, fmtDate, fmtDateTime, fmtINR } from '@dairydirect/shared/lib/utils'
import { Badge, Button, Input } from '@dairydirect/shared/ui/base'
import {
  Dialog, DialogContent, DropdownItem, DropdownMenu, DropdownMenuContent,
  DropdownMenuTrigger,
} from '@dairydirect/shared/ui/overlays'
import { Field, Select } from '@dairydirect/shared/ui/form'
import { EmptyState, PageHeader, SearchInput, TabPills } from '@dairydirect/shared/ui/misc'
import { StatusPill } from '@dairydirect/shared/ui/misc'
import { DataTable, type Column } from '@dairydirect/shared/ui/DataTable'
import { KpiCard } from '@dairydirect/shared/ui/KpiCard'
import { ApprovalCard, SectionCard } from '@dairydirect/shared/ui/domain'
import { ApprovalsScene } from '@dairydirect/shared/assets/scenes'
import { useDebouncedValue, useStagger } from '@dairydirect/shared/hooks/misc'
import {
  useApprovals, useErasureRequests, useFraudFindings, useLegalHolds, useReconciliation,
} from '@/api/queries'
import { useApprovalActions } from '@/api/mutations'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { DEMO_NOW } from '@dairydirect/shared/mock-db/seed'
import type { Approval, ErasureRequest, FraudFinding, LegalHold, ReconciliationFinding } from '@dairydirect/shared/types'

const APPROVAL_TABS = [
  { value: 'queue', label: 'Approvals queue' },
  { value: 'fraud', label: 'Fraud findings' },
  { value: 'erasure', label: 'Data erasure & legal holds' },
]
const FRAUD_KIND: Record<FraudFinding['kind'], { label: string; tone: 'red' | 'amber' | 'violet' | 'blue' }> = {
  account_takeover: { label: 'Account takeover', tone: 'red' },
  refund_abuse: { label: 'Refund abuse', tone: 'amber' },
  promo_abuse: { label: 'Promo abuse', tone: 'violet' },
  cod_shortfall: { label: 'COD shortfall', tone: 'blue' },
}
const RECON_KIND: Record<ReconciliationFinding['kind'], string> = {
  mismatch: 'Mismatch', unresolved_payment: 'Unresolved payment', missing_payout: 'Missing payout',
}

/* ── Build applyChanges from record fields (variant SKU / name matching) ── */
function buildApplyChanges(db: ReturnType<typeof useDB.getState>['db'], approval: Approval):
  | { variantId?: string; newPrice?: number; publish?: boolean; workforceId?: string; newRole?: string }
  | undefined {
  if (approval.targetType === 'variant_price') {
    const sku = approval.targetLabel.match(/\(([^)]+)\)/)?.[1]
    const variant = sku ? db.variants.find((v) => v.sku === sku) : undefined
    const newPrice = Number((approval.details.match(/→\s*₹\s*([\d,]+)/) ?? [])[1]?.replace(/,/g, ''))
    if (variant && Number.isFinite(newPrice)) return { variantId: variant.id, newPrice }
    return undefined
  }
  if (approval.targetType === 'product_publish') {
    const sku = approval.targetLabel.match(/\(([^)]+)\)/)?.[1]
    let variant = sku ? db.variants.find((v) => v.sku === sku) : undefined
    if (!variant) {
      const productName = approval.targetLabel.split('–')[0]?.trim().toLowerCase()
      const variantLabel = approval.targetLabel.split('–')[1]?.trim().toLowerCase()
      const product = db.products.find((p) => p.name.toLowerCase() === productName)
      variant = db.variants.find((v) => product
        && v.productId === product.id
        && (!variantLabel || v.label.toLowerCase() === variantLabel))
        ?? db.variants.find((v) => v.productId === product?.id)
    }
    return variant ? { publish: true, variantId: variant.id } : undefined
  }
  if (approval.targetType === 'workforce_role') {
    const name = approval.targetLabel.replace(/\(.*\)/, '').trim().toLowerCase()
    const member = db.workforce.find((w) => w.name.toLowerCase() === name)
    return member ? { workforceId: member.id, newRole: 'admin' } : undefined
  }
  // refund_override / coupon_config / business_rule — decision only, no catalog change
  return undefined
}

/* ── QUEUE tab ──────────────────────────────────────────────── */
function QueueTab({ statusParam }: { statusParam?: string }) {
  const db = useDB((s) => s.db)
  const approvalActions = useApprovalActions()
  const [search, setSearch] = useState('')
  const debSearch = useDebouncedValue(search)
  const [status, setStatus] = useState(['pending', 'completed', 'rejected', 'expired'].includes(statusParam ?? '') ? statusParam! : 'all')

  const query = useApprovals({ status, search: debSearch || undefined })
  const rows = query.data ?? []

  const decide = (approval: Approval, decision: 'completed' | 'rejected') => {
    approvalActions.decide(approval.id, decision, decision === 'completed' ? buildApplyChanges(db, approval) : undefined)
  }

  return (
    <motion.div variants={{}} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput className="w-full sm:w-72" value={search} onChange={setSearch} placeholder="Search action, target or requester…" />
        <Select
          className="w-44"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'pending', label: 'Pending' },
            { value: 'completed', label: 'Completed' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'expired', label: 'Expired' },
          ]}
        />
      </div>
      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-44 rounded-card" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No approvals match" body="Try a different search or status filter." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecide={(id, decision) => {
              const approval = rows.find((x) => x.id === id)
              if (approval) decide(approval, decision)
            }} />
          ))}
        </div>
      )}
    </motion.div>
  )
}

/* ── FRAUD tab ──────────────────────────────────────────────── */
function FraudTab() {
  const db = useDB((s) => s.db)
  const approvalActions = useApprovalActions()
  const fraudQuery = useFraudFindings()
  const reconQuery = useReconciliation()

  const cols: Array<Column<FraudFinding>> = [
    { key: 'id', header: 'Finding', render: (r) => <span className="font-mono text-xs font-semibold">{r.id}</span> },
    { key: 'ref', header: 'Ref', render: (r) => <span className="font-medium">{r.ref}</span> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge tone={FRAUD_KIND[r.kind].tone}>{FRAUD_KIND[r.kind].label}</Badge> },
    {
      key: 'riskLevel', header: 'Risk',
      render: (r) => (
        <Badge tone={r.riskLevel === 'high' ? 'red' : r.riskLevel === 'medium' ? 'amber' : 'neutral'} className="capitalize">
          {r.riskLevel} risk
        </Badge>
      ),
    },
    { key: 'summary', header: 'Summary', render: (r) => <span className="line-clamp-2 max-w-[280px] text-xs text-muted-foreground">{r.summary}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status === 'confirmed' ? 'confirmed' : r.status} dot={r.status === 'open'} /> },
    { key: 'at', header: 'When', render: (r) => <span className="tabular text-muted-foreground">{fmtDateTime(r.at)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownItem disabled={r.status === 'cleared'} onSelect={() => approvalActions.setFraudStatus(r.id, 'cleared')}>
              <CircleSlash className="h-3.5 w-3.5" /> Mark cleared
            </DropdownItem>
            <DropdownItem danger disabled={r.status === 'confirmed'} onSelect={() => approvalActions.setFraudStatus(r.id, 'confirmed')}>
              <ShieldAlert className="h-3.5 w-3.5" /> Mark confirmed
            </DropdownItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const recon = reconQuery.data ?? []
  return (
    <motion.div variants={{}} className="space-y-5">
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={fraudQuery.data ?? []}
          keyId={(r) => r.id}
          loading={fraudQuery.isLoading}
          skeletonRows={5}
          empty={<EmptyState icon={ShieldAlert} title="No fraud findings" body="Suspicious patterns will be flagged here." />}
        />
      </div>
      <SectionCard
        title="Payment reconciliation findings"
        subtitle="Read-only here — investigate and resolve in Payments."
        action={
          <Button variant="outline" size="sm">
            <Link to="/payments?tab=reconciliation" className="inline-flex items-center gap-1.5">Open in Payments <ExternalLink className="h-3.5 w-3.5" /></Link>
          </Button>
        }
      >
        {recon.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No reconciliation findings.</p>
        ) : (
          <ul className="space-y-2">
            {recon.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 px-4 py-3 text-[13px]">
                <span className="font-mono text-xs font-semibold">{f.id}</span>
                <Badge tone={f.kind === 'mismatch' ? 'red' : f.kind === 'unresolved_payment' ? 'amber' : 'blue'}>{RECON_KIND[f.kind]}</Badge>
                <span className="font-medium">{f.ref}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.summary}</span>
                <span className="tabular text-xs font-semibold">{fmtINR(f.expected)} vs {fmtINR(f.actual)}</span>
                <StatusPill status={f.status} dot={f.status === 'open'} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </motion.div>
  )
}

/* ── DATA ERASURE & LEGAL HOLDS tab ─────────────────────────── */
function ErasureHoldsTab() {
  const db = useDB((s) => s.db)
  const approvalActions = useApprovalActions()
  const erasureQuery = useErasureRequests()
  const holdsQuery = useLegalHolds()

  const [noteTarget, setNoteTarget] = useState<null | { erasure: ErasureRequest; kind: 'complete' | 'reject' }>(null)
  const [placeOpen, setPlaceOpen] = useState(false)

  const erasureCols: Array<Column<ErasureRequest>> = [
    { key: 'customerName', header: 'Customer', render: (r) => <span className="font-semibold">{r.customerName}</span> },
    { key: 'requestedAt', header: 'Requested', render: (r) => fmtDate(r.requestedAt) },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'pending'} /> },
    {
      key: 'eligible', header: 'Eligible',
      render: (r) => r.eligible ? <Badge tone="green">Yes</Badge> : (
        <Tooltipish content={r.ineligibleReason ?? 'Not eligible'}>
          <span><Badge tone="red">No</Badge></span>
        </Tooltipish>
      ),
    },
    { key: 'note', header: 'Note', render: (r) => <span className="line-clamp-2 max-w-[220px] text-xs text-muted-foreground">{r.note ?? r.ineligibleReason ?? '—'}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownItem
              disabled={r.status !== 'pending' || !r.eligible}
              onSelect={() => approvalActions.updateErasure(r.id, { status: 'processing' })}
            >
              <PauseCircle className="h-3.5 w-3.5" /> Start processing
            </DropdownItem>
            <DropdownItem disabled={r.status !== 'processing'} onSelect={() => setNoteTarget({ erasure: r, kind: 'complete' })}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete…
            </DropdownItem>
            <DropdownItem danger disabled={r.status !== 'pending'} onSelect={() => setNoteTarget({ erasure: r, kind: 'reject' })}>
              <Trash2 className="h-3.5 w-3.5" /> Reject…
            </DropdownItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const holdCols: Array<Column<LegalHold>> = [
    { key: 'subjectName', header: 'Subject', render: (r) => <span className="font-semibold">{r.subjectName}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-[280px] text-xs text-muted-foreground">{r.reason}</span> },
    { key: 'placedAt', header: 'Placed', render: (r) => fmtDate(r.placedAt) },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'active'} /> },
    { key: 'releasedAt', header: 'Released at', render: (r) => (r.releasedAt ? fmtDateTime(r.releasedAt) : '—') },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <Button variant="outline" size="sm" disabled={r.status !== 'active'} onClick={() => approvalActions.releaseHold(r.id)}>
          Release
        </Button>
      ),
    },
  ]

  return (
    <motion.div variants={{}} className="space-y-5">
      <SectionCard title="Erasure requests" subtitle="Start processing only when the request is eligible — customers under an active legal hold cannot be erased.">
        <DataTable
          columns={erasureCols}
          rows={erasureQuery.data ?? []}
          keyId={(r) => r.id}
          loading={erasureQuery.isLoading}
          skeletonRows={4}
          empty={<EmptyState title="No erasure requests" body="GDPR/DPDP erasure requests will appear here." />}
        />
      </SectionCard>
      <SectionCard
        title="Legal holds"
        subtitle="A hold blocks erasure for the subject account until released."
        action={<Button variant="primary" size="sm" onClick={() => setPlaceOpen(true)}>Place hold</Button>}
      >
        <DataTable
          columns={holdCols}
          rows={holdsQuery.data ?? []}
          keyId={(r) => r.id}
          loading={holdsQuery.isLoading}
          skeletonRows={3}
          empty={<EmptyState title="No legal holds" body="Holds placed by compliance will appear here." />}
        />
      </SectionCard>

      {noteTarget && (
        <NoteDialog
          title={noteTarget.kind === 'complete' ? `Complete erasure — ${noteTarget.erasure.customerName}` : `Reject erasure — ${noteTarget.erasure.customerName}`}
          description={noteTarget.kind === 'complete'
            ? 'An optional completion note is stored on the request.'
            : 'The rejection reason is recorded as the ineligibility reason.'}
          confirmLabel={noteTarget.kind === 'complete' ? 'Complete' : 'Reject'}
          destructive={noteTarget.kind === 'reject'}
          required={noteTarget.kind === 'reject'}
          onClose={() => setNoteTarget(null)}
          onSubmit={(note) => {
            if (noteTarget.kind === 'complete') approvalActions.updateErasure(noteTarget.erasure.id, { status: 'completed', note: note || `Completed on ${fmtDate(DEMO_NOW)}` })
            else approvalActions.updateErasure(noteTarget.erasure.id, { status: 'rejected', ineligibleReason: note })
          }}
        />
      )}
      {placeOpen && <PlaceHoldDialog onClose={() => setPlaceOpen(false)} />}
    </motion.div>
  )
}

function Tooltipish({ content, children }: { content: string; children: React.ReactNode }) {
  // tiny inline tooltip via title to avoid nested-tooltip edge cases inside tables
  return <span title={content} className="inline-flex">{children}</span>
}

function NoteDialog({
  title, description, confirmLabel = 'Confirm', destructive, required = false, onClose, onSubmit,
}: {
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  required?: boolean
  onClose: () => void
  onSubmit: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const ready = required ? note.trim().length >= 3 : true
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={title} description={description}>
        <Field label={required ? 'Reason' : 'Note'} required={required}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={required ? 'Describe why…' : 'Optional note…'} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'primary'} size="md" disabled={!ready} onClick={() => { onSubmit(note.trim()); onClose() }}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Place hold dialog ──────────────────────────────────────── */
function PlaceHoldDialog({ onClose }: { onClose: () => void }) {
  const db = useDB((s) => s.db)
  const approvalActions = useApprovalActions()
  const [customerId, setCustomerId] = useState('')
  const [reason, setReason] = useState('')
  const customer = db.customers.find((c) => c.id === customerId)
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title="Place legal hold" description="A hold blocks data erasure for the subject until it is released.">
        <div className="space-y-3">
          <Field label="Subject (customer)" required>
            <Select
              value={customerId || 'choose'}
              onValueChange={(v) => setCustomerId(v === 'choose' ? '' : v)}
              placeholder="Choose a customer…"
              options={[{ value: 'choose', label: 'Choose a customer…' }, ...db.customers.map((c) => ({ value: c.id, label: `${c.name} · ${c.id}` }))]}
            />
          </Field>
          <Field label="Reason" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ongoing fraud investigation" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary" size="md"
              disabled={!customer || reason.trim().length < 3}
              onClick={() => {
                if (!customer) return
                approvalActions.placeHold({
                  id: `LH-${Date.now()}`,
                  subjectName: customer.name,
                  reason: reason.trim(),
                  placedAt: DEMO_NOW.toISOString(),
                  status: 'active',
                })
                onClose()
              }}
            >
              Place hold
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
export function AdminApprovals() {
  const stagger = useStagger()
  const db = useDB((s) => s.db)
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState('queue')
  const statusParam = searchParams.get('status') ?? undefined

  const pending = db.approvals.filter((a) => a.status === 'pending').length
  const completed = db.approvals.filter((a) => a.status === 'completed').length
  const rejectedExpired = db.approvals.filter((a) => a.status === 'rejected' || a.status === 'expired').length
  const openFraud = db.fraudFindings.filter((f) => f.status === 'open').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        titleAccent="& compliance"
        breadcrumb={['Approvals']}
        subtitle="Sensitive-change approvals, fraud findings and data erasure with legal holds."
        illustration={<ApprovalsScene />}
      />
      <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
        <motion.section variants={stagger.item} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Pending approvals" value={pending} format="num" icon={ShieldCheck} tint="amber" />
          <KpiCard label="Completed" value={completed} format="num" icon={CheckCircle2} tint="green" />
          <KpiCard label="Rejected & expired" value={rejectedExpired} format="num" icon={FileWarning} tint="red" />
          <KpiCard label="Open fraud findings" value={openFraud} format="num" icon={ShieldAlert} tint="violet" />
        </motion.section>
        <motion.section variants={stagger.item}>
          <TabPills id="approvals-tabs" tabs={APPROVAL_TABS} value={tab} onChange={setTab} />
        </motion.section>
        <motion.section variants={stagger.item} key={tab} className={cn(tab === 'queue' && 'pb-2')}>
          {tab === 'queue' && <QueueTab statusParam={statusParam} />}
          {tab === 'fraud' && <FraudTab />}
          {tab === 'erasure' && <ErasureHoldsTab />}
        </motion.section>
      </motion.div>
    </div>
  )
}
