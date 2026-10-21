// Who is making the current request, for the audit log. getSessionUser()
// remembers each session's user here; the database layer reads it back when it
// writes, using the request's own cookie and headers, and tags the transaction
// (app.actor, app.ip, app.ua) so the audit triggers can record it.

export type Actor = { actor: string; ip: string | null; ua: string | null }

const MAX = 500
const sessions = new Map<string, string>() // session id → "Name <email>"

export function rememberActor(sessionId: string, name: string, email: string) {
  if (sessions.size >= MAX) sessions.delete(sessions.keys().next().value as string)
  sessions.set(sessionId, name ? `${name} <${email}>` : email)
}

/** The signed-in user of the current request, or null outside a request (scripts, migrations). */
export function currentActor(): Actor | null {
  try {
    // Loaded lazily: next/headers only works inside a request.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cookies, headers } = require('next/headers') as typeof import('next/headers')
    const sid = cookies().get('pongs_session')?.value
    const who = sid ? sessions.get(sid) : undefined
    if (!who) return null
    const h = headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || null
    return { actor: who, ip, ua: h.get('user-agent') }
  } catch {
    return null
  }
}
