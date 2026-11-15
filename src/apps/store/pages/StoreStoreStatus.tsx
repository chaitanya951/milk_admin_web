// §7 Store Status — current status hero, Online/Paused option cards (pause needs a
// reason + confirm), read-only store info, operational impact, status change history.
// The manager never sees global store configuration — only their own store.
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDays, CheckCircle2, Clock, History, Info, MapPin, PauseCircle,
  Play, Store, TriangleAlert,
} from 'lucide-react'
import { useStagger } from '@/shared/hooks/misc'
import { useActiveStoreId, useStoreStatusInfo } from '@/apps/store/api/storeQueries'
import { useStoreStatusActions } from '@/apps/store/api/storeMutations'
import { useDB } from '@/shared/data/db'
import { DEMO_NOW } from '@/shared/data/seed'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/shared/components/ui/base'
import { ConfirmDialog, Dialog, DialogContent } from '@/shared/components/ui/overlays'
import { Field, Select } from '@/shared/components/ui/form'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { EmptyState, PageHeader, StatusPill } from '@/shared/components/misc'
import { MeadowScene } from '@/shared/illustrations/scenes'
import { cn, fmtDate, fmtDateTime, timeAgo } from '@/shared/lib/utils'
import type { StoreHours, StoreStatusChange } from '@/shared/types'

const PAUSE_REASONS = ['Stock receipt delayed', 'Staff shortage', 'Maintenance', 'Equipment failure', 'Other']
const IMPACT_ONLINE = [
  'New orders are assigned to your store immediately.',
  'Picking tasks continue as normal.',
  'Riders are dispatched on schedule.',
]
const IMPACT_PAUSED = [
  'New orders are queued until you resume.',
  'Riders are not dispatched.',
  'In-progress picking can still be completed.',
]

/* ── Giant status pill (same language as StatusPill, hero-sized) ── */
function BigStatusPill({ status }: { status: 'online' | 'paused' }) {
  const online = status === 'online'
  return (
    <span className={cn(
      'inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-lg font-extrabold capitalize',
      online ? 'bg-success-soft text-success' : 'bg-warning-soft text-amber-600 dark:text-warning',
    )}>
      <span className={cn('h-3 w-3 rounded-full animate-pulse-soft', online ? 'bg-success' : 'bg-warning')} />
      {online ? 'Online' : 'Paused'}
    </span>
  )
}

function hoursSummary(hours: StoreHours[]) {
  const pairs = new Set(hours.filter((h) => h.open && h.close).map((h) => `${h.open} – ${h.close}`))
  if (pairs.size === 0) return 'Closed'
  if (pairs.size === 1) return `${[...pairs][0]} daily`
  return [...pairs].join(' / ')
}

