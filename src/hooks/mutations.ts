import { useCallback } from 'react'
import { toast } from '@/lib/toast'
import { useDB, type JournalOp } from '@/store/db'
import { useAuth } from '@/store/auth'
import { useQueryClient } from '@tanstack/react-query'
import { fmtINR } from '@/lib/utils'
import type {
  Store, Zone, LegalEntity, Product, Variant, VariantAvailability, WorkforceAccount,
  Rider, Coupon, PushCampaign, SystemSettings, LegalHold, ExportJob, AdminNotification,
  Payout, WalletLedgerEntry, ReportTab, StockLevel, ErasureRequest,
} from '@/types'
import { DEMO_NOW } from '@/data/seed'

/** Apply a journal op (persisted mutation) + toast + refetch everything. */
export function useApply() {
  const apply = useDB((s) => s.apply)
  const qc = useQueryClient()
  return useCallback((op: JournalOp, message?: string) => {
    apply(op)
    qc.invalidateQueries()
    if (message) toast.success(message)
  }, [apply, qc])
}

function useActor() {
  return useAuth((s) => s.user?.name ?? 'Arjun Mehta')
}

export function useNotify() {
  const apply = useApply()
  return useCallback((title: string, body: string, kind: AdminNotification['kind']) => {
    apply({ t: 'notification', entry: { id: `n-${Date.now()}`, title, body, kind, at: DEMO_NOW.toISOString(), read: false } })
  }, [apply])
}

// ── §2 Stores ───────────────────────────────────────────────────
export function useStoreActions() {
  const apply = useApply()
  return {
    addStore: (store: Store) => apply({ t: 'store.add', store }, `Store "${store.name}" created`),
    updateStore: (id: string, patch: Partial<Store>, name?: string) => apply({ t: 'store.update', id, patch }, name ? `${name} updated` : 'Store updated'),
    deleteStore: (id: string, name: string) => apply({ t: 'store.delete', id }, `Store "${name}" deleted`),
    addZone: (zone: Zone) => apply({ t: 'zone.add', zone }, `Zone "${zone.name}" created`),
    updateZone: (id: string, patch: Partial<Zone>) => apply({ t: 'zone.update', id, patch }, 'Zone updated'),
    deleteZone: (id: string, name: string) => apply({ t: 'zone.delete', id }, `Zone "${name}" removed`),
    addLegalEntity: (entity: LegalEntity) => apply({ t: 'entity.add', entity }, `Legal entity "${entity.name}" created`),
    updateLegalEntity: (id: string, patch: Partial<LegalEntity>) => apply({ t: 'entity.update', id, patch }, 'Legal entity updated'),
    deleteLegalEntity: (id: string, name: string) => apply({ t: 'entity.delete', id }, `Legal entity "${name}" deleted`),
  }
}

// ── §3 Products ─────────────────────────────────────────────────
export function useProductActions() {
  const apply = useApply()
  const actor = useActor()
  return {
    addProduct: (product: Product, variants: Variant[]) => apply({ t: 'product.add', product, variants }, `Product "${product.name}" created`),
    updateProduct: (id: string, patch: Partial<Product>, name?: string) => apply({ t: 'product.update', id, patch }, name ? `${name} updated` : 'Product updated'),
    deleteProduct: (id: string, name: string) => apply({ t: 'product.delete', id }, `Product "${name}" deleted`),
    updateVariant: (id: string, patch: Partial<Variant>, label?: string) => apply({ t: 'variant.update', id, patch }, label ? `${label} updated` : 'Variant updated'),
    addVariant: (variant: Variant) => apply({ t: 'variant.add', variant }, `Variant ${variant.label} added`),
    updateAvailability: (variantId: string, storeId: string, patch: Partial<VariantAvailability>) => apply({ t: 'storeVariant.update', variantId, storeId, patch }),
    /** Sensitive catalog change → creates an approval request + marks the item "Pending approval". */
    requestApproval: (input: { action: string; targetType: 'variant_price' | 'product_publish' | 'coupon_config' | 'business_rule' | 'refund_override'; targetLabel: string; details: string; reason: string }, onItem?: { productId?: string; pendingLabel?: string }) => {
      const approvalId = `ap-${Date.now()}`
      apply({
        t: 'approval.add',
        approval: {
          id: approvalId, action: input.action, targetType: input.targetType, targetLabel: input.targetLabel,
          details: input.details, reason: input.reason, requesterName: actor, requesterRole: 'Admin',
          status: 'pending', requestedAt: DEMO_NOW.toISOString(), canApprove: false,
          cannotApproveReason: 'You requested this change — another admin must approve it', expiresAt: DEMO_NOW.toISOString(),
        },
      })
      apply({ t: 'notification', entry: { id: `n-${Date.now()}`, title: 'Approval requested', body: `${input.action} — ${input.targetLabel}`, kind: 'approval', at: DEMO_NOW.toISOString(), read: false } })
      if (onItem?.productId) {
        useDB.getState().apply({ t: 'product.update', id: onItem.productId, patch: { pendingApprovalId: approvalId, pendingChangeLabel: onItem.pendingLabel ?? 'Pending approval' } })
      }
      toast.success('Approval request submitted — item shows "Pending approval" until decided')
    },
  }
}

