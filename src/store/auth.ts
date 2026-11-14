import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useDB } from './db'

// Single admin-portal session. Role model: Admin, Store manager, Rider, Support agent,
// Customer (customer accounts live under People, they do not sign into this portal).
export type AuthRole = 'admin' | 'store_manager' | 'rider' | 'support_agent'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: AuthRole
  avatar: number
}

interface AuthState {
  user: AuthUser | null
  login: (email: string, password: string) => { ok: boolean; error?: string }
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: (email, password) => {
        if (!email || password.length < 4) return { ok: false, error: 'Enter a valid email and password (min 4 chars).' }
        const db = useDB.getState().db
        const member = db.workforce.find((w) => w.email.toLowerCase() === email.toLowerCase() && w.status !== 'invited')
        const user: AuthUser = member
          ? { id: member.id, name: member.name, email: member.email, role: member.role as AuthRole, avatar: member.avatar }
          : { id: 'wf-1', name: 'Arjun Mehta', email, role: 'admin', avatar: 0 }
        set({ user })
        return { ok: true }
      },
      logout: () => set({ user: null }),
    }),
    { name: 'dairydirect-auth-v2' },
  ),
)
