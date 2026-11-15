import { Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from './authStore'

/** Route guard: unauthenticated visitors go to /login (remembering where they
 * came from). Admin-web has no cross-portal 403 — only admins reach this tree. */
export function RequireAdmin({ children }: { children: JSX.Element }) {
  const user = useAdminAuth((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}
