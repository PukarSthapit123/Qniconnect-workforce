import { test as base, expect, type Page } from '@playwright/test';
import { tid } from '../../src/testids';

/* Signing in, under the auth stub (playwright.config.ts runs the dev server
   with VITE_AUTH=stub): the stub's account in the tab's sessionStorage stands
   in for the Microsoft one. The keys are the app's own (src/lib/dev-account.ts). */
const STUB_ACCOUNT_KEY = 'qniconnect.stubAccount';
/* The fake /bc seed's Production environment (src/mocks/bc/seed.ts) as
   environment selection stores it, so a signed-in page lands on the shell. */
export const PRODUCTION = { id: 'env-production-01', name: 'Production', type: 'Production', url: 'https://businesscentral.dynamics.com/production',
  companyName: 'BrightPath Care Ltd', company_Id: '6f1c2a9e-4b7d-4e2a-9c31-0d8e5b7a1f01' };

/* MSW lives in the page's service worker, so control calls run inside the
   page. A signed-in page's calls name its account with X-Dev-Account, the
   fake server's development override (src/mocks/auth.ts), which is what the
   stub account's token would name. */
const call = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(async ([m, p, b, key]) => {
    const raw = sessionStorage.getItem(key as string);
    const email = raw ? (JSON.parse(raw) as { email?: string }).email : undefined;
    const r = await fetch(p as string, { method: m as string, headers: { 'Content-Type': 'application/json', ...(email ? { 'X-Dev-Account': email } : {}) },
      body: b === undefined ? undefined : JSON.stringify(b) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  }, [method, path, body, STUB_ACCOUNT_KEY] as const);

/* A _dev control call must succeed: a reset, seed, clock or fault that fails
   would otherwise leave the test running against the wrong state and fail
   later, somewhere unrelated, or pass for the wrong reason. */
async function control(page: Page, method: string, path: string, body?: unknown): Promise<void> {
  const r = await call(page, method, path, body);
  if (r.status < 200 || r.status >= 300) throw new Error(`${method} ${path} answered ${r.status}: ${JSON.stringify(r.body)}`);
}

/* Signs this page (this tab) in as that address: the stub's account, the
   seed Production environment, then a fresh load of the app at "/". */
export async function signInPage(page: Page, email: string) {
  await page.evaluate(([key, e, env]) => {
    sessionStorage.setItem(key, JSON.stringify({ oid: `e2e-${e.toLowerCase()}`, email: e, name: e }));
    sessionStorage.removeItem('qniconnect.devAccount'); // an earlier pick in the dev picker would answer instead
    localStorage.setItem('activeEnvironment', JSON.stringify(env));
  }, [STUB_ACCOUNT_KEY, email, PRODUCTION] as const);
  await page.goto('/');
  /* Not the role pill: spec §10.3 hides it (and the brand name) below the
     md breakpoint to keep the phone header on one line, so it is not a
     viewport-independent signal that sign-in landed on the shell. The
     account menu trigger always renders. */
  await expect(page.getByTestId(tid.shell.account)).toBeVisible();
}

export const FROZEN = '2026-08-13T14:30:00.000Z';
type Persona = 'employee' | 'manager' | 'admin';
export const test = base.extend<{
  api: { reset(): Promise<void>; seed(t: 'social' | 'qnipay'): Promise<void>; setClock(iso: string | null): Promise<void>;
    fault(method: string, path: string, status: number, times?: number): Promise<void>; get(path: string): Promise<{ status: number; body: unknown }>;
    send(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> };
  signInAs(p: Persona): Promise<void>;
}>({
  api: async ({ page }, use) => {
    /* The dev picker, which renders signed in or out (signed out, / is the
       landing page since Task 21), so the fake server is up before any
       control call. */
    await page.goto('/dev/sign-in');
    await page.getByTestId(tid.page('dev-sign-in')).waitFor();
    const api = {
      reset: async () => { await control(page, 'POST', '/api/_dev/reset'); await control(page, 'POST', '/api/_dev/clock', { now: FROZEN }); },
      seed: async (t: string) => { await control(page, 'POST', `/api/_dev/seed/${t}`); },
      setClock: async (iso: string | null) => { await control(page, 'POST', '/api/_dev/clock', { now: iso }); },
      /* Faults live in a module-level array in mocks/faults.ts: real state for
         the running page, but not persisted anywhere. signInAs (below) does a
         full page load of the app, which throws that array away along with
         everything else in the JS context. So a fault meant to fire after
         signing in must be registered with api.fault(...) AFTER calling
         signInAs(...), never before it. The frozen clock does not have this
         problem: it is persisted with the store (see store.ts), which is what
         lets signInAs reload the page at all without losing it. */
      fault: async (method: string, path: string, status: number, times = 1) => { await control(page, 'POST', '/api/_dev/faults', { method, path, status, times }); },
      get: (path: string) => call(page, 'GET', path),
      send: (method: string, path: string, body?: unknown) => call(page, method, path, body),
    };
    await api.reset();
    await use(api);
  },
  /* The persona's first seed account, as before; signed in through the stub. */
  signInAs: async ({ page, api }, use) => {
    await use(async (p: Persona) => {
      const accounts = (await api.get('/api/v1/session/accounts')).body as { email: string; userType: Persona }[];
      const acc = accounts.find(a => a.userType === p);
      if (!acc) throw new Error(`no demo account for persona "${p}"`);
      await signInPage(page, acc.email);
    });
  },
});
export { expect };
