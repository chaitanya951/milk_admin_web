import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  Plus, MoreVertical, Pencil, Pause, Play, Trash2, MapPin, Info, Save, CalendarDays,
  Users, UserPlus, UserMinus, Store as StoreIcon, Building2, Map as MapIcon, Route,
} from 'lucide-react'
import { useStagger } from '@/shared/hooks/misc'
import {
  useStores, useZones, useCities, useLegalEntities, useWorkforce,
} from '@/apps/admin/api/queries'
import { useStoreActions } from '@/apps/admin/api/mutations'
import { useFeature } from '@/shared/hooks/flags'
import { PageHeader, TabPills, SearchInput, StatusPill, EmptyState } from '@/shared/components/misc'
import { Select, Field } from '@/shared/components/ui/form'
import { Button, Card, Input, Switch, Badge, Label } from '@/shared/components/ui/base'
import {
  Dialog, DialogContent, Drawer, ConfirmDialog, DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownItem, DropdownSeparator, Tooltip,
} from '@/shared/components/ui/overlays'
import { DataTable, Pagination } from '@/shared/components/DataTable'
import { LazyMap } from '@/shared/components/map/LazyMap'
import { ZoneLegend } from '@/shared/components/domain'
import { CityScene } from '@/shared/illustrations/scenes'
import type { Store, Zone, LegalEntity, StoreHours, City } from '@/shared/types'
import { cn, fmtDate } from '@/shared/lib/utils'

const PolygonEditor = lazy(() => import('@/shared/components/map/PolygonEditor'))

/* ── Local helpers ─────────────────────────────────────────── */
const STORE_TINTS = ['#2E7D1A', '#5DAE2B', '#B05560', '#3B82F6', '#F59E0B', '#8B5CF6', '#14B8A6', '#EF4444']

