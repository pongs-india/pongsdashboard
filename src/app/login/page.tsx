'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import AuthLayout from '@/components/AuthLayout'
import { Field } from '@/components/ui'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [firstTime, setFirstTime] = useState(false) // account has no password yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const searchParams = useSearchParams()
  // Same-origin paths only: `//host` or `/\host` would leave the app (open redirect).
  const rawNext = searchParams.get('next') || '/'
  const next = /^\/(?![\/\\])/.test(rawNext) ? rawNext : '/'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (firstTime) {
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
      if (password !== confirm) { setError('Passwords do not match.'); return }
    }
    setLoading(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
    })
    const data = await res.json()
    if (!res.ok) {
      // The account exists but has never set a password → switch to setup mode.
      if (data.firstTime) {
        setFirstTime(true)
        setError(firstTime ? (data.error ?? 'Sign-in failed') : '')
        setLoading(false)
        return
      }
      setError(data.error ?? 'Sign-in failed')
      setLoading(false)
      return
    }
    // Full load: the shell and every cached user lookup start fresh as the new user.
    window.location.assign(next)
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        {firstTime ? 'Create your password' : 'Sign in'}
      </h1>
      <p className="mt-1.5 text-sm text-gray-500">
        {firstTime
          ? 'This is your first sign-in. Choose a password to secure your account.'
          : 'Use the email address your administrator approved.'}
      </p>

      <form onSubmit={handleLogin} className="mt-8 space-y-4">
        <Field label="Email address">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input h-10"
            placeholder="name@company.com"
            required
            autoFocus
            autoComplete="email"
            readOnly={firstTime}
          />
        </Field>

        <Field label={firstTime ? 'New password' : 'Password'} hint={firstTime ? 'At least 8 characters.' : undefined}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input h-10"
            required
            autoComplete={firstTime ? 'new-password' : 'current-password'}
          />
        </Field>

        {firstTime && (
          <Field label="Confirm password">
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="input h-10"
              required
              autoComplete="new-password"
            />
          </Field>
        )}

        {error && (
          <div className="alert-error" role="alert">
            <span>
              {error}
              {error.toLowerCase().includes('request access') && (
                <> <a href="/request-access" className="font-medium underline underline-offset-2">Request access</a></>
              )}
            </span>
          </div>
        )}

        <button type="submit" disabled={loading || !email || !password} className="btn-primary w-full h-10 text-sm">
          {loading
            ? (firstTime ? 'Setting password…' : 'Signing in…')
            : (<>{firstTime ? 'Set password and sign in' : 'Sign in'} <ArrowRight size={15} /></>)}
        </button>
      </form>

      <p className="mt-8 text-[13px] text-gray-500">
        New to the team?{' '}
        <a href="/request-access" className="font-medium text-gray-900 underline-offset-2 hover:underline">Request access</a>
      </p>
    </AuthLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
