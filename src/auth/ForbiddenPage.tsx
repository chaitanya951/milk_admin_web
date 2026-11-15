import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/shared/components/ui/base'
import { useAuth } from './authStore'

export function ForbiddenPage() {
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  const home = user?.role === 'admin' ? '/admin/dashboard' : user?.role === 'store_manager' ? '/store/dashboard' : '/login'
  return (
    <div className="page-bg grid min-h-full place-items-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
        className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-destructive-soft text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">403 — No access</h1>
        <p className="text-sm text-muted-foreground">
          {user
            ? `This portal is for ${user.role === 'admin' ? 'Store Manager' : 'Admin'} accounts. Your account (${user.email}) doesn't have access to it.`
            : 'Sign in with an account that has access to this portal.'}
        </p>
        <Button size="lg" onClick={() => navigate(home)}>Go to my portal</Button>
        <Link to="/login" className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">Switch account</Link>
      </motion.div>
    </div>
  )
}
