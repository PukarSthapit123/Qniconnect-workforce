/* The public pages (docs/superpowers/inventory/public.md: LAND, LOGIN, PRICE
   and REG's form), through the whole app: the auth stub's account, the fake
   /bc and /api/v1. MSAL's own calls (LAND.C1, C2, LOGIN.C1, C2) are in
   src/auth/msal.test.ts; REG.C1's wire in src/api/bc/registration.wire.test.ts;
   REG's rules as functions in src/domain/registration.test.ts. */
import type { MockInstance } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { setAuth, type AuthAdapter } from '@/auth';
import { tid } from '@/testids';
import { App } from '@/App';
import { bcStore } from '@/mocks/bc/seed';
import { MANUAL_REDIRECT_KEY } from '@/api/bc/cleanup';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { accountOf, clearStubAccount, resetTo, setSeedEnvironment, setStubAccount, testAuth } from '@/test/api-helpers';
import { COMPARISON, TIERS } from './PricingPage';
import { LANDING_CLEARS } from './LandingPage';

const BASE = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
const src = (file: string) => readFileSync(resolve(__dirname, file), 'utf8');

const spies = {
  signIn: vi.fn<AuthAdapter['signIn']>(async () => undefined),
  reauthenticate: vi.fn(async () => undefined),
  signOut: vi.fn(async () => { clearStubAccount(); }),
};
let scrolled: MockInstance<typeof window.scrollTo>;
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetTo('social');
  bcStore.reset();
  for (const s of Object.values(spies)) s.mockClear();
  spies.signIn.mockImplementation(async () => undefined);
  setAuth({ ...testAuth, ...spies });
  scrolled = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => { server.resetHandlers(); server.events.removeAllListeners(); scrolled.mockRestore(); });

const open = (path: string) => { window.history.replaceState(null, '', path); return render(<App />); };
/* A popup that worked: Microsoft now has this account, and signIn returns. */
const popupSignsIn = (email = accountOf('employee').email) => { spies.signIn.mockImplementation(async () => { setStubAccount(email); }); };
/* Every /bc request, as "METHOD path". */
function recordBc() {
  const calls: string[] = [];
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    if (u.pathname.startsWith('/bc/') || u.pathname.startsWith('/session/')) calls.push(`${request.method} ${u.pathname}`);
  });
  return calls;
}

