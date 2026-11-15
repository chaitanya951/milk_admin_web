// ── §6 People — customers · rider applications · workforce ──────────────────
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  Ban, Building2, Eye, Info, KeyRound, MoreHorizontal, ShieldOff, UserPlus,
} from 'lucide-react'
import { cn, fmtDate, fmtNum, timeAgo } from '@/shared/lib/utils'
import { toast } from '@/shared/lib/toast'
import { Badge, Button, Input, Textarea } from '@/shared/components/ui/base'
import {
  Dialog, DialogContent, Drawer, DropdownItem, DropdownMenu, DropdownMenuContent,
  DropdownMenuTrigger, Tooltip,
} from '@/shared/components/ui/overlays'
import { Field, Select } from '@/shared/components/ui/form'
import { EmptyState, PageHeader, SearchInput, TabPills } from '@/shared/components/misc'
import { StatusPill } from '@/shared/components/misc'
import { DataTable, Pagination, type Column } from '@/shared/components/DataTable'
import { InitialAvatar } from '@/shared/illustrations/avatars'
import { PeopleScene } from '@/shared/illustrations/scenes'
import { useDebouncedValue, useStagger } from '@/shared/hooks/misc'
import { useCustomers, useRiderApplications, useStoreOptions, useWorkforce } from '@/apps/admin/api/queries'
import { usePeopleActions } from '@/apps/admin/api/mutations'
import { useDB } from '@/shared/data/db'
import { DEMO_NOW } from '@/shared/data/seed'
import type { Customer, DocStatus, Rider, WorkforceAccount } from '@/shared/types'
import type { CustomerRow } from '@/shared/data/api'

const PEOPLE_TABS = [
  { value: 'customers', label: 'Customers' },
  { value: 'riders', label: 'Rider applications' },
  { value: 'workforce', label: 'Workforce' },
]
const RIDER_STATUSES = ['application_pending', 'application_approved', 'application_rejected', 'active', 'suspended'] as const

const DOC_TONE: Record<DocStatus, 'green' | 'amber' | 'neutral' | 'red'> = {
  verified: 'green', submitted: 'amber', pending: 'neutral', rejected: 'red',
}
const DOC_LABEL: Record<Rider['documents'][number]['type'], string> = {
  license: 'License', id_proof: 'ID proof', bank_details: 'Bank details',
}
const ROLE_BADGE: Record<WorkforceAccount['role'], { label: string; tone: 'amber' | 'green' | 'blue' | 'violet' }> = {
  admin: { label: 'Admin', tone: 'amber' },
  store_manager: { label: 'Store manager', tone: 'green' },
  rider: { label: 'Rider', tone: 'blue' },
  support_agent: { label: 'Support agent', tone: 'violet' },
}

/* ── small local helpers ─────────────────────────────────────── */
function LinkButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-brand-600/60 bg-transparent px-4 text-sm font-semibold text-brand-700 shadow-soft transition-all duration-200 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:text-brand-300"
    >
      {children}
    </Link>
  )
}

