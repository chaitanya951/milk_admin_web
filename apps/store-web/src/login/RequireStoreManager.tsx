import { Navigate, useLocation } from 'react-router-dom'
import { useStoreAuth } from './authStore'

/** Route guard: unauthenticated visitors go to /login (remembering where they
 * came from). Store-web has no cross-portal 403 — only store managers reach this tree. */
export function RequireStoreManager({ children }: { children: JSX.Element }) {
  const user = useStoreAuth((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}
