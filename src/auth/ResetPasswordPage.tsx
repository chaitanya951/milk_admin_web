import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound } from 'lucide-react'
import { toast } from '@/shared/lib/toast'
import { Button, Input, Label } from '@/shared/components/ui/base'
import { Logo } from '@/shared/illustrations/Logo'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const strength = (pw: string) => (pw.length >= 10 && /[A-Z]/.test(pw) && /\d/.test(pw) ? 'Strong' : pw.length >= 8 ? 'Okay' : 'Weak')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (code.trim().length < 6) errs.code = 'Enter the reset code from the email'
    if (password.length < 8) errs.password = 'Minimum 8 characters'
    if (confirm !== password) errs.confirm = 'Passwords do not match'
    setErrors(errs)
    if (Object.keys(errs).length) return
    toast.success('Password updated — sign in with your new password')
    navigate('/login')
  }

  return (
    <div className="page-bg grid min-h-full place-items-center p-4 sm:p-8">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-md rounded-card border border-border bg-card p-8 shadow-lift">
        <Logo />
        <h1 className="mt-6 flex items-center gap-2 text-2xl font-extrabold tracking-tight"><KeyRound className="h-6 w-6 text-brand-600" /> Set new password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Paste the reset code and choose a new password.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="code" required>Reset code</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 482913" />
            {errors.code && <p className="mt-1 text-xs font-semibold text-destructive">{errors.code}</p>}
          </div>
          <div>
            <Label htmlFor="pw" required>New password</Label>
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {password && <p className="mt-1 text-[11px] font-semibold text-muted-foreground">Strength: {strength(password)}</p>}
            {errors.password && <p className="mt-1 text-xs font-semibold text-destructive">{errors.password}</p>}
          </div>
          <div>
            <Label htmlFor="pw2" required>Confirm password</Label>
            <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {errors.confirm && <p className="mt-1 text-xs font-semibold text-destructive">{errors.confirm}</p>}
          </div>
          <Button type="submit" size="lg" className="w-full">Update password</Button>
        </form>
        <Link to="/login" className="mt-6 block text-center text-[13px] font-semibold text-muted-foreground hover:text-foreground">Back to sign in</Link>
      </motion.div>
    </div>
  )
}
