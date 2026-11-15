// ── §11 Support & reviews ────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BadgeIndianRupee, CircleUser, Eye, FileImage, LifeBuoy, Lock, MessageSquare,
  MoreHorizontal, Paperclip, Send, Star,
} from 'lucide-react'
import { cn, fmtDateTime, fmtINR, timeAgo } from '@dairydirect/shared/lib/utils'
import { toast } from '@dairydirect/shared/lib/toast'
import { Badge, Button, Switch, Textarea } from '@dairydirect/shared/ui/base'
import {
  Dialog, DialogContent, Drawer, DropdownItem, DropdownMenu, DropdownMenuContent,
  DropdownMenuTrigger, Tooltip,
} from '@dairydirect/shared/ui/overlays'
import { Field, Select } from '@dairydirect/shared/ui/form'
import { EmptyState, PageHeader, SearchInput, TabPills } from '@dairydirect/shared/ui/misc'
import { StatusPill } from '@dairydirect/shared/ui/misc'
import { DataTable, Pagination, type Column } from '@dairydirect/shared/ui/DataTable'
import { KpiCard } from '@dairydirect/shared/ui/KpiCard'
import { SupportScene } from '@dairydirect/shared/assets/scenes'
import { useDebouncedValue, useStagger } from '@dairydirect/shared/hooks/misc'
import { useRatings, useSavedResponses, useTicket, useTickets } from '@/api/queries'
import { usePaymentActions, useSupportActions } from '@/api/mutations'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { DEMO_NOW } from '@dairydirect/shared/mock-db/seed'
import { isRefundEligible, orderRefundTotal } from '@dairydirect/shared/mock-db/selectors'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@dairydirect/shared/ui/base'
import type { Rating, Ticket, TicketAttachment, TicketCategory, TicketMessage } from '@dairydirect/shared/types'

const SUPPORT_TABS = [
  { value: 'tickets', label: 'Tickets' },
  { value: 'ratings', label: 'Rating moderation' },
]
const CATEGORY_LABEL: Record<TicketCategory, string> = {
  order_issue: 'Order issue', payment: 'Payment', refund_request: 'Refund request',
  account: 'Account', product_quality: 'Product quality', other: 'Other',
}
const PRIORITY_BADGE: Record<Ticket['priority'], { tone: 'red' | 'neutral' | 'blue'; label: string }> = {
  high: { tone: 'red', label: 'High' },
  normal: { tone: 'neutral', label: 'Normal' },
  low: { tone: 'blue', label: 'Low' },
}
const AUTHOR_LABEL: Record<TicketMessage['author'], string> = { customer: 'Customer', admin: 'Admin', system: 'System' }
const AUTHOR_TONE: Record<TicketMessage['author'], 'blue' | 'green' | 'neutral'> = { customer: 'blue', admin: 'green', system: 'neutral' }

