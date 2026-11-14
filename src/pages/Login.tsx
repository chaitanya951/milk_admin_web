import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button, Input, Label } from '@/components/ui/base'
import { Logo } from '@/illustrations/Logo'
import { LoginHero } from '@/illustrations/scenes'
import { useAuth } from '@/store/auth'

const DEMO_ACCOUNTS = [
  { email: 'admin@dairydirect.in', role: 'Admin — full portal access' },
  { email: 'rohit.kulkarni@dairydirect.in', role: 'Store manager — Colaba Fresh Store' },
  { email: 'lalita.bisht@dairydirect.in', role: 'Support agent' },
]

export function Login() {
  const user = useAuth((s) => s.user)
  const login = useAuth((s) => s.login)
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@dairydirect.in')
  const [password, setPassword] = useState('demo1234')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setTimeout(() => {
      const res = login(email, password)
      setBusy(false)
      if (!res.ok) { setError(res.error ?? 'Login failed'); return }
      toast.success('Welcome back to DairyDirect 🐄')
      navigate('/dashboard')
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
          <h1 className="mt-8 text-2xl font-extrabold tracking-tight">Sign in to the Admin Portal</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Run stores, products, orders, riders and payments across Maharashtra.</p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email" required>Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@dairydirect.in" autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password" required>Password</Label>
              <div className="relative">
                <Input id="password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Toggle password visibility">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="rounded-lg bg-destructive-soft px-3 py-2 text-xs font-semibold text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              <LogIn className="h-4 w-4" /> {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <div className="mt-6 rounded-xl bg-primary-softer p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-700 dark:text-brand-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Demo accounts — any password with 4+ characters works
            </div>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <button type="button" className="font-semibold text-foreground/80 hover:text-brand-700 hover:underline" onClick={() => { setEmail(a.email); setPassword('demo1234') }}>
                    {a.email}
                  </button>
                  <span className="shrink-0 text-muted-foreground">{a.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* hero */}
        <div className="relative hidden items-center justify-center bg-gradient-to-br from-brand-50 to-cream p-8 lg:flex dark:from-brand-500/5 dark:to-transparent">
          <LoginHero className="w-full max-w-[420px]" />
          <div className="absolute bottom-6 left-8 right-8">
            <p className="text-sm font-bold">Fresh dairy, managed beautifully.</p>
            <p className="mt-1 text-xs text-muted-foreground">5 cities · 8 stores · 480 customers · 1,248 orders this month</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Login
