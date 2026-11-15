// ── §14 Settings & system ────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle, Bell, CheckCircle2, Cog, Info, RefreshCcw, Repeat, Truck, Wallet,
} from 'lucide-react'
import { cn, fmtDateTime, timeAgo } from '@/shared/lib/utils'
import { Badge, Button, Card, Checkbox, Input, Switch } from '@/shared/components/ui/base'
import { Tooltip } from '@/shared/components/ui/overlays'
import { Field } from '@/shared/components/ui/form'
import { EmptyState, PageHeader, TabPills } from '@/shared/components/misc'
import { StatusPill } from '@/shared/components/misc'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { KpiCard } from '@/shared/components/KpiCard'
import { SectionCard } from '@/shared/components/domain'
import { MeadowScene } from '@/shared/illustrations/scenes'
import { useStagger } from '@/shared/hooks/misc'
import {
  useBackgroundJobs, useInvoiceFailures, useOperationalNotifications, useSystemSettings,
} from '@/apps/admin/api/queries'
import { usePaymentActions, useSystemActions } from '@/apps/admin/api/mutations'
import { useFeatureFlags } from '@/shared/hooks/flags'
import { DEMO_NOW } from '@/shared/data/seed'
import type { BackgroundJob, BusinessRules, FeatureFlags, InvoiceFailure, OperationalNotification } from '@/shared/types'

const SETTINGS_TABS = [
  { value: 'features', label: 'Feature toggles' },
  { value: 'rules', label: 'Business rules' },
  { value: 'jobs', label: 'Background jobs' },
  { value: 'alerts', label: 'Operational alerts' },
]

/* ── FEATURE TOGGLES tab ────────────────────────────────────── */
function FeaturesTab() {
  const flags = useFeatureFlags()
  const systemActions = useSystemActions()
  const cards: Array<{ flag: keyof FeatureFlags; name: string; description: string; hidesWhenOff: string; icon: typeof Truck }> = [
    {
      flag: 'cod',
      name: 'COD on delivery',
      description: 'Cash on delivery for eligible orders and stores (per-store COD availability is configured in Stores).',
      hidesWhenOff: 'Hides COD columns in Orders/Payouts; disables COD methods',
      icon: Truck,
    },
    {
      flag: 'wallets',
      name: 'Customer wallets',
      description: 'Prepaid wallet top-ups, wallet order payments and refund credits.',
      hidesWhenOff: 'Hides wallet ledger & adjustments',
      icon: Wallet,
    },
    {
      flag: 'subscriptions',
      name: 'Subscriptions',
      description: 'Standing daily/weekly orders generated per slot with auto-retry.',
      hidesWhenOff: 'Shows disabled banner on Subscriptions page',
      icon: Repeat,
    },
  ]
  return (
    <motion.div variants={{}} className="grid gap-4 lg:grid-cols-3">
      {cards.map((f) => {
        const on = flags[f.flag]
        const Icon = f.icon
        return (
          <Card key={f.flag} hoverable className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-brand-700 dark:text-brand-300">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[15px] font-bold">{f.name}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">{f.flag}</p>
                </div>
              </div>
              <Switch checked={on} onCheckedChange={(v) => systemActions.setFeatures({ ...flags, [f.flag]: v })} aria-label={`Toggle ${f.name}`} />
            </div>
            <p className="mt-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">{f.description}</p>
            <div className="mt-3">
              {on ? (
                <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Enabled</Badge>
              ) : (
                <Badge tone="amber">{f.hidesWhenOff}</Badge>
              )}
            </div>
          </Card>
        )
      })}
    </motion.div>
  )
}

/* ── BUSINESS RULES tab ─────────────────────────────────────── */
const DOC_OPTIONS: Array<{ id: BusinessRules['riderRequiredDocs'][number]; label: string }> = [
  { id: 'license', label: 'Driving license' },
  { id: 'id_proof', label: 'ID proof' },
  { id: 'bank_details', label: 'Bank details' },
]

