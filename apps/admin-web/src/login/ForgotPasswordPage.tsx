import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MailCheck, Send } from 'lucide-react'
import { toast } from '@dairydirect/shared/lib/toast'
import { Button, Input, Label } from '@dairydirect/shared/ui/base'
import { Logo } from '@dairydirect/shared/assets/Logo'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { document.title = 'Admin · Forgot password · DairyDirect' }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return }
    setSent(true)
    toast.success('Reset link sent (demo — no email is actually delivered)')
  }

  return (
    <div className="page-bg grid min-h-full place-items-center p-4 sm:p-8">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-md rounded-card border border-border bg-card p-8 shadow-lift">
        <Logo badge="Admin Portal" />
        {!sent ? (
          <>
            <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Forgot password</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Enter your admin account email and we'll send a reset link.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="email" required>Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@dairydirect.in" />
                {error && <p className="mt-1 text-xs font-semibold text-destructive">{error}</p>}
              </div>
              <Button type="submit" size="lg" className="w-full"><Send className="h-4 w-4" /> Send reset link</Button>
            </form>
          </>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-success-soft text-success"><MailCheck className="h-7 w-7" /></span>
            <h1 className="text-xl font-extrabold tracking-tight">Check your email</h1>
            <p className="text-sm text-muted-foreground">If an admin account exists for <b>{email}</b>, a reset link is on its way. The link is valid for 30 minutes.</p>
            <Button variant="secondary" className="mt-2" onClick={() => navigate('/reset-password', { state: { email } })}>
              I have the reset code — set new password
            </Button>
          </div>
        )}
        <Link to="/login" className="mt-6 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </motion.div>
    </div>
  )
}
