// Signs in through the auth stub as each seeded persona and screenshots key app
// screens at 1440, 768 and 390. Usage: node shots.mjs <projectRoot> <baseURL> <outDir>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [root, base, out] = process.argv.slice(2);
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('@playwright/test');

const PRODUCTION = { id: 'env-production-01', name: 'Production', type: 'Production', url: 'https://businesscentral.dynamics.com/production',
  companyName: 'BrightPath Care Ltd', company_Id: '6f1c2a9e-4b7d-4e2a-9c31-0d8e5b7a1f01' };
const FROZEN = '2026-08-13T14:30:00.000Z';
const WIDTHS = [[1440, 900], [768, 1024], [390, 844]];
const PLAN = {
  employee: ['/work/home', '/work/ts', '/work/cal', '/work/profile'],
  manager: ['/', '/team/tteam', '/team/temployees'],
  admin: ['/', '/setup/asetup', '/setup/aemployees', '/setup/aperm', '/setup/iaudit', '/setup/aappr'],
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const call = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const raw = sessionStorage.getItem('qniconnect.stubAccount');
  const email = raw ? JSON.parse(raw).email : undefined;
  const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json', ...(email ? { 'X-Dev-Account': email } : {}) },
    body: b === undefined ? undefined : JSON.stringify(b) });
  const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null };
}, [method, path, body]);

for (const [persona, routes] of Object.entries(PLAN)) {
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(base + '/dev/sign-in');
    await page.locator('[data-testid^="dev-sign-in-account-"]').first().waitFor();
    await call(page, 'POST', '/api/_dev/reset');
    await call(page, 'POST', '/api/_dev/clock', { now: FROZEN });
    const accounts = (await call(page, 'GET', '/api/v1/session/accounts')).body;
    const acc = accounts.find(a => a.userType === persona);
    await page.evaluate(([e, env]) => {
      sessionStorage.setItem('qniconnect.stubAccount', JSON.stringify({ oid: `e2e-${e.toLowerCase()}`, email: e, name: e }));
      sessionStorage.removeItem('qniconnect.devAccount');
      localStorage.setItem('activeEnvironment', JSON.stringify(env));
    }, [acc.email, PRODUCTION]);
    for (const r of routes) {
      await page.goto(base + r);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1200);
      await page.evaluate(() => document.fonts.ready);
      const name = `${persona}${r.replace(/[/?=]+/g, '_')}-${w}`.replace(/_$/, '');
      await page.screenshot({ path: join(out, `${name}-fold.png`) });
      await page.screenshot({ path: join(out, `${name}-full.png`), fullPage: true });
      console.log('shot', name, page.url());
    }
    await ctx.close();
  }
}
await browser.close();
