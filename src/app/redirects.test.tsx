/* Old QniConnect addresses (bookmarks, emails, the backend's own links) land
   on their new routes (spec section 8, Task 21's table). */
import { render, screen, waitFor } from '@testing-library/react';
import { server } from '@/mocks/node';
import { App } from '@/App';
import { tid } from '@/testids';
import { accountOf, resetTo, signInEmail } from '@/test/api-helpers';
import { bcStore } from '@/mocks/bc/seed';
import { REDIRECTS } from './redirects';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); resetTo('social'); bcStore.reset(); });
afterEach(() => { server.resetHandlers(); });

const open = (path: string) => { window.history.replaceState(null, '', path); return render(<App />); };

test('the redirect table is exactly the plan\'s', () => {
  expect(REDIRECTS).toEqual({
    '/portal': '/work/home', '/portal/dashboard': '/work/home', '/portal/documents': '/work/docs', '/portal/profile': '/work/profile',
    '/admin': '/setup/aoverview', '/admin/dashboard': '/setup/aoverview', '/admin/users': '/setup/aemployees',
    '/admin/environments': '/setup/aenv', '/admin/authorization': '/setup/aauth', '/admin/settings': '/setup/asettings',
    '/environment-select': '/account-setup/environment', '/forgot-password': '/login',
  });
});

test('each old QniConnect URL lands on its new route', async () => {
  for (const [from, to] of Object.entries(REDIRECTS)) {
    const view = open(from);
    await waitFor(() => { expect(window.location.pathname, from).toBe(to); });
    view.unmount();
  }
});

test('signed in, an old address opens the new page itself, with its query kept', async () => {
  await signInEmail(accountOf('employee').email);
  let view = open('/portal/documents');
  expect(await screen.findByTestId(tid.page('docs'))).toBeInTheDocument();
  expect(window.location.pathname).toBe('/work/docs');
  view.unmount();
  await signInEmail(accountOf('admin').email);
  view = open('/admin/environments?from=email');
  expect(await screen.findByTestId(tid.page('aenv'))).toBeInTheDocument();
  expect(window.location.pathname + window.location.search).toBe('/setup/aenv?from=email');
  view.unmount();
});

test('/forgot-password opens the sign-in page (LOGIN.R5)', async () => {
  open('/forgot-password');
  expect(await screen.findByTestId(tid.page('login'))).toBeInTheDocument();
  expect(window.location.pathname).toBe('/login');
});
