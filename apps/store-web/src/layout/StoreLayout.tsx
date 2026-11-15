import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Boxes, Undo2, UserCheck, Banknote, Store as StoreIcon, UsersRound, BellRing, ChevronDown } from 'lucide-react'
import { AppShell, type AppShellProps } from '@dairydirect/shared/ui/shell/AppShell'
import { Button } from '@dairydirect/shared/ui/base'
import { useStoreAuth, useActiveStore } from '@/login/authStore'
import { useDB } from '@dairydirect/shared/mock-db/db'
import { useStoreNotifications } from '../api/storeQueries'
import { useStoreNotificationActions } from '../api/storeMutations'
import { cn } from '@dairydirect/shared/lib/utils'
import { STORE_NAV_PATH_IMPORTS } from '../routes'

// Store Manager sidebar — exactly 9 items, in spec order. Store-web owns the root paths.
export const STORE_NAV_ITEMS = [
  { to: '/dashboard', label: 'Store Dashboard', icon: LayoutDashboard },
  { to: '/orders-picking', label: 'Orders & Picking', icon: ShoppingCart },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/returns', label: 'Returns & Quality Checks', icon: Undo2 },
  { to: '/rider-applications', label: 'Rider Applications', icon: UserCheck },
  { to: '/cod-deposits', label: 'COD Cash Deposits', icon: Banknote },
  { to: '/status', label: 'Store Status', icon: StoreIcon },
  { to: '/staff-workload', label: 'Staff & Workload', icon: UsersRound },
  { to: '/notifications', label: 'Notifications & Account', icon: BellRing },
]

export function useAssignedStores(): Array<{ id: string; name: string; code: string }> {
  const user = useStoreAuth((s) => s.user)
  const db = useDB((s) => s.db)
  if (!user) return []
  return db.stores.filter((s) => user.assignedStoreIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name, code: s.code }))
}

/** The manager's active store — falls back to the first assigned store. */
export function useActiveStoreDetails() {
  const user = useStoreAuth((s) => s.user)
  const db = useDB((s) => s.db)
  const activeId = useActiveStore((s) => s.activeStoreId)
  const stores = useAssignedStores()
  const active = stores.find((s) => s.id === activeId) ?? stores[0]
  const store = active ? db.stores.find((s) => s.id === active.id) ?? null : null
  return { stores, active, store }
}

function StoreSelector() {
  const { stores, active } = useActiveStoreDetails()
  const setActive = useActiveStore((s) => s.setActiveStore)
  const [open, setOpen] = useState(false)
  if (!active) return null
  if (stores.length <= 1) {
    // single store → static label (no selector per spec)
    return (
      <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold shadow-soft" aria-label="Assigned store">
        <StoreIcon className="h-4 w-4 text-brand-600" />
        {active.name} <span className="text-muted-foreground">({active.code})</span>
      </div>
    )
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold shadow-soft transition hover:border-brand-300"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Active store"
      >
        <StoreIcon className="h-4 w-4 text-brand-600" />
        {active.name} <span className="text-muted-foreground">({active.code})</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul role="listbox" className="absolute left-0 top-12 z-50 w-72 rounded-xl border border-border bg-card p-1.5 shadow-lift">
            {stores.map((s) => (
              <li key={s.id}>
                <button
                  role="option"
                  aria-selected={s.id === active.id}
                  onClick={() => { setActive(s.id); setOpen(false) }}
                  className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition', s.id === active.id ? 'bg-primary-soft text-brand-700 dark:text-brand-300' : 'hover:bg-muted')}
                >
                  <span>{s.name} <span className="text-muted-foreground">({s.code})</span></span>
                  {s.id === active.id && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Browser tab title: "Store · <page> · DairyDirect". */
function useStorePageTitle() {
  const location = useLocation()
  useEffect(() => {
    const base = '/' + (location.pathname.split('/')[1] ?? '')
    const label = STORE_NAV_ITEMS.find((i) => i.to === base)?.label ?? 'DairyDirect'
    document.title = `Store · ${label} · DairyDirect`
  }, [location.pathname])
}

export function StoreLayout() {
  useStorePageTitle()
  const user = useStoreAuth((s) => s.user)
  const navigate = useNavigate()
  const { active } = useActiveStoreDetails()
  const { data: storeNotifications = [] } = useStoreNotifications()
  const { markNotificationRead, markAllRead } = useStoreNotificationActions()

  const shell: AppShellProps = {
    sidebar: {
      items: STORE_NAV_ITEMS, homePath: '/dashboard', badge: 'Store Manager Portal',
      variant: 'dark', prefetch: (path) => STORE_NAV_PATH_IMPORTS[path]?.(),
    },
    searchPlaceholder: 'Search orders by ID, customer, product…',
    userLabel: 'Store Manager',
    user: user ? { name: user.name, email: user.email, avatar: user.avatar } : null,
    onSignOut: () => useStoreAuth.getState().logout(),
    homePath: '/dashboard',
    settingsPath: '/notifications',
    themeKey: 'dd_store_theme',
    sessionStorageKey: 'dd_store_session',
    onSessionExpire: () => { useStoreAuth.getState().logout(); navigate('/login') },
    topbarLeft: <StoreSelector />,
    bellTitle: 'Notifications',
    bellNotifications: storeNotifications.map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.at, read: n.read, kind: n.kind })),
    onBellMarkAllRead: () => markAllRead(),
    onBellMarkRead: (id) => markNotificationRead(id),
  }

  return (
    <AppShell {...shell}>
      {active ? <Outlet /> : (
        // Manager with zero store assignments: show the contact-admin screen.
        <div className="grid min-h-[50vh] place-items-center text-center">
          <div className="flex max-w-md flex-col items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-warning-soft text-warning">
              <StoreIcon className="h-8 w-8" />
            </span>
            <div>
              <p className="text-lg font-bold">No store assigned, contact admin</p>
              <p className="mt-1 text-sm text-muted-foreground">Your account has no store assignments yet.</p>
            </div>
            <Button size="lg" onClick={() => { useStoreAuth.getState().logout(); navigate('/login') }}>Sign out</Button>
          </div>
        </div>
      )}
    </AppShell>
  )
}