describe('LAND: the landing page', () => {
  test('LAND.S1: signed out, / is the landing page with QniConnect\'s words, in order', async () => {
    open('/');
    const page = await screen.findByTestId(tid.page('landing'));
    expect(page).toHaveTextContent(/Employee self-service portal.*Your payroll\.On your time\..*Secure self-service access to your payslips, documents and employment records directly connected to your organisation’s Microsoft Business Central\./);
    expect([...page.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Microsoft Azure secured', 'HMRC compliant', 'Real-time BC data']);
    expect(page).toHaveTextContent(/Already have an account\?Sign in to QniConnectSign in with Microsoft.*New to QniConnect\?Connect your Business Central environment and get your team set up\.Register your organisation/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your payroll.On your time.');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign in to QniConnect');
    expect(screen.getByTestId(tid.pub.help)).toHaveAttribute('href', 'mailto:support@dogmagroup.co.uk');
    expect(screen.getByTestId(tid.pub.help)).toHaveTextContent('Need help?');
    expect(screen.getByAltText('QniConnect')).toBeInTheDocument();
    expect(screen.getByTestId(tid.pub.year)).toHaveTextContent(`© ${new Date().getFullYear()} QniConnect. All rights reserved.`);
    for (const id of [tid.pub.privacy, tid.pub.terms]) {
      expect(screen.getByTestId(id)).toHaveAttribute('href', 'https://qnipay.com/legal/');
      expect(screen.getByTestId(id)).toHaveAttribute('target', '_blank');
      expect(screen.getByTestId(id)).toHaveAttribute('rel', 'noreferrer');
    }
    expect(document.body).not.toHaveTextContent(/QniPay|Qnipay/);
    expectTestIdCoverage();
  });

  test('LAND.S4: a static page: nothing is loaded for it, signed out, and nothing signs in on its own', async () => {
    const calls = recordBc();
    open('/');
    await screen.findByTestId(tid.page('landing'));
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(calls).toEqual([]);
    expect(spies.signIn).not.toHaveBeenCalled();
    expect(screen.getByTestId(tid.page('landing'))).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('LAND.R1 and LAND.R12: the page is always the landing page; the dead three-step form is not there', async () => {
    open('/');
    await screen.findByTestId(tid.page('landing'));
    expect(document.body).not.toHaveTextContent(/Company Details|BC Configuration|Complete Registration|Review & submit/);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('LAND.R2 (not kept): signed in, / opens the app, because Microsoft sends a sign-in back to /', async () => {
    setStubAccount(accountOf('employee').email);
    setSeedEnvironment();
    open('/');
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(screen.queryByTestId(tid.page('landing'))).toBeNull();
  });

  test('LAND.R3: signing in first removes the six employee keys from localStorage, and nothing else', async () => {
    const keep = { isAuthenticated: 'true', registrationId: 'REG-1', activeEnvironment: '{"id":"e"}', theme: 'x' };
    for (const k of LANDING_CLEARS) localStorage.setItem(k, 'v');
    for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
    open('/');
    fireEvent.click(await screen.findByTestId(tid.land.signIn));
    for (const k of LANDING_CLEARS) expect(localStorage.getItem(k), k).toBeNull();
    for (const [k, v] of Object.entries(keep)) expect(localStorage.getItem(k), k).toBe(v);
    expect(LANDING_CLEARS).toEqual(['clientCompanies', 'clientCompanyId', 'clientCompanyName', 'employeeData', 'employeeId', 'employeeNo']);
  });

  test('LAND.R4 and LAND.S2: while signing in the button is busy, says "Signing in…", and a second press does nothing', async () => {
    spies.signIn.mockImplementation(() => new Promise(() => undefined));
    open('/');
    const button = await screen.findByTestId(tid.land.signIn);
    expect(button).toHaveTextContent('Sign in with Microsoft');
    fireEvent.click(button);
    expect(button).toHaveTextContent('Signing in…');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(spies.signIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(tid.land.error)).toBeNull();
  });

  test('LAND.R5 and LAND.C1: a popup that signs in opens the app in place, and the button stays busy until it does', async () => {
    setSeedEnvironment();
    popupSignsIn();
    open('/');
    fireEvent.click(await screen.findByTestId(tid.land.signIn));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(spies.signIn).toHaveBeenCalledTimes(1);
    await waitFor(() => { expect(window.location.pathname).toBe('/work/home'); });
  });

  test('LAND.R7 and LAND.S3: a sign-in that cannot start says "Sign in failed. Please try again." and can be tried again', async () => {
    spies.signIn.mockRejectedValueOnce(new Error('interaction_in_progress'));
    open('/');
    const button = await screen.findByTestId(tid.land.signIn);
    fireEvent.click(button);
    expect(await screen.findByTestId(tid.land.error)).toHaveTextContent(/^Sign in failed\. Please try again\.$/);
    expect(screen.getByTestId(tid.land.error)).toHaveAttribute('role', 'alert');
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).toHaveTextContent('Sign in with Microsoft');
    fireEvent.click(button);
    expect(spies.signIn).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId(tid.land.error)).toBeNull();
  });

  test('LAND.R9 and LAND.C3: a page load that finds manual_redirect removes it and finishes the sign-out, saying nothing', async () => {
    setStubAccount(accountOf('employee').email);
    sessionStorage.setItem(MANUAL_REDIRECT_KEY, 'true');
    open('/');
    await waitFor(() => { expect(spies.signOut).toHaveBeenCalledTimes(1); });
    expect(sessionStorage.getItem(MANUAL_REDIRECT_KEY)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('LAND.R9: with nobody signed in, the key is still removed and the landing page shows', async () => {
    sessionStorage.setItem(MANUAL_REDIRECT_KEY, 'true');
    open('/');
    await screen.findByTestId(tid.page('landing'));
    await waitFor(() => { expect(sessionStorage.getItem(MANUAL_REDIRECT_KEY)).toBeNull(); });
    expect(spies.signOut).not.toHaveBeenCalled();
  });

  test('LAND.R10: "Register your organisation" goes to /register in the app', async () => {
    open('/');
    const link = await screen.findByTestId(tid.land.register);
    expect(link).toHaveAttribute('href', '/register');
    fireEvent.click(link);
    expect(await screen.findByTestId(tid.page('register'))).toBeInTheDocument();
  });

  test('LAND.R11: the landing page\'s own words differ from the sign-in page\'s, and it clears keys the sign-in page keeps', async () => {
    spies.signIn.mockRejectedValue(new Error('no'));
    localStorage.setItem('employeeNo', 'E1');
    const view = open('/login');
    expect(await screen.findByTestId(tid.login.signIn)).toHaveTextContent('Sign in with Microsoft 365');
    fireEvent.click(screen.getByTestId(tid.login.signIn));
    expect(await screen.findByTestId(tid.login.error)).toHaveTextContent('Login failed. Please try again.');
    expect(localStorage.getItem('employeeNo')).toBe('E1');
    view.unmount();
    open('/');
    expect(await screen.findByTestId(tid.land.signIn)).toHaveTextContent(/^Sign in with Microsoft$/);
    fireEvent.click(screen.getByTestId(tid.land.signIn));
    expect(await screen.findByTestId(tid.land.error)).toHaveTextContent('Sign in failed. Please try again.');
    expect(localStorage.getItem('employeeNo')).toBeNull();
    spies.signIn.mockReset();
  });

  test('LAND.R13 and LAND.R14: no hover lift on a card that is not a control, and no endless pulse', () => {
    const page = src('./LandingPage.tsx');
    expect(page).not.toMatch(/translate-y|-translate|animate-pulse|animate-ping|infinite/);
  });
});

describe('LOGIN: the sign-in page', () => {
  test('LOGIN.S1 and LOGIN.S5: signed out, /login shows the sign-in card, the help line and the footer', async () => {
    open('/login');
    const page = await screen.findByTestId(tid.page('login'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to QniConnect');
    expect(page).toHaveTextContent('Access your payslips, profile, and employee documents');
    expect(screen.getByTestId(tid.login.signIn)).toHaveTextContent('Sign in with Microsoft 365');
    expect(screen.getByTestId(tid.login.signIn).querySelector('svg')).not.toBeNull();
    expect(page).toHaveTextContent('Need help? Contact support@qnipay.com');
    expect(screen.getByTestId(tid.login.help)).toHaveAttribute('href', 'https://qnipay.com/legal/');
    expect(screen.getByTestId(tid.login.help)).toHaveTextContent(/^support@qnipay\.com$/);
    expect(screen.getByTestId(tid.pub.year)).toHaveTextContent(`© ${new Date().getFullYear()} QniConnect. All rights reserved.`);
    expect(screen.getByAltText('QniConnect')).toBeInTheDocument();
    expectTestIdCoverage();
  });

  test('LOGIN.R1, LOGIN.R2 and LOGIN.S2: with a Microsoft account, /login says it is redirecting, then opens the app', async () => {
    setStubAccount(accountOf('employee').email);
    setSeedEnvironment();
    open('/login');
    expect(screen.getByTestId(tid.login.redirecting)).toHaveTextContent('Redirecting to dashboard…');
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    await waitFor(() => { expect(window.location.pathname).toBe('/work/home'); });
  });

  test('LOGIN.R2: a stale isAuthenticated with no Microsoft account does not redirect', async () => {
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('currentUser', JSON.stringify({ email: 'gone@contoso.com' }));
    open('/login');
    expect(await screen.findByTestId(tid.page('login'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  test('LOGIN.R3: signing in from /login marks the session signed in (isAuthenticated), as handleLogin did', async () => {
    setSeedEnvironment();
    popupSignsIn();
    open('/login');
    fireEvent.click(await screen.findByTestId(tid.login.signIn));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(localStorage.getItem('isAuthenticated')).toBe('true');
  });

  test('LOGIN.R4: one sign-in page, whatever QniConnect passed it', async () => {
    open('/login');
    await screen.findByTestId(tid.page('login'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  test('LOGIN.R5: /forgot-password is the sign-in page', async () => {
    open('/forgot-password');
    expect(await screen.findByTestId(tid.page('login'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  test('LOGIN.R6, LOGIN.S3 and LOGIN.S4: busy while it works; a sign-in that cannot start says "Login failed. Please try again."', async () => {
    let fail: (e: Error) => void = () => undefined;
    spies.signIn.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    open('/login');
    const button = await screen.findByTestId(tid.login.signIn);
    fireEvent.click(button);
    expect(button).toHaveTextContent('Signing in…');
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => { fail(new Error('popup and redirect both failed')); });
    expect(screen.getByTestId(tid.login.error)).toHaveTextContent(/^Login failed\. Please try again\.$/);
    expect(button).toHaveTextContent('Sign in with Microsoft 365');
  });

  test('LOGIN.R7: the sign-in button clears no storage', async () => {
    for (const k of ['isAuthenticated', 'employeeNo', 'clientCompanyId', 'registrationId']) localStorage.setItem(k, 'v');
    spies.signIn.mockImplementation(() => new Promise(() => undefined));
    open('/login');
    fireEvent.click(await screen.findByTestId(tid.login.signIn));
    for (const k of ['isAuthenticated', 'employeeNo', 'clientCompanyId', 'registrationId']) expect(localStorage.getItem(k), k).toBe('v');
  });

  test('LOGIN.R8: a signed-in person on another public page is not sent anywhere', async () => {
    setStubAccount(accountOf('employee').email);
    setSeedEnvironment();
    open('/pricing');
    await screen.findByTestId(tid.page('pricing'));
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(window.location.pathname).toBe('/pricing');
  });
});

describe('PRICE: pricing', () => {
  const panel = () => screen.getByTestId(/^price-panel-/);

  test('PRICE.S1 and PRICE.R1: Basic shows first, one tier at a time, and the tier control changes it', async () => {
    open('/pricing');
    await screen.findByTestId(tid.page('pricing'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Choose the right plan for your organization');
    expect(screen.getByTestId(tid.page('pricing'))).toHaveTextContent('QniConnect offers flexible license options to meet the specific needs of your business');
    expect(screen.getAllByTestId(/^price-panel-/)).toHaveLength(1);
    expect(panel()).toHaveAttribute('data-testid', tid.price.panel('basic'));
    expect(screen.getByTestId(tid.price.tier('basic'))).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId(tid.price.tier('premium')));
    expect(panel()).toHaveAttribute('data-testid', tid.price.panel('premium'));
    expect(screen.getByTestId(tid.price.tier('premium'))).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(tid.price.tier('basic'))).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId(tid.price.table)).toBeNull();
    expectTestIdCoverage();
  });

  test('PRICE.S2 and PRICE.R5: each tier\'s copy, price, list and call to action, word for word', async () => {
    open('/pricing');
    await screen.findByTestId(tid.page('pricing'));
    const expected = {
      basic: ['Basic license', '£0.5', 'Employee profile visibility', 'Payslip list and detailed preview', 'Secure PDF payslip download', 'Microsoft 365 authentication', 'Get started with Basic', 'Designed for employees who need:', 'Seamless login with existing Microsoft 365 credentials'],
      essential: ['Essential license', 'Most popular', '£5', 'All Basic features included', 'Personalized employee dashboard', 'Document management system', 'Leave management and time tracking', 'Reporting and analytics tools', 'Get started with Essential', 'Perfect for organizations that need:', 'Time tracking capabilities for accurate attendance records'],
      premium: ['Premium license', '£7', 'All Basic & Essential features included', 'Comprehensive starter checklist', 'Advanced onboarding tools', 'Enhanced reporting capabilities', 'Priority support', 'Get started with Premium', 'Ideal for organizations that want:', 'Priority support with dedicated account management'],
    };
    for (const [tier, words] of Object.entries(expected)) {
      fireEvent.click(screen.getByTestId(tid.price.tier(tier)));
      const p = screen.getByTestId(tid.price.panel(tier));
      for (const w of words) expect(p, `${tier}: ${w}`).toHaveTextContent(w);
      expect(p).toHaveTextContent('per employee/month');
      expect(p).toHaveTextContent('billed monthly');
    }
    expect(Object.values(TIERS).map(t => t.price)).toEqual(['£0.5', '£5', '£7']);
  });

  test('PRICE.R2 and PRICE.S3: the comparison opens and closes, and says which', async () => {
    open('/pricing');
    const toggle = await screen.findByTestId(tid.price.compare);
    expect(toggle).toHaveTextContent('View detailed comparison');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Hide detailed comparison');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle.querySelector('svg')).toHaveClass('rotate-180');
    expect(screen.getByTestId(tid.price.table)).toBeInTheDocument();
    expectTestIdCoverage();
    fireEvent.click(toggle);
    expect(screen.queryByTestId(tid.price.table)).toBeNull();
  });

  test('PRICE.R3: the comparison has QniConnect\'s twelve rows, in order, ticked as it ticked them, on alternating rows', async () => {
    open('/pricing');
    fireEvent.click(await screen.findByTestId(tid.price.compare));
    const table = screen.getByTestId(tid.price.table);
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Feature', 'Basic', 'Essential', 'Premium']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map(r => r.firstChild?.textContent)).toEqual(['Profile page visibility', 'Payslip list view', 'Payslip preview', 'Payslip download (PDF)',
      'Microsoft 365 authentication', 'Business Central integration', 'Dashboard', 'Document management', 'Leave management', 'Time tracking',
      'Reporting & analytics', 'Starter checklist']);
    rows.forEach((r, i) => {
      const marks = [...r.querySelectorAll('svg')].map(s => s.getAttribute('aria-label'));
      /* a label on an svg is read only with role img */
      expect([...r.querySelectorAll('svg')].every(s => s.getAttribute('role') === 'img')).toBe(true);
      expect(marks, r.firstChild?.textContent ?? '').toEqual(COMPARISON[i]?.slice(1).map(on => (on ? 'Included' : 'Not included')));
    });
    expect(rows.slice(6).map(r => r.querySelectorAll('[aria-label="Included"]').length)).toEqual([2, 2, 2, 2, 2, 1]);
    expect(table.querySelector('tbody')?.className).toContain('nth-child(even)');
  });

  test('PRICE.R4: every call to action goes to /register, without the tier', async () => {
    open('/pricing');
    await screen.findByTestId(tid.page('pricing'));
    for (const tier of ['basic', 'essential', 'premium']) {
      fireEvent.click(screen.getByTestId(tid.price.tier(tier)));
      expect(screen.getByTestId(tid.price.cta(tier))).toHaveAttribute('href', '/register');
    }
    fireEvent.click(screen.getByTestId(tid.price.cta('premium')));
    expect(await screen.findByTestId(tid.page('register'))).toBeInTheDocument();
    /* the form starts on Essential whatever was chosen here (REG.R1) */
  });

  test('PRICE.R6 and PRICE.R7: no annual discount here, and the tiers\' own wording, not registration\'s', async () => {
    open('/pricing');
    const page = await screen.findByTestId(tid.page('pricing'));
    expect(page).not.toHaveTextContent(/annual|20%/i);
    expect(page).toHaveTextContent('Employee profile visibility');
    expect(page).not.toHaveTextContent('Profile visibility,');
  });

  test('PRICE.R8: public, and open to someone signed in', async () => {
    setStubAccount(accountOf('employee').email);
    open('/pricing');
    expect(await screen.findByTestId(tid.page('pricing'))).toBeInTheDocument();
  });

  test('PRICE.R9: the dead footer and newsletter are not ported; the year is the current one (Ruling Q13)', async () => {
    open('/pricing');
    const page = await screen.findByTestId(tid.page('pricing'));
    expect(screen.queryByPlaceholderText('Enter your email')).toBeNull();
    expect(document.body).not.toHaveTextContent(/Subscribe|newsletter|Cookie Policy|GDPR|© 2025/);
    expect(document.querySelectorAll('a[href="#"]')).toHaveLength(0);
    expect(page.querySelector('img[src*="placeholder"]')).toBeNull();
    expect(screen.getByTestId(tid.pub.year)).toHaveTextContent(String(new Date().getFullYear()));
  });

  test('PRICE.R10: one tier control at every width: a group of three pressed buttons, no separate phone select', async () => {
    open('/pricing');
    await screen.findByTestId(tid.page('pricing'));
    const group = screen.getByRole('group', { name: 'License tier' });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['Basic', 'Essential', 'Premium']);
    expect(document.querySelector('select')).toBeNull();
  });

  test('PRICE header: the logo goes home, Register and Sign in go to their pages; How it works has its three steps', async () => {
    open('/pricing');
    await screen.findByTestId(tid.page('pricing'));
    expect(screen.getByTestId(tid.pub.home)).toHaveAttribute('href', '/');
    expect(screen.getByTestId(tid.pub.register)).toHaveAttribute('href', '/register');
    expect(screen.getByTestId(tid.pub.signIn)).toHaveAttribute('href', '/login');
    const how = screen.getByRole('region', { name: 'How license-based access works' });
    expect(how).toHaveTextContent('QniConnect intelligently adapts to your organization’s license tier, showing only the features your employees have access to.');
    expect(within(how).getAllByRole('listitem').map(li => li.querySelector('h3')?.textContent)).toEqual(['User authentication', 'License detection', 'Personalized experience']);
  });
});

describe('REG: the registration form', () => {
  const field = (name: string) => screen.getByTestId(tid.reg.field(name));
  const type = (name: string, value: string) => { fireEvent.change(field(name), { target: { value } }); };
  const next = () => { fireEvent.click(screen.getByTestId(tid.reg.next)); };
  const step = () => screen.getByTestId(tid.reg.step).textContent;
  async function toStep4(over: Record<string, string> = {}) {
    open('/register');
    await screen.findByTestId(tid.page('register'));
    const values: Record<string, string> = { companyName: 'Northwind Care', companyEmail: 'hello@northwind.test', tenantId: '3c9d1e2f-0000-4a4a-9b9b-111122223333',
      domainName: 'northwind.onmicrosoft.com', bcEnvironment: 'Production', bcCompanyName: 'Northwind UK', numberOfEmployees: '40',
      contactName: 'Ana Silva', contactEmail: 'ana@northwind.test', ...over };
    type('companyName', values.companyName ?? ''); type('companyEmail', values.companyEmail ?? ''); next();
    for (const k of ['tenantId', 'domainName', 'bcEnvironment', 'bcCompanyName', 'numberOfEmployees']) type(k, values[k] ?? '');
    next(); next();
    type('contactName', values.contactName ?? ''); type('contactEmail', values.contactEmail ?? '');
    fireEvent.click(field('agreeTerms')); fireEvent.click(field('agreeDataProcessing'));
  }

  test('REG.S1 and REG.R3: four steps, each with its header; Continue and Back move one step, keep what was typed, and scroll to the top', async () => {
    open('/register');
    await screen.findByTestId(tid.page('register'));
    expect(step()).toBe('Step 1 of 4');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Company information');
    expect(screen.getByTestId(tid.page('register'))).toHaveTextContent('Tell us about your organisation');
    expect(screen.getByTestId(tid.reg.tracker(1))).toHaveAttribute('aria-current', 'step');
    expectTestIdCoverage();
    type('companyName', 'Northwind'); type('companyEmail', 'x@y.z');
    next();
    expect(step()).toBe('Step 2 of 4');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Business Central configuration');
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    expect(scrolled).toHaveBeenCalledWith(0, 0);
    expect(screen.getByTestId(tid.reg.tracker(1))).toHaveTextContent('(done)');
    fireEvent.click(screen.getByTestId(tid.reg.prev));
    expect(step()).toBe('Step 1 of 4');
    expect(field('companyName')).toHaveValue('Northwind');
    expect(field('companyEmail')).toHaveValue('x@y.z');
    expect(screen.queryByTestId(tid.reg.prev)).toBeNull();
  });

  test('REG.R2 and the step 1 fields: labels, placeholders, the hint and QniConnect\'s industries', async () => {
    open('/register');
    await screen.findByTestId(tid.page('register'));
    expect(field('companyName')).toHaveAttribute('placeholder', 'Acme Corporation Ltd');
    expect(field('companyEmail')).toHaveAttribute('type', 'email');
    expect(field('companyWebsite')).toHaveAttribute('type', 'url');
    expect(field('companyPhone')).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText('Company name')).toBe(field('companyName'));
    expect(screen.getByTestId(tid.page('register'))).toHaveTextContent("We'll send important account notifications to this email");
    expect(field('industry')).toHaveTextContent('Select an industry');
  });

  test('REG.R4 and REG.R8: steps 1 to 3 have no submit button, so neither Continue nor Enter sends anything', async () => {
    const calls = recordBc();
    open('/register');
    await screen.findByTestId(tid.page('register'));
    type('companyName', 'A'); type('companyEmail', 'b');
    for (let s = 1; s <= 3; s++) {
      expect(document.querySelector('button[type="submit"]'), `step ${s}`).toBeNull();
      expect(screen.getByTestId(tid.reg.next)).toHaveAttribute('type', 'button');
      if (s === 2) for (const k of ['tenantId', 'domainName', 'bcEnvironment', 'bcCompanyName', 'numberOfEmployees']) type(k, '1');
      next();
    }
    expect(calls).toEqual([]);
  });

  test('REG.R5 and REG.S6: Continue waits for the step\'s required fields, and says why it cannot go on', async () => {
    open('/register');
    await screen.findByTestId(tid.page('register'));
    expect(screen.getByTestId(tid.reg.next)).toBeDisabled();
    expect(screen.getByTestId(tid.reg.blocked)).toHaveTextContent('Fill in every required field to continue.');
    type('companyName', 'A');
    expect(screen.getByTestId(tid.reg.next)).toBeDisabled();
    type('companyEmail', 'b');
    expect(screen.getByTestId(tid.reg.next)).toBeEnabled();
    expect(screen.queryByTestId(tid.reg.blocked)).toBeNull();
    next();
    expect(screen.getByTestId(tid.reg.next)).toBeDisabled();
    for (const k of ['tenantId', 'domainName', 'bcEnvironment', 'bcCompanyName']) type(k, 'x');
    expect(screen.getByTestId(tid.reg.next)).toBeDisabled();
    type('numberOfEmployees', '3');
    next();
    /* step 3 always can */
    expect(screen.getByTestId(tid.reg.next)).toBeEnabled();
    next();
    expect(screen.getByTestId(tid.reg.submit)).toBeDisabled();
    expect(screen.getByTestId(tid.reg.blocked)).toHaveTextContent('Fill in your contact details and tick both boxes to finish.');
  });

  test('REG.R6: only step 4\'s fields are on the page at submit, with the browser\'s own checks', async () => {
    await toStep4();
    expect(field('contactName')).toBeRequired();
    expect(field('contactEmail')).toBeRequired();
    expect(field('contactEmail')).toHaveAttribute('type', 'email');
    expect(screen.queryByTestId(tid.reg.field('companyEmail'))).toBeNull();
    expect(screen.queryByTestId(tid.reg.field('numberOfEmployees'))).toBeNull();
    expect(screen.queryByTestId(tid.reg.field('companyWebsite'))).toBeNull();
  });

  test('REG.R7: spaces, "0" and a company email that is not one let the form go on', async () => {
    open('/register');
    await screen.findByTestId(tid.page('register'));
    type('companyName', '   '); type('companyEmail', 'not an email');
    expect(screen.getByTestId(tid.reg.next)).toBeEnabled();
    next();
    for (const k of ['tenantId', 'domainName', 'bcEnvironment', 'bcCompanyName']) type(k, ' ');
    type('numberOfEmployees', '0');
    expect(screen.getByTestId(tid.reg.next)).toBeEnabled();
  });

  test('REG.R11 to REG.R15: step 3: billing, the plans and the total; step 4: the plan line', async () => {
    open('/register');
    await screen.findByTestId(tid.page('register'));
    type('companyName', 'A'); type('companyEmail', 'b'); next();
    for (const k of ['tenantId', 'domainName', 'bcEnvironment', 'bcCompanyName']) type(k, 'x');
    type('numberOfEmployees', '10'); next();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Select your plan');
    expect(screen.getByTestId(tid.reg.billing('annual'))).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(tid.reg.billing('annual'))).toHaveTextContent('Annual (save 20%)');
    expect(screen.getByTestId(tid.reg.plan('essential'))).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(tid.reg.plan('essential'))).toHaveTextContent('Popular');
    expect(screen.getByTestId(tid.reg.plan('basic'))).toHaveTextContent(/Basic£0\.5\/user\/mo.*Profile visibility.*Payslip access.*Secure auth/);
    expect(screen.getByTestId(tid.reg.total)).toHaveTextContent('£480.00');
    expect(screen.getByTestId(tid.reg.totalNote)).toHaveTextContent('Essential plan · 10 users · billed annually20% off');
    expect(screen.getByTestId(tid.page('register'))).toHaveTextContent('per year');
    fireEvent.click(screen.getByTestId(tid.reg.plan('premium')));
    expect(screen.getByTestId(tid.reg.total)).toHaveTextContent('£672.00');
    fireEvent.keyDown(screen.getByTestId(tid.reg.plan('premium')), { key: 'ArrowRight' });
    expect(screen.getByTestId(tid.reg.plan('basic'))).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(tid.reg.plan('basic'))).toHaveFocus();
    fireEvent.click(screen.getByTestId(tid.reg.billing('monthly')));
    expect(screen.getByTestId(tid.reg.total)).toHaveTextContent('£5.00');
    expect(screen.getByTestId(tid.reg.totalNote)).toHaveTextContent(/^Basic plan · 10 users · billed monthly$/);
    expect(screen.getByTestId(tid.page('register'))).toHaveTextContent('per month');
    next();
    expect(screen.getByTestId(tid.reg.summary('plan'))).toHaveTextContent('Basic · £0.5/user/mo');
    fireEvent.click(screen.getByTestId(tid.reg.prev));
    fireEvent.click(screen.getByTestId(tid.reg.billing('annual')));
    next();
    expect(screen.getByTestId(tid.reg.summary('plan'))).toHaveTextContent('Basic · £0.40/user/mo');
  });

  test('REG step 4: the summary shows what was typed, a dash for nothing, and the agreements link to the legal page', async () => {
    await toStep4({ bcCompanyName: 'Northwind UK' });
    expect(screen.getByTestId(tid.reg.summary('company'))).toHaveTextContent('Northwind Care');
    expect(screen.getByTestId(tid.reg.summary('email'))).toHaveTextContent('hello@northwind.test');
    expect(screen.getByTestId(tid.reg.summary('environment'))).toHaveTextContent('Production');
    expect(screen.getByTestId(tid.reg.summary('bc-company'))).toHaveTextContent('Northwind UK');
    expect(screen.getByTestId(tid.reg.summary('employees'))).toHaveTextContent('40');
    expect(screen.getByTestId(tid.page('register'))).toHaveTextContent('I agree to the Terms of Service and Privacy Policy');
    expect(screen.getByTestId(tid.page('register'))).toHaveTextContent('I consent to the processing of my company and personal data as described in the Privacy Policy');
    for (const n of [1, 2, 3]) {
      expect(screen.getByTestId(tid.reg.legal(n))).toHaveAttribute('href', 'https://qnipay.com/legal/');
      expect(screen.getByTestId(tid.reg.legal(n))).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expectTestIdCoverage();
  });

  test('REG.R16 to REG.R18, REG.R22, REG.S4 and REG.R27: Complete registration sends QniConnect\'s payload once, then says where the email went', async () => {
    const bodies: unknown[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/bc/portalRegistrations')) void request.clone().json().then(b => bodies.push(b));
    });
    await toStep4({ contactEmail: '' });
    /* no contact email: the form cannot finish yet */
    expect(screen.getByTestId(tid.reg.submit)).toBeDisabled();
    type('contactEmail', 'ana@northwind.test');
    const stored = { ...localStorage };
    fireEvent.click(screen.getByTestId(tid.reg.submit));
    expect(await screen.findByTestId(tid.reg.done)).toHaveTextContent('Registration successful');
    /* announced, and still a heading (a role on the h2 itself took its heading role away) */
    expect(screen.getByRole('heading', { level: 2, name: 'Registration successful' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Registration successful');
    expect(screen.getByTestId(tid.reg.done)).toHaveTextContent("Thank you for registering. We’ve sent a confirmation email to ana@northwind.test with further instructions to complete your setup.");
    expect(bodies).toEqual([{ company_Name: 'Northwind Care', contactEmail: 'ana@northwind.test', contactName: 'Ana Silva', tenantId: '3c9d1e2f-0000-4a4a-9b9b-111122223333',
      primaryEnvironment: 'Production', primaryCompanyName: 'Northwind UK', numberOfEmployees: 40, industry: '', registrationSource: 'Portal', vatRegistrationNo: '',
      companyRegistrationNo: '', primaryContactLanguage: 'EN', address: '', city: '', county: '', postCode: '', countryRegionCode: '' }]);
    expect(bcStore.db.registrations.at(-1)).toMatchObject({ company_Name: 'Northwind Care' });
    /* REG.R27: nothing is stored; Return to home is the only way on */
    expect({ ...localStorage }).toEqual(stored);
    fireEvent.click(screen.getByTestId(tid.reg.doneHome));
    expect(await screen.findByTestId(tid.page('landing'))).toBeInTheDocument();
  });

  test('REG.S2 and REG.R26: while it sends, the button is busy with "Processing..." and a second press sends nothing more', async () => {
    let release: () => void = () => undefined;
    let posts = 0;
    server.use(http.post(`${BASE}/bc/portalRegistrations`, async () => { posts++; await new Promise<void>(r => { release = r; }); return HttpResponse.json({ id: 'R' }); }));
    await toStep4();
    const submit = screen.getByTestId(tid.reg.submit);
    fireEvent.click(submit);
    await waitFor(() => { expect(submit).toHaveTextContent('Processing…'); });
    expect(submit).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form') as HTMLFormElement);
    await waitFor(() => { expect(posts).toBe(1); });
    await act(async () => { release(); });
    expect(await screen.findByTestId(tid.reg.done)).toBeInTheDocument();
    expect(posts).toBe(1);
  });

  test('REG.S3, REG.R23 to REG.R25: a refusal shows its own words without the correlation id, above the form, on step 4 with everything kept', async () => {
    /* the seed organisation's own tenant is already registered */
    await toStep4({ tenantId: bcStore.db.authorization.tenantId });
    fireEvent.click(screen.getByTestId(tid.reg.submit));
    const banner = await screen.findByTestId(tid.reg.error);
    expect(banner).toHaveTextContent(/^Registration errorA registration for this tenant already exists\.$/);
    expect(banner.parentElement).toHaveAttribute('role', 'alert');
    expect(step()).toBe('Step 4 of 4');
    expect(field('contactName')).toHaveValue('Ana Silva');
    expect(screen.getByTestId(tid.reg.submit)).toHaveTextContent('Complete registration');
    expect(screen.getByTestId(tid.reg.submit)).toBeEnabled();
  });

  test('REG.R9: the error stays when going back, until it is dismissed or the form is sent again', async () => {
    server.use(http.post(`${BASE}/bc/portalRegistrations`, () => HttpResponse.json({ error: 'Tenant not valid' }, { status: 400 })));
    await toStep4();
    fireEvent.click(screen.getByTestId(tid.reg.submit));
    expect(await screen.findByTestId(tid.reg.error)).toHaveTextContent('Tenant not valid');
    fireEvent.click(screen.getByTestId(tid.reg.prev));
    expect(screen.getByTestId(tid.reg.error)).toBeInTheDocument();
    next();
    server.resetHandlers();
    let seen = false;
    let release: () => void = () => undefined;
    server.use(http.post(`${BASE}/bc/portalRegistrations`, async () => {
      seen = true; await new Promise<void>(r => { release = r; }); return HttpResponse.json({ error: 'Still not valid' }, { status: 400 });
    }));
    fireEvent.click(screen.getByTestId(tid.reg.submit));
    await waitFor(() => { expect(seen).toBe(true); });
    expect(screen.queryByTestId(tid.reg.error)).toBeNull();
    await act(async () => { release(); });
    expect(await screen.findByTestId(tid.reg.error)).toHaveTextContent('Still not valid');
    fireEvent.click(screen.getByTestId(tid.reg.errorDismiss));
    expect(screen.queryByTestId(tid.reg.error)).toBeNull();
  });

  test('REG.R25: a message that is empty once its correlation id is cut shows no alert', async () => {
    server.use(http.post(`${BASE}/bc/portalRegistrations`, () => HttpResponse.json({ message: 'CorrelationId: 0f3a' }, { status: 500 })));
    await toStep4();
    fireEvent.click(screen.getByTestId(tid.reg.submit));
    await waitFor(() => { expect(screen.getByTestId(tid.reg.submit)).toHaveTextContent('Complete registration'); });
    expect(screen.queryByTestId(tid.reg.error)).toBeNull();
  });

  test('REG.R28: a network failure shows the browser\'s message', async () => {
    server.use(http.post(`${BASE}/bc/portalRegistrations`, () => HttpResponse.error()));
    await toStep4();
    fireEvent.click(screen.getByTestId(tid.reg.submit));
    expect(await screen.findByTestId(tid.reg.error)).toHaveTextContent(/^Registration error.+/);
  });

  test('REG.R10: signed in, the form is open too, and Home goes home', async () => {
    setStubAccount(accountOf('employee').email);
    setSeedEnvironment();
    open('/register');
    expect(await screen.findByTestId(tid.page('register'))).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(tid.reg.back));
    await waitFor(() => { expect(window.location.pathname).not.toBe('/register'); });
  });

  test('REG chrome: Need help? and the footer, and no "Powered by QniPay"', async () => {
    open('/register');
    await screen.findByTestId(tid.page('register'));
    expect(screen.getByTestId(tid.pub.help)).toHaveAttribute('href', 'mailto:support@dogmagroup.co.uk');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Get your team\s*up and running\.$/);
    expect(screen.getByTestId(tid.page('register'))).toHaveTextContent('Register your Business Central environment and give employees secure, instant access to their payroll data — all in minutes.');
    expect(document.body).not.toHaveTextContent(/QniPay|Qnipay/);
  });
});

/* public.md §0, QniConnect's App.js shell, and where each rule went in the
   port's gate (src/App.tsx). */
describe('SHELL: the app shell around the routes', () => {
  const VERIFY = `${BASE}/bc/portalUsers/verify`;
  const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
    const p = resolve(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

  test('SHELL.R1: while the sign-in check runs a protected route shows a loading state, and a public route does not wait for it', async () => {
    let answer: () => void = () => undefined;
    const held = new Promise<void>(r => { answer = r; });
    server.use(http.post(VERIFY, async () => { await held; return undefined; }));
    setStubAccount(accountOf('employee').email);
    setSeedEnvironment();
    const { unmount } = open('/work/home');
    expect(await screen.findByTestId(tid.shell.loading)).toHaveTextContent('Loading your workspace…');
    expect(screen.queryByTestId(tid.page('home'))).toBeNull();
    unmount();
    /* QniConnect replaced every route, public ones too, with "Authenticating..." */
    open('/pricing');
    expect(await screen.findByTestId(tid.page('pricing'))).toBeInTheDocument();
    expect(screen.queryByTestId(tid.shell.loading)).toBeNull();
    answer();
  });

  test('SHELL.R2: with a sign-in error every protected route, an unknown one too, goes to /auth-error', async () => {
    server.use(http.post(VERIFY, () => HttpResponse.json({ exists: false })));
    setStubAccount(accountOf('employee').email);
    setSeedEnvironment();
    for (const path of ['/work/home', '/no-such-page']) {
      const { unmount } = open(path);
      expect(await screen.findByTestId(tid.auth.errorMessage)).toBeInTheDocument();
      expect(window.location.pathname).toBe('/auth-error');
      unmount();
    }
  });

  test('SHELL.R3: no debug panel is mounted beside the routes, in development either (Ruling Q13)', async () => {
    expect(import.meta.env.DEV).toBe(true);
    open('/');
    await screen.findByTestId(tid.page('landing'));
    expect(document.body).not.toHaveTextContent(/Auth Debug|Force Auth|Clear Auth/);
  });

  test('SHELL.R4: an unknown path is no longer blank: signed in, it is the page-unavailable page in the shell', async () => {
    setStubAccount(accountOf('employee').email);
    setSeedEnvironment();
    open('/work/no-such-page');
    expect(await screen.findByTestId(tid.unavailable.root)).toBeInTheDocument();
    expect(screen.getByTestId(tid.shell.account)).toBeInTheDocument();
  });

  test('SHELL.R5: QniConnect\'s App.css and its qni-landing classes are not carried: the public pages are drawn with the design system', () => {
    const SRC = resolve(__dirname, '../..');
    const carrying = files(SRC).filter(f => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter(f => /App\.css|qni-landing-/.test(readFileSync(f, 'utf8')));
    expect(carrying).toEqual([]);
  });
});