function RulesTab() {
  const settings = useSystemSettings()
  const systemActions = useSystemActions()
  const [draft, setDraft] = useState<BusinessRules | null>(null)

  useEffect(() => {
    if (settings.data && draft === null) {
      setDraft({ ...settings.data.rules, riderRequiredDocs: [...settings.data.rules.riderRequiredDocs] })
    }
  }, [settings.data, draft])

  if (!settings.data || !draft) {
    return (
      <div className="space-y-3 rounded-card border border-border/70 bg-card p-5 shadow-soft">
        {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}
      </div>
    )
  }

  const saved = settings.data.rules
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const numericFields: Array<keyof BusinessRules> = [
    'deliveryFee', 'freeDeliveryAbove', 'minOrderValue', 'codMaxOrderValue', 'walletMaxBalance',
    'dispatchRadiusKm', 'dispatchBatchSize', 'maxOrdersPerSlotPerStore', 'refundWindowDays',
  ]
  const invalid = numericFields.some((k) => !Number.isFinite(draft[k] as number) || (draft[k] as number) < 0)

  const set = (k: keyof BusinessRules, v: number) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const toggleDoc = (doc: BusinessRules['riderRequiredDocs'][number]) =>
    setDraft((d) => {
      if (!d) return d
      const docs = d.riderRequiredDocs.includes(doc) ? d.riderRequiredDocs.filter((x) => x !== doc) : [...d.riderRequiredDocs, doc]
      return { ...d, riderRequiredDocs: docs }
    })

  return (
    <motion.div variants={{}} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Fees & limits" subtitle="Applied at checkout and enforced by the order service.">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumField label="Delivery fee ₹" value={draft.deliveryFee} onChange={(v) => set('deliveryFee', v)} />
            <NumField label="Free delivery above ₹" value={draft.freeDeliveryAbove} onChange={(v) => set('freeDeliveryAbove', v)} />
            <NumField label="Min order value ₹" value={draft.minOrderValue} onChange={(v) => set('minOrderValue', v)} />
            <NumField label="COD max order ₹" value={draft.codMaxOrderValue} onChange={(v) => set('codMaxOrderValue', v)} />
            <NumField label="Wallet max balance ₹" value={draft.walletMaxBalance} onChange={(v) => set('walletMaxBalance', v)} />
          </div>
        </SectionCard>
        <SectionCard title="Dispatch" subtitle="How orders are batched to stores and riders.">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumField label="Dispatch radius (km)" value={draft.dispatchRadiusKm} onChange={(v) => set('dispatchRadiusKm', v)} />
            <NumField label="Dispatch batch size" value={draft.dispatchBatchSize} onChange={(v) => set('dispatchBatchSize', v)} />
            <NumField label="Max orders / slot / store" value={draft.maxOrdersPerSlotPerStore} onChange={(v) => set('maxOrdersPerSlotPerStore', v)} />
          </div>
        </SectionCard>
        <SectionCard title="Rider requirements" subtitle="Documents a rider application must include (reviewed by the store manager).">
          <div className="flex flex-wrap gap-6 pt-1">
            {DOC_OPTIONS.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-2 text-[13.5px] font-medium">
                <Checkbox checked={draft.riderRequiredDocs.includes(d.id)} onCheckedChange={() => toggleDoc(d.id)} ariaLabel={`Require ${d.label}`} />
                {d.label}
              </label>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Refunds" subtitle="Window within which delivered orders can be refunded.">
          <NumField label="Refund window (days)" value={draft.refundWindowDays} onChange={(v) => set('refundWindowDays', v)} />
        </SectionCard>
      </div>
      <div className="flex items-center justify-end gap-2">
        {invalid && <p className="mr-auto text-xs font-semibold text-destructive">All values must be 0 or more.</p>}
        <Button variant="secondary" size="md" disabled={!dirty} onClick={() => setDraft({ ...saved, riderRequiredDocs: [...saved.riderRequiredDocs] })}>
          Discard
        </Button>
        <Button variant="primary" size="md" disabled={!dirty || invalid} onClick={() => systemActions.setRules(draft)}>
          Save changes
        </Button>
      </div>
    </motion.div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const bad = !Number.isFinite(value) || value < 0
  return (
    <Field label={label} error={bad ? 'Must be 0 or more' : undefined}>
      <Input
        type="number"
        min={0}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(bad && 'border-destructive')}
      />
    </Field>
  )
}

/* ── BACKGROUND JOBS tab (anchor #jobs) ─────────────────────── */
const JOB_KIND_LABEL: Record<BackgroundJob['kind'], string> = {
  invoice_render: 'Invoice render', payout_export: 'Payout export', subscription_generate: 'Subscription generate',
  webhook_delivery: 'Webhook delivery', report_email: 'Report email',
}
function JobsTab() {
  const systemActions = useSystemActions()
  const query = useBackgroundJobs()

  const cols: Array<Column<BackgroundJob>> = [
    { key: 'name', header: 'Job', render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge tone="blue">{JOB_KIND_LABEL[r.kind]}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'running'} /> },
    { key: 'lastRunAt', header: 'Last run', render: (r) => <span className="tabular text-muted-foreground">{fmtDateTime(r.lastRunAt)}</span> },
    { key: 'attempts', header: 'Attempts', align: 'right', render: (r) => <span className="tabular font-semibold">{r.attempts}</span> },
    { key: 'error', header: 'Error', render: (r) => (r.error ? <span className="line-clamp-2 max-w-[220px] text-xs font-medium text-destructive">{r.error}</span> : <span className="text-muted-foreground">—</span>) },
    {
      key: 'recovery', header: 'Recovery',
      render: (r) => <Badge tone={r.recovery === 'retry' ? 'blue' : r.recovery === 'requeue' ? 'amber' : 'neutral'} className="capitalize">{r.recovery}</Badge>,
    },
    {
      key: 'action', header: '', align: 'right',
      render: (r) => {
        const tooltip = r.canRetry ? (r.retryAfterFix ?? 'Retry this job now') : (r.retryAfterFix ?? 'Retry not available for this job')
        const btn = (
          <Button variant="outline" size="sm" disabled={!r.canRetry} onClick={() => systemActions.retryJob(r.id)}>
            <RefreshCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        )
        return <Tooltip content={tooltip}><span>{btn}</span></Tooltip>
      },
    },
  ]

  return (
    <motion.div variants={{}} id="jobs" className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Background workers render invoices, generate subscriptions and deliver webhooks. Failed jobs recover per the
        listed strategy — retry is enabled only when the job says it is safe.
      </p>
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={query.data ?? []}
          keyId={(r) => r.id}
          loading={query.isLoading}
          skeletonRows={6}
          empty={<EmptyState title="No background jobs" body="Job runs will appear here." />}
        />
      </div>
    </motion.div>
  )
}

