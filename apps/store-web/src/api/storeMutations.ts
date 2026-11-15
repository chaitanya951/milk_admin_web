import { useCallback } from 'react'
import { toast } from '@dairydirect/shared/lib/toast'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { useQueryClient } from '@tanstack/react-query'
import { useStoreAuth, useActiveStore } from '@/login/authStore'
import { DEMO_NOW } from '@dairydirect/shared/mock-db/seed'
import { fmtINR } from '@dairydirect/shared/lib/utils'
import type {
  ReturnParcel, CodDeposit, StockReceipt, StockCount, StockAdjustment,
  StoreNotificationPrefs, PickingTask,
} from '@dairydirect/shared/types'

/** Apply a store journal op + toast + refetch. */
export function useStoreApply() {
  const apply = useDB((s) => s.apply)
  const qc = useQueryClient()
  return useCallback((op: Parameters<ReturnType<typeof useDB.getState>['apply']>[0], message?: string) => {
    apply(op)
    qc.invalidateQueries()
    if (message) toast.success(message)
  }, [apply, qc])
}

function useManager() {
  const user = useStoreAuth((s) => s.user)
  const activeId = useActiveStore((s) => s.activeStoreId)
  return { name: user?.name ?? 'Store Manager', id: user?.id ?? '', storeId: activeId }
}

// ── §2 Picking ──────────────────────────────────────────────────
export function usePickingActions() {
  const apply = useStoreApply()
  const manager = useManager()
  return {
    claim: (task: PickingTask) => apply({ t: 'picking.claim', taskId: task.id, assigneeId: manager.id, at: DEMO_NOW.toISOString() }, `Task ${task.id} claimed by you`),
    release: (taskId: string) => apply({ t: 'picking.release', taskId }, 'Task released back to the queue'),
    pickLine: (taskId: string, lineId: string, qtyPicked: number, batchId: string) => apply({ t: 'picking.pick', taskId, lineId, qtyPicked, batchId }),
    substitute: (taskId: string, lineId: string, substitutionVariantId: string) => apply({ t: 'picking.substitute', taskId, lineId, substitutionVariantId }, 'Substitute recorded'),
    markUnavailable: (taskId: string, lineId: string, reason: string) => apply({ t: 'picking.unavailable', taskId, lineId, reason }, 'Item marked unavailable'),
    completePicking: (taskId: string) => apply({ t: 'picking.complete', taskId, at: DEMO_NOW.toISOString() }, 'Picking complete — ready to pack'),
    savePacking: (taskId: string, bags: number, coldChain: boolean, packedBy: string, notes: string | undefined, riderId: string, riderName: string) =>
      apply({ t: 'packing.save', taskId, bags, coldChain, packedBy, notes, riderId, riderName, code: String(Math.floor(1000 + Math.random() * 9000)), at: DEMO_NOW.toISOString() }, 'Packed — ready for handover'),
    verifyHandover: (taskId: string, code: string, attempts: number) => {
      apply({ t: 'handover.verify', taskId, code, attempts, at: DEMO_NOW.toISOString() })
      // caller checks result via query
    },
    reassign: (taskId: string, toAssigneeId: string, assigneeName: string, reason: string) =>
      apply({ t: 'staff.reassign', taskId, toAssigneeId, reason, by: manager.name }, `Task reassigned to ${assigneeName}`),
  }
}

// ── §4 Returns ──────────────────────────────────────────────────
export function useReturnActions() {
  const apply = useStoreApply()
  const manager = useManager()
  return {
    record: (parcel: ReturnParcel) => apply({ t: 'returns.record', parcel }, `Return ${parcel.id} recorded — inspection pending`),
    decide: (parcelId: string, itemBatchId: string, decision: 'saleable' | 'damaged' | 'expired') => apply({ t: 'returns.decide', parcelId, itemBatchId, decision }),
    complete: (parcelId: string, stockAction: 'quarantine' | 'write_off', note?: string) => apply({ t: 'returns.complete', parcelId, stockAction, note, at: DEMO_NOW.toISOString() }, 'Return processing complete'),
    saveDraft: (parcelId: string) => apply({ t: 'returns.draft', parcelId }, 'Draft saved'),
    newParcelId: () => `RTN-${Date.now() % 100000}`,
    managerName: manager.name,
  }
}