// ── §4 Inventory ────────────────────────────────────────────────
export function useInventoryActions() {
  const apply = useApply()
  return {
    updateStock: (storeId: string, variantId: string, patch: Partial<StockLevel>) => apply({ t: 'stock.update', storeId, variantId, patch }, 'Stock level updated'),
  }
}

// ── §5 Orders ───────────────────────────────────────────────────
export function useOrderActions() {
  const apply = useApply()
  const notify = useNotify()
  const actor = useActor()
  return {
    hold: (id: string, reason: string) => {
      apply({ t: 'order.hold', id, reason, at: DEMO_NOW.toISOString() }, `Order #${id} put on hold`)
      notify(`Order #${id} put on hold`, reason, 'order')
    },
    release: (id: string) => apply({ t: 'order.release', id, at: DEMO_NOW.toISOString() }, `Order #${id} hold released`),
    cancel: (id: string, reason: string) => {
      apply({ t: 'order.cancel', id, reason, at: DEMO_NOW.toISOString() }, `Order #${id} cancelled`)
      notify(`Order #${id} cancelled`, reason, 'order')
    },
    requestCorrection: (id: string, kind: string, reason: string) => apply({ t: 'order.correction', id, kind, reason, by: actor, at: DEMO_NOW.toISOString() }, `Correction requested for #${id}`),
    reassign: (id: string, riderId: string, riderName: string) => apply({ t: 'order.reassign', id, riderId, at: DEMO_NOW.toISOString() }, `#${id} reassigned to ${riderName}`),
    resolveAddress: (id: string) => apply({ t: 'order.resolveAddress', id, at: DEMO_NOW.toISOString() }, `Wrong-address report resolved for #${id}`),
    resetCode: (id: string) => apply({ t: 'order.resetCode', id, at: DEMO_NOW.toISOString() }, `Delivery code lock reset for #${id}`),
  }
}

// ── §6 People ───────────────────────────────────────────────────
export function usePeopleActions() {
  const apply = useApply()
  const notify = useNotify()
  const actor = useActor()
  return {
    blockCustomer: (id: string, reason: string, name: string) => apply({ t: 'customer.block', id, reason }, `${name} blocked`),
    unblockCustomer: (id: string, name: string) => apply({ t: 'customer.unblock', id }, `${name} unblocked`),
    addWorkforce: (member: WorkforceAccount) => apply({ t: 'workforce.add', member }, `Invite sent to ${member.email}`),
    updateWorkforce: (id: string, patch: Partial<WorkforceAccount>, name?: string) => apply({ t: 'workforce.update', id, patch }, name ? `${name} updated` : 'Account updated'),
    requestPasswordReset: (id: string, name: string) => apply({ t: 'workforce.update', id, patch: { passwordResetRequested: true } }, `Password reset requested for ${name}`),
    /** Role change to admin goes through the approval workflow. */
    requestRoleChange: (member: WorkforceAccount, newRole: WorkforceAccount['role'], approvalId: string) => {
      apply({ t: 'workforce.update', id: member.id, patch: { pendingRoleChangeApprovalId: approvalId } })
      apply({ t: 'notification', entry: { id: `n-${Date.now()}`, title: 'Role change needs approval', body: `${member.name}: ${member.role} → ${newRole}`, kind: 'approval', at: DEMO_NOW.toISOString(), read: false } })
      toast.success('Role change submitted as an approval request')
    },
  }
}