function StoreThumb({ variant, size = 38 }: { variant: number; size?: number }) {
  const c = STORE_TINTS[variant % STORE_TINTS.length]!
  return (
    <span className="grid shrink-0 place-items-center rounded-xl ring-1" style={{ width: size, height: size, background: `${c}1A`, color: c, boxShadow: `inset 0 0 0 1px ${c}22` }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 9 5 4h14l2 5" /><path d="M3 9h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 14v6h14v-6" /><path d="M10 20v-4h4v4" />
      </svg>
    </span>
  )
}

const ZONE_COLORS: Record<number, string> = { 1: '#2E7D1A', 2: '#F59E0B', 3: '#0EA5E9' }
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const defaultHours = (): StoreHours[] => DAY_ORDER.map((day) => ({ day, open: '06:00', close: '22:00' }))

function centroid(points: [number, number][]): [number, number] {
  const lat = points.reduce((a, p) => a + p[0], 0) / Math.max(1, points.length)
  const lng = points.reduce((a, p) => a + p[1], 0) / Math.max(1, points.length)
  return [+lat.toFixed(5), +lng.toFixed(5)]
}

/* ── Store add/edit dialog (RHF + zod) ─────────────────────── */
const storeSchema = z.object({
  name: z.string().min(2, 'Store name is required'),
  location: z.string().min(4, 'Location is required'),
  cityId: z.string().min(1, 'Pick a city'),
  capacityOrdersPerDay: z.coerce.number({ invalid_type_error: 'Capacity must be a number' }).int('Whole number only').min(1, 'Capacity must be at least 1').max(5000, 'Capacity looks too high'),
  status: z.enum(['online', 'paused']),
  codAvailable: z.boolean(),
  legalEntityId: z.string().min(1, 'Pick a legal entity'),
})
type StoreFormValues = z.infer<typeof storeSchema>

function StoreFormDialog({ open, onOpenChange, initial, cities, entities, codOn, onSubmit }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: Store | null
  cities: City[]
  entities: LegalEntity[]
  codOn: boolean
  onSubmit: (values: StoreFormValues) => void
}) {
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: { name: '', location: '', cityId: '', capacityOrdersPerDay: 200, status: 'online', codAvailable: true, legalEntityId: '' },
  })
  useEffect(() => {
    if (open) {
      reset(initial
        ? { name: initial.name, location: initial.location, cityId: initial.cityId, capacityOrdersPerDay: initial.capacityOrdersPerDay, status: initial.status, codAvailable: initial.codAvailable, legalEntityId: initial.legalEntityId }
        : { name: '', location: '', cityId: '', capacityOrdersPerDay: 200, status: 'online', codAvailable: true, legalEntityId: '' })
    }
  }, [open, initial, reset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={initial ? `Edit ${initial.name}` : 'Add store'} description={initial ? 'Update store configuration' : 'Create a new delivery store'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Field label="Store name" required error={errors.name?.message}><Input {...register('name')} placeholder="e.g. Khar West Store" /></Field>
          <Field label="Location" required error={errors.location?.message}><Input {...register('location')} placeholder="Shop address line" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" required error={errors.cityId?.message}>
              <Controller control={control} name="cityId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} options={cities.map((c) => ({ value: c.id, label: c.name }))} placeholder="Pick city" />
              )} />
            </Field>
            <Field label="Capacity (orders/day)" required error={errors.capacityOrdersPerDay?.message}>
              <Input type="number" {...register('capacityOrdersPerDay')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Controller control={control} name="status" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} options={[{ value: 'online', label: 'Online' }, { value: 'paused', label: 'Paused' }]} />
              )} />
            </Field>
            <Field label="Legal entity" required error={errors.legalEntityId?.message}>
              <Controller control={control} name="legalEntityId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} options={entities.map((e) => ({ value: e.id, label: e.name }))} placeholder="Pick entity" />
              )} />
            </Field>
          </div>
          {codOn && (
            <Controller control={control} name="codAvailable" render={({ field }) => (
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
                <div>
                  <Label className="mb-0">COD available</Label>
                  <p className="text-xs text-muted-foreground">Customers can pay cash on delivery here</p>
                </div>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </div>
            )} />
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="md"><Save className="h-4 w-4" /> {initial ? 'Save changes' : 'Create store'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Zone add/edit dialog (RHF + zod) ──────────────────────── */
const zoneSchema = z.object({
  name: z.string().min(2, 'Zone name is required'),
  storeId: z.string().min(1, 'Assign the zone to a store'),
  priority: z.enum(['1', '2', '3']),
  pincodes: z.string(),
})
type ZoneFormValues = z.infer<typeof zoneSchema>

function ZoneFormDialog({ open, onOpenChange, initial, stores, onSubmit }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: Zone | null
  stores: Store[]
  onSubmit: (values: ZoneFormValues) => void
}) {
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneSchema),
    defaultValues: { name: '', storeId: '', priority: '1', pincodes: '' },
  })
  useEffect(() => {
    if (open) {
      reset(initial
        ? { name: initial.name, storeId: initial.storeId, priority: String(initial.priority) as '1' | '2' | '3', pincodes: initial.pincodes }
        : { name: '', storeId: '', priority: '1', pincodes: '' })
    }
  }, [open, initial, reset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={initial ? `Edit ${initial.name}` : 'Add service zone'} description="Zones drive dispatch assignment and delivery priority">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Field label="Zone name" required error={errors.name?.message}><Input {...register('name')} placeholder="e.g. Khar–Santacruz belt" /></Field>
          <Field label="Store" required error={errors.storeId?.message}>
            <Controller control={control} name="storeId" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} options={stores.map((s) => ({ value: s.id, label: s.name }))} placeholder="Pick store" />
            )} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Controller control={control} name="priority" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} options={[
                  { value: '1', label: 'Priority 1 — fastest dispatch' },
                  { value: '2', label: 'Priority 2' },
                  { value: '3', label: 'Priority 3' },
                ]} />
              )} />
            </Field>
            <Field label="Pincodes" hint="Space or comma separated"><Input {...register('pincodes')} placeholder="400001 400002" /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="md"><Save className="h-4 w-4" /> {initial ? 'Save zone' : 'Create zone'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Legal entity add/edit dialog (RHF + zod) ──────────────── */
const entitySchema = z.object({
  name: z.string(). min(2, 'Entity name is required'),
  gstin: z.string().regex(/^[0-9]{2}[A-Z0-9]{13}$/, 'GSTIN must be a valid 15-character identifier'),
  address: z.string(),
  invoicePrefix: z.string().max(6, 'Max 6 characters'),
})
type EntityFormValues = z.infer<typeof entitySchema>

function EntityFormDialog({ open, onOpenChange, initial, onSubmit }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: LegalEntity | null
  onSubmit: (values: EntityFormValues) => void
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EntityFormValues>({
    resolver: zodResolver(entitySchema),
    defaultValues: { name: '', gstin: '', address: '', invoicePrefix: 'DD' },
  })
  useEffect(() => {
    if (open) {
      reset(initial
        ? { name: initial.name, gstin: initial.gstin, address: initial.address, invoicePrefix: initial.invoicePrefix }
        : { name: '', gstin: '', address: '', invoicePrefix: 'DD' })
    }
  }, [open, initial, reset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={initial ? `Edit ${initial.name}` : 'Add legal entity'} description="Invoices for linked stores are issued under this entity">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Field label="Name" required error={errors.name?.message}><Input {...register('name')} placeholder="DairyDirect Retail Pvt Ltd" /></Field>
          <Field label="GSTIN" required error={errors.gstin?.message}><Input {...register('gstin')} placeholder="27AABCD1234A1Z5" className="uppercase" /></Field>
          <Field label="Registered address" error={errors.address?.message}><Input {...register('address')} placeholder="Billing address" /></Field>
          <Field label="Invoice prefix" error={errors.invoicePrefix?.message}><Input {...register('invoicePrefix')} placeholder="DDR" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="md"><Save className="h-4 w-4" /> {initial ? 'Save entity' : 'Create entity'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Store detail drawer: meta, hours, holidays, managers ──── */
function StoreDrawer({ store, cities, entities, managers, codOn, onClose, onUpdate }: {
  store: Store
  cities: City[]
  entities: LegalEntity[]
  managers: Array<{ id: string; name: string }>
  codOn: boolean
  onClose: () => void
  onUpdate: (patch: Partial<Store>) => void
}) {
  const [hoursDraft, setHoursDraft] = useState<StoreHours[]>(store.hours?.length ? store.hours : defaultHours())
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')
  const [assignPick, setAssignPick] = useState('')

  useEffect(() => {
    setHoursDraft(store.hours?.length ? store.hours : defaultHours())
    setAssignPick('')
  }, [store.id, store.hours])

  const city = cities.find((c) => c.id === store.cityId)
  const entity = entities.find((e) => e.id === store.legalEntityId)
  const assigned = managers.filter((m) => store.managerIds.includes(m.id))
  const available = managers.filter((m) => !store.managerIds.includes(m.id))

  const setDay = (day: number, patch: Partial<StoreHours>) =>
    setHoursDraft((hs) => hs.map((h) => (h.day === day ? { ...h, ...patch } : h)))

  const meta: Array<[string, React.ReactNode]> = [
    ['Location', store.location],
    ['City', city?.name ?? '—'],
    ['Capacity', `${store.capacityOrdersPerDay} orders/day`],
    ['Opened', fmtDate(store.openedOn)],
    ['Legal entity', entity?.name ?? '—'],
  ]

  return (
    <Drawer open onOpenChange={(v) => { if (!v) onClose() }} width="lg" title={store.name} subtitle={`${city?.name ?? ''} · ${store.location}`}>
      <div className="space-y-5">
        {/* header pills */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={store.status} dot />
          {codOn && (
            <Badge tone={store.codAvailable ? 'green' : 'neutral'}>
              {store.codAvailable ? 'COD available' : 'No COD'}
            </Badge>
          )}
          <Badge tone="blue">{store.capacityOrdersPerDay} orders/day capacity</Badge>
        </div>

        {/* meta rows */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-xl border border-border/70 bg-muted/30 p-4 text-[13px] sm:grid-cols-2">
          {meta.map(([k, v]) => (
            <div key={k} className="flex min-w-0 gap-2">
              <dt className="shrink-0 font-semibold text-muted-foreground">{k}:</dt>
              <dd className="min-w-0 flex-1 truncate font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        {/* admin vs manager note banner */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-warning-soft px-4 py-3 dark:border-amber-500/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-warning" />
          <p className="text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-200">{store.note ?? 'Store managers control day-to-day picking; the admin controls wider configuration.'}</p>
        </div>

        {/* weekly opening hours editor */}
        <section>
          <h4 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground"><Save className="h-3.5 w-3.5" /> Weekly opening hours</h4>
          <div className="overflow-hidden rounded-xl border border-border">
            {DAY_ORDER.map((day) => {
              const row = hoursDraft.find((h) => h.day === day) ?? { day, open: null, close: null }
              const closed = row.open == null || row.close == null
              return (
                <div key={day} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <span className="w-24 shrink-0 text-[13px] font-semibold">{DAY_NAMES[DAY_ORDER.indexOf(day)]}</span>
                  {closed ? (
                    <span className="flex-1 text-xs font-medium text-muted-foreground italic">Closed</span>
                  ) : (
                    <div className="flex flex-1 items-center gap-2">
                      <Input type="time" value={row.open ?? '06:00'} onChange={(e) => setDay(day, { open: e.target.value })} className="h-9 flex-1" />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input type="time" value={row.close ?? '22:00'} onChange={(e) => setDay(day, { close: e.target.value })} className="h-9 flex-1" />
                    </div>
                  )}
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={closed}
                      onChange={(e) => setDay(day, e.target.checked ? { open: null, close: null } : { open: '06:00', close: '22:00' })}
                      className="h-4 w-4 rounded border-input accent-[#2E7D1A]"
                    />
                    Closed
                  </label>
                </div>
              )
            })}
          </div>
          <Button size="sm" variant="primary" className="mt-2" onClick={() => onUpdate({ hours: hoursDraft })}>
            <Save className="h-3.5 w-3.5" /> Save hours
          </Button>
        </section>

        {/* holiday calendar */}
        <section>
          <h4 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Holiday calendar</h4>
          <div className="space-y-1.5">
            {store.holidays.length === 0 && <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground">No holidays configured</p>}
            {store.holidays.map((h) => (
              <div key={h.date + h.name} className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2">
                <Badge tone="violet">{fmtDate(h.date)}</Badge>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{h.name}</span>
                <Button size="iconSm" variant="ghost" aria-label="Remove holiday" onClick={() => onUpdate({ holidays: store.holidays.filter((x) => !(x.date === h.date && x.name === h.name)) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="w-40"><Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} /></div>
            <div className="min-w-[180px] flex-1"><Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Holiday name" /></div>
            <Button size="sm" variant="outline" disabled={!holidayDate || !holidayName.trim()} onClick={() => { onUpdate({ holidays: [...store.holidays, { date: holidayDate, name: holidayName.trim() }] }); setHolidayDate(''); setHolidayName('') }}>
              <Plus className="h-3.5 w-3.5" /> Add holiday
            </Button>
          </div>
        </section>

        {/* managers */}
        <section>
          <h4 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" /> Store managers</h4>
          <div className="space-y-1.5">
            {assigned.length === 0 && <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground">No manager assigned</p>}
            {assigned.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-brand-700 dark:text-brand-300">{m.name.split(' ').map((p) => p[0]).join('')}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{m.name}</span>
                <Tooltip content="Remove this manager from the store">
                  <span>
                    <Button size="iconSm" variant="ghost" aria-label="Unassign manager" disabled={store.managerIds.length <= 1} onClick={() => onUpdate({ managerIds: store.managerIds.filter((id) => id !== m.id) })}>
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </Tooltip>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Select value={assignPick} onValueChange={setAssignPick} placeholder="Assign a manager…" options={available.map((m) => ({ value: m.id, label: m.name }))} disabled={available.length === 0} />
            </div>
            <Button size="sm" variant="outline" disabled={!assignPick} onClick={() => { onUpdate({ managerIds: [...store.managerIds, assignPick] }); setAssignPick('') }}>
              <UserPlus className="h-3.5 w-3.5" /> Assign
            </Button>
          </div>
        </section>
      </div>
    </Drawer>
  )
}

/* ── Page ──────────────────────────────────────────────────── */
type MainTab = 'stores' | 'cities' | 'entities'

export function AdminStores() {
  const container = useStagger()
  const codOn = useFeature('cod')
  const [tab, setTab] = useState<MainTab>('stores')

  const storesQ = useStores()
  const zonesQ = useZones()
  const citiesQ = useCities()
  const entitiesQ = useLegalEntities()
  const workforceQ = useWorkforce({ role: 'store_manager', pageSize: 200 })
  const actions = useStoreActions()

  const stores = storesQ.data ?? []
  const zones = zonesQ.data ?? []
  const cities = citiesQ.data ?? []
  const entities = entitiesQ.data ?? []
  const managers = (workforceQ.data?.rows ?? []).map((m) => ({ id: m.id, name: m.name }))

  // stores tab UI state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [codFilter, setCodFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pauseTarget, setPauseTarget] = useState<Store | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null)

  // zone UI state
  const [zoneFormOpen, setZoneFormOpen] = useState(false)
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [zoneDeleteTarget, setZoneDeleteTarget] = useState<Zone | null>(null)
  const [boundaryZoneId, setBoundaryZoneId] = useState<string | null>(null)

  // entity UI state
  const [entityFormOpen, setEntityFormOpen] = useState(false)
  const [editingEntity, setEditingEntity] = useState<LegalEntity | null>(null)
  const [entityDeleteTarget, setEntityDeleteTarget] = useState<LegalEntity | null>(null)

  const detailStore = stores.find((s) => s.id === detailId) ?? null

  const filteredStores = useMemo(() => stores.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (codFilter !== 'all' && s.codAvailable !== (codFilter === 'cod')) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !s.location.toLowerCase().includes(q)) return false
    }
    return true
  }), [stores, search, statusFilter, codFilter])

  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? '—'
  const managerNames = (ids: string[]) => ids.map((id) => managers.find((m) => m.id === id)?.name).filter(Boolean).join(', ') || '—'

  const mapCenter = useMemo<[number, number]>(() => {
    const all = zones.flatMap((z) => z.polygon)
    return all.length ? centroid(all) : [19.076, 72.8777]
  }, [zones])

  const detail = (
    <DataTable
      keyId={(s) => s.id}
      rows={filteredStores}
      loading={storesQ.isLoading}
      onRowClick={(s) => setDetailId(s.id)}
      empty={<EmptyState icon={StoreIcon} title="No stores match" body="Adjust the search, status or COD filters." />}
      columns={[
        {
          key: 'name', header: 'Store',
          render: (s: Store) => (
            <div className="flex items-center gap-3">
              <StoreThumb variant={s.imageVariant} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.location}</p>
              </div>
            </div>
          ),
        },
        { key: 'city', header: 'City', render: (s: Store) => cityName(s.cityId) },
        { key: 'capacity', header: 'Capacity', render: (s: Store) => <span className="tabular">{s.capacityOrdersPerDay} orders/day</span> },
        { key: 'managers', header: 'Managers', render: (s: Store) => <span className="text-[13px]">{managerNames(s.managerIds)}</span> },
        ...(codOn ? [{
          key: 'cod', header: 'COD',
          render: (s: Store) => <Badge tone={s.codAvailable ? 'green' : 'neutral'}>{s.codAvailable ? 'Yes' : 'No'}</Badge>,
        }] : []),
        { key: 'status', header: 'Status', render: (s: Store) => <StatusPill status={s.status} dot /> },
        {
          key: 'actions', header: '', align: 'right' as const,
          render: (s: Store) => (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="iconSm" variant="ghost" aria-label={`Actions for ${s.name}`}><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownItem onSelect={() => { setEditingStore(s); setFormOpen(true) }}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownItem>
                  <DropdownItem onSelect={() => setPauseTarget(s)}>
                    {s.status === 'online' ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem danger onSelect={() => setDeleteTarget(s)}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        },
      ]}
    />
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stores &"
        titleAccent="service areas"
        subtitle="Delivery stores, dispatch zones and the legal entities that bill them."
        illustration={<CityScene />}
        breadcrumb={['Stores']}
      />

      <motion.div variants={container.container} initial="hidden" animate="show" className="space-y-4">
        <motion.div variants={container.item}>
          <TabPills
            id="stores-tabs"
            value={tab}
            onChange={(v) => setTab(v as MainTab)}
            tabs={[
              { value: 'stores', label: 'Stores', count: stores.length },
              { value: 'cities', label: 'Cities & zones', count: zones.length },
              { value: 'entities', label: 'Legal entities', count: entities.length },
            ]}
          />
        </motion.div>

        {/* ── STORES tab ── */}
        {tab === 'stores' && (
          <motion.section variants={container.item} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <SearchInput value={search} onChange={setSearch} placeholder="Search stores by name or location…" className="min-w-[220px] flex-1" />
              <div className="w-36">
                <Select value={statusFilter} onValueChange={setStatusFilter} options={[
                  { value: 'all', label: 'All statuses' }, { value: 'online', label: 'Online' }, { value: 'paused', label: 'Paused' },
                ]} />
              </div>
              {codOn && (
                <div className="w-40">
                  <Select value={codFilter} onValueChange={setCodFilter} options={[
                    { value: 'all', label: 'COD: all' }, { value: 'cod', label: 'COD available' }, { value: 'nocod', label: 'No COD' },
                  ]} />
                </div>
              )}
              <Button variant="primary" size="md" onClick={() => { setEditingStore(null); setFormOpen(true) }}>
                <Plus className="h-4 w-4" /> Add Store
              </Button>
            </div>
            <Card className="overflow-hidden">{detail}</Card>
          </motion.section>
        )}

        {/* ── CITIES & ZONES tab ── */}
        {tab === 'cities' && (
          <motion.section variants={container.item} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight"><MapIcon className="h-4 w-4 text-brand-600" /> Cities & zones</h3>
                  <Button size="sm" variant="primary" onClick={() => { setEditingZone(null); setZoneFormOpen(true) }}><Plus className="h-3.5 w-3.5" /> Add zone</Button>
                </div>
                {citiesQ.isLoading ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Loading zones…</p>
                ) : zones.length === 0 ? (
                  <EmptyState icon={Route} title="No service zones yet" body="Create the first zone to start dispatching." />
                ) : (
                  <div className="space-y-4">
                    {cities.map((city) => {
                      const cityZones = zones.filter((z) => z.cityId === city.id)
                      if (cityZones.length === 0) return null
                      return (
                        <div key={city.id}>
                          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            <MapPin className="h-3 w-3 text-brand-600" /> {city.name}
                          </p>
                          <div className="space-y-1.5">
                            {cityZones.map((z) => {
                              const store = stores.find((s) => s.id === z.storeId)
                              return (
                                <div key={z.id} className={cn('rounded-xl border px-3 py-2.5', boundaryZoneId === z.id ? 'border-brand-300 bg-primary-softer' : 'border-border/70')}>
                                  <div className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{z.name}</span>
                                    <Badge tone={z.priority === 1 ? 'green' : z.priority === 2 ? 'amber' : 'blue'}>P{z.priority}</Badge>
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">{store?.name ?? '—'} · pincodes {z.pincodes || '—'}</p>
                                  <div className="mt-2 flex items-center gap-1.5">
                                    <Button size="sm" variant="ghost" onClick={() => { setEditingZone(z); setZoneFormOpen(true) }}><Pencil className="h-3 w-3" /> Edit</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setBoundaryZoneId(boundaryZoneId === z.id ? null : z.id)}>
                                      <Route className="h-3 w-3" /> {boundaryZoneId === z.id ? 'Close boundary' : 'Edit boundary'}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setZoneDeleteTarget(z)}><Trash2 className="h-3 w-3" /> Delete</Button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </div>
            <div className="lg:col-span-7">
              <Card className="relative overflow-hidden p-0">
                {boundaryZoneId ? (() => {
                  const z = zones.find((x) => x.id === boundaryZoneId)
                  if (!z) return null
                  return (
                    <Suspense fallback={<div className="skeleton h-[480px] w-full rounded-card" />}>
                      <PolygonEditor
                        center={centroid(z.polygon)}
                        initialPoints={z.polygon}
                        color={ZONE_COLORS[z.priority]}
                        onSave={(points) => { actions.updateZone(z.id, { polygon: points }); setBoundaryZoneId(null) }}
                        onCancel={() => setBoundaryZoneId(null)}
                      />
                    </Suspense>
                  )
                })() : (
                  <div className="relative h-[480px] w-full">
                    <LazyMap
                      center={mapCenter}
                      zoom={8}
                      showZoom
                      polygons={zones.map((z) => ({ points: z.polygon, color: ZONE_COLORS[z.priority] ?? '#2E7D1A', label: `${z.name} · P${z.priority}` }))}
                      markers={stores.map((s, i) => ({ coords: s.coords, color: STORE_TINTS[i % STORE_TINTS.length]!, label: s.name }))}
                    />
                    <ZoneLegend />
                  </div>
                )}
              </Card>
              {boundaryZoneId && (
                <p className="mt-2 text-xs text-muted-foreground">Editing boundary for <span className="font-semibold">{zones.find((x) => x.id === boundaryZoneId)?.name}</span> — drag the vertex handles, click the map to add points, then save.</p>
              )}
            </div>
          </motion.section>
        )}

        {/* ── LEGAL ENTITIES tab ── */}
        {tab === 'entities' && (
          <motion.section variants={container.item} className="space-y-3">
            <div className="flex justify-end">
              <Button variant="primary" size="md" onClick={() => { setEditingEntity(null); setEntityFormOpen(true) }}>
                <Plus className="h-4 w-4" /> Add entity
              </Button>
            </div>
            <Card className="overflow-hidden">
              <DataTable
                keyId={(e) => e.id}
                rows={entities}
                loading={entitiesQ.isLoading}
                empty={<EmptyState icon={Building2} title="No legal entities" body="Add the first billing entity." />}
                columns={[
                  { key: 'name', header: 'Entity', render: (e: LegalEntity) => <span className="font-semibold">{e.name}</span> },
                  { key: 'gstin', header: 'GSTIN', render: (e: LegalEntity) => <span className="font-mono text-xs">{e.gstin}</span> },
                  { key: 'address', header: 'Address', render: (e: LegalEntity) => <span className="text-[13px] text-muted-foreground">{e.address || '—'}</span> },
                  { key: 'prefix', header: 'Invoice prefix', render: (e: LegalEntity) => <Badge tone="blue">{e.invoicePrefix}</Badge> },
                  { key: 'stores', header: 'Stores linked', render: (e: LegalEntity) => <span className="tabular">{stores.filter((s) => s.legalEntityId === e.id).length}</span> },
                  {
                    key: 'actions', header: '', align: 'right' as const,
                    render: (e: LegalEntity) => {
                      const linked = stores.filter((s) => s.legalEntityId === e.id).length
                      return (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingEntity(e); setEntityFormOpen(true) }}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                          <Tooltip content={linked > 0 ? `${linked} store${linked > 1 ? 's' : ''} still linked — unlink before deleting` : 'Delete entity'}>
                            <span>
                              <Button size="sm" variant="ghost" className="text-destructive" disabled={linked > 0} onClick={() => setEntityDeleteTarget(e)}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete
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
      </motion.div>

      {/* ── Store detail drawer ── */}
      {detailStore && (
        <StoreDrawer
          store={detailStore}
          cities={cities}
          entities={entities}
          managers={managers}
          codOn={codOn}
          onClose={() => setDetailId(null)}
          onUpdate={(patch) => actions.updateStore(detailStore.id, patch, detailStore.name)}
        />
      )}

      {/* ── Store add/edit ── */}
      <StoreFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editingStore}
        cities={cities}
        entities={entities}
        codOn={codOn}
        onSubmit={(v) => {
          if (editingStore) {
            actions.updateStore(editingStore.id, v, editingStore.name)
          } else {
            const city = cities.find((c) => c.id === v.cityId)
            actions.addStore({
              id: `st-${Date.now()}`,
              code: `ST-${String(Date.now()).slice(-4)}`,
              name: v.name,
              location: v.location,
              cityId: v.cityId,
              coords: city?.coords ?? [19.076, 72.8777],
              capacityOrdersPerDay: v.capacityOrdersPerDay,
              status: v.status,
              codAvailable: v.codAvailable,
              legalEntityId: v.legalEntityId,
              managerIds: [],
              openedOn: new Date().toISOString().slice(0, 10),
              imageVariant: stores.length % 8,
              hours: defaultHours(),
              holidays: [],
              pickingBacklog: 0,
              note: 'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).',
            })
          }
          setFormOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!pauseTarget}
        onOpenChange={(v) => { if (!v) setPauseTarget(null) }}
        title={pauseTarget?.status === 'online' ? `Pause ${pauseTarget?.name}?` : `Resume ${pauseTarget?.name}?`}
        description={pauseTarget?.status === 'online'
          ? 'Paused stores stop accepting new orders until resumed. In-flight orders are unaffected.'
          : 'Resuming puts the store back into the dispatch rotation immediately.'}
        confirmLabel={pauseTarget?.status === 'online' ? 'Pause store' : 'Resume store'}
        destructive={pauseTarget?.status === 'online'}
        onConfirm={() => { if (pauseTarget) actions.updateStore(pauseTarget.id, { status: pauseTarget.status === 'online' ? 'paused' : 'online' }, pauseTarget.name); setPauseTarget(null) }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
        title={`Delete ${deleteTarget?.name}?`}
        description="The store and its service zones are removed. Historical orders are kept."
        confirmLabel="Delete store"
        destructive
        onConfirm={() => { if (deleteTarget) actions.deleteStore(deleteTarget.id, deleteTarget.name); setDeleteTarget(null) }}
      />

      {/* ── Zone add/edit/delete ── */}
      <ZoneFormDialog
        open={zoneFormOpen}
        onOpenChange={setZoneFormOpen}
        initial={editingZone}
        stores={stores}
        onSubmit={(v) => {
          if (editingZone) {
            actions.updateZone(editingZone.id, { name: v.name, storeId: v.storeId, priority: Number(v.priority) as 1 | 2 | 3, pincodes: v.pincodes })
          } else {
            const store = stores.find((s) => s.id === v.storeId)
            const city = cities.find((c) => c.id === store?.cityId) ?? cities[0]
            const c = city?.coords ?? [19.076, 72.8777]
            actions.addZone({
              id: `z-${Date.now()}`,
              storeId: v.storeId,
              cityId: city?.id ?? 'mumbai',
              name: v.name,
              priority: Number(v.priority) as 1 | 2 | 3,
              pincodes: v.pincodes,
              polygon: [[c[0] - 0.015, c[1] - 0.015], [c[0] - 0.015, c[1] + 0.015], [c[0] + 0.015, c[1] + 0.015], [c[0] + 0.015, c[1] - 0.015]],
            })
          }
          setZoneFormOpen(false)
        }}
      />
      <ConfirmDialog
        open={!!zoneDeleteTarget}
        onOpenChange={(v) => { if (!v) setZoneDeleteTarget(null) }}
        title={`Delete zone ${zoneDeleteTarget?.name}?`}
        description="Customers in this zone stop being dispatchable until a new zone covers them."
        confirmLabel="Delete zone"
        destructive
        onConfirm={() => { if (zoneDeleteTarget) actions.deleteZone(zoneDeleteTarget.id, zoneDeleteTarget.name); setZoneDeleteTarget(null) }}
      />

      {/* ── Entity add/edit/delete ── */}
      <EntityFormDialog
        open={entityFormOpen}
        onOpenChange={setEntityFormOpen}
        initial={editingEntity}
        onSubmit={(v) => {
          if (editingEntity) actions.updateLegalEntity(editingEntity.id, v)
          else actions.addLegalEntity({ id: `le-${Date.now()}`, name: v.name, gstin: v.gstin.toUpperCase(), address: v.address, invoicePrefix: v.invoicePrefix.toUpperCase() })
          setEntityFormOpen(false)
        }}
      />
      <ConfirmDialog
        open={!!entityDeleteTarget}
        onOpenChange={(v) => { if (!v) setEntityDeleteTarget(null) }}
        title={`Delete ${entityDeleteTarget?.name}?`}
        description="Only entities with no linked stores can be deleted."
        confirmLabel="Delete entity"
        destructive
        onConfirm={() => { if (entityDeleteTarget) actions.deleteLegalEntity(entityDeleteTarget.id, entityDeleteTarget.name); setEntityDeleteTarget(null) }}
      />
    </div>
  )
}

