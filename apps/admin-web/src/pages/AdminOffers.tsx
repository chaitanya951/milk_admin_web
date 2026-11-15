// ── §9 Offers & notifications ────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  Banknote, Bell, Check, Megaphone, Package, Plus, Settings2, ShieldCheck, Store,
  Tag, LifeBuoy, type LucideIcon,
} from 'lucide-react'
import { cn, fmtDateTime, fmtINR, fmtNum, timeAgo } from '@dairydirect/shared/lib/utils'
import { Badge, Button, Card, Checkbox, Input, Progress, Textarea } from '@dairydirect/shared/ui/base'
import { Dialog, DialogContent } from '@dairydirect/shared/ui/overlays'
import { Field, Select } from '@dairydirect/shared/ui/form'
import { EmptyState, PageHeader, SearchInput, TabPills } from '@dairydirect/shared/ui/misc'
import { StatusPill } from '@dairydirect/shared/ui/misc'
import { DataTable, Pagination, type Column } from '@dairydirect/shared/ui/DataTable'
import { KpiCard } from '@dairydirect/shared/ui/KpiCard'
import { Logo } from '@dairydirect/shared/assets/Logo'
import { OffersScene } from '@dairydirect/shared/assets/scenes'
import { useDebouncedValue, useStagger } from '@dairydirect/shared/hooks/misc'
import {
  useAdminNotifications, useCampaigns, useCoupons, useCustomers, useProducts, useStores,
} from '@/api/queries'
import { useOfferActions } from '@/api/mutations'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { DEMO_NOW } from '@dairydirect/shared/mock-db/seed'
import type { AdminNotification, Coupon, CouponKind, PushCampaign } from '@dairydirect/shared/types'

const OFFER_TABS = [
  { value: 'coupons', label: 'Coupons' },
  { value: 'campaigns', label: 'Push campaigns' },
  { value: 'notifications', label: 'My notifications' },
]
const KIND_LABEL: Record<CouponKind, string> = { percentage: 'Percentage', flat: 'Flat', free_delivery: 'Free delivery' }
const AUDIENCE_LABEL: Record<PushCampaign['audience'], string> = {
  all_customers: 'All customers', subscription_users: 'Subscription users', selected_users: 'Selected users',
}
const NOTIF_ICON: Record<AdminNotification['kind'], LucideIcon> = {
  order: Package, store: Store, payout: Banknote, approval: ShieldCheck, support: LifeBuoy, system: Settings2,
}

/* ── Coupon value display helper ────────────────────────────── */
function couponValue(c: Coupon): string {
  if (c.kind === 'percentage') return `${c.value}%`
  if (c.kind === 'flat') return fmtINR(c.value)
  return 'Free delivery'
}

/* ── Coupon create/edit dialog (RHF + zod) ──────────────────── */
const couponSchema = z.object({
  code: z.string().min(2, 'Code is required').regex(/^[A-Z0-9_-]+$/, 'Use uppercase letters and numbers only'),
  kind: z.enum(['percentage', 'flat', 'free_delivery']),
  value: z.string().optional(),
  minOrderValue: z.coerce.number().min(0, 'Must be 0 or more'),
  startsOn: z.string().min(1, 'Start date is required'),
  endsOn: z.string().min(1, 'End date is required'),
  usageLimit: z.coerce.number().int().min(1, 'Must be at least 1'),
  eligibleStoreIds: z.array(z.string()),
  eligibleProductIds: z.array(z.string()),
}).superRefine((v, ctx) => {
  if (v.kind !== 'free_delivery') {
    const n = Number(v.value)
    if (!v.value || !Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Value is required for this kind' })
    }
  }
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsOn'], message: 'End date must be after start date' })
  }
})
type CouponForm = z.infer<typeof couponSchema>

