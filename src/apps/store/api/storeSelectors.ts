import type { DB, PickingTask } from '@/shared/types'
import { sameDay } from '@/shared/lib/utils'

export interface StoreDashboardSummary {
  storeId: string
  date: string
  openPickingTasks: number
  completedToday: number
  deadlineBreaches: number
  avgPickingTimeMin: number
  substitutedRatePct: number
  pendingRiderApps: number
  storeStatus: 'online' | 'paused'
  storeName: string
  storeCode: string
  storeNote?: string
  lowStock: Array<{ variantName: string; qty: number; reorderLevel: number }>
  expiringStock: Array<{ variantName: string; qty: number; expiryDate: string; daysLeft: number }>
  hourly: Array<{ label: string; completed: number; open: number }>
  byStatus: { waiting: number; beingPicked: number; readyToPack: number; readyHandover: number }
  staffWorkload: Array<{ id: string; name: string; activeTasks: number; level: 'High' | 'Medium' | 'Low'; status: 'active' | 'inactive' }>
  avgTasksPerActivePicker: number
  upcoming: Array<{ taskId: string; orderId: string; customerName: string; itemCount: number; dueBy: string; overdue: boolean; status: string; assigneeName: string | null }>
  overdueCount: number
  dueSoonCount: number
  lowStockCount: number
  expiringCount: number
  pendingReturns: number
  underInspection: number
  processedToday: number
  inQuarantine: number
  codTodayTotal: number
  codTodayCount: number
}

const variantName = (db: DB, vid: string) => {
  const v = db.variants.find((x) => x.id === vid)!
  return v ? `${db.products.find((p) => p.id === v.productId)!.name} – ${v.label}` : vid
}

export function storeTasksFor(db: DB, storeId: string): PickingTask[] {
  return db.pickingTasks.filter((t) => t.storeId === storeId)
}

export function isOverdue(t: PickingTask, now: Date): boolean {
  return (t.status === 'waiting_to_pick' || t.status === 'being_picked') && new Date(t.deadline).getTime() < now.getTime()
}
export function isDueSoon(t: PickingTask, now: Date, withinMin = 30): boolean {
  if (!(t.status === 'waiting_to_pick' || t.status === 'being_picked')) return false
  const dl = new Date(t.deadline).getTime()
  const diff = dl - now.getTime()
  return diff >= 0 && diff <= withinMin * 60000
}