// ── §7 Payments, refunds & wallets ──────────────────────────────
export function usePaymentActions() {
  const apply = useApply()
  const notify = useNotify()
  const actor = useActor()
  return {
    requestRefund: (orderId: string, amount: number, reason: string, source: 'admin' | 'support') => {
      apply({ t: 'refund.request', orderId, amount, reason, source, at: DEMO_NOW.toISOString(), refundId: `RF-${orderId}-${Date.now()}` }, `${fmtINR(amount)} refund requested for #${orderId}`)
      notify('Refund requested', `${fmtINR(amount)} for #${orderId} — status: Requested`, 'system' as AdminNotification['kind'])
    },
    updateRefundStatus: (id: string, status: 'processing' | 'paid' | 'failed') => {
      apply({ t: 'refund.status', id, status, at: DEMO_NOW.toISOString() }, `Refund marked ${status}`)
      if (status === 'paid') notify('Refund paid', `${id} settled`, 'system' as AdminNotification['kind'])
    },
    recordRefundEvidence: (id: string, reference: string, fileName: string) => apply({ t: 'refund.evidence', id, reference, fileName }, 'Manual refund evidence recorded'),
    walletAdjust: (entry: WalletLedgerEntry) => apply({ t: 'wallet.adjust', entry }, `Wallet ${entry.amount >= 0 ? 'credit' : 'debit'} of ${fmtINR(Math.abs(entry.amount))} applied`),
    setReconciliationStatus: (id: string, status: 'open' | 'investigating' | 'resolved', note?: string) => apply({ t: 'reconciliation.status', id, status, note }, `Finding marked ${status}`),
    retryInvoice: (id: string) => apply({ t: 'invoice.retry', id, at: DEMO_NOW.toISOString() }, `Invoice render retry queued for ${id}`),
  }
}

// ── §8 Rider payouts & COD ──────────────────────────────────────
export function usePayoutActions() {
  const apply = useApply()
  return {
    approve: (payout: Payout) => apply({ t: 'payout.approve', id: payout.id, at: DEMO_NOW.toISOString() }, `Payout ${payout.id} approved (${fmtINR(payout.netAmount)})`),
    hold: (id: string, reason: string) => apply({ t: 'payout.hold', id, reason }, `Payout ${id} put on hold`),
    /** Post-payment evidence only — no bank transfer is initiated from here. */
    settle: (id: string, reference: string, fileName?: string) => apply({ t: 'payout.settle', id, reference, fileName, at: DEMO_NOW.toISOString() }, `Payment reference recorded for ${id}`),
  }
}

// ── §9 Offers & notifications ───────────────────────────────────
export function useOfferActions() {
  const apply = useApply()
  return {
    addCoupon: (coupon: Coupon) => apply({ t: 'coupon.add', coupon }, `Coupon ${coupon.code} created`),
    updateCoupon: (id: string, patch: Partial<Coupon>, code?: string) => apply({ t: 'coupon.update', id, patch }, code ? `Coupon ${code} updated` : 'Coupon updated'),
    addCampaign: (campaign: PushCampaign) => apply({ t: 'campaign.add', campaign }, campaign.status === 'scheduled' ? `Campaign "${campaign.name}" scheduled` : `Draft "${campaign.name}" saved`),
    markNotificationRead: (id?: string) => apply({ t: 'notif.read', id }),
  }
}

