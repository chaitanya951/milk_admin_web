// §9 Notifications & Account — notification inbox (tabs, search, per-row actions,
// mark-all-read, deep links), preference switches persisted to the journal, and the
// manager's own account card (reset password → existing /reset-password flow, sign out).
// No Edit Profile (spec removes it).
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bell, CheckCheck, Eye, EyeOff, KeyRound, LogOut, Mail, MoreVertical, Phone,
  Settings, UserRound, Zap,
} from 'lucide-react'
import { useDebouncedValue, useStagger } from '@/shared/hooks/misc'
import { useStoreNotifications } from '@/apps/store/api/storeQueries'
import { useStoreNotificationActions } from '@/apps/store/api/storeMutations'
import { useAuth } from '@/auth/authStore'
import { useDB } from '@/shared/data/db'
import { DEMO_NOW } from '@/shared/data/seed'
import { toast } from '@/shared/lib/toast'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Switch } from '@/shared/components/ui/base'
import { DropdownItem, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/components/ui/overlays'
import { Select } from '@/shared/components/ui/form'
import { Avatar as PhotoAvatar } from '@/shared/illustrations/avatars'
import { EmptyState, PageHeader, SearchInput, TabPills } from '@/shared/components/misc'
import { Pagination } from '@/shared/components/DataTable'
import { KpiCard } from '@/shared/components/KpiCard'
import { MeadowScene } from '@/shared/illustrations/scenes'
import { cn, timeAgo } from '@/shared/lib/utils'
import type { StoreNotification, StoreNotificationPrefs } from '@/shared/types'

const PAGE_SIZE = 8

const KIND_META: Record<StoreNotification['kind'], { label: string; tile: string; tone: 'amber' | 'blue' | 'neutral' }> = {
  action: { label: 'Action', tile: 'bg-warning-soft text-amber-600 dark:text-warning', tone: 'amber' },
  operational: { label: 'Operational', tile: 'bg-info-soft text-info', tone: 'blue' },
  system: { label: 'System', tile: 'bg-muted text-muted-foreground', tone: 'neutral' },
}
const KIND_ICON = { action: Zap, operational: Bell, system: Settings } as const

const PREF_ROWS: Array<{ key: keyof StoreNotificationPrefs; label: string; desc: string }> = [
  { key: 'pickingOrders', label: 'Picking & Orders', desc: 'Queue updates, claims and packing' },
  { key: 'inventoryAlerts', label: 'Inventory Alerts', desc: 'Low stock and expiring batches' },
  { key: 'riderApplications', label: 'Rider Applications', desc: 'New applications and document updates' },
  { key: 'codDeposits', label: 'COD Deposits', desc: 'Recorded deposits and discrepancies' },
  { key: 'storeStatus', label: 'Store Status', desc: 'Pause, resume and auto-open events' },
]

export function StoreNotificationsAccount() {
  const stagger = useStagger()
  const navigate = useNavigate()
  const { data, prefs, isLoading } = useStoreNotifications()
  const actions = useStoreNotificationActions()
  const user = useAuth((s) => s.user)
  const db = useDB((s) => s.db)

  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search)
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [localUnread, setLocalUnread] = useState<Set<string>>(new Set())
  const [localPrefs, setLocalPrefs] = useState<StoreNotificationPrefs | null>(null)
  const logout = useAuth((s) => s.logout)

  const isRead = (n: StoreNotification) => !localUnread.has(n.id) && n.read

  const counts = useMemo(() => {
    const unread = data.filter((n) => !isRead(n)).length
    return {
      total: data.length,
      unread,
      read: data.length - unread,
      action: data.filter((n) => n.requiresAction).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, localUnread])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return [...data]
      .filter((n) => {
        if (tab === 'action' && !n.requiresAction) return false
        if (tab === 'operational' && n.kind !== 'operational') return false
        if (tab === 'system' && n.kind !== 'system') return false
        if (typeFilter !== 'all' && n.kind !== typeFilter) return false
        if (q && !(n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))) return false
        return true
      })
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [data, tab, typeFilter, debounced])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const markRead = (n: StoreNotification) => {
    actions.markNotificationRead(n.id)
    setLocalUnread((prev) => { const next = new Set(prev); next.delete(n.id); return next })
  }
  const markUnread = (n: StoreNotification) => setLocalUnread((prev) => new Set(prev).add(n.id)) // local toggle — no journal op for unread
  const markAll = () => {
    actions.markAllRead()
    setLocalUnread(new Set())
    toast.success('All notifications marked as read')
  }

  const currentPrefs: StoreNotificationPrefs = localPrefs ?? prefs ?? {
    pickingOrders: true, inventoryAlerts: true, riderApplications: true, codDeposits: true, storeStatus: true,
  }
  const togglePref = (key: keyof StoreNotificationPrefs) => {
    const next = { ...currentPrefs, [key]: !currentPrefs[key] }
    setLocalPrefs(next)
    actions.setPrefs(next) // persisted to the journal; toast comes from the mutation
  }

  const member = db.workforce.find((w) => w.id === user?.id)
  const assignedStores = (user?.assignedStoreIds ?? [])
    .map((id) => db.stores.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)

  const TABS = [
    { value: 'all', label: 'All', count: counts.total },
    { value: 'action', label: 'Action Required', count: counts.action },
    { value: 'operational', label: 'Operational', count: data.filter((n) => n.kind === 'operational').length },
    { value: 'system', label: 'System', count: data.filter((n) => n.kind === 'system').length },
  ]

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
      <PageHeader
        breadcrumb={['Notifications & Account']}
        title="Notifications &"
        titleAccent="Account"
        subtitle="Review store notifications, tune what you are alerted about and manage your manager account."
        illustration={<MeadowScene variant="settings" />}
      />

      <motion.section variants={stagger.item} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Notifications" value={counts.total} icon={Bell} tint="blue" />
        <KpiCard label="Unread" value={counts.unread} icon={Zap} tint="amber" />
        <KpiCard label="Read" value={counts.read} icon={CheckCheck} tint="green" />
        <KpiCard label="Action Required" value={counts.action} icon={Eye} tint="red" />
      </motion.section>

      <motion.section variants={stagger.item} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ── Notification inbox ── */}
        <Card hoverable className="lg:col-span-7">
          <CardHeader className="flex-col items-stretch gap-3 xl:flex-row xl:items-center">
            <TabPills id="notif-tabs" value={tab} onChange={(v) => { setTab(v); setPage(1) }} tabs={TABS} />
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search title or body…" className="w-full xl:w-52" />
              <Select
                value={typeFilter}
                onValueChange={(v) => { setTypeFilter(v); setPage(1) }}
                options={[
                  { value: 'all', label: 'All types' },
                  { value: 'action', label: 'Action' },
                  { value: 'operational', label: 'Operational' },
                  { value: 'system', label: 'System' },
                ]}
                className="w-36"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{filtered.length} notification{filtered.length === 1 ? '' : 's'}</p>
              <Button variant="secondary" size="sm" onClick={markAll}><CheckCheck className="h-3.5 w-3.5" /> Mark all as read</Button>
            </div>

            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)
            ) : pageRows.length === 0 ? (
              <EmptyState icon={Bell} title="No notifications here" body="Try a different tab, type filter or search." />
            ) : (
              pageRows.map((n) => {
                const Icon = KIND_ICON[n.kind]
                const meta = KIND_META[n.kind]
                const read = isRead(n)
                return (
                  <div key={n.id} className={cn('flex items-start gap-3 rounded-xl border p-3.5 transition-colors', read ? 'border-border/60' : 'border-brand-200 bg-primary-softer/60')}>
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', meta.tile)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('truncate text-[13.5px]', read ? 'font-semibold' : 'font-bold')}>{n.title}</span>
                        {!read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{timeAgo(n.at, DEMO_NOW)}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {n.requiresAction && <Badge tone="red">Action required</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {n.link && (
                        <Link
                          to={n.link}
                          className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-brand-700 shadow-soft transition hover:border-brand-300 hover:bg-primary-soft dark:text-brand-300"
                        >
                          View
                        </Link>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="iconSm" aria-label={`Actions for ${n.title}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {!read ? (
                            <DropdownItem onSelect={() => markRead(n)}><CheckCheck className="h-3.5 w-3.5" /> Mark read</DropdownItem>
                          ) : (
                            <DropdownItem onSelect={() => markUnread(n)}><EyeOff className="h-3.5 w-3.5" /> Mark unread</DropdownItem>
                          )}
                          {n.link && (
                            <DropdownItem onSelect={() => navigate(n.link!)}><Eye className="h-3.5 w-3.5" /> Open link</DropdownItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })
            )}
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </CardContent>
        </Card>

        {/* ── Preferences + account ── */}
        <div className="space-y-5 lg:col-span-5">
          <Card hoverable>
            <CardHeader><CardTitle>Notification Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {PREF_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-primary-softer/50">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">{row.label}</div>
                    <div className="text-xs text-muted-foreground">{row.desc}</div>
                  </div>
                  <Switch
                    checked={currentPrefs[row.key]}
                    onCheckedChange={() => togglePref(row.key)}
                    aria-label={`Toggle ${row.label} notifications`}
                  />
                </div>
              ))}
              <p className="px-2 pt-2 text-[11px] text-muted-foreground">Operational notifications are filtered by these switches; system notices always arrive.</p>
            </CardContent>
          </Card>

          <Card hoverable>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-4 w-4 text-brand-600" /> My Account</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <PhotoAvatar index={user?.avatar ?? 0} name={user?.name ?? 'Manager'} size={56} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold">{user?.name ?? 'Store Manager'}</span>
                    <Badge tone="blue">Store Manager</Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {user?.email ?? '—'}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {member?.phone ?? '—'}</p>
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Assigned store(s)</div>
                <div className="flex flex-wrap gap-2">
                  {assignedStores.map((s) => (
                    <Badge key={s.id} tone="neutral" className="px-3 py-1">{s.name} ({s.code})</Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Link
                  to="/reset-password"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-600/60 bg-transparent px-4 text-sm font-semibold text-brand-700 transition hover:bg-primary-soft dark:text-brand-300"
                >
                  <KeyRound className="h-4 w-4" /> Reset Password
                </Link>
                <Button
                  variant="destructive"
                  onClick={() => { logout(); navigate('/login') }}
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.section>
    </motion.div>
  )
}