function CouponDialog({ existing, onClose }: { existing?: Coupon; onClose: () => void }) {
  const offerActions = useOfferActions()
  const storesQuery = useStores()
  const productsQuery = useProducts({ pageSize: 100 })
  const stores = storesQuery.data ?? []
  const products = (productsQuery.data?.rows ?? []).map((r) => r.product)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CouponForm>({
    resolver: zodResolver(couponSchema),
    defaultValues: existing
      ? {
          code: existing.code, kind: existing.kind, value: String(existing.value || ''),
          minOrderValue: existing.minOrderValue, startsOn: existing.startsOn, endsOn: existing.endsOn,
          usageLimit: existing.usageLimit, eligibleStoreIds: existing.eligibleStoreIds, eligibleProductIds: existing.eligibleProductIds,
        }
      : { code: '', kind: 'percentage', value: '', minOrderValue: 0, startsOn: '', endsOn: '', usageLimit: 100, eligibleStoreIds: [], eligibleProductIds: [] },
  })
  useEffect(() => {
    reset(existing
      ? {
          code: existing.code, kind: existing.kind, value: String(existing.value || ''),
          minOrderValue: existing.minOrderValue, startsOn: existing.startsOn, endsOn: existing.endsOn,
          usageLimit: existing.usageLimit, eligibleStoreIds: existing.eligibleStoreIds, eligibleProductIds: existing.eligibleProductIds,
        }
      : { code: '', kind: 'percentage', value: '', minOrderValue: 0, startsOn: '', endsOn: '', usageLimit: 100, eligibleStoreIds: [], eligibleProductIds: [] })
  }, [existing, reset])

  const kind = watch('kind')
  const storeIds = watch('eligibleStoreIds')
  const productIds = watch('eligibleProductIds')
  const toggle = (field: 'eligibleStoreIds' | 'eligibleProductIds', id: string) => {
    const cur = field === 'eligibleStoreIds' ? storeIds : productIds
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    setValue(field, next, { shouldValidate: false })
  }

  const submit = handleSubmit((v) => {
    const patch = {
      code: v.code,
      kind: v.kind,
      value: v.kind === 'free_delivery' ? 0 : Number(v.value),
      minOrderValue: v.minOrderValue,
      startsOn: v.startsOn,
      endsOn: v.endsOn,
      usageLimit: v.usageLimit,
      eligibleStoreIds: v.eligibleStoreIds,
      eligibleProductIds: v.eligibleProductIds,
    }
    if (existing) offerActions.updateCoupon(existing.id, patch, v.code)
    else offerActions.addCoupon({ id: `cp-${Date.now()}`, ...patch, usedCount: 0, status: 'active' })
    onClose()
  })

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent wide title={existing ? `Edit coupon ${existing.code}` : 'Create coupon'} description="Coupons apply at checkout within their validity window and eligible stores/products.">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" required error={errors.code?.message}>
              <Input
                value={watch('code')}
                onChange={(e) => setValue('code', e.target.value.toUpperCase(), { shouldValidate: true })}
                placeholder="DAIRY10"
                className="font-mono uppercase"
              />
            </Field>
            <Field label="Kind" required>
              <Select
                value={kind}
                onValueChange={(v) => setValue('kind', v as CouponKind, { shouldValidate: true })}
                options={[
                  { value: 'percentage', label: 'Percentage off' },
                  { value: 'flat', label: 'Flat amount off' },
                  { value: 'free_delivery', label: 'Free delivery' },
                ]}
              />
            </Field>
            {kind !== 'free_delivery' && (
              <Field label={kind === 'percentage' ? 'Discount %' : 'Discount ₹'} required error={errors.value?.message}>
                <Input type="number" min={1} {...register('value')} placeholder={kind === 'percentage' ? 'e.g. 10' : 'e.g. 50'} />
              </Field>
            )}
            <Field label="Min order value ₹" required error={errors.minOrderValue?.message}>
              <Input type="number" min={0} {...register('minOrderValue')} />
            </Field>
            <Field label="Starts on" required error={errors.startsOn?.message}>
              <Input type="date" {...register('startsOn')} />
            </Field>
            <Field label="Ends on" required error={errors.endsOn?.message}>
              <Input type="date" {...register('endsOn')} />
            </Field>
            <Field label="Usage limit" required error={errors.usageLimit?.message}>
              <Input type="number" min={1} {...register('usageLimit')} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Eligible stores (${storeIds.length} selected)`}>
              <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 p-3">
                {stores.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <Checkbox checked={storeIds.includes(s.id)} onCheckedChange={() => toggle('eligibleStoreIds', s.id)} ariaLabel={`Include ${s.name}`} />
                    {s.name}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={`Eligible products (${productIds.length} selected)`}>
              <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 p-3">
                {products.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <Checkbox checked={productIds.includes(p.id)} onCheckedChange={() => toggle('eligibleProductIds', p.id)} ariaLabel={`Include ${p.name}`} />
                    {p.name}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="md">{existing ? 'Save changes' : 'Create coupon'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Coupons tab ────────────────────────────────────────────── */
function CouponsTab() {
  const offerActions = useOfferActions()
  const query = useCoupons()
  const [search, setSearch] = useState('')
  const debSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Coupon | null>(null)
  useEffect(() => { setPage(1) }, [debSearch])

  const rows = (query.data ?? []).filter((c) => {
    if (!debSearch) return true
    const q = debSearch.toLowerCase()
    return c.code.toLowerCase().includes(q) || KIND_LABEL[c.kind].toLowerCase().includes(q)
  })

  const cols: Array<Column<Coupon>> = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-[13px] font-bold">{r.code}</span> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge tone={r.kind === 'percentage' ? 'violet' : r.kind === 'flat' ? 'blue' : 'green'}>{KIND_LABEL[r.kind]}</Badge> },
    { key: 'value', header: 'Value', render: (r) => <span className="font-semibold">{couponValue(r)}</span> },
    { key: 'minOrderValue', header: 'Min order', align: 'right', render: (r) => <span className="tabular">{fmtINR(r.minOrderValue)}</span> },
    { key: 'validity', header: 'Validity', render: (r) => <span className="text-xs text-muted-foreground">{fmtShort(r.startsOn)} – {fmtShort(r.endsOn)}</span> },
    {
      key: 'usage', header: 'Usage',
      render: (r) => (
        <div className="w-32">
          <p className="text-[11px] font-semibold tabular">{fmtNum(r.usedCount)}/{fmtNum(r.usageLimit)}</p>
          <div className="mt-1"><Progress value={(r.usedCount / Math.max(1, r.usageLimit)) * 100} /></div>
        </div>
      ),
    },
    { key: 'eligible', header: 'Eligible', render: (r) => <span className="text-xs text-muted-foreground">{r.eligibleStoreIds.length} stores · {r.eligibleProductIds.length} products</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'active'} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {r.status === 'active' ? (
            <Button variant="ghost" size="sm" onClick={() => offerActions.updateCoupon(r.id, { status: 'inactive' }, r.code)}>Deactivate</Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => offerActions.updateCoupon(r.id, { status: 'active' }, r.code)}>Activate</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setEditTarget(r); setDialogOpen(true) }}>Edit</Button>
        </div>
      ),
    },
  ]

  const total = rows.length
  const totalPages = Math.ceil(total / 8)
  const start = total === 0 ? 0 : (page - 1) * 8 + 1

  return (
    <motion.div variants={{}} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput className="w-full sm:w-64" value={search} onChange={setSearch} placeholder="Search coupon code…" />
        <div className="ml-auto">
          <Button variant="primary" size="md" onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
            <Plus className="h-4 w-4" /> Create coupon
          </Button>
        </div>
      </div>
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={rows.slice((page - 1) * 8, page * 8)}
          keyId={(r) => r.id}
          loading={query.isLoading}
          skeletonRows={6}
          empty={<EmptyState icon={Tag} title="No coupons found" body="Try a different search." />}
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
      {dialogOpen && <CouponDialog existing={editTarget ?? undefined} onClose={() => { setDialogOpen(false); setEditTarget(null) }} />}
    </motion.div>
  )
}
function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

/* ── Campaign create dialog (RHF + zod) ─────────────────────── */
const campaignSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  audience: z.enum(['all_customers', 'subscription_users', 'selected_users']),
  selectedUserIds: z.array(z.string()),
  title: z.string().min(2, 'Title is required'),
  body: z.string().min(2, 'Body is required'),
  scheduledAt: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.audience === 'selected_users' && v.selectedUserIds.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedUserIds'], message: 'Select at least one customer' })
  }
})
type CampaignForm = z.infer<typeof campaignSchema>

function CampaignDialog({ onClose }: { onClose: () => void }) {
  const db = useDB((s) => s.db)
  const offerActions = useOfferActions()
  const customersQuery = useCustomers({ pageSize: 100 })
  const [mode, setMode] = useState<'draft' | 'scheduled'>('draft')

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { name: '', audience: 'all_customers', selectedUserIds: [], title: '', body: '', scheduledAt: '' },
  })
  const audience = watch('audience')
  const selected = watch('selectedUserIds')
  const scheduledAt = watch('scheduledAt')

  const submit = handleSubmit((v) => {
    offerActions.addCampaign({
      id: `pmc-${Date.now()}`,
      name: v.name.trim(),
      audience: v.audience,
      selectedUserIds: v.selectedUserIds,
      title: v.title.trim(),
      body: v.body.trim(),
      status: mode === 'draft' ? 'draft' : 'scheduled',
      scheduledAt: mode === 'scheduled' && v.scheduledAt ? new Date(v.scheduledAt).toISOString() : undefined,
      recipients: v.audience === 'selected_users'
        ? v.selectedUserIds.length
        : v.audience === 'subscription_users'
          ? Math.floor(db.customers.length * 0.4)
          : db.customers.length,
    })
    onClose()
  })

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent wide title="Create push campaign" description="Draft now, schedule for later, or send from the campaign card once reviewed.">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Campaign name" required error={errors.name?.message}>
              <Input {...register('name')} placeholder="e.g. Republic Day milk offer" />
            </Field>
            <Field label="Audience" required>
              <Select
                value={audience}
                onValueChange={(v) => setValue('audience', v as CampaignForm['audience'], { shouldValidate: true })}
                options={[
                  { value: 'all_customers', label: 'All customers' },
                  { value: 'subscription_users', label: 'Subscription users' },
                  { value: 'selected_users', label: 'Selected users' },
                ]}
              />
            </Field>
          </div>
          {audience === 'selected_users' && (
            <Field label={`Selected customers (${selected.length})`} error={errors.selectedUserIds?.message}>
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 p-3">
                {(customersQuery.data?.rows ?? []).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <Checkbox
                      checked={selected.includes(c.id)}
                      onCheckedChange={() => setValue('selectedUserIds', selected.includes(c.id) ? selected.filter((x) => x !== c.id) : [...selected, c.id], { shouldValidate: true })}
                      ariaLabel={`Include ${c.name}`}
                    />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.id}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}
          <Field label="Title" required error={errors.title?.message}>
            <Input {...register('title')} placeholder="Push notification title" />
          </Field>
          <Field label="Body" required error={errors.body?.message}>
            <Textarea {...register('body')} placeholder="Push notification body — keep it short and actionable." />
          </Field>
          {mode === 'scheduled' && (
            <Field label="Schedule for" required>
              <Input type="datetime-local" {...register('scheduledAt')} />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button type="button" variant="secondary" size="md" onClick={() => { setMode('draft'); void submit() }}>Save as draft</Button>
            <Button
              type="button" variant="primary" size="md"
              disabled={mode === 'scheduled' && !scheduledAt}
              onClick={() => {
                if (mode === 'draft') setMode('scheduled')
                else { setMode('scheduled'); void submit() }
              }}
            >
              <Megaphone className="h-4 w-4" /> Schedule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Campaign preview dialog (phone-style push card) ────────── */
function CampaignPreviewDialog({ campaign, onClose }: { campaign: PushCampaign; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={`Preview — ${campaign.name}`} description="How the push notification appears on a customer's phone.">
        <div className="mx-auto w-[320px] rounded-[2.2rem] border-4 border-foreground/70 bg-card p-3 shadow-lift">
          <div className="rounded-2xl bg-muted/70 p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl gradient-primary"><Logo compact /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold">DairyDirect</p>
                <p className="text-[10px] text-muted-foreground">now</p>
              </div>
            </div>
            <p className="mt-2.5 text-[13.5px] font-bold leading-snug">{campaign.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{campaign.body}</p>
          </div>
          <p className="mt-2 text-center text-[10px] font-medium text-muted-foreground">Push preview · {AUDIENCE_LABEL[campaign.audience]}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Campaigns tab ──────────────────────────────────────────── */
function CampaignsTab() {
  const query = useCampaigns()
  const [createOpen, setCreateOpen] = useState(false)
  const [preview, setPreview] = useState<PushCampaign | null>(null)
  return (
    <motion.div variants={{}} className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Create campaign
        </Button>
      </div>
      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-44 rounded-card" />)}
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns yet" body="Create your first push campaign." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(query.data ?? []).map((c) => (
            <Card key={c.id} hoverable className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold">{c.name}</p>
                  <Badge tone="blue" className="mt-1">{AUDIENCE_LABEL[c.audience]}</Badge>
                </div>
                <StatusPill status={c.status} />
              </div>
              <div className="mt-3 rounded-xl bg-muted/60 px-3.5 py-3">
                <p className="text-[13px] font-bold leading-snug">{c.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.body}</p>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{fmtNum(c.recipients)} recipients</span>
                <span>{c.sentAt ? `Sent ${fmtDateTime(c.sentAt)}` : c.scheduledAt ? `Scheduled ${fmtDateTime(c.scheduledAt)}` : 'Not scheduled'}</span>
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setPreview(c)}>Preview</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {createOpen && <CampaignDialog onClose={() => setCreateOpen(false)} />}
      {preview && <CampaignPreviewDialog campaign={preview} onClose={() => setPreview(null)} />}
    </motion.div>
  )
}

/* ── My notifications tab (the bell feed) ───────────────────── */
function NotificationsTab() {
  const query = useAdminNotifications()
  const offerActions = useOfferActions()
  const notifications = query.data ?? []
  const unread = notifications.filter((n) => !n.read).length
  return (
    <motion.div variants={{}} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'All caught up'}</p>
        <Button variant="secondary" size="md" disabled={unread === 0} onClick={() => offerActions.markNotificationRead()}>
          <Check className="h-4 w-4" /> Mark all read
        </Button>
      </div>
      {query.isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" body="System and team notifications will appear here." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const Icon = NOTIF_ICON[n.kind]
            return (
              <li key={n.id} className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', n.read ? 'border-border/70 bg-card' : 'border-brand-200 bg-primary-softer')}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-brand-700 dark:text-brand-300">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                    <p className="truncate text-[13.5px] font-bold">{n.title}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{timeAgo(n.at, DEMO_NOW)}</span>
                  {!n.read && (
                    <Button variant="ghost" size="iconSm" aria-label="Mark read" onClick={() => offerActions.markNotificationRead(n.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </motion.div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
export function AdminOffers() {
  const stagger = useStagger()
  const [tab, setTab] = useState('coupons')
  const couponsQuery = useCoupons()
  const campaignsQuery = useCampaigns()

  const coupons = couponsQuery.data ?? []
  const campaigns = campaignsQuery.data ?? []
  const activeCoupons = coupons.filter((c) => c.status === 'active').length
  const scheduledCampaigns = campaigns.filter((c) => c.status === 'scheduled').length
  const sentCampaigns = campaigns.filter((c) => c.status === 'sent').length
  const discountKinds = new Set(coupons.map((c) => c.kind)).size

  return (
    <div className="space-y-5">
      <PageHeader
        title="Offers"
        titleAccent="& notifications"
        breadcrumb={['Offers']}
        subtitle="Checkout coupons, push campaigns and your own admin notification feed."
        illustration={<OffersScene />}
      />
      <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
        <motion.section variants={stagger.item} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Active coupons" value={activeCoupons} format="num" icon={Tag} tint="green" />
          <KpiCard label="Scheduled campaigns" value={scheduledCampaigns} format="num" icon={Megaphone} tint="blue" />
          <KpiCard label="Sent campaigns" value={sentCampaigns} format="num" icon={Bell} tint="violet" />
          <KpiCard label="Discount kinds" value={discountKinds} format="num" icon={Settings2} tint="amber" />
        </motion.section>
        <motion.section variants={stagger.item}>
          <TabPills id="offers-tabs" tabs={OFFER_TABS} value={tab} onChange={setTab} />
        </motion.section>
        <motion.section variants={stagger.item} key={tab}>
          {tab === 'coupons' && <CouponsTab />}
          {tab === 'campaigns' && <CampaignsTab />}
          {tab === 'notifications' && <NotificationsTab />}
        </motion.section>
      </motion.div>
    </div>
  )
}
