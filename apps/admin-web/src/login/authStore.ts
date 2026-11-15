import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { signIn, type AdminAuthUser } from './authApi'

// Admin-web auth store. Session lives under its OWN storage key (`dd_admin_session`)
// so signing in to admin-web never signs in to (or out of) store-web.
export type AdminRole = 'admin'

interface AdminAuthState {
  user: AdminAuthUser | null
  failedAttempts: number
  lockUntil: number | null
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000

export const useAdminAuth = create<AdminAuthState>()(
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
          // wrong-role and wrong-password both count towards lockout
          const attempts = failedAttempts + 1
          if (res.error === "This account can't sign in here") {
            set({ failedAttempts: 0 })
            return { ok: false, error: res.error }
          }
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
    { name: 'dd_admin_session', partialize: (s) => ({ user: s.user }) },
  ),
)