function ReasonDialog({
  open, title, description, confirmLabel = 'Confirm', destructive, onClose, onSubmit,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={title} description={description}>
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe why…" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'} size="md"
            disabled={reason.trim().length < 3}
            onClick={() => { onSubmit(reason.trim()); onClose() }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

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

/* ── Add / invite workforce dialog (RHF + zod) ───────────────── */
const addSchema = z.object({
  name: z.string().min(2, 'Enter the full name'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().optional(),
  role: z.enum(['store_manager', 'rider', 'support_agent']),
  storeId: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.role === 'store_manager' && !v.storeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['storeId'], message: 'Choose the store this manager will run' })
  }
})
type AddForm = z.infer<typeof addSchema>

function AddWorkforceDialog({ onClose, storeOptions }: { onClose: () => void; storeOptions: Array<{ value: string; label: string }> }) {
  const peopleActions = usePeopleActions()
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    defaultValues: { name: '', email: '', phone: '', role: 'support_agent', storeId: undefined },
  })
  const role = watch('role')
  const storeId = watch('storeId')
  useEffect(() => { reset({ name: '', email: '', phone: '', role: 'support_agent', storeId: undefined }) }, [reset])
  const submit = handleSubmit((v) => {
    peopleActions.addWorkforce({
      id: `wf-${Date.now()}`,
      name: v.name.trim(),
      email: v.email.trim(),
      password: 'Store@123',
      phone: v.phone?.trim() || '—',
      role: v.role,
      storeId: v.role === 'store_manager' ? v.storeId! : null,
      status: 'invited',
      joinedOn: DEMO_NOW.toISOString().slice(0, 10),
      avatar: Math.floor(Math.random() * 12),
    })
    onClose()
  })
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title="Add / invite team member" description="An invite email is sent — the account stays 'Invited' until first login.">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <Field label="Full name" required error={errors.name?.message}>
            <Input {...register('name')} placeholder="e.g. Priya Nair" />
          </Field>
          <Field label="Email" required error={errors.email?.message}>
            <Input {...register('email')} type="email" placeholder="name@dairydirect.in" />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Input {...register('phone')} placeholder="+91 …" />
          </Field>
          <Field label="Role" required>
            <Select
              value={role}
              onValueChange={(v) => setValue('role', v as AddForm['role'], { shouldValidate: true })}
              options={[
                { value: 'store_manager', label: 'Store manager' },
                { value: 'rider', label: 'Rider' },
                { value: 'support_agent', label: 'Support agent' },
              ]}
            />
          </Field>
          {role === 'store_manager' && (
            <Field label="Store" required error={errors.storeId?.message}>
              <Select
                value={storeId ?? 'all'}
                onValueChange={(v) => setValue('storeId', v === 'all' ? undefined : v, { shouldValidate: true })}
                options={[{ value: 'all', label: 'Choose a store…' }, ...storeOptions]}
                placeholder="Choose a store…"
              />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="md"><UserPlus className="h-4 w-4" /> Send invite</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Assign to store dialog ──────────────────────────────────── */
function AssignStoreDialog({ member, onClose, storeOptions }: { member: WorkforceAccount; onClose: () => void; storeOptions: Array<{ value: string; label: string }> }) {
  const peopleActions = usePeopleActions()
  const [storeId, setStoreId] = useState(member.storeId ?? 'all')
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={`Assign ${member.name} to a store`} description="Store managers see only the store they are assigned to.">
        <Field label="Store" required>
          <Select
            value={storeId}
            onValueChange={setStoreId}
            options={[{ value: 'all', label: 'Choose a store…' }, ...storeOptions]}
            placeholder="Choose a store…"
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary" size="md" disabled={storeId === 'all'}
            onClick={() => { peopleActions.updateWorkforce(member.id, { storeId }, member.name); onClose() }}
          >
            <Building2 className="h-4 w-4" /> Assign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Change role dialog ──────────────────────────────────────── */
function ChangeRoleDialog({ member, onClose }: { member: WorkforceAccount; onClose: () => void }) {
  const peopleActions = usePeopleActions()
  const [role, setRole] = useState<string>(member.role)
  const submit = () => {
    if (role === member.role) { onClose(); return }
    if (role === 'admin') {
      peopleActions.requestRoleChange(member, 'admin', `ap-${Date.now()}`)
      toast.success('Role change sent for approval')
    } else {
      peopleActions.updateWorkforce(member.id, { role: role as WorkforceAccount['role'] }, member.name)
    }
    onClose()
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={`Change role — ${member.name}`} description="Role changes to Admin go through the approval workflow.">
        <Field label="Role" required>
          <Select
            value={role}
            onValueChange={setRole}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'store_manager', label: 'Store manager' },
              { value: 'rider', label: 'Rider' },
              { value: 'support_agent', label: 'Support agent' },
            ]}
          />
        </Field>
        {role === 'admin' && member.role !== 'admin' && (
          <p className="mt-2 rounded-lg bg-primary-softer px-3 py-2 text-[11.5px] font-medium text-brand-700 dark:text-brand-300">
            This will be submitted as an approval request — another admin must approve it.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" disabled={role === member.role} onClick={submit}>Save role</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Customer detail drawer (basic details only — no mega-profile) ── */
function CustomerDrawer({ customer, onClose, onBlock, onUnblock }: {
  customer: Customer
  onClose: () => void
  onBlock: (c: Customer) => void
  onUnblock: (c: Customer) => void
}) {
  const db = useDB((s) => s.db)
  const city = db.cities.find((c) => c.id === customer.cityId)?.name ?? '—'
  const blocked = customer.status === 'blocked'
  return (
    <Drawer open onOpenChange={(v) => { if (!v) onClose() }} width="md" title={customer.name} subtitle={`${customer.id} · joined ${fmtDate(customer.joinedOn)}`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <InitialAvatar name={customer.name} size={44} />
          <div className="min-w-0">
            <p className="text-sm font-bold">{customer.name}</p>
            <StatusPill status={customer.status} dot className="mt-1" />
          </div>
        </div>
        <dl className="space-y-2 rounded-xl border border-border/70 px-4 py-3 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Phone</dt><dd><a className="font-semibold hover:underline" href={`tel:${customer.phone.replace(/\s/g, '')}`}>{customer.phone}</a></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Email</dt><dd className="truncate font-medium">{customer.email}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">City</dt><dd className="font-medium">{city}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Joined</dt><dd className="font-medium">{fmtDate(customer.joinedOn)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd><StatusPill status={customer.status} dot /></dd></div>
        </dl>
        {blocked && customer.blockedReason && (
          <p className="rounded-xl bg-destructive-soft px-4 py-3 text-[12.5px] font-medium text-destructive">
            Blocked: {customer.blockedReason}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/orders?customerId=${customer.id}`}>View orders</LinkButton>
          <LinkButton to={`/support?customerId=${customer.id}`}>View tickets</LinkButton>
          {blocked ? (
            <Button variant="secondary" size="md" onClick={() => onUnblock(customer)}>
              <ShieldOff className="h-4 w-4" /> Unblock
            </Button>
          ) : (
            <Button variant="destructive" size="md" onClick={() => onBlock(customer)}>
              <Ban className="h-4 w-4" /> Block
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  )
}

/* ── Rider application drawer (read-only) ────────────────────── */
function RiderDrawer({ rider, onClose }: { rider: Rider; onClose: () => void }) {
  const db = useDB((s) => s.db)
  const store = db.stores.find((s) => s.id === rider.storeId)
  return (
    <Drawer open onOpenChange={(v) => { if (!v) onClose() }} width="md" title={rider.name} subtitle={`${rider.id} · ${rider.phone}`}>
      <div className="space-y-4">
        <dl className="space-y-2 rounded-xl border border-border/70 px-4 py-3 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd><StatusPill status={rider.status} dot /></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Applied on</dt><dd className="font-medium">{fmtDate(rider.appliedOn)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Vehicle</dt><dd className="font-medium">{rider.vehicle}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Store</dt><dd className="font-medium">{store?.name ?? rider.storeId}</dd></div>
        </dl>
        <div>
          <p className="mb-2 text-[13px] font-bold">Documents (read-only)</p>
          <div className="space-y-2">
            {rider.documents.map((d) => (
              <div key={d.type} className="flex items-center justify-between rounded-xl border border-border/70 px-3.5 py-2.5 text-[13px]">
                <span className="font-medium">{DOC_LABEL[d.type]}</span>
                <Badge tone={DOC_TONE[d.status]} className="capitalize">{d.status}</Badge>
              </div>
            ))}
          </div>
        </div>
        {rider.reviewNote && (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-[12.5px] font-medium text-amber-700 dark:text-amber-300">
            Review note: {rider.reviewNote}
          </p>
        )}
        <p className="text-[12.5px] text-muted-foreground">
          {rider.reviewedByStoreManager ? 'Reviewed by assigned store manager' : 'Awaiting store manager review'}
        </p>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/orders?riderId=${rider.id}`}>View deliveries</LinkButton>
          <LinkButton to={`/payouts?riderName=${encodeURIComponent(rider.name)}`}>View payouts</LinkButton>
        </div>
      </div>
    </Drawer>
  )
}

/* ── Page ────────────────────────────────────────────────────── */
export function AdminPeople() {
  const stagger = useStagger()
  const [searchParams, setSearchParams] = useSearchParams()
  const db = useDB((s) => s.db)
  const peopleActions = usePeopleActions()
  const storeOptions = useStoreOptions()

  const tabParam = searchParams.get('tab') ?? 'customers'
  const tab = PEOPLE_TABS.some((t) => t.value === tabParam) ? tabParam : 'customers'
  const statusParam = searchParams.get('status') ?? undefined
  const focusId = searchParams.get('focus')

  const switchTab = (v: string) => {
    const sp = new URLSearchParams(searchParams)
    sp.set('tab', v)
    setSearchParams(sp, { replace: true })
  }

  // customers
  const [custSearch, setCustSearch] = useState('')
  const debCustSearch = useDebouncedValue(custSearch)
  const [custStatus, setCustStatus] = useState(statusParam === 'active' || statusParam === 'blocked' ? statusParam : 'all')
  const [custPage, setCustPage] = useState(1)
  useEffect(() => { setCustPage(1) }, [debCustSearch, custStatus])
  const customersQuery = useCustomers({ search: debCustSearch || undefined, status: custStatus, page: custPage, pageSize: 10 })

  // riders
  const [riderSearch, setRiderSearch] = useState('')
  const debRiderSearch = useDebouncedValue(riderSearch)
  const [riderStore, setRiderStore] = useState('all')
  const [riderStatus, setRiderStatus] = useState(RIDER_STATUSES.includes(statusParam as typeof RIDER_STATUSES[number]) ? statusParam! : 'all')
  const [riderPage, setRiderPage] = useState(1)
  useEffect(() => { setRiderPage(1) }, [debRiderSearch, riderStore, riderStatus])
  const ridersQuery = useRiderApplications({ search: debRiderSearch || undefined, storeId: riderStore, status: riderStatus, page: riderPage, pageSize: 8 })

  // workforce
  const [wfSearch, setWfSearch] = useState('')
  const debWfSearch = useDebouncedValue(wfSearch)
  const [wfRole, setWfRole] = useState('all')
  const [wfStatus, setWfStatus] = useState(statusParam === 'active' || statusParam === 'blocked' || statusParam === 'invited' ? statusParam : 'all')
  const [wfPage, setWfPage] = useState(1)
  useEffect(() => { setWfPage(1) }, [debWfSearch, wfRole, wfStatus])
  const workforceQuery = useWorkforce({ search: debWfSearch || undefined, role: wfRole, status: wfStatus, page: wfPage, pageSize: 8 })

  // drawers & dialogs
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null)
  const [openRiderId, setOpenRiderId] = useState<string | null>(null)
  const [blockTarget, setBlockTarget] = useState<{ kind: 'customer' | 'workforce'; id: string; name: string; blocked: boolean } | null>(null)
  const [assignTarget, setAssignTarget] = useState<WorkforceAccount | null>(null)
  const [roleTarget, setRoleTarget] = useState<WorkforceAccount | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    if (!focusId) return
    if (tab === 'customers') setOpenCustomerId(focusId)
    if (tab === 'riders') setOpenRiderId(focusId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const focusedCustomer = openCustomerId ? db.customers.find((c) => c.id === openCustomerId) ?? null : null
  const focusedRider = openRiderId ? db.riders.find((r) => r.id === openRiderId) ?? null : null

  const customerCols: Array<Column<CustomerRow>> = [
    {
      key: 'customer', header: 'Customer',
      render: (r) => (
        <div className="flex items-center gap-3">
          <InitialAvatar name={r.name} size={34} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold">{r.name}</p>
            <p className="truncate text-xs text-muted-foreground">{r.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (r) => <span className="tabular text-muted-foreground">{r.phone}</span> },
    { key: 'joinedOn', header: 'Joined', render: (r) => fmtDate(r.joinedOn) },
    { key: 'ordersCount', header: 'Orders', align: 'right', render: (r) => <span className="font-semibold tabular">{fmtNum(r.ordersCount)}</span> },
    { key: 'lastOrder', header: 'Last order', render: (r) => (r.lastOrder ? fmtDate(r.lastOrder) : '—') },
    { key: 'openTickets', header: 'Open tickets', align: 'right', render: (r) => <span className={cn('font-semibold tabular', r.openTickets > 0 && 'text-warning')}>{r.openTickets}</span> },
    {
      key: 'status', header: 'Status',
      render: (r) => r.blockedReason ? (
        <Tooltip content={r.blockedReason}><span><StatusPill status={r.status} dot /></span></Tooltip>
      ) : (
        <StatusPill status={r.status} dot />
      ),
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <RowActions>
          <DropdownItem onSelect={() => setOpenCustomerId(r.id)}><Eye className="h-3.5 w-3.5" /> View</DropdownItem>
          {r.status === 'blocked' ? (
            <DropdownItem onSelect={() => peopleActions.unblockCustomer(r.id, r.name)}>
              <ShieldOff className="h-3.5 w-3.5" /> Unblock
            </DropdownItem>
          ) : (
            <DropdownItem danger onSelect={() => setBlockTarget({ kind: 'customer', id: r.id, name: r.name, blocked: false })}>
              <Ban className="h-3.5 w-3.5" /> Block…
            </DropdownItem>
          )}
        </RowActions>
      ),
    },
  ]

  const riderCols: Array<Column<Rider>> = [
    {
      key: 'rider', header: 'Rider',
      render: (r) => (
        <div className="flex items-center gap-3">
          <InitialAvatar name={r.name} size={34} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold">{r.name}</p>
            <p className="text-xs text-muted-foreground tabular">{r.phone}</p>
          </div>
        </div>
      ),
    },
    { key: 'store', header: 'Store', render: (r) => db.stores.find((s) => s.id === r.storeId)?.name ?? r.storeId },
    { key: 'appliedOn', header: 'Applied', render: (r) => fmtDate(r.appliedOn) },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot /> },
    {
      key: 'documents', header: 'Documents',
      render: (r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.documents.map((d) => (
            <Badge key={d.type} tone={DOC_TONE[d.status]}>{DOC_LABEL[d.type]}</Badge>
          ))}
        </div>
      ),
    },
    { key: 'deliveries', header: 'Deliveries', align: 'right', render: (r) => <span className="font-semibold tabular">{fmtNum(r.deliveriesPeriod)}</span> },
    { key: 'rating', header: 'Rating', render: (r) => <span className="tabular font-semibold">★ {r.rating.toFixed(1)}</span> },
    {
      key: 'review', header: 'Review',
      render: (r) => (
        <span className={cn('text-xs font-medium', r.reviewedByStoreManager ? 'text-success' : 'text-muted-foreground')}>
          {r.reviewedByStoreManager ? 'Reviewed by assigned store manager' : 'Awaiting store manager review'}
        </span>
      ),
    },
  ]

  const workforceCols: Array<Column<WorkforceAccount>> = [
    {
      key: 'member', header: 'Member',
      render: (w) => (
        <div className="flex items-center gap-3">
          <InitialAvatar name={w.name} size={34} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold">{w.name}</p>
            <p className="truncate text-xs text-muted-foreground">{w.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (w) => <Badge tone={ROLE_BADGE[w.role].tone}>{ROLE_BADGE[w.role].label}</Badge> },
    { key: 'store', header: 'Store', render: (w) => (w.storeId ? db.stores.find((s) => s.id === w.storeId)?.name ?? w.storeId : '—') },
    { key: 'status', header: 'Status', render: (w) => <StatusPill status={w.status} dot /> },
    {
      key: 'lastLogin', header: 'Last login',
      render: (w) => (w.status === 'invited' || !w.lastLogin ? <span className="text-muted-foreground">Invited</span> : <span className="tabular">{timeAgo(w.lastLogin, DEMO_NOW)}</span>),
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (w) => (
        <RowActions>
          {w.role === 'store_manager' && (
            <DropdownItem onSelect={() => setAssignTarget(w)}><Building2 className="h-3.5 w-3.5" /> Assign to store</DropdownItem>
          )}
          <DropdownItem onSelect={() => setRoleTarget(w)}><UserPlus className="h-3.5 w-3.5" /> Change role</DropdownItem>
          <DropdownItem onSelect={() => peopleActions.requestPasswordReset(w.id, w.name)}>
            <KeyRound className="h-3.5 w-3.5" /> Request password reset{w.passwordResetRequested ? ' ✓' : ''}
          </DropdownItem>
          {w.role === 'admin' ? (
            <Tooltip content="The primary admin account cannot be blocked">
              <span>
                <DropdownItem disabled><Ban className="h-3.5 w-3.5" /> Block</DropdownItem>
              </span>
            </Tooltip>
          ) : w.status === 'blocked' ? (
            <DropdownItem onSelect={() => peopleActions.updateWorkforce(w.id, { status: 'active' }, w.name)}>
              <ShieldOff className="h-3.5 w-3.5" /> Unblock
            </DropdownItem>
          ) : (
            <DropdownItem danger onSelect={() => setBlockTarget({ kind: 'workforce', id: w.id, name: w.name, blocked: false })}>
              <Ban className="h-3.5 w-3.5" /> Block…
            </DropdownItem>
          )}
        </RowActions>
      ),
    },
  ]

  const pages = (total: number, pageSize: number, page: number, setPage: (p: number) => void) => {
    const totalPages = Math.ceil(total / pageSize)
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1
    return (
      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={setPage}
        showing={total > 0 ? `Showing ${start}–${Math.min(page * pageSize, total)} of ${fmtNum(total)}` : 'No results'}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="People"
        titleAccent="directory"
        breadcrumb={['People']}
        subtitle="Customers, rider applications and portal workforce accounts."
        illustration={<PeopleScene />}
      />

      <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
        <motion.section variants={stagger.item}>
          <TabPills id="people-tabs" tabs={PEOPLE_TABS} value={tab} onChange={switchTab} />
        </motion.section>

        {/* ── Customers ── */}
        {tab === 'customers' && (
          <motion.section variants={stagger.item} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput className="w-full sm:w-72" value={custSearch} onChange={setCustSearch} placeholder="Search name, email or phone…" />
              <Select
                className="w-40"
                value={custStatus}
                onValueChange={setCustStatus}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'blocked', label: 'Blocked' },
                ]}
              />
            </div>
            <div className="rounded-card border border-border/70 bg-card shadow-soft">
              <DataTable
                columns={customerCols}
                rows={customersQuery.data?.rows ?? []}
                keyId={(r) => r.id}
                loading={customersQuery.isLoading}
                onRowClick={(r) => setOpenCustomerId(r.id)}
                skeletonRows={8}
                empty={<EmptyState title="No customers found" body="Try a different search or status filter." />}
                footer={pages(customersQuery.data?.total ?? 0, 10, custPage, setCustPage)}
              />
            </div>
          </motion.section>
        )}

        {/* ── Rider applications ── */}
        {tab === 'riders' && (
          <motion.section variants={stagger.item} className="space-y-4">
            <div className="flex items-start gap-3 rounded-card border border-amber-200/70 bg-warning-soft px-4 py-3 text-[13px] font-medium text-amber-800 dark:text-amber-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-warning" />
              <p>Applications are reviewed by the assigned store manager. This view is read-only for documents.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput className="w-full sm:w-64" value={riderSearch} onChange={setRiderSearch} placeholder="Search rider name or phone…" />
              <Select
                className="w-52"
                value={riderStore}
                onValueChange={setRiderStore}
                options={[{ value: 'all', label: 'All stores' }, ...(storeOptions.data ?? [])]}
              />
              <Select
                className="w-52"
                value={riderStatus}
                onValueChange={setRiderStatus}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'application_pending', label: 'Application pending' },
                  { value: 'application_approved', label: 'Application approved' },
                  { value: 'application_rejected', label: 'Application rejected' },
                  { value: 'active', label: 'Active' },
                  { value: 'suspended', label: 'Suspended' },
                ]}
              />
            </div>
            <div className="rounded-card border border-border/70 bg-card shadow-soft">
              <DataTable
                columns={riderCols}
                rows={ridersQuery.data?.rows ?? []}
                keyId={(r) => r.id}
                loading={ridersQuery.isLoading}
                onRowClick={(r) => setOpenRiderId(r.id)}
                skeletonRows={6}
                empty={<EmptyState title="No rider applications" body="Try a different search, store or status filter." />}
                footer={pages(ridersQuery.data?.total ?? 0, 8, riderPage, setRiderPage)}
              />
            </div>
          </motion.section>
        )}

        {/* ── Workforce ── */}
        {tab === 'workforce' && (
          <motion.section variants={stagger.item} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput className="w-full sm:w-64" value={wfSearch} onChange={setWfSearch} placeholder="Search name or email…" />
              <Select
                className="w-44"
                value={wfRole}
                onValueChange={setWfRole}
                options={[
                  { value: 'all', label: 'All roles' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'store_manager', label: 'Store manager' },
                  { value: 'rider', label: 'Rider' },
                  { value: 'support_agent', label: 'Support agent' },
                ]}
              />
              <Select
                className="w-40"
                value={wfStatus}
                onValueChange={setWfStatus}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'blocked', label: 'Blocked' },
                  { value: 'invited', label: 'Invited' },
                ]}
              />
              <div className="ml-auto">
                <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Add / invite
                </Button>
              </div>
            </div>
            <div className="rounded-card border border-border/70 bg-card shadow-soft">
              <DataTable
                columns={workforceCols}
                rows={workforceQuery.data?.rows ?? []}
                keyId={(w) => w.id}
                loading={workforceQuery.isLoading}
                skeletonRows={6}
                empty={<EmptyState title="No team members found" body="Try a different search, role or status filter." />}
                footer={pages(workforceQuery.data?.total ?? 0, 8, wfPage, setWfPage)}
              />
            </div>
          </motion.section>
        )}
      </motion.div>

      {/* drawers & dialogs */}
      {focusedCustomer && (
        <CustomerDrawer
          customer={focusedCustomer}
          onClose={() => setOpenCustomerId(null)}
          onBlock={(c) => setBlockTarget({ kind: 'customer', id: c.id, name: c.name, blocked: false })}
          onUnblock={(c) => peopleActions.unblockCustomer(c.id, c.name)}
        />
      )}
      {focusedRider && <RiderDrawer rider={focusedRider} onClose={() => setOpenRiderId(null)} />}
      {blockTarget && (
        <ReasonDialog
          open
          title={blockTarget.blocked ? `Unblock ${blockTarget.name}` : `Block ${blockTarget.name}`}
          description={blockTarget.blocked ? 'The account will regain access immediately.' : 'A blocked account can no longer sign in or place orders.'}
          confirmLabel={blockTarget.blocked ? 'Unblock' : 'Block'}
          destructive={!blockTarget.blocked}
          onClose={() => setBlockTarget(null)}
          onSubmit={(reason) => {
            if (blockTarget.kind === 'customer') {
              if (blockTarget.blocked) peopleActions.unblockCustomer(blockTarget.id, blockTarget.name)
              else peopleActions.blockCustomer(blockTarget.id, reason, blockTarget.name)
            } else {
              peopleActions.updateWorkforce(blockTarget.id, { status: blockTarget.blocked ? 'active' : 'blocked' }, blockTarget.name)
            }
          }}
        />
      )}
      {assignTarget && <AssignStoreDialog member={assignTarget} storeOptions={storeOptions.data ?? []} onClose={() => setAssignTarget(null)} />}
      {roleTarget && <ChangeRoleDialog member={roleTarget} onClose={() => setRoleTarget(null)} />}
      {addOpen && <AddWorkforceDialog storeOptions={storeOptions.data ?? []} onClose={() => setAddOpen(false)} />}
    </div>
  )
}