function RowActions({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="iconSm" aria-label="Actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="contents" onClick={(e) => e.stopPropagation()}>{children}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))
}

/* ── Ticket detail drawer ───────────────────────────────────── */
function TicketDrawer({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const db = useDB((s) => s.db)
  const supportActions = useSupportActions()
  const paymentActions = usePaymentActions()
  const detail = useTicket(ticketId)
  const savedResponsesQuery = useSavedResponses()

  const ticket: Ticket | null = detail.data ?? db.tickets.find((t) => t.id === ticketId) ?? null
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [attachmentView, setAttachmentView] = useState<TicketAttachment | null>(null)
  const [refundOpen, setRefundOpen] = useState(false)

  const refundEligible = !!ticket?.orderId && isRefundEligible(db, ticket.orderId).eligible

  const send = () => {
    if (!ticket || body.trim().length === 0) return
    supportActions.reply(ticket.id, body.trim(), internal)
    setBody('')
    setInternal(false)
  }

  if (!ticket) {
    return (
      <Drawer open onOpenChange={(v) => { if (!v) onClose() }} width="lg" title="Ticket" subtitle={ticketId}>
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      </Drawer>
    )
  }

  return (
    <Drawer open onOpenChange={(v) => { if (!v) onClose() }} width="lg" title={`${ticket.ref} — ${ticket.subject}`} subtitle={`Updated ${timeAgo(ticket.updatedAt, DEMO_NOW)}`}>
      <div className="space-y-5">
        {/* header */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={ticket.status} dot />
          <Badge tone={PRIORITY_BADGE[ticket.priority].tone}>{PRIORITY_BADGE[ticket.priority].label} priority</Badge>
          <Badge>{CATEGORY_LABEL[ticket.category]}</Badge>
          <Select
            className="ml-auto w-40"
            value={ticket.status}
            onValueChange={(v) => supportActions.setStatus(ticket.id, v as Ticket['status'])}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'pending', label: 'Pending' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
        </div>

        {/* customer block */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 px-4 py-3 text-[13px]">
          <span className="flex items-center gap-2 font-semibold"><CircleUser className="h-4 w-4 text-muted-foreground" /> {ticket.customerName}</span>
          {ticket.orderId && (
            <Link className="font-semibold text-brand-700 hover:underline dark:text-brand-300" to={`/orders/${ticket.orderId}`}>#{ticket.orderId}</Link>
          )}
        </div>

        {/* messages thread */}
        <div className="space-y-3">
          <p className="text-[13px] font-bold">Messages</p>
          {ticket.messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'rounded-xl border px-4 py-3',
                m.internal ? 'border-amber-200/70 bg-warning-soft' : 'border-border/70 bg-card',
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <Badge tone={AUTHOR_TONE[m.author]}>{AUTHOR_LABEL[m.author]}</Badge>
                {m.internal && <Badge tone="amber">Internal note</Badge>}
                <span className="ml-auto text-muted-foreground">{fmtDateTime(m.at)}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed">{m.body}</p>
            </div>
          ))}
        </div>

        {/* attachments */}
        {ticket.attachments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-bold">Attachments</p>
            {ticket.attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground">{a.sizeKb} KB</p>
                  </div>
                </div>
                {a.authorized ? (
                  <Button variant="outline" size="sm" onClick={() => setAttachmentView(a)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                ) : (
                  <Tooltip content="You are not authorized to view this attachment">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" /> Not authorized
                    </span>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
        )}

        {/* response composer */}
        <div className="space-y-3 rounded-xl border border-border/70 p-4">
          <p className="text-[13px] font-bold">Response</p>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply to the customer…" />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              className="w-56"
              value=""
              onValueChange={(v) => {
                const sr = savedResponsesQuery.data?.find((s) => s.id === v)
                if (sr) setBody(sr.body)
              }}
              placeholder="Insert saved response…"
              options={(savedResponsesQuery.data ?? []).map((s) => ({ value: s.id, label: s.title }))}
            />
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <Switch checked={internal} onCheckedChange={setInternal} /> Internal note
            </label>
            <div className="ml-auto flex items-center gap-2">
              {ticket.orderId && refundEligible && (
                <Button variant="outline" size="md" onClick={() => setRefundOpen(true)}>
                  <BadgeIndianRupee className="h-4 w-4" /> Request refund
                </Button>
              )}
              <Button variant="primary" size="md" disabled={body.trim().length === 0} onClick={send}>
                <Send className="h-4 w-4" /> Send
              </Button>
            </div>
          </div>
          {ticket.orderId && !refundEligible && (
            <p className="text-[11px] text-muted-foreground">
              Refund request unavailable for this order: {isRefundEligible(db, ticket.orderId).reason ?? 'not eligible'}
            </p>
          )}
        </div>
      </div>

      {/* attachment viewer */}
      {attachmentView && (
        <Dialog open onOpenChange={(v) => { if (!v) setAttachmentView(null) }}>
          <DialogContent title={attachmentView.name} description={`${attachmentView.sizeKb} KB · ${ticket.ref}`}>
            <div className="grid place-items-center gap-3 rounded-xl border border-border/70 bg-muted/40 py-12">
              <FileImage className="h-12 w-12 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Image preview is not available in the demo dataset.</p>
              <Badge tone="green">Authorized attachment</Badge>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* refund request */}
      {refundOpen && ticket.orderId && (
        <TicketRefundDialog ticket={ticket} onClose={() => setRefundOpen(false)} />
      )}
    </Drawer>
  )
}

/* ── Support refund request dialog (RHF + zod) ──────────────── */
const supportRefundSchema = z.object({
  amount: z.coerce.number().positive('Enter an amount above zero'),
  reason: z.string().min(3, 'Reason is required'),
})
function TicketRefundDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const db = useDB((s) => s.db)
  const paymentActions = usePaymentActions()
  const orderId = ticket.orderId!
  const order = db.orders.find((o) => o.id === orderId)!
  const max = order.amount - orderRefundTotal(db, orderId)
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(supportRefundSchema),
    defaultValues: { amount: max, reason: ticket.subject },
  })
  const submit = handleSubmit((v) => {
    const amount = Math.min(Math.round(v.amount), max)
    paymentActions.requestRefund(orderId, amount, v.reason.trim(), 'support')
    toast.success('Refund request created in Payments')
    onClose()
  })
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title={`Request refund — #${orderId}`} description={`Order ${fmtINR(order.amount)} · already refunded ${fmtINR(orderRefundTotal(db, orderId))} · max ${fmtINR(max)}`}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <Field label="Amount" required error={errors.amount?.message}>
            <Input type="number" min={1} max={max} {...register('amount')} />
          </Field>
          <Field label="Reason" required error={errors.reason?.message}>
            <Input {...register('reason')} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="md">Request refund</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── TICKETS tab ────────────────────────────────────────────── */
function TicketsTab({ statusParam, orderIdParam, customerIdParam, focusId, onClearDeepLink }: {
  statusParam?: string
  orderIdParam?: string
  customerIdParam?: string
  focusId?: string
  onClearDeepLink: () => void
}) {
  const db = useDB((s) => s.db)
  const [search, setSearch] = useState('')
  const debSearch = useDebouncedValue(search)
  const [status, setStatus] = useState(['open', 'pending', 'resolved', 'closed'].includes(statusParam ?? '') ? statusParam! : 'all')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  useEffect(() => { setPage(1) }, [debSearch, status, category])
  useEffect(() => { if (focusId) setDrawerId(focusId) }, [focusId])

  const query = useTickets({
    search: debSearch || undefined,
    status,
    category,
    orderId: orderIdParam,
    customerId: customerIdParam,
    page,
    pageSize: 8,
  })

  const openCount = db.tickets.filter((t) => t.status === 'open').length
  const pendingCount = db.tickets.filter((t) => t.status === 'pending').length
  const doneCount = db.tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length

  const cols: Array<Column<Ticket>> = [
    { key: 'ref', header: 'Ref', render: (r) => <span className="font-mono text-xs font-semibold">{r.ref}</span> },
    { key: 'subject', header: 'Subject', render: (r) => <span className="block max-w-[240px] truncate font-semibold">{r.subject}</span> },
    { key: 'category', header: 'Category', render: (r) => <Badge tone="blue">{CATEGORY_LABEL[r.category]}</Badge> },
    { key: 'customer', header: 'Customer', render: (r) => r.customerName },
    {
      key: 'order', header: 'Order',
      render: (r) => (r.orderId
        ? <Link className="font-semibold text-brand-700 hover:underline dark:text-brand-300" to={`/orders/${r.orderId}`}>#{r.orderId}</Link>
        : <span className="text-muted-foreground">—</span>),
    },
    { key: 'priority', header: 'Priority', render: (r) => <Badge tone={PRIORITY_BADGE[r.priority].tone}>{PRIORITY_BADGE[r.priority].label}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} dot={r.status === 'open'} /> },
    { key: 'updated', header: 'Updated', render: (r) => <span className="text-muted-foreground">{timeAgo(r.updatedAt, DEMO_NOW)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <RowActions>
          <DropdownItem onSelect={() => setDrawerId(r.id)}><MessageSquare className="h-3.5 w-3.5" /> Open</DropdownItem>
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
        <KpiCard label="Open" value={openCount} format="num" icon={MessageSquare} tint="blue" />
        <KpiCard label="Pending" value={pendingCount} format="num" icon={Paperclip} tint="amber" />
        <KpiCard label="Resolved & closed" value={doneCount} format="num" icon={LifeBuoy} tint="green" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput className="w-full sm:w-72" value={search} onChange={setSearch} placeholder="Search ref, subject or customer…" />
        <Select
          className="w-40"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'open', label: 'Open' },
            { value: 'pending', label: 'Pending' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
        <Select
          className="w-48"
          value={category}
          onValueChange={setCategory}
          options={[
            { value: 'all', label: 'All categories' },
            { value: 'order_issue', label: 'Order issue' },
            { value: 'payment', label: 'Payment' },
            { value: 'refund_request', label: 'Refund request' },
            { value: 'account', label: 'Account' },
            { value: 'product_quality', label: 'Product quality' },
            { value: 'other', label: 'Other' },
          ]}
        />
        {(orderIdParam || customerIdParam) && (
          <Badge tone="violet" className="gap-1.5 py-1.5">
            {orderIdParam ? `Filtered by #${orderIdParam}` : `Filtered by ${db.customers.find((c) => c.id === customerIdParam)?.name ?? customerIdParam}`}
            <button className="ml-1 font-bold" onClick={onClearDeepLink} aria-label="Clear deep-link filter">✕</button>
          </Badge>
        )}
      </div>
      <div className="rounded-card border border-border/70 bg-card shadow-soft">
        <DataTable
          columns={cols}
          rows={query.data?.rows ?? []}
          keyId={(r) => r.id}
          loading={query.isLoading}
          onRowClick={(r) => setDrawerId(r.id)}
          skeletonRows={6}
          empty={<EmptyState title="No tickets match" body="Try a different search, status or category." />}
          footer={
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              showing={total > 0 ? `Showing ${start}–${Math.min(page * 8, total)} of ${total}` : 'No results'}
            />
          }
        />
      </div>
      {drawerId && <TicketDrawer ticketId={drawerId} onClose={() => setDrawerId(null)} />}
    </motion.div>
  )
}

/* ── RATING MODERATION tab ──────────────────────────────────── */
function RatingModerationTab() {
  const db = useDB((s) => s.db)
  const supportActions = useSupportActions()
  const queueQuery = useRatings(true)
  const allQuery = useRatings(false)
  const [removeTarget, setRemoveTarget] = useState<Rating | null>(null)

  const queue = queueQuery.data ?? []
  const recently = useMemo(
    () => (allQuery.data ?? [])
      .filter((r) => r.moderationRequired && r.moderationStatus !== 'pending')
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6),
    [allQuery.data],
  )
  const storeNameOf = (sid: string) => db.stores.find((s) => s.id === sid)?.name ?? sid

  return (
    <motion.div variants={{}} className="space-y-5">
      <p className="rounded-card border border-amber-200/70 bg-warning-soft px-4 py-3 text-[13px] font-medium text-amber-800 dark:text-amber-200">
        Moderation queue only — browsing all ratings needs additional read APIs.
      </p>

      {queueQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((i) => <div key={i} className="skeleton h-40 rounded-card" />)}</div>
      ) : queue.length === 0 ? (
        <EmptyState icon={Star} title="Moderation queue is clear" body="No ratings are waiting for review." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {queue.map((r) => (
            <div key={r.id} className="rounded-card border border-border/70 bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold tracking-tight text-amber-500">{stars(r.stars)}</span>
                <span className="text-[11px] text-muted-foreground">{timeAgo(r.at, DEMO_NOW)}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed">{r.comment}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{r.customerName}</span>
                <Link className="font-semibold text-brand-700 hover:underline dark:text-brand-300" to={`/orders/${r.orderId}`}>#{r.orderId}</Link>
                <span>{storeNameOf(r.storeId)}</span>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => supportActions.moderate(r.id, 'approved')}>Approve</Button>
                <Button variant="destructive" size="sm" onClick={() => setRemoveTarget(r)}>Remove…</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {recently.length > 0 && (
        <div className="rounded-card border border-border/70 bg-card p-4">
          <p className="text-[13px] font-bold text-muted-foreground">Recently moderated</p>
          <ul className="mt-3 space-y-2">
            {recently.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5 text-[12.5px]">
                <span className="text-amber-500">{stars(r.stars)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.comment}</span>
                <StatusPill status={r.moderationStatus} />
                <span className="text-[11px] text-muted-foreground">{timeAgo(r.at, DEMO_NOW)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {removeTarget && (
        <RemoveRatingDialog
          rating={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onSubmit={(reason) => supportActions.moderate(removeTarget.id, 'removed', reason)}
        />
      )}
    </motion.div>
  )
}

function RemoveRatingDialog({ rating, onClose, onSubmit }: { rating: Rating; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState(rating.moderationReason ?? '')
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent title="Remove rating" description="The rating is hidden from the storefront and the reason is recorded.">
        <Field label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Abusive language" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive" size="md" disabled={reason.trim().length < 3}
            onClick={() => { onSubmit(reason.trim()); onClose() }}
          >
            Remove rating
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
export function AdminSupport() {
  const stagger = useStagger()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState('tickets')
  const focusId = searchParams.get('focus') ?? undefined
  const statusParam = searchParams.get('status') ?? undefined
  const orderIdParam = searchParams.get('orderId') ?? undefined
  const customerIdParam = searchParams.get('customerId') ?? undefined
  const clearDeepLink = () => {
    const sp = new URLSearchParams(searchParams)
    sp.delete('orderId')
    sp.delete('customerId')
    sp.delete('focus')
    setSearchParams(sp, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Support"
        titleAccent="& reviews"
        breadcrumb={['Support']}
        subtitle="Customer tickets with full conversation threads, attachments and the rating moderation queue."
        illustration={<SupportScene />}
      />
      <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
        <motion.section variants={stagger.item}>
          <TabPills id="support-tabs" tabs={SUPPORT_TABS} value={tab} onChange={setTab} />
        </motion.section>
        <motion.section variants={stagger.item} key={tab}>
          {tab === 'tickets' && (
            <TicketsTab
              statusParam={statusParam}
              orderIdParam={orderIdParam}
              customerIdParam={customerIdParam}
              focusId={focusId}
              onClearDeepLink={clearDeepLink}
            />
          )}
          {tab === 'ratings' && <RatingModerationTab />}
        </motion.section>
      </motion.div>
    </div>
  )
}
