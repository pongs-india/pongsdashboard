// Screenshots every route at desktop and mobile width.
// node replica/shoot.js <outDir> <sessionId> [routeFilter]
const { chromium } = require('playwright')
const [, , out, sid, filter] = process.argv
const BASE = process.env.BASE || 'http://localhost:3005'
const ROUTES = [
  ['S01-dashboard', '/'], ['S02-quotes', '/quotes'], ['S03-quote-new', '/quotes/new'],
  ['S04-quote-client', '/quotes/sample-q1/client'], ['S05-quote-internal', '/quotes/sample-q1/internal'],
  ['S06-quote-revisions', '/quotes/sample-q1/revisions'], ['S07-quote-team', '/quotes/sample-q1/team'],
  ['S08-quote-edit', '/quotes/sample-q1/edit'],
  ['S09-clients', '/clients'], ['S10-client-detail', '/clients/sample-c1'],
  ['S11-projects', '/projects'], ['S12-projects-all', '/projects/all'], ['S13-projects-calendar', '/projects/calendar'],
  ['S14-projects-completed', '/projects/completed'], ['S15-project-detail', '/projects/sample-p1'],
  ['S16-inventory', '/inventory'], ['S17-inv-products', '/inventory/products'], ['S18-inv-product', '/inventory/products/sample-pr1'],
  ['S19-inv-fabric', '/inventory/fabric-rolls'], ['S20-inv-suppliers', '/inventory/suppliers'], ['S21-inv-purchases', '/inventory/purchases'],
  ['S22-inv-movements', '/inventory/movements'], ['S23-inv-reorder', '/inventory/reorder'], ['S24-inv-work', '/inventory/work-completion'],
  ['S25-inv-activity', '/inventory/activity'], ['S26-finance', '/finance'], ['S27-analytics', '/analytics'],
  ['S28-users', '/users'], ['S29-users-all', '/users/all'], ['S30-users-perms', '/users/permissions'], ['S31-users-activity', '/users/activity'],
  ['S32-user-detail', '/users/zz-test-admin'], ['S33-access-requests', '/admin/access-requests'], ['S34-import', '/admin/import'],
  ['S35-login', '/login'], ['S36-request-access', '/request-access'],
]
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const sizes = [[1440, 900, 'desktop'], [390, 844, 'mobile']].filter(([, , t]) => !process.env.ONLY || process.env.ONLY === t)
  for (const [w, h, tag] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    await ctx.addCookies([{ name: 'pongs_session', value: sid, url: BASE }])
    const page = await ctx.newPage()
    const errors = []
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', e => errors.push(String(e)))
    for (const [id, path] of ROUTES) {
      if (filter && !id.includes(filter)) continue
      if (id.startsWith('S35') || id.startsWith('S36')) await ctx.clearCookies()
      errors.length = 0
      const t0 = Date.now()
      await page.goto(BASE + path, { waitUntil: 'load', timeout: 90000 }).catch(e => errors.push(String(e)))
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
      await page.waitForTimeout(500)
      const ms = Date.now() - t0
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth).catch(() => false).catch(() => false)
      await page.screenshot({ path: `${out}/${id}-${tag}.png`, fullPage: true })
      console.log(`${tag} ${id} ${ms}ms${overflow ? ' H-OVERFLOW' : ''}${errors.length ? ' ERR ' + errors.slice(0, 2).join(' | ').slice(0, 200) : ''}`)
      if (id.startsWith('S36')) await ctx.addCookies([{ name: 'pongs_session', value: sid, url: BASE }])
    }
    await ctx.close()
  }
  await browser.close()
})()
