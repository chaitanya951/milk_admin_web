import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, LogIn, ShieldCheck, Lock, ChevronDown } from 'lucide-react'
import { toast } from '@dairydirect/shared/lib/toast'
import { cn } from '@dairydirect/shared/lib/utils'
import { Button, Input, Label, Kbd } from '@dairydirect/shared/ui/base'
import { Logo } from '@dairydirect/shared/assets/Logo'
import { LoginHero } from '@dairydirect/shared/assets/scenes'
import { useAdminAuth } from './authStore'

const DEMO_ACCOUNT = { email: 'admin@dairydirect.in', password: 'Admin@123', label: 'Admin — full portal access' }
// Demo panel ships only when VITE_DEMO_MODE=true (opt-in, never in prod builds).
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
const MAX_ATTEMPTS = 5

export function AdminLoginPage() {
  const user = useAdminAuth((s) => s.user)
  const login = useAdminAuth((s) => s.login)
  const failedAttempts = useAdminAuth((s) => s.failedAttempts)
  const lockUntil = useAdminAuth((s) => s.lockUntil)
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState(DEMO_MODE ? DEMO_ACCOUNT.email : '')
  const [password, setPassword] = useState(DEMO_MODE ? DEMO_ACCOUNT.password : '')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => { document.title = 'Admin · Sign in · DairyDirect' }, [])

  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/dashboard'} replace />
  }

  const locked = lockUntil !== null && lockUntil > now
  const lockSecs = locked ? Math.ceil((lockUntil - now) / 1000) : 0
  if (locked) setTimeout(() => setNow(Date.now()), 1000)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (locked) return
    setBusy(true)
    setError('')
    const res = await login(email, password)
    setBusy(false)
    setNow(Date.now())
    if (!res.ok) {
      setError(res.error ?? 'Invalid email or password')
      setShake((s) => s + 1)
      return
    }
    toast.success('Welcome back, Admin 🐄')
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== '/login' ? from : '/dashboard')
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
          <Logo badge="Admin Portal" />
          {/* portal badge pill */}
          <div className="mt-7 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin Portal
          </div>

          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Sign in to the Admin Portal</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Run stores, products, orders, riders and payments across the network.
          </p>

          <motion.form key={shake} onSubmit={submit} className="mt-6 space-y-4"
            animate={shake ? { x: [0, -10, 10, -8, 8, -4, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <div>
              <Label htmlFor="email" required>Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dairydirect.in" autoComplete="email" />
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
              <button type="button" onClick={() => navigate('/forgot-password')} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
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

          {/* demo panel — only when VITE_DEMO_MODE=true */}
          {DEMO_MODE && (
            <div className="mt-5 rounded-xl bg-primary-softer">
              <button onClick={() => setDemoOpen(!demoOpen)} className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-brand-700 dark:text-brand-300" aria-expanded={demoOpen}>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Demo account (demo mode)</span>
                <ChevronDown className={cn(demoOpen && 'rotate-180', 'h-3.5 w-3.5 transition-transform')} />
              </button>
              <AnimatePresence>
                {demoOpen && (
                  <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4 pb-3">
                    <li>
                      <button type="button"
                        onClick={() => { setEmail(DEMO_ACCOUNT.email); setPassword(DEMO_ACCOUNT.password); setError('') }}
                        className="w-full rounded-lg bg-card px-3 py-2 text-left text-[11.5px] shadow-soft transition hover:ring-1 hover:ring-brand-300"
                      >
                        <span className="block font-bold">{DEMO_ACCOUNT.email} <Kbd className="ml-1">{DEMO_ACCOUNT.password}</Kbd></span>
                        <span className="text-muted-foreground">{DEMO_ACCOUNT.label}</span>
                      </button>
                    </li>
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* hero — admin-themed illustration */}
        <div className="relative hidden items-center justify-center bg-gradient-to-br from-brand-50 to-cream p-8 lg:flex dark:from-brand-500/5 dark:to-transparent">
          <LoginHero className="w-full max-w-[420px]" />
          <div className="absolute right-8 top-6 grid h-12 w-12 place-items-center rounded-2xl bg-card shadow-lift">
            <ShieldCheck className="h-6 w-6 text-brand-600" />
          </div>
          <div className="absolute bottom-6 left-8 right-8">
            <p className="text-sm font-bold">DairyDirect Admin Portal</p>
            <p className="mt-1 text-xs text-muted-foreground">The network control room — stores, orders, riders, payments and compliance.</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
