import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useDB } from '@/shared/data/db'

// Unified auth for both portals. Roles: admin | store_manager.
// The REAL role comes from the account record, never from the login toggle.
export type AuthRole = 'admin' | 'store_manager'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: AuthRole
  avatar: number
  /** Store ids this manager is assigned to (store_managers mapping). */
  assignedStoreIds: string[]
}

interface AuthState {
  user: AuthUser | null
  failedAttempts: number
  lockUntil: number | null
  login: (email: string, password: string, expectedRole: AuthRole) => { ok: boolean; error?: string }
  logout: () => void
}

const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      failedAttempts: 0,
      lockUntil: null,
      login: (email, password, expectedRole) => {
        const now = Date.now()
        const { lockUntil, failedAttempts } = get()
        if (lockUntil && lockUntil > now) {
          const secs = Math.ceil((lockUntil - now) / 1000)
          return { ok: false, error: `Too many attempts. Try again in ${secs}s.` }
        }
        if (!email || !password) return { ok: false, error: 'Invalid email or password' }
        const db = useDB.getState().db
        const member = db.workforce.find((w) => w.email.toLowerCase() === email.toLowerCase())
        // Generic error: never reveal which part was wrong.
        const validPassword = member ? member.password === password : false
        if (!member || !validPassword || member.status === 'invited') {
          const attempts = failedAttempts + 1
          if (attempts >= MAX_ATTEMPTS) {
            set({ failedAttempts: 0, lockUntil: now + LOCK_MS })
            return { ok: false, error: `Too many attempts. Locked for ${LOCK_MS / 1000}s.` }
          }
          set({ failedAttempts: attempts })
          return { ok: false, error: 'Invalid email or password' }
        }
        if (member.role !== expectedRole) {
          set({ failedAttempts: 0 })
          return { ok: false, error: expectedRole === 'store_manager'
            ? 'This account is not a Store Manager account'
            : 'This account is not an Admin account' }
        }
        if (member.status === 'blocked') {
          return { ok: false, error: 'Invalid email or password' }
        }
        const assignedStoreIds = db.storeManagers.filter((sm) => sm.workforceId === member.id).map((sm) => sm.storeId)
        if (member.role === 'store_manager' && assignedStoreIds.length === 0) {
          return { ok: false, error: 'No store assigned, contact admin' }
        }
        set({ user: {
          id: member.id, name: member.name, email: member.email,
          role: member.role as AuthRole, avatar: member.avatar,
          assignedStoreIds: member.role === 'admin' ? [] : assignedStoreIds,
        }, failedAttempts: 0, lockUntil: null })
        return { ok: true }
      },
      logout: () => set({ user: null }),
    }),
    { name: 'dairydirect-auth-v3', partialize: (s) => ({ user: s.user }) },
  ),
)

/** Active store for the manager portal (remembered across sessions). */
interface ActiveStoreState {
  activeStoreId: string | null
  setActiveStore: (id: string) => void
}
export const useActiveStore = create<ActiveStoreState>()(
  persist(
    (set) => ({
      activeStoreId: null,
      setActiveStore: (id) => set({ activeStoreId: id }),
    }),
    { name: 'dairydirect-active-store-v1' },
  ),
)
