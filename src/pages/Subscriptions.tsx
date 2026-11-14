import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, AlertTriangle, RotateCcw, CalendarPlus, Plus, Trash2, Save, Ban, Clock } from 'lucide-react'
import { useStagger } from '@/hooks/misc'
import { useSubscriptionRuns } from '@/hooks/queries'
import { useSubscriptionAdminActions, useProductActions } from '@/hooks/mutations'
import { useFeature, useFeatureFlags } from '@/hooks/flags'
import { useDB } from '@/store/db'
import { PageHeader, TabPills, StatusPill, EmptyState } from '@/components/shared/misc'
import { Select, Field } from '@/components/ui/form'
import { Button, Card, Input, Switch, Badge, Label } from '@/components/ui/base'
import { Drawer, Tooltip } from '@/components/ui/overlays'
import { DataTable } from '@/components/shared/DataTable'
import { KpiCard } from '@/components/shared/KpiCard'
import { MeadowScene } from '@/illustrations/scenes'
import type { DeliverySlot, SubscriptionHoliday, SubscriptionRun } from '@/types'
import { fmtDate, fmtNum } from '@/lib/utils'

/* ── Page-local persisted config (slots + holidays; demo-only, no journal op exists) ── */
interface SubLocalConfig { slots: DeliverySlot[]; holidays: SubscriptionHoliday[] }
const SUB_LOCAL_KEY = 'dd-sub-config'

function loadLocalConfig(fallback: SubLocalConfig): SubLocalConfig {
  try {
    const raw = localStorage.getItem(SUB_LOCAL_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SubLocalConfig
      if (Array.isArray(parsed.slots) && Array.isArray(parsed.holidays)) return parsed
    }
  } catch { /* corrupted storage — fall back to seed */ }
  return fallback
}

type MainTab = 'runs' | 'slots' | 'holidays' | 'products' | 'settings'

const CUTOFF_OPTIONS = ['18:00', '19:00', '20:00', '21:00', '22:00']

