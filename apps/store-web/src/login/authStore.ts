import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { signIn, type StoreAuthUser } from './authApi'

// Store-web auth store. Session lives under its OWN storage key (`dd_store_session`)
// so signing in to store-web never signs in to (or out of) admin-web.
export type StoreRole = 'store_manager'

interface StoreAuthState {
  user: StoreAuthUser | null
  failedAttempts: number
  lockUntil: number | null
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000

export const useStoreAuth = create<StoreAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      failedAttempts: 0,
      lockUntil: null,
      login: async (email, password) => {
        const now = Date.now()
        const { lockUntil, failedAttempts } = get()
        if (lockUntil && lockUntil > now) {
          const secs = Math.ceil((lockUntil - now) / 1000)
          return { ok: false, error: `Too many attempts. Try again in ${secs}s.` }
        }
        if (!email || !password) return { ok: false, error: 'Invalid email or password' }
        const res = await signIn(email, password)
        if (!res.ok) {
          if (res.error === "This account can't sign in here") {
            set({ failedAttempts: 0 })
            return { ok: false, error: res.error }
          }
          const attempts = failedAttempts + 1
          if (attempts >= MAX_ATTEMPTS) {
            set({ failedAttempts: 0, lockUntil: now + LOCK_MS })
            return { ok: false, error: `Too many attempts. Locked for ${LOCK_MS / 1000}s.` }
          }
          set({ failedAttempts: attempts })
          return { ok: false, error: res.error }
        }
        set({ user: res.user, failedAttempts: 0, lockUntil: null })
        return { ok: true }
      },
      logout: () => set({ user: null, failedAttempts: 0, lockUntil: null }),
    }),
    { name: 'dd_store_session', partialize: (s) => ({ user: s.user }) },
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
    { name: 'dd_store_active_store' },
  ),
)