export function getStoreDashboard(db: DB, storeId: string, date: Date = new Date(db.demoNow)): StoreDashboardSummary {
  const store = db.stores.find((s) => s.id === storeId)!
  const now = new Date(db.demoNow)
  const tasks = storeTasksFor(db, storeId)
  const todays = tasks.filter((t) => sameDay(new Date(t.createdAt), now))
  const waiting = todays.filter((t) => t.status === 'waiting_to_pick').length
  const beingPicked = todays.filter((t) => t.status === 'being_picked').length
  const readyToPack = todays.filter((t) => t.status === 'ready_to_pack').length
  const readyHandover = todays.filter((t) => t.status === 'ready_for_handover').length
  const completedTodayTasks = tasks.filter((t) => t.status === 'completed' && t.completedAt && sameDay(new Date(t.completedAt), now))

  const durations = completedTodayTasks
    .filter((t) => t.claimedAt && t.completedAt)
    .map((t) => (new Date(t.completedAt!).getTime() - new Date(t.claimedAt!).getTime()) / 60000)
  const avgPickingTimeMin = durations.length ? +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : 0

  const todaysLines = todays.flatMap((t) => t.lines)
  const substituted = todaysLines.filter((l) => l.substitutionVariantId || l.unavailableReason).length
  const substitutedRatePct = todaysLines.length ? +((substituted / todaysLines.length) * 100).toFixed(1) : 0

  const overdueTasks = todays.filter((t) => isOverdue(t, now))
  const dueSoonTasks = todays.filter((t) => isDueSoon(t, now))

  const batches = db.inventoryBatches.filter((b) => b.storeId === storeId)
  const totalsByVariant = new Map<string, number>()
  for (const b of batches) totalsByVariant.set(b.variantId, (totalsByVariant.get(b.variantId) ?? 0) + b.qty)
  const lowStock: StoreDashboardSummary['lowStock'] = []
  let lowStockCount = 0
  for (const [vid, qty] of totalsByVariant) {
    const product = db.products.find((p) => p.id === db.variants.find((v) => v.id === vid)!.productId)!
    if (qty < product.reorderLevel) {
      lowStockCount++
      if (lowStock.length < 6) lowStock.push({ variantName: variantName(db, vid), qty, reorderLevel: product.reorderLevel })
    }
  }
  const expiring = batches
    .filter((b) => (new Date(b.expiryDate).getTime() - now.getTime()) / 86400000 <= 7)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  const expiringCount = expiring.length
  const expiringStock = expiring.slice(0, 6).map((b) => ({
    variantName: variantName(db, b.variantId), qty: b.qty, expiryDate: b.expiryDate,
    daysLeft: Math.max(0, Math.ceil((new Date(b.expiryDate).getTime() - now.getTime()) / 86400000)),
  }))

  // hourly overview: completed per hour bucket + open (created) per hour bucket, 6 AM → 4 PM
  const hourly: StoreDashboardSummary['hourly'] = []
  for (let h = 6; h <= 16; h++) {
    const label = `${h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`
    const completed = completedTodayTasks.filter((t) => t.completedAt && new Date(t.completedAt).getHours() === h).length
    const open = todays.filter((t) => new Date(t.createdAt).getHours() === h && t.status !== 'completed').length
    hourly.push({ label, completed, open })
  }

  const staffIds = store.managerIds
  const staffWorkload = staffIds.map((id) => {
    const w = db.workforce.find((x) => x.id === id)
    const active = todays.filter((t) => t.status === 'being_picked' && t.assigneeId === id).length
    return {
      id, name: w?.name ?? id,
      activeTasks: w?.status === 'inactive' ? 0 : active,
      level: (active >= 4 ? 'High' : active >= 2 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
      status: (w?.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
    }
  })
  const activePickers = staffWorkload.filter((s) => s.status === 'active' && s.activeTasks > 0)
  const avgTasksPerActivePicker = activePickers.length ? +(staffWorkload.reduce((a, s) => a + s.activeTasks, 0) / activePickers.length).toFixed(1) : 0

  const upcoming = [...overdueTasks, ...dueSoonTasks].map((t) => {
    const order = db.orders.find((o) => o.id === t.orderId)
    const assignee = t.assigneeId ? db.workforce.find((w) => w.id === t.assigneeId) : null
    return {
      taskId: t.id, orderId: t.orderId, customerName: order?.customerName ?? '—',
      itemCount: t.lines.reduce((a, l) => a + l.qtyOrdered, 0), dueBy: t.deadline,
      overdue: isOverdue(t, now), status: t.status, assigneeName: assignee?.name ?? null,
    }
  })

  const returns = db.returns.filter((r) => r.storeId === storeId)
  const codToday = db.codDeposits.filter((d) => d.storeId === storeId && sameDay(new Date(d.at), now))

  return {
    storeId, date: date.toISOString(),
    openPickingTasks: waiting + beingPicked,
    completedToday: completedTodayTasks.length,
    deadlineBreaches: overdueTasks.length,
    avgPickingTimeMin,
    substitutedRatePct,
    pendingRiderApps: db.riderApplications.filter((a) => a.storeId === storeId && a.status === 'pending').length,
    storeStatus: store.status, storeName: store.name, storeCode: store.code, storeNote: store.note,
    lowStock, expiringStock, hourly,
    byStatus: { waiting, beingPicked, readyToPack, readyHandover },
    staffWorkload, avgTasksPerActivePicker, upcoming,
    overdueCount: overdueTasks.length, dueSoonCount: dueSoonTasks.length,
    lowStockCount, expiringCount,
    pendingReturns: returns.filter((r) => r.status === 'pending').length,
    underInspection: returns.filter((r) => r.status === 'under_inspection').length,
    processedToday: returns.filter((r) => r.status === 'processed' && r.processedAt && sameDay(new Date(r.processedAt), now)).length,
    inQuarantine: returns.filter((r) => r.stockAction === 'quarantine').length,
    codTodayTotal: codToday.reduce((a, d) => a + d.amount, 0),
    codTodayCount: codToday.length,
  }
}
