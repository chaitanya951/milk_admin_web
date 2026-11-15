import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, PauseCircle, PlayCircle, XCircle, Wrench, RefreshCcw, MapPinX,
  KeyRound, Phone, Receipt, Clock, Undo2, LifeBuoy, Bike, PackageSearch,
  AlertTriangle, BadgeCheck,
} from 'lucide-react'
import { useStagger } from '@dairydirect/shared/hooks/misc'
import { useOrderDetail } from '@/api/queries'
import { useOrderActions, usePaymentActions } from '@/api/mutations'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { isRefundEligible, orderActionEligibility, orderRefundTotal } from '@dairydirect/shared/mock-db/selectors'
import { PageHeader, StatusPill, EmptyState } from '@dairydirect/shared/ui/misc'
import { Field } from '@dairydirect/shared/ui/form'
import { Button, Card, Badge, Input, Textarea } from '@dairydirect/shared/ui/base'
import { Dialog, DialogContent, Tooltip } from '@dairydirect/shared/ui/overlays'
import { SectionCard, StatusTimeline } from '@dairydirect/shared/ui/domain'
import { InitialAvatar } from '@dairydirect/shared/assets/avatars'
import { ScooterScene } from '@dairydirect/shared/assets/scenes'
import { OrderActionDialogs, type OrderAction } from './AdminOrders'
import type { Order } from '@dairydirect/shared/types'
import { cn, fmtDateTime, fmtINR, fmtNum } from '@dairydirect/shared/lib/utils'

/* ── Local helpers ─────────────────────────────────────────── */
const PAYMENT_LABEL: Record<string, string> = { online_upi: 'UPI', online_card: 'Card', online_netbanking: 'NB', wallet: 'Wallet', cod: 'COD' }
const ATTENTION_LABEL: Record<string, string> = { on_hold: 'On hold', wrong_address: 'Wrong address', code_locked: 'Code locked', payment_failed: 'Payment failed' }
const CORRECTION_LABEL: Record<string, string> = { address: 'Address correction', items: 'Item correction', slot: 'Slot correction' }

/** Header action button with eligibility + reason tooltip. */
function ActionButton({ enabled, reason, label, icon: Icon, tone, onClick }: {
  enabled: boolean
  reason?: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'destructive'
  onClick: () => void
}) {
  return (
    <Tooltip content={enabled ? label : (reason ?? 'Not available for this order')}>
      <span>
        <Button size="sm" variant={tone ?? 'secondary'} disabled={!enabled} onClick={onClick}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </Button>
      </span>
    </Tooltip>
  )
}

