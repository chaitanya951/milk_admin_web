import { useDB } from '@dairydirect/shared/mock-db/db'
import { sleep } from '@dairydirect/shared/lib/utils'

/** Admin-web auth API. Role is checked from the workforce record (profiles.role
 * in Supabase mode) — never from the UI. Admin-web ONLY accepts admins. */
export interface AdminAuthUser {
  id: string
  name: string
  email: string
  avatar: number
}

export type SignInResult = { ok: true; user: AdminAuthUser } | { ok: false; error: string }

export async function signIn(email: string, password: string): Promise<SignInResult> {
  await sleep(550) // simulate network so the loading state is visible
  const db = useDB.getState().db
  const member = db.workforce.find((w) => w.email.toLowerCase() === email.toLowerCase())
  // Generic error: never reveal which part was wrong.
  const validPassword = member ? member.password === password : false
  if (!member || !validPassword || member.status === 'invited') {
    return { ok: false, error: 'Invalid email or password' }
  }
  if (member.role !== 'admin') {
    // Store managers / riders / agents must use their own portal.
    return { ok: false, error: "This account can't sign in here" }
  }
  if (member.status === 'blocked') {
    return { ok: false, error: 'Invalid email or password' }
  }
  return { ok: true, user: { id: member.id, name: member.name, email: member.email, avatar: member.avatar } }
}
