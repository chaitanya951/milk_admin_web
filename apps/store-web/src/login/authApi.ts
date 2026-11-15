import { useDB } from '@dairydirect/shared/mock-db/db'
import { sleep } from '@dairydirect/shared/lib/utils'

/** Store-web auth API. Role is checked from the workforce record (profiles.role
 * in Supabase mode) — never from the UI. Store-web ONLY accepts store managers. */
export interface StoreAuthUser {
  id: string
  name: string
  email: string
  avatar: number
  /** Store ids this manager is assigned to (store_managers mapping). */
  assignedStoreIds: string[]
}

export type SignInResult = { ok: true; user: StoreAuthUser } | { ok: false; error: string }

export async function signIn(email: string, password: string): Promise<SignInResult> {
  await sleep(550) // simulate network so the loading state is visible
  const db = useDB.getState().db
  const member = db.workforce.find((w) => w.email.toLowerCase() === email.toLowerCase())
  // Generic error: never reveal which part was wrong.
  const validPassword = member ? member.password === password : false
  if (!member || !validPassword || member.status === 'invited') {
    return { ok: false, error: 'Invalid email or password' }
  }
  if (member.role !== 'store_manager') {
    // Admins must use the Admin Portal.
    return { ok: false, error: "This account can't sign in here" }
  }
  if (member.status === 'blocked') {
    return { ok: false, error: 'Invalid email or password' }
  }
  const assignedStoreIds = db.storeManagers.filter((sm) => sm.workforceId === member.id).map((sm) => sm.storeId)
  return { ok: true, user: { id: member.id, name: member.name, email: member.email, avatar: member.avatar, assignedStoreIds } }
}
