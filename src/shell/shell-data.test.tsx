import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { faults } from '@/mocks/faults';
import { setAuth } from '@/auth';
import { STUB_ACCOUNT_KEY } from '@/mocks/auth-stub';
import { tid } from '@/testids';
import { App } from '@/App';
import { clearStubAccount, signInEmail, testAuth } from '@/test/api-helpers';

/* Shell.tsx:26 and SetupIndex.tsx:15 used to render blank (`return null`)
   whether the tenant fetch was still pending or had failed outright: a fault,
   network error or revoked session left no header and no way to sign out.
   These drive real faults through the running app (as e2e's api.fault does)
   to prove the loading and error states shellData.tsx now renders instead. */

const reauthenticate = vi.fn(async () => undefined);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { faults.length = 0; store.reset('social'); reauthenticate.mockClear(); setAuth({ ...testAuth, reauthenticate }); });
afterEach(() => { clearStubAccount(); setAuth(testAuth); });

const anyAccount = (type: string) => {
  const found = Object.values(store.db.accounts as Record<string, { email: string; userType: string }>).find(a => a.userType === type);
  if (!found) throw new Error(`no seeded account with userType "${type}"`);
  return found;
};

async function faultTenant(status: number, times = 1): Promise<void> {
  await fetch('/api/_dev/faults', {
    method: 'POST', body: JSON.stringify({ method: 'GET', path: '/api/v1/tenant', status, times }),
  });
}

test('a failed tenant load shows a clear error, not a blank screen, and Sign out works from it', async () => {
  await signInEmail(anyAccount('employee').email);
  await faultTenant(500);

  render(<App />);

  expect(await screen.findByTestId(tid.shell.error)).toHaveTextContent(/could not load your workspace/i);
  expect(screen.getByTestId(tid.shell.retry)).toBeInTheDocument();

  await userEvent.click(screen.getByTestId(tid.shell.signOut));

  expect(await screen.findByTestId(tid.auth.signingOut)).toBeInTheDocument();
  expect(sessionStorage.getItem(STUB_ACCOUNT_KEY)).toBeNull();
});

test('retrying after a failed tenant load renders the shell once the server recovers', async () => {
  await signInEmail(anyAccount('employee').email);
  await faultTenant(500, 1); // the one fault is consumed by the first attempt; a retry hits the real handler

  render(<App />);

  expect(await screen.findByTestId(tid.shell.error)).toBeInTheDocument();

  await userEvent.click(screen.getByTestId(tid.shell.retry));

  expect(await screen.findByTestId(tid.shell.rolePill)).toBeInTheDocument();
});

test('a 401 answering the tenant load reauthenticates instead of leaving a dead end', async () => {
  await signInEmail(anyAccount('employee').email);
  await faultTenant(401);

  render(<App />);

  await waitFor(() => expect(reauthenticate).toHaveBeenCalledTimes(1));
  expect(await screen.findByTestId(tid.toast.error)).toBeInTheDocument();
  expect(screen.queryByTestId(tid.shell.error)).not.toBeInTheDocument();
});
