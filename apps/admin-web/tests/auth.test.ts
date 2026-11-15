import { describe, expect, it } from 'vitest'
import { signIn } from '@/login/authApi'
import { ADMIN_PAGE_IMPORTS } from '@/routes'
import { ADMIN_NAV_PATH_IMPORTS } from '@/routes'

describe('admin-web auth boundary', () => {
  it('accepts an admin account', async () => {
    const res = await signIn('admin@dairydirect.in', 'Admin@123')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.user.email).toBe('admin@dairydirect.in')
  })

  it('rejects wrong password generically', async () => {
    const res = await signIn('admin@dairydirect.in', 'nope')
    expect(res).toEqual({ ok: false, error: 'Invalid email or password' })
  })

  it("rejects a store-manager account with the cross-portal message", async () => {
    const res = await signIn('chaitanya.raju@srm.edu.in', 'Store@123')
    expect(res).toEqual({ ok: false, error: "This account can't sign in here" })
  })
})

describe('admin-web routes', () => {
  it('covers the 14 admin sections (+ order detail)', () => {
    expect(Object.keys(ADMIN_PAGE_IMPORTS)).toHaveLength(15)
  })
  it('nav prefetch map has no /admin prefix', () => {
    for (const path of Object.keys(ADMIN_NAV_PATH_IMPORTS)) expect(path.startsWith('/admin')).toBe(false)
    expect(ADMIN_NAV_PATH_IMPORTS['/dashboard']).toBeTruthy()
  })
})