export function StoreStoreStatus() {
  const storeId = useActiveStoreId()
  const stagger = useStagger()
  const statusActions = useStoreStatusActions()
  const db = useDB((s) => s.db)
  const info = useStoreStatusInfo(storeId)

  const [pauseOpen, setPauseOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [pauseDetails, setPauseDetails] = useState('')

  const store = info.data?.store ?? db.stores.find((s) => s.id === storeId) ?? null
  const statusChanges = info.data?.statusChanges ?? []
  const status: 'online' | 'paused' = store?.status ?? 'online'
  const latest = statusChanges[0] ?? null
  const cityName = store ? db.cities.find((c) => c.id === store.cityId)?.name ?? '' : ''

  const composedReason = pauseDetails.trim() ? `${pauseReason} — ${pauseDetails.trim()}` : pauseReason

  const columns: Column<StoreStatusChange>[] = [
    { key: 'at', header: 'When', render: (c) => <span className="whitespace-nowrap text-muted-foreground">{fmtDateTime(c.at)}</span> },
    { key: 'status', header: 'Status', render: (c) => <StatusPill status={c.status} dot /> },
    { key: 'by', header: 'By', render: (c) => <span className="font-medium">{c.by}</span> },
    { key: 'role', header: 'Role', render: (c) => <span className="text-muted-foreground">{c.role}</span> },
    { key: 'reason', header: 'Reason', render: (c) => c.reason ?? <span className="text-muted-foreground">—</span> },
  ]

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
      <PageHeader
        breadcrumb={['Store Status']}
        title="Store"
        titleAccent="Status"
        subtitle="Control whether your store is accepting work right now."
        illustration={<MeadowScene variant="stores" />}
      />

      {/* ── Current status hero ── */}
      <motion.section variants={stagger.item}>
        <Card hoverable className="flex flex-wrap items-center gap-5 p-6">
          <BigStatusPill status={status} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {status === 'online' ? 'Your store is accepting work right now.' : 'Your store is temporarily not accepting new orders.'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {latest
                ? <>Since {fmtDateTime(latest.at)} · {timeAgo(latest.at, DEMO_NOW)}{latest.by ? ` · by ${latest.by}` : ''}</>
                : 'No status changes recorded yet.'}
            </p>
          </div>
          {store?.note && (
            <p className="ml-auto flex max-w-xs items-start gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {store.note}
            </p>
          )}
        </Card>
      </motion.section>

      {/* ── Option cards ── */}
      <motion.section variants={stagger.item} className="grid gap-4 md:grid-cols-2">
        <Card
          hoverable
          className={cn('p-5 transition-shadow', status === 'online' ? 'border-success/50 ring-2 ring-success/40' : 'opacity-90')}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-success-soft text-success"><Store className="h-6 w-6" /></span>
            {status === 'online' && <Badge tone="green">Current</Badge>}
          </div>
          <h3 className="mt-3.5 text-lg font-bold">Online</h3>
          <p className="mt-1 text-sm text-muted-foreground">Store is accepting orders and picking tasks.</p>
          <div className="mt-5">
            {status === 'online' ? (
              <Button variant="success" disabled aria-label="Store is already online">Online now</Button>
            ) : (
              // one-click resume — no dialog per spec
              <Button variant="success" onClick={() => storeId && statusActions.resume(storeId)} aria-label="Resume store operations">
                <Play className="h-4 w-4" /> Resume
              </Button>
            )}
          </div>
        </Card>

        <Card
          hoverable
          className={cn('p-5 transition-shadow', status === 'paused' ? 'border-warning/60 ring-2 ring-warning/40' : 'opacity-90')}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-warning-soft text-amber-600 dark:text-warning"><PauseCircle className="h-6 w-6" /></span>
            {status === 'paused' && <Badge tone="amber">Current</Badge>}
          </div>
          <h3 className="mt-3.5 text-lg font-bold">Paused</h3>
          <p className="mt-1 text-sm text-muted-foreground">Store temporarily not accepting new orders.</p>
          <div className="mt-5">
            {status === 'paused' ? (
              <Button variant="secondary" disabled aria-label="Store is already paused">Currently paused</Button>
            ) : (
              <Button variant="destructive" onClick={() => { setPauseOpen(true); setPauseReason(''); setPauseDetails('') }} aria-label="Pause store">
                <PauseCircle className="h-4 w-4" /> Pause Operations
              </Button>
            )}
          </div>
        </Card>
      </motion.section>

      {/* ── Read-only info cards ── */}
      <motion.section variants={stagger.item} className="grid gap-4 lg:grid-cols-2">
        <Card hoverable>
          <CardHeader><CardTitle>Store Information</CardTitle></CardHeader>
          <CardContent className="space-y-2.5 text-[13px]">
            <p className="text-[15px] font-bold">{store?.name ?? '—'} <Badge tone="blue" className="ml-1 tabular">{store?.code ?? ''}</Badge></p>
            <p className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {store?.location}{cityName ? `, ${cityName}` : ''}</p>
            <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {store ? hoursSummary(store.hours) : '—'}</p>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div>
                <span className="font-semibold">Holidays: </span>
                {store && store.holidays.length > 0
                  ? store.holidays.map((h) => `${h.name} (${fmtDate(h.date)})`).join(', ')
                  : 'None scheduled'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card hoverable>
          <CardHeader><CardTitle>Operational Impact</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-[13px]">
              {(status === 'online' ? IMPACT_ONLINE : IMPACT_PAUSED).map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  {status === 'online'
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-warning" />}
                  <span className="text-foreground/85">{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-muted/50 px-3.5 py-2.5 text-xs text-muted-foreground">
              You control only your own store's status — wider store configuration is managed by admins.
            </p>
          </CardContent>
        </Card>
      </motion.section>

      <motion.section variants={stagger.item}>
        <Card hoverable>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4 text-brand-600" /> Recent Status Changes</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              rows={statusChanges}
              keyId={(c) => c.id}
              loading={info.isLoading}
              empty={<EmptyState icon={History} title="No status changes yet" body="Pauses and resumes for this store will be recorded here." />}
            />
          </CardContent>
        </Card>
      </motion.section>

      {/* ── Pause reason dialog → confirm ── */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent
          title="Pause your store?"
          description="The reason is recorded in the status history and the team is notified."
        >
          <div className="space-y-4">
            <Field label="Reason" required error={!pauseReason ? 'Pick a reason to continue' : undefined}>
              <Select
                value={pauseReason}
                onValueChange={setPauseReason}
                placeholder="Why are you pausing?"
                options={PAUSE_REASONS.map((r) => ({ value: r, label: r }))}
              />
            </Field>
            <Field label="Details (optional)">
              <Textarea
                value={pauseDetails}
                maxLength={200}
                onChange={(e) => setPauseDetails(e.target.value.slice(0, 200))}
                placeholder="Anything the team should know…"
                aria-label="Pause details"
              />
              <div className="mt-1 text-right text-[11px] tabular text-muted-foreground">{pauseDetails.length} / 200</div>
            </Field>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setPauseOpen(false)}>Cancel</Button>
              <Button variant="destructive" disabled={!pauseReason} onClick={() => { setPauseOpen(false); setConfirmOpen(true) }}>
                Continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Pause this store?"
        description={`Reason: ${composedReason || '—'}. New orders will be queued and riders will not be dispatched until you resume.`}
        confirmLabel="Pause store"
        destructive
        onConfirm={() => {
          if (!storeId) return
          statusActions.pause(storeId, composedReason) // toast comes from the mutation
          setConfirmOpen(false)
        }}
      />
    </motion.div>
  )
}