/* ── OPERATIONAL ALERTS tab ─────────────────────────────────── */
const SEVERITY_BADGE: Record<OperationalNotification['severity'], { tone: 'blue' | 'amber' | 'red'; icon: typeof Info }> = {
  info: { tone: 'blue', icon: Info },
  warning: { tone: 'amber', icon: AlertTriangle },
  critical: { tone: 'red', icon: AlertTriangle },
}

function AlertsTab() {
  const opQuery = useOperationalNotifications()
  const invoiceQuery = useInvoiceFailures()
  const paymentActions = usePaymentActions()
  const notifications = opQuery.data ?? []
  const invoices = invoiceQuery.data ?? []

  return (
    <motion.div variants={{}} className="space-y-5">
      {opQuery.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No operational alerts" body="System alerts will appear here." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const meta = SEVERITY_BADGE[n.severity]
            const Icon = meta.icon
            return (
              <li key={n.id} className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
                <span className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                  n.severity === 'critical' ? 'bg-destructive-soft text-destructive' : n.severity === 'warning' ? 'bg-warning-soft text-amber-600 dark:text-warning' : 'bg-info-soft text-info',
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={meta.tone} className="capitalize">{n.severity}</Badge>
                    <p className="text-[13.5px] font-bold">{n.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.at, DEMO_NOW)}</span>
              </li>
            )
          })}
        </ul>
      )}

      <SectionCard
        title="Invoice render failures"
        subtitle="Suspended invoices — retry is enabled only once the cause is fixed."
        action={<Badge tone="red">{invoices.length}</Badge>}
      >
        {invoices.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No invoice failures — all invoices rendered.</p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 px-4 py-3 text-[13px]">
                <span className="font-mono text-xs font-semibold">{f.invoiceId}</span>
                <span className="font-medium">#{f.orderId}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.reason}</span>
                {f.causeFixed ? <Badge tone="green">Cause fixed</Badge> : <Badge tone="red">Cause open</Badge>}
                <Tooltip content={f.causeFixed ? 'Retry the invoice render now' : 'Fix the cause first — see reason'}>
                  <span>
                    <Button variant="outline" size="sm" disabled={!f.causeFixed} onClick={() => paymentActions.retryInvoice(f.id)}>
                      <RefreshCcw className="h-3.5 w-3.5" /> Retry
                    </Button>
                  </span>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <Link
            to="/payments?tab=invoices"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-brand-600/60 px-4 text-[13px] font-semibold text-brand-700 transition hover:bg-primary-soft dark:text-brand-300"
          >
            Open in Payments
          </Link>
        </div>
      </SectionCard>
    </motion.div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
export function AdminSettings() {
  const stagger = useStagger()
  const [tab, setTab] = useState('features')
  const notifications = useOperationalNotifications()
  const jobs = useBackgroundJobs()
  const invoices = useInvoiceFailures()

  const failedJobs = (jobs.data ?? []).filter((j) => j.status === 'failed').length
  const openInvoices = (invoices.data ?? []).filter((f) => !f.causeFixed).length
  const criticalAlerts = (notifications.data ?? []).filter((n) => n.severity === 'critical').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        titleAccent="& system"
        breadcrumb={['Settings']}
        subtitle="Feature flags, business rules, background jobs and operational alerts."
        illustration={<MeadowScene variant="settings" />}
      />
      <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
        <motion.section variants={stagger.item} className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Failed jobs" value={failedJobs} format="num" icon={Cog} tint="red" />
          <KpiCard label="Blocked invoices" value={openInvoices} format="num" icon={AlertTriangle} tint="amber" />
          <KpiCard label="Critical alerts" value={criticalAlerts} format="num" icon={Bell} tint="violet" />
        </motion.section>
        <motion.section variants={stagger.item}>
          <TabPills id="settings-tabs" tabs={SETTINGS_TABS} value={tab} onChange={setTab} />
        </motion.section>
        <motion.section variants={stagger.item} key={tab}>
          {tab === 'features' && <FeaturesTab />}
          {tab === 'rules' && <RulesTab />}
          {tab === 'jobs' && <JobsTab />}
          {tab === 'alerts' && <AlertsTab />}
        </motion.section>
      </motion.div>
    </div>
  )
}