// ── §5 Rider documents ──────────────────────────────────────────
export function useRiderDocActions() {
  const apply = useStoreApply()
  return {
    decide: (appId: string, docType: string, status: 'approved' | 'rejected', reason?: string) => {
      apply({ t: 'riderDoc.decide', appId, docType, status, reason, at: DEMO_NOW.toISOString() },
        status === 'approved' ? 'Document approved' : 'Document rejected — rider notified to re-upload')
    },
  }
}

// ── §6 COD deposits ─────────────────────────────────────────────
export function useCodActions() {
  const apply = useStoreApply()
  const manager = useManager()
  return {
    record: (deposit: CodDeposit) => apply({ t: 'cod.record', deposit }, `${fmtINR(deposit.amount)} deposit recorded (${deposit.outcome.replace(/_/g, ' ')})`),
    suggestReference: () => {
      const today = DEMO_NOW.toISOString().slice(0, 10).replace(/-/g, '')
      const existing = useDB.getState().db.codDeposits.filter((d) => d.id.includes(today)).length
      return `DEP-${today}-${String(existing + 1).padStart(2, '0')}`
    },
    storeId: manager.storeId,
  }
}

// ── §3 Inventory ────────────────────────────────────────────────
export function useStoreInventoryActions() {
  const apply = useStoreApply()
  const manager = useManager()
  return {
    receiveStock: (receipt: StockReceipt) => apply({ t: 'receipt.add', receipt }, `Stock received: ${receipt.qty} units into ${receipt.binLocation}`),
    setBin: (storeId: string, variantId: string, binLocation: string) => apply({ t: 'bin.set', storeId, variantId, binLocation }, `Bin location set to ${binLocation}`),
    startCount: (count: StockCount) => apply({ t: 'count.start', count }, 'Stock count started'),
    updateCountLine: (id: string, variantId: string, counted: number) => apply({ t: 'count.update', id, lineBatchId: variantId, counted }),
    completeCount: (id: string) => apply({ t: 'count.complete', id, at: DEMO_NOW.toISOString() }, 'Stock count completed'),
    createAdjustment: (adjustment: StockAdjustment) => {
      const needsApproval = Math.abs(adjustment.delta) >= 20 || adjustment.reason.toLowerCase().includes('unexplained')
      if (needsApproval) {
        apply({
          t: 'adjustment.create', adjustment,
          approval: {
            id: `ap-stock-${Date.now()}`, action: 'Stock adjustment', targetType: 'stock_adjustment',
            targetLabel: `Variant ${adjustment.variantId} (${manager.storeId})`,
            details: `Adjustment ${adjustment.delta > 0 ? '+' : ''}${adjustment.delta} units · reason: ${adjustment.reason}`,
            reason: adjustment.reason, requesterName: manager.name, requesterRole: 'Store manager',
            status: 'pending', requestedAt: DEMO_NOW.toISOString(),
            canApprove: false, cannotApproveReason: 'You requested this adjustment — an admin must approve it',
            expiresAt: DEMO_NOW.toISOString(),
          },
        } as never)
        toast.success('Adjustment submitted — pending admin approval')
      } else {
        apply({ t: 'adjustment.create', adjustment } as never, 'Adjustment recorded')
      }
    },
  }
}

// ── §7 Store status ─────────────────────────────────────────────
export function useStoreStatusActions() {
  const apply = useStoreApply()
  const manager = useManager()
  return {
    pause: (storeId: string, reason: string) => {
      apply({ t: 'status.change', change: { id: `ssc-${Date.now()}`, storeId, status: 'paused', by: manager.name, role: 'Store manager', at: DEMO_NOW.toISOString(), reason } }, 'Store paused')
    },
    resume: (storeId: string) => {
      apply({ t: 'status.change', change: { id: `ssc-${Date.now()}`, storeId, status: 'online', by: manager.name, role: 'Store manager', at: DEMO_NOW.toISOString() } }, 'Store resumed — accepting orders')
    },
  }
}

// ── §8 Staff reassign ───────────────────────────────────────────
export function useStaffActions() {
  return { reassign: usePickingActions().reassign }
}

// ── §9 Notifications & prefs ────────────────────────────────────
export function useStoreNotificationActions() {
  const apply = useStoreApply()
  const user = useStoreAuth((s) => s.user)
  return {
    markNotificationRead: (id?: string) => apply({ t: 'storeNotif.read', id }),
    markAllRead: () => apply({ t: 'storeNotif.read' }),
    setPrefs: (prefs: StoreNotificationPrefs) => user && apply({ t: 'prefs.set', workforceId: user.id, prefs }, 'Notification preferences saved'),
  }
}