// ── §10 Subscriptions ───────────────────────────────────────────
export function useSubscriptionAdminActions() {
  const apply = useApply()
  return {
    retryRun: (id: string) => apply({ t: 'subscription.retryRun', id, at: DEMO_NOW.toISOString() }, `Retried failed generations for run ${id}`),
    updateConfig: (patch: Partial<SystemSettings['subscription']>) => apply({ t: 'subscription.config', patch }, 'Subscription settings saved'),
  }
}

// ── §11 Support & reviews ───────────────────────────────────────
export function useSupportActions() {
  const apply = useApply()
  return {
    reply: (ticketId: string, body: string, internal = false) => apply({ t: 'ticket.reply', id: ticketId, message: { id: `m-${Date.now()}`, author: internal ? 'admin' : 'admin', body, at: DEMO_NOW.toISOString(), internal } }, internal ? 'Internal note added' : 'Response sent'),
    setStatus: (id: string, status: 'open' | 'pending' | 'resolved' | 'closed') => apply({ t: 'ticket.status', id, status, at: DEMO_NOW.toISOString() }, `Ticket marked ${status}`),
    moderate: (id: string, status: 'approved' | 'removed', reason?: string) => apply({ t: 'rating.moderate', id, status, reason }, `Rating ${status}`),
  }
}

// ── §13 Approvals & compliance ──────────────────────────────────
export function useApprovalActions() {
  const apply = useApply()
  const actor = useActor()
  return {
    decide: (id: string, status: 'completed' | 'rejected', applyChanges?: { variantId?: string; newPrice?: number; publish?: boolean; workforceId?: string; newRole?: string }) => {
      apply({ t: 'approval.decide', id, status, decidedBy: actor, at: DEMO_NOW.toISOString(), apply: applyChanges }, status === 'completed' ? 'Approval granted — change applied' : 'Approval rejected')
    },
    setFraudStatus: (id: string, status: 'open' | 'cleared' | 'confirmed') => apply({ t: 'fraud.status', id, status }, `Fraud finding marked ${status}`),
    updateErasure: (id: string, patch: Partial<ErasureRequest>) => apply({ t: 'erasure.update', id, patch }),
    placeHold: (hold: LegalHold) => apply({ t: 'hold.add', hold }, `Legal hold placed on ${hold.subjectName}`),
    releaseHold: (id: string) => apply({ t: 'hold.release', id, at: DEMO_NOW.toISOString() }, 'Legal hold released'),
  }
}

// ── §12 Reports & exports ───────────────────────────────────────
export function useExportActions() {
  const apply = useApply()
  const qc = useQueryClient()
  return {
    createJob: (tab: ReportTab, label: string, filtersSummary: string) => {
      const job: ExportJob = {
        id: `ex-${Date.now()}`, tab, label, filtersSummary, status: 'pending', authorized: true,
        createdAt: DEMO_NOW.toISOString(),
      }
      apply({ t: 'export.add', job })
      // simulate async job completion
      const finish = Math.random() > 0.18
      setTimeout(() => {
        if (finish) {
          useDB.getState().apply({ t: 'export.complete', id: job.id, rowCount: Math.max(12, Math.floor(Math.random() * 800)), fileName: `${tab}-${new Date().toISOString().slice(0, 10)}.xlsx` })
          toast.success(`Export ${job.id} completed — download available`)
        } else {
          useDB.getState().apply({ t: 'export.fail', id: job.id, error: 'Export worker timed out' })
          toast.error(`Export ${job.id} failed`)
        }
        void qc.invalidateQueries()
      }, 2200)
      return job
    },
  }
}

// ── §14 Settings & system ───────────────────────────────────────
export function useSystemActions() {
  const apply = useApply()
  return {
    setFeatures: (features: SystemSettings['features']) => apply({ t: 'flags', features }, 'Feature flags updated — UI updated everywhere instantly'),
    setRules: (rules: SystemSettings['rules']) => apply({ t: 'rules', rules }, 'Business rules saved'),
    retryJob: (id: string) => apply({ t: 'job.retry', id, at: DEMO_NOW.toISOString() }, `Job ${id} re-queued`),
  }
}