export function Subscriptions() {
  const container = useStagger()
  const subscriptionsOn = useFeature('subscriptions')
  const flags = useFeatureFlags()
  const db = useDB((s) => s.db)
  const subActions = useSubscriptionAdminActions()
  const productActions = useProductActions()

  const runsQ = useSubscriptionRuns()
  const runs = runsQ.data ?? []

  const [tab, setTab] = useState<MainTab>('runs')

  // page-local slots + holidays, seeded from useSubscriptionConfig (db) then persisted in localStorage
  const [localCfg, setLocalCfg] = useState<SubLocalConfig | null>(null)
  useEffect(() => {
    setLocalCfg((prev) => prev ?? loadLocalConfig({ slots: db.deliverySlots, holidays: db.subscriptionHolidays }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (localCfg) {
      try { localStorage.setItem(SUB_LOCAL_KEY, JSON.stringify(localCfg)) } catch { /* storage unavailable — keep in memory */ }
    }
  }, [localCfg])
  const slots = localCfg?.slots ?? db.deliverySlots
  const holidays = localCfg?.holidays ?? db.subscriptionHolidays

  // KPI inputs
  const demoDate = new Date(db.demoNow)
  const monthRuns = runs.filter((r) => {
    const d = new Date(r.date)
    return d.getMonth() === demoDate.getMonth() && d.getFullYear() === demoDate.getFullYear()
  })
  const generatedThisMonth = monthRuns.reduce((a, r) => a + r.generated, 0)
  const failedRuns = runs.filter((r) => r.status === 'failed').length
  const retryableFailures = runs.reduce((a, r) => a + r.failures.filter((f) => f.retryable).length, 0)

  // runs drawer
  const [openRun, setOpenRun] = useState<SubscriptionRun | null>(null)

  // slot / holiday form state
  const [slotLabel, setSlotLabel] = useState('')
  const [slotWindow, setSlotWindow] = useState('')
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')

  // settings form
  const settings = db.systemSettings.subscription
  const [cutoff, setCutoff] = useState(settings.orderCutoffTime)
  const [autoRetry, setAutoRetry] = useState(settings.autoRetryFailed)
  const [defaultSlot, setDefaultSlot] = useState(settings.defaultSlotId)
  useEffect(() => {
    setCutoff(settings.orderCutoffTime)
    setAutoRetry(settings.autoRetryFailed)
    setDefaultSlot(settings.defaultSlotId)
  }, [settings.orderCutoffTime, settings.autoRetryFailed, settings.defaultSlotId])

  /* ── Feature disabled → banner only ── */
  if (!subscriptionsOn) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Subscriptions"
          subtitle="Automated daily delivery generation for subscribed customers."
          illustration={<MeadowScene variant="settings" />}
          breadcrumb={['Subscriptions']}
        />
        <Card className="flex items-start gap-4 border-amber-200 bg-warning-soft p-6 dark:border-amber-500/30">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warning-soft text-amber-600 ring-1 ring-amber-300 dark:text-warning dark:ring-amber-500/40">
            <Ban className="h-5 w-5" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-[15px] font-bold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" /> Subscriptions are currently disabled
            </p>
            <p className="mt-1 text-[13px] text-amber-700 dark:text-amber-200/80">
              Enable them under Settings &amp; system → Feature toggles.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  const currentFlagState = flags.subscriptions

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subscription"
        titleAccent="operations"
        subtitle="Daily generation runs, delivery slots, holiday calendar and subscriber settings."
        illustration={<MeadowScene variant="settings" />}
        breadcrumb={['Subscriptions']}
        actions={(
          <Badge tone={currentFlagState ? 'green' : 'neutral'}>
            <CalendarClock className="h-3 w-3" /> Feature {currentFlagState ? 'enabled' : 'disabled'}
          </Badge>
        )}
      />

      <motion.div variants={container.container} initial="hidden" animate="show" className="space-y-5">
        {/* ── KPIs ── */}
        <motion.section variants={container.item} className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard label="Generated this month" value={generatedThisMonth} icon={CalendarClock} tint="green" format="num" />
          <KpiCard label="Failed runs" value={failedRuns} icon={AlertTriangle} tint="red" format="num" />
          <KpiCard label="Retryable failures" value={retryableFailures} icon={RotateCcw} tint="amber" format="num" />
          <KpiCard label="Active delivery slots" value={slots.length} icon={Clock} tint="blue" format="num" />
        </motion.section>

        <motion.div variants={container.item}>
          <TabPills
            id="subs-tabs"
            value={tab}
            onChange={(v) => setTab(v as MainTab)}
            tabs={[
              { value: 'runs', label: 'Runs', count: runs.length },
              { value: 'slots', label: 'Delivery slots', count: slots.length },
              { value: 'holidays', label: 'Holidays', count: holidays.length },
              { value: 'products', label: 'Subscribable products' },
              { value: 'settings', label: 'Settings' },
            ]}
          />
        </motion.div>

        {/* ── RUNS ── */}
        {tab === 'runs' && (
          <motion.section variants={container.item}>
            <Card className="overflow-hidden">
              <DataTable
                keyId={(r) => r.id}
                rows={runs}
                loading={runsQ.isLoading}
                onRowClick={(r) => setOpenRun(r)}
                empty={<EmptyState icon={CalendarClock} title="No generation runs yet" />}
                columns={[
                  { key: 'date', header: 'Date', render: (r: SubscriptionRun) => <span className="font-semibold">{fmtDate(r.date)}</span> },
                  { key: 'generated', header: 'Generated', render: (r: SubscriptionRun) => <span className="font-bold tabular">{fmtNum(r.generated)}</span> },
                  { key: 'status', header: 'Status', render: (r: SubscriptionRun) => <StatusPill status={r.status} dot /> },
                  {
                    key: 'failures', header: 'Failures',
                    render: (r: SubscriptionRun) => r.failures.length === 0
                      ? <span className="text-muted-foreground">—</span>
                      : <Badge tone={r.failures.some((f) => f.retryable) ? 'amber' : 'neutral'}>{r.failures.length}</Badge>,
                  },
                  {
                    key: 'actions', header: '', align: 'right' as const,
                    render: (r: SubscriptionRun) => {
                      const canRetry = r.failures.some((f) => f.retryable)
                      return (
                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <Tooltip content={canRetry ? 'Re-run the failed generations of this run' : 'No retryable failures in this run'}>
                            <span>
                              <Button size="sm" variant="outline" disabled={!canRetry} onClick={() => subActions.retryRun(r.id)}>
                                <RotateCcw className="h-3.5 w-3.5" /> Retry failed
                              </Button>
                            </span>
                          </Tooltip>
                        </div>
                      )
                    },
                  },
                ]}
              />
            </Card>
          </motion.section>
        )}

        {/* ── SLOTS ── */}
        {tab === 'slots' && (
          <motion.section variants={container.item} className="space-y-3">
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="min-w-[200px] flex-1">
                <Field label="Slot label"><Input value={slotLabel} onChange={(e) => setSlotLabel(e.target.value)} placeholder="e.g. Late evening" /></Field>
              </div>
              <div className="w-48">
                <Field label="Window"><Input value={slotWindow} onChange={(e) => setSlotWindow(e.target.value)} placeholder="e.g. 20:00 – 22:00" /></Field>
              </div>
              <Button
                variant="primary" size="md"
                disabled={!slotLabel.trim() || !slotWindow.trim()}
                onClick={() => {
                  setLocalCfg((cfg) => ({
                    slots: [...(cfg?.slots ?? slots), { id: `slot-${Date.now()}`, label: slotLabel.trim(), window: slotWindow.trim() }],
                    holidays: cfg?.holidays ?? holidays,
                  }))
                  setSlotLabel(''); setSlotWindow('')
                }}
              >
                <Plus className="h-4 w-4" /> Add slot
              </Button>
            </div>
            <Card className="overflow-hidden">
              {slots.length === 0 ? (
                <EmptyState icon={CalendarClock} title="No delivery slots" />
              ) : (
                <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
                  {slots.map((s) => (
                    <div key={s.id} className="group relative rounded-card border border-border/70 bg-card p-4 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                      <Button
                        size="iconSm" variant="ghost" aria-label={`Remove ${s.label}`}
                        className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100"
                        onClick={() => setLocalCfg((cfg) => ({ slots: (cfg?.slots ?? slots).filter((x) => x.id !== s.id), holidays: cfg?.holidays ?? holidays }))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Delivery slot</p>
                      <p className="mt-1 text-[15px] font-extrabold">{s.label}</p>
                      <p className="mt-0.5 font-mono text-[12.5px] text-muted-foreground">{s.window}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <p className="text-[11px] text-muted-foreground">Slot and holiday edits are stored per browser in this demo; the Settings tab persists via the journal.</p>
          </motion.section>
        )}

        {/* ── HOLIDAYS ── */}
        {tab === 'holidays' && (
          <motion.section variants={container.item} className="space-y-3">
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="w-44">
                <Field label="Date"><Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} /></Field>
              </div>
              <div className="min-w-[200px] flex-1">
                <Field label="Name"><Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="e.g. Holi — no milk subscriptions" /></Field>
              </div>
              <Button
                variant="primary" size="md"
                disabled={!holidayDate || !holidayName.trim()}
                onClick={() => {
                  setLocalCfg((cfg) => ({
                    slots: cfg?.slots ?? slots,
                    holidays: [...(cfg?.holidays ?? holidays), { date: holidayDate, name: holidayName.trim() }].sort((a, b) => a.date.localeCompare(b.date)),
                  }))
                  setHolidayDate(''); setHolidayName('')
                }}
              >
                <CalendarPlus className="h-4 w-4" /> Add holiday
              </Button>
            </div>
            <Card className="overflow-hidden">
              {holidays.length === 0 ? (
                <EmptyState icon={CalendarPlus} title="No holidays configured" />
              ) : (
                <div className="space-y-1.5 p-5">
                  {holidays.slice().sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
                    <div key={h.date + h.name} className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5">
                      <Badge tone="violet">{fmtDate(h.date)}</Badge>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{h.name}</span>
                      <Button
                        size="iconSm" variant="ghost" aria-label={`Remove ${h.name}`}
                        onClick={() => setLocalCfg((cfg) => ({ slots: cfg?.slots ?? slots, holidays: (cfg?.holidays ?? holidays).filter((x) => !(x.date === h.date && x.name === h.name)) }))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </motion.section>
        )}

        {/* ── SUBSCRIBABLE PRODUCTS ── */}
        {tab === 'products' && (
          <motion.section variants={container.item}>
            <Card className="overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h3 className="text-[15px] font-bold tracking-tight">Subscribable products</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Only products marked subscribable can be picked for daily subscriptions</p>
              </div>
              <DataTable
                keyId={(r) => r.product.id}
                rows={db.products.map((product) => ({ product }))}
                empty={<EmptyState title="No products in the catalog" />}
                columns={[
                  { key: 'name', header: 'Product', render: (r: { product: typeof db.products[number] }) => <span className="font-semibold">{r.product.name}</span> },
                  { key: 'storage', header: 'Storage', render: (r: { product: typeof db.products[number] }) => <Badge tone={r.product.storage === 'chilled' ? 'blue' : 'neutral'}>{r.product.storage}</Badge> },
                  {
                    key: 'sub', header: 'Subscribable', align: 'right' as const,
                    render: (r: { product: typeof db.products[number] }) => (
                      <div className="flex items-center justify-end gap-2.5" onClick={(e) => e.stopPropagation()}>
                        <Label className="mb-0 text-[11px] text-muted-foreground">{r.product.subscribable ? 'Yes' : 'No'}</Label>
                        <Switch checked={r.product.subscribable} onCheckedChange={(v) => productActions.updateProduct(r.product.id, { subscribable: v }, r.product.name)} />
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          </motion.section>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <motion.section variants={container.item}>
            <Card className="max-w-2xl p-5">
              <h3 className="text-[15px] font-bold tracking-tight">Generation settings</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Control when subscription orders are generated and how failures recover</p>
              <div className="mt-4 space-y-4">
                <Field label="Order cutoff time" hint="Subscriptions for tomorrow lock in before this time">
                  <Select value={cutoff} onValueChange={setCutoff} options={CUTOFF_OPTIONS.map((c) => ({ value: c, label: c }))} />
                </Field>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <div>
                    <Label className="mb-0">Auto-retry failed generations</Label>
                    <p className="text-xs text-muted-foreground">Retry retryable failures automatically on the next run</p>
                  </div>
                  <Switch checked={autoRetry} onCheckedChange={setAutoRetry} />
                </div>
                <Field label="Default delivery slot">
                  <Select value={defaultSlot} onValueChange={setDefaultSlot} options={slots.map((s) => ({ value: s.id, label: `${s.label} (${s.window})` }))} placeholder="Pick default slot" />
                </Field>
                <div className="flex justify-end">
                  <Button variant="primary" size="md" onClick={() => subActions.updateConfig({ orderCutoffTime: cutoff, autoRetryFailed: autoRetry, defaultSlotId: defaultSlot })}>
                    <Save className="h-4 w-4" /> Save settings
                  </Button>
                </div>
              </div>
            </Card>
          </motion.section>
        )}
      </motion.div>

      {/* run failures drawer */}
      {openRun && (
        <Drawer open onOpenChange={(v) => { if (!v) setOpenRun(null) }} width="md" title={`Run ${openRun.id}`} subtitle={`${fmtDate(openRun.date)} · ${fmtNum(openRun.generated)} generated`}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusPill status={openRun.status} dot />
              <Badge tone={openRun.failures.length ? 'amber' : 'green'}>{openRun.failures.length} failure{openRun.failures.length === 1 ? '' : 's'}</Badge>
            </div>
            {openRun.failures.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Every subscription generated cleanly on this run</p>
            ) : (
              <div className="space-y-1.5">
                {openRun.failures.map((f, i) => (
                  <div key={`${f.subscriptionRef}-${i}`} className="rounded-xl border border-border/70 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-bold">{f.subscriptionRef}</span>
                      <span className="text-[12.5px] font-semibold">{f.customerName}</span>
                      <span className="ml-auto"><Badge tone={f.retryable ? 'amber' : 'red'}>{f.retryable ? 'Retryable' : 'Permanent'}</Badge></span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">{f.reason}</p>
                  </div>
                ))}
              </div>
            )}
            {openRun.failures.some((f) => f.retryable) && (
              <Button variant="primary" size="md" className="w-full" onClick={() => { subActions.retryRun(openRun.id); setOpenRun(null) }}>
                <RotateCcw className="h-4 w-4" /> Retry failed generations
              </Button>
            )}
          </div>
        </Drawer>
      )}
    </div>
  )
}

export default Subscriptions
