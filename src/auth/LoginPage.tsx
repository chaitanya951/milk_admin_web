import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, LogIn, ShieldCheck, Lock, ChevronDown, Store } from 'lucide-react'
import { toast } from '@/shared/lib/toast'
import { Button, Input, Label, Kbd } from '@/shared/components/ui/base'
import { Logo } from '@/shared/illustrations/Logo'
import { LoginHero } from '@/shared/illustrations/scenes'
import { useAuth, type AuthRole } from './authStore'
import { cn } from '@/shared/lib/utils'

const DEMO_ACCOUNTS = [
  { role: 'admin' as AuthRole, email: 'admin@dairydirect.in', password: 'Admin@123', label: 'Admin — full portal access' },
  { role: 'store_manager' as AuthRole, email: 'chaitanya.raju@srm.edu.in', password: 'Store@123', label: 'Store Manager — SRM AP + Guntur Central' },
]
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false' // ships only outside production builds
const MAX_ATTEMPTS = 5

export function LoginPage() {
  const user = useAuth((s) => s.user)
  const login = useAuth((s) => s.login)
  const failedAttempts = useAuth((s) => s.failedAttempts)
  const lockUntil = useAuth((s) => s.lockUntil)
  const navigate = useNavigate()
  const [role, setRole] = useState<AuthRole>('admin')
  const [email, setEmail] = useState('admin@dairydirect.in')
  const [password, setPassword] = useState('Admin@123')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [now, setNow] = useState(Date.now())

  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/store/dashboard'} replace />

  const locked = lockUntil !== null && lockUntil > now
  const lockSecs = locked ? Math.ceil((lockUntil - now) / 1000) : 0
  if (locked) setTimeout(() => setNow(Date.now()), 1000)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (locked) return
    setBusy(true)
    setError('')
    setTimeout(() => {
      const res = login(email, password, role)
      setBusy(false)
      if (!res.ok) {
        setError(res.error ?? 'Invalid email or password')
        setShake((s) => s + 1)
        setNow(Date.now())
        return
      }
      toast.success(role === 'admin' ? 'Welcome back, Admin 🐄' : 'Welcome back, Store Manager 🏪')
      navigate(role === 'admin' ? '/admin/dashboard' : '/store/dashboard')
    }, 550)
  }

  return (
    <div className="page-bg grid min-h-full place-items-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="grid w-full max-w-4xl overflow-hidden rounded-card border border-border bg-card shadow-lift lg:grid-cols-2"
      >
        {/* form */}
        <div className="p-7 sm:p-10">
          <Logo />
          {/* segmented toggle */}
          <div className="mt-7 flex rounded-full border border-border bg-muted/70 p-1" role="tablist" aria-label="Portal">
            {(['admin', 'store_manager'] as AuthRole[]).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                onClick={() => {
                  setRole(r)
                  setError('')
                  setDemoOpen(false)
                  setEmail(r === 'admin' ? 'admin@dairydirect.in' : 'chaitanya.raju@srm.edu.in')
                  setPassword(r === 'admin' ? 'Admin@123' : 'Store@123')
                }}
                className={cn(
                  'relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold transition-colors',
                  role === r ? 'text-white' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {role === r && <motion.span layoutId="login-role-pill" className="absolute inset-0 rounded-full gradient-primary shadow-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <span className="relative z-10 flex items-center gap-1.5">
                  {r === 'admin' ? <ShieldCheck className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
                  {r === 'admin' ? 'Admin' : 'Store Manager'}
                </span>
              </button>
            ))}
          </div>

          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
            {role === 'admin' ? 'Sign in to the Admin Portal' : 'Sign in to the Store Manager Portal'}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {role === 'admin' ? 'Run stores, products, orders, riders and payments across the network.' : 'Run picking, inventory, riders and COD for your assigned store.'}
          </p>

          <motion.form key={shake} onSubmit={submit} className="mt-6 space-y-4"
            animate={shake ? { x: [0, -10, 10, -8, 8, -4, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <div>
              <Label htmlFor="email" required>Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={role === 'admin' ? 'you@dairydirect.in' : 'manager@srm.edu.in'} autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password" required>Password</Label>
              <div className="relative">
                <Input id="password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsOn(e.getModifierState?.('CapsLock') ?? false)}
                  placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Toggle password visibility">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsOn && <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-warning"><Lock className="h-3 w-3" /> Caps Lock is on</p>}
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-muted-foreground">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-input accent-[#2E7D1A]" />
                Remember me
              </label>
              <button type="button" onClick={() => navigate('/forgot-password', { state: { role } })} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Forgot password?
              </button>
            </div>
            {error && (
              <p className="flex items-center gap-1.5 rounded-lg bg-destructive-soft px-3 py-2 text-xs font-semibold text-destructive" role="alert">
                <Lock className="h-3.5 w-3.5 shrink-0" /> {error}
                {!locked && failedAttempts > 0 && <span className="ml-auto opacity-70">{MAX_ATTEMPTS - failedAttempts} attempts left</span>}
              </p>
            )}
            {locked && (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-bold text-amber-700 dark:text-warning" role="alert">
                Account temporarily locked — try again in {lockSecs}s
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={busy || locked}>
              <LogIn className="h-4 w-4" /> {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </motion.form>

          {/* demo panel — only in demo builds */}
          {DEMO_MODE && (
            <div className="mt-5 rounded-xl bg-primary-softer">
              <button onClick={() => setDemoOpen(!demoOpen)} className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-brand-700 dark:text-brand-300" aria-expanded={demoOpen}>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Demo accounts (demo mode)</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', demoOpen && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {demoOpen && (
                  <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4 pb-3">
                    {DEMO_ACCOUNTS.map((a) => (
                      <li key={a.email} className="mb-1.5">
                        <button type="button"
                          onClick={() => { setRole(a.role); setEmail(a.email); setPassword(a.password); setError('') }}
                          className="w-full rounded-lg bg-card px-3 py-2 text-left text-[11.5px] shadow-soft transition hover:ring-1 hover:ring-brand-300"
                        >
                          <span className="block font-bold">{a.email} <Kbd className="ml-1">{a.password}</Kbd></span>
                          <span className="text-muted-foreground">{a.label}</span>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* hero */}
        <div className="relative hidden items-center justify-center bg-gradient-to-br from-brand-50 to-cream p-8 lg:flex dark:from-brand-500/5 dark:to-transparent">
          <LoginHero className="w-full max-w-[420px]" />
          <div className="absolute bottom-6 left-8 right-8">
            <p className="text-sm font-bold">One login. Two portals.</p>
            <p className="mt-1 text-xs text-muted-foreground">Admins run the network · Store managers run their store. Your role decides where you land.</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
