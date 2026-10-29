/* Final review I1: while looking at the app as someone else, Home, Documents
   and My profile neither ask for nor show the signed-in account's own
   Business Central payroll: it is theirs, not the viewed person's. The same
   rule as the bell (Shell.tsx useInbox(readOnly)) and Business Central setup
   (shellData.tsx isPortalAdmin). A banner says why; the viewed person's
   Workforce data stays; ending the view loads the payroll again. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/mocks/node';
import { setAuth } from '@/auth';
import { tid } from '@/testids';
import { App } from '@/App';
import { bcStore } from '@/mocks/bc/seed';
import { store } from '@/mocks/store';
import type { Account } from '@/mocks/auth';
import { accountOf, resetTo, setSeedEnvironment, setStubAccount, testAuth } from '@/test/api-helpers';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  resetTo('social'); bcStore.reset();
  setAuth(testAuth);
});
afterEach(() => { server.resetHandlers(); server.events.removeAllListeners(); });

/* the payroll reads: payslips, the employee record, and the fiscal years and tax documents */
const PAYROLL = /\/bc\/(payslips|employees\/|fiscalyears)/;
const go = (path: string) => { window.history.replaceState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

/* The seed admin (a portal admin too, with a payroll record of her own) is
   given My work, so her own Home, Documents and profile exist to compare;
   she then looks at the app as an employee. */
async function viewAsFrom(path: string, view: string) {
  const seen: string[] = [];
  server.events.on('request:start', ({ request }) => { seen.push(new URL(request.url).pathname); });
  const admin = accountOf('admin');
  const acc = Object.values(store.coll<Account>('accounts')).find(a => a.email === admin.email);
  if (!acc) throw new Error('no admin account');
  acc.grants = [...acc.grants, 'own_home'];
  setStubAccount(admin.email); setSeedEnvironment();
  window.history.replaceState(null, '', path);
  render(<App />);
  await screen.findByTestId(tid.page(view), {}, { timeout: 5000 });
  await userEvent.click(screen.getByTestId(tid.shell.account));
  await userEvent.click(await screen.findByTestId(tid.shell.viewAs(accountOf('employee').employeeCode)));
  await screen.findByTestId(tid.shell.viewAsEnd);
  seen.length = 0;
  go(path);
  return seen;
}
async function endView() {
  await userEvent.click(screen.getByTestId(tid.shell.account));
  await userEvent.click(await screen.findByTestId(tid.shell.menuViewAsEnd));
  await waitFor(() => expect(screen.queryByTestId(tid.shell.viewAsEnd)).toBeNull());
}

test('Home while viewing as someone else: no payroll asked for or shown, a banner says why; ending the view loads it', async () => {
  const seen = await viewAsFrom('/work/home', 'home');
  expect(await screen.findByTestId(tid.shell.payrollHidden)).toHaveTextContent('Payroll details are not shown while you look at the app as someone else.');
  expect(screen.queryByTestId(tid.home.summary)).toBeNull();
  expect(screen.queryByTestId(tid.home.loading)).toBeNull();
  expect(seen.filter(p => PAYROLL.test(p))).toEqual([]);
  await endView();
  expect(await screen.findByTestId(tid.home.summary)).toBeInTheDocument();
  expect(screen.queryByTestId(tid.shell.payrollHidden)).toBeNull();
  expect(seen.some(p => PAYROLL.test(p))).toBe(true);
});

test('Documents while viewing as someone else: no payslips or tax documents asked for or shown, a banner says why, and the viewed person\'s Workforce documents stay', async () => {
  const seen = await viewAsFrom('/work/docs', 'docs');
  expect(await screen.findByTestId(tid.shell.payrollHidden)).toBeInTheDocument();
  expect(await screen.findByTestId(tid.docs.card)).toBeInTheDocument();
  expect(screen.queryByTestId(tid.docs.payslips)).toBeNull();
  expect(screen.queryByTestId(tid.docs.tax)).toBeNull();
  expect(seen.filter(p => PAYROLL.test(p))).toEqual([]);
  await endView();
  expect(await screen.findByTestId(tid.docs.payslips)).toBeInTheDocument();
  expect(screen.queryByTestId(tid.shell.payrollHidden)).toBeNull();
  expect(seen.some(p => PAYROLL.test(p))).toBe(true);
});

test('My profile while viewing as someone else: no payroll record asked for or shown, a banner says why, and the viewed person\'s Workforce record stays', async () => {
  const seen = await viewAsFrom('/work/profile', 'profile');
  expect(await screen.findByTestId(tid.shell.payrollHidden)).toBeInTheDocument();
  expect(await screen.findByTestId(tid.profile.fact('code'))).toHaveTextContent(accountOf('employee').employeeCode);
  expect(screen.queryByTestId(tid.profile.bcSection('personal'))).toBeNull();
  expect(screen.queryByTestId(tid.profile.bcLoading)).toBeNull();
  expect(seen.filter(p => PAYROLL.test(p))).toEqual([]);
  await endView();
  expect(await screen.findByTestId(tid.profile.bcSection('personal'))).toBeInTheDocument();
  expect(screen.queryByTestId(tid.shell.payrollHidden)).toBeNull();
  expect(seen.some(p => PAYROLL.test(p))).toBe(true);
});