export function AdminOrderDetail() {
  const container = useStagger()
  const { id } = useParams<{ id: string }>()
  const db = useDB((s) => s.db)
  const orderActions = useOrderActions()
  const paymentActions = usePaymentActions()
  const detailQ = useOrderDetail(id ?? null)

  const data = detailQ.data
  const order = data?.order ?? null

  // action dialog state (dialogs reused from the Orders page module)
  const [dialog, setDialog] = useState<{ action: OrderAction; order: Order } | null>(null)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [refundError, setRefundError] = useState('')

  useEffect(() => {
    if (refundOpen && order) {
      const remaining = order.amount - orderRefundTotal(db, order.id)
      setRefundAmount(String(Math.max(0, remaining)))
      setRefundReason('')
      setRefundError('')
    }
  }, [refundOpen, order, db])

  if (detailQ.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="skeleton h-40 rounded-card" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="skeleton h-72 rounded-card lg:col-span-8" />
          <div className="skeleton h-72 rounded-card lg:col-span-4" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="space-y-5">
        <PageHeader title="Order" titleAccent="not found" subtitle="We could not find this order." breadcrumb={['Orders', id ?? '']} />
        <Card>
          <EmptyState icon={PackageSearch} title={`No order “${id}”`} body="It may have been removed or the link is stale." action={(
            <Link to="/orders"><Button variant="secondary" size="md"><ArrowLeft className="h-4 w-4" /> Back to orders</Button></Link>
          )} />
        </Card>
      </div>
    )
  }

  const el = orderActionEligibility(db, order)
  const refundElig = isRefundEligible(db, order.id)
  const alreadyRefunded = orderRefundTotal(db, order.id)
  const refundRemaining = Math.max(0, order.amount - alreadyRefunded)

  const direct = (a: OrderAction) => {
    if (!order) return
    if (a === 'release') orderActions.release(order.id)
    if (a === 'resolveAddress') orderActions.resolveAddress(order.id)
    if (a === 'resetCode') orderActions.resetCode(order.id)
    if (a === 'hold' || a === 'cancel' || a === 'correction' || a === 'reassign') setDialog({ action: a, order })
  }

  const submitRefund = () => {
    if (!order) return
    const amt = Number(refundAmount)
    if (!Number.isFinite(amt) || amt <= 0) { setRefundError('Enter a valid amount'); return }
    if (amt > refundRemaining) { setRefundError(`Amount cannot exceed the un-refunded balance (${fmtINR(refundRemaining)})`); return }
    if (refundReason.trim().length < 3) { setRefundError('Give a short reason for the refund'); return }
    paymentActions.requestRefund(order.id, amt, refundReason.trim(), 'admin')
    setRefundOpen(false)
  }

  const t = order.timeline
  const timelineSteps = [
    { label: 'Placed', at: t.placed },
    t.confirmed ? { label: 'Confirmed', at: t.confirmed } : null,
    t.picked ? { label: 'Picked', at: t.picked } : null,
    t.ready ? { label: 'Ready', at: t.ready } : null,
    t.outForDelivery ? { label: 'Out for delivery', at: t.outForDelivery } : null,
    t.delivered ? { label: 'Delivered', at: t.delivered } : null,
    t.cancelled ? { label: 'Cancelled', at: t.cancelled, note: order.cancelReason } : null,
    t.held ? { label: 'Held', at: t.held, note: order.holdReason ?? 'Hold applied' } : null,
  ]

  const itemsSubtotal = order.items.reduce((a, it) => a + it.total, 0)
  const city = db.cities.find((c) => c.id === data?.store?.cityId)

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Order #${order.id}`}
        subtitle={`Placed ${fmtDateTime(order.placedAt)} · ${data?.store?.name ?? '—'}`}
        illustration={<ScooterScene moving={order.status === 'out_for_delivery'} />}
        breadcrumb={['Orders', order.id]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton enabled={el.hold} reason={el.holdReason} label="Put on hold" icon={PauseCircle} onClick={() => direct('hold')} />
            <ActionButton enabled={el.release} reason={el.releaseReason} label="Release hold" icon={PlayCircle} onClick={() => direct('release')} />
            <ActionButton enabled={el.cancel} reason={el.cancelReason} label="Cancel order" icon={XCircle} tone="destructive" onClick={() => direct('cancel')} />
            <ActionButton enabled={el.reassign} reason={el.reassignReason} label="Reassign rider" icon={RefreshCcw} onClick={() => direct('reassign')} />
            <ActionButton enabled={el.resolveAddress} reason={el.resolveAddressReason} label="Resolve wrong-address" icon={MapPinX} onClick={() => direct('resolveAddress')} />
            <ActionButton enabled={el.resetCode} reason={el.resetCodeReason} label="Reset code lock" icon={KeyRound} onClick={() => direct('resetCode')} />
            <ActionButton enabled label="Request correction" icon={Wrench} onClick={() => direct('correction')} />
          </div>
        )}
      />

      <Link to="/orders" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to all orders
      </Link>

      {/* header status card */}
      <motion.div variants={container.container} initial="hidden" animate="show" className="space-y-4">
        <motion.section variants={container.item}>
          <Card className="flex flex-wrap items-center gap-3 p-5">
            <StatusPill status={order.status} dot />
            <Badge tone={order.paymentMethod === 'cod' ? 'amber' : 'blue'}>{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}</Badge>
            {order.requiresAttention && order.attentionReason && (
              <Badge tone="amber"><AlertTriangle className="h-3 w-3" /> {ATTENTION_LABEL[order.attentionReason]}</Badge>
            )}
            {order.deliveryCodeLocked && <Badge tone="red"><KeyRound className="h-3 w-3" /> Code locked</Badge>}
            <span className="ml-auto text-[13px] font-medium text-muted-foreground"><Clock className="mr-1 inline h-3.5 w-3.5" />{fmtDateTime(order.placedAt)}</span>
          </Card>
        </motion.section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* ── col-8 ── */}
          <div className="space-y-4 lg:col-span-8">
            {/* items */}
            <motion.section variants={container.item}>
              <SectionCard title="Items" subtitle={`${order.items.length} line item${order.items.length === 1 ? '' : 's'}`}>
                <div className="overflow-hidden rounded-xl border border-border/70">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="bg-muted/40 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((it) => (
                        <tr key={it.variantId} className="border-t border-border/60">
                          <td className="px-3 py-2 font-medium">{it.name}</td>
                          <td className="px-3 py-2 text-right tabular">×{fmtNum(it.qty)}</td>
                          <td className="px-3 py-2 text-right tabular">{fmtINR(it.price)}</td>
                          <td className="px-3 py-2 text-right font-bold tabular">{fmtINR(it.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 space-y-1 text-[13px]">
                  <p className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular">{fmtINR(itemsSubtotal)}</span></p>
                  <p className="flex justify-between text-muted-foreground"><span>Delivery fee</span><span className="tabular">{fmtINR(order.deliveryFee)}</span></p>
                  {order.discount > 0 && <p className="flex justify-between text-success"><span>Discount</span><span className="tabular">−{fmtINR(order.discount)}</span></p>}
                  <p className="flex justify-between border-t border-border pt-1.5 text-[14px] font-extrabold"><span>Total</span><span className="tabular">{fmtINR(order.amount)}</span></p>
                </div>
              </SectionCard>
            </motion.section>

            {/* timeline */}
            <motion.section variants={container.item}>
              <SectionCard title="Timeline" subtitle="Status history recorded by stores and riders">
                <StatusTimeline steps={timelineSteps} />
              </SectionCard>
            </motion.section>

            {/* corrections */}
            <motion.section variants={container.item}>
              <SectionCard title="Correction requests" subtitle="Requested fixes filed by admins or support">
                {order.correctionRequests.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No corrections requested for this order</p>
                ) : (
                  <div className="space-y-1.5">
                    {order.correctionRequests.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5">
                        <Badge tone="blue">{CORRECTION_LABEL[c.kind] ?? c.kind}</Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{c.reason}</p>
                          <p className="text-[11px] text-muted-foreground">by {c.requestedBy} · {fmtDateTime(c.at)}</p>
                        </div>
                        <Badge tone={c.status === 'applied' ? 'green' : c.status === 'rejected' ? 'red' : 'amber'}>{c.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </motion.section>
          </div>

          {/* ── col-4 ── */}
          <div className="space-y-4 lg:col-span-4">
            {/* customer */}
            <motion.section variants={container.item}>
              <SectionCard title="Customer">
                <div className="flex items-center gap-3">
                  <InitialAvatar name={order.customerName} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold">{order.customerName}</p>
                    <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-300">
                      <Phone className="h-3 w-3" /> {order.customerPhone}
                    </a>
                  </div>
                </div>
                {city && <p className="mt-2.5 text-xs text-muted-foreground">City: <span className="font-semibold text-foreground/80">{city.name}</span> · served from {data?.store?.name}</p>}
              </SectionCard>
            </motion.section>

            {/* delivery */}
            <motion.section variants={container.item}>
              <SectionCard title="Delivery">
                <div className="flex items-center gap-3">
                  {data?.rider ? (
                    <>
                      <InitialAvatar name={data.rider.name} size={40} />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-bold"><Bike className="mr-1 inline h-3.5 w-3.5 text-brand-600" />{data.rider.name}</p>
                        <p className="text-[11px] text-muted-foreground">{data.rider.vehicle} · rating {data.rider.rating}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">No rider assigned yet</p>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Delivery code</p>
                    <p className="font-mono text-[18px] font-extrabold tracking-widest">{order.deliveryCode}</p>
                  </div>
                  <Tooltip content={order.deliveryCodeLocked ? 'Unlock the code so the rider can retry handover' : 'Delivery code is not locked'}>
                    <span>
                      <Button size="sm" variant="outline" disabled={!el.resetCode} onClick={() => direct('resetCode')}>Reset lock</Button>
                    </span>
                  </Tooltip>
                </div>
                {order.wrongAddressReportedAt && (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-warning-soft px-3 py-2.5 dark:border-amber-500/30">
                    <div>
                      <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-amber-800 dark:text-amber-200"><MapPinX className="h-3.5 w-3.5" /> Wrong address reported</p>
                      <p className="text-[11px] text-amber-700/80 dark:text-amber-200/80">{fmtDateTime(order.wrongAddressReportedAt)}</p>
                    </div>
                    {order.wrongAddressResolvedAt ? (
                      <Badge tone="green"><BadgeCheck className="h-3 w-3" /> Resolved</Badge>
                    ) : (
                      <Button size="sm" variant="primary" disabled={!el.resolveAddress} onClick={() => direct('resolveAddress')}>Resolve</Button>
                    )}
                  </div>
                )}
              </SectionCard>
            </motion.section>

            {/* payment attempts */}
            <motion.section variants={container.item}>
              <SectionCard title="Payment attempts" subtitle="Gateway attempts (COD and wallet excluded)">
                {(data?.attempts ?? []).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No gateway attempts — {PAYMENT_LABEL[order.paymentMethod]} order</p>
                ) : (
                  <div className="space-y-1.5">
                    {(data?.attempts ?? []).map((a) => (
                      <div key={a.id} className="rounded-xl border border-border/70 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-bold">Attempt #{a.attemptNo}</span>
                          <Badge tone="blue">{PAYMENT_LABEL[a.method] ?? a.method}</Badge>
                          <span className="text-[13px] font-bold tabular">{fmtINR(a.amount)}</span>
                          <span className="ml-auto"><StatusPill status={a.status} /></span>
                        </div>
                        <p className={cn('mt-1 text-[11px]', a.failureReason ? 'text-destructive' : 'text-muted-foreground')}>
                          {a.failureReason ?? `${a.gateway}${a.gatewayRef ? ` · ${a.gatewayRef}` : ''}`}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{fmtDateTime(a.at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </motion.section>

            {/* refunds */}
            <motion.section variants={container.item}>
              <SectionCard
                title="Refunds"
                subtitle={`${fmtINR(alreadyRefunded)} refunded · ${fmtINR(refundRemaining)} remaining`}
                action={(
                  <Tooltip content={refundElig.eligible ? 'File a refund against this order' : (refundElig.reason ?? 'Refund not eligible')}>
                    <span>
                      <Button size="sm" variant="primary" disabled={!refundElig.eligible} onClick={() => setRefundOpen(true)}>
                        <Undo2 className="h-3.5 w-3.5" /> Request refund
                      </Button>
                    </span>
                  </Tooltip>
                )}
              >
                {(data?.refunds ?? []).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No refunds on this order</p>
                ) : (
                  <div className="space-y-1.5">
                    {(data?.refunds ?? []).map((r) => (
                      <div key={r.id} className="rounded-xl border border-border/70 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <StatusPill status={r.status} />
                          <span className="text-[13.5px] font-extrabold tabular">{fmtINR(r.amount)}</span>
                          <span className="ml-auto text-[11px] text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-[11.5px] text-muted-foreground">{r.reason} · via {r.source}</p>
                        {r.evidence && <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand-700 dark:text-brand-300"><Receipt className="h-3 w-3" /> Evidence: {r.evidence.fileName}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </motion.section>

            {/* related tickets */}
            <motion.section variants={container.item}>
              <SectionCard title="Related tickets" subtitle="Support conversations linked to this order">
                {(data?.tickets ?? []).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No tickets reference this order</p>
                ) : (
                  <div className="space-y-1.5">
                    {(data?.tickets ?? []).map((tk) => (
                      <Link key={tk.id} to={`/support?focus=${tk.id}`} className="group flex items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2.5 transition hover:bg-primary-soft">
                        <LifeBuoy className="h-4 w-4 shrink-0 text-brand-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">{tk.ref} — {tk.subject}</p>
                          <p className="text-[11px] text-muted-foreground">Updated {fmtDateTime(tk.updatedAt)}</p>
                        </div>
                        <StatusPill status={tk.status} />
                      </Link>
                    ))}
                  </div>
                )}
              </SectionCard>
            </motion.section>
          </div>
        </div>
      </motion.div>

      {/* shared action dialogs */}
      <OrderActionDialogs open={dialog} onClose={() => setDialog(null)} />

      {/* refund dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent title={`Request refund for #${order.id}`} description={`Up to ${fmtINR(refundRemaining)} (un-refunded balance)`}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submitRefund() }}>
            <Field label="Amount (₹)" required error={refundError}>
              <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} max={refundRemaining} />
            </Field>
            <Field label="Reason" required hint="Logged on the refund and visible to support">
              <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. Missing item reported via ticket" />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="md" onClick={() => setRefundOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" size="md">Request refund</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

