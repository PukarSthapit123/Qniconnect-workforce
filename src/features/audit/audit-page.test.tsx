import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { writeAudit } from '@/mocks/audit';
import { queryClient } from '@/api/query';
import { tid } from '@/testids';
import { AuditPage } from './AuditPage';
import { signInEmail, clearStubAccount } from '@/test/api-helpers';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

interface SeedAccount { email: string; version: number; userType: string }
const anyAccount = (userType: string): SeedAccount => {
  const found = Object.values(store.db.accounts as unknown as Record<string, SeedAccount>).find(a => a.userType === userType);
  if (!found) throw new Error(`no seeded account with userType "${userType}"`);
  return found;
};

beforeEach(async () => {
  store.reset('social');
  queryClient.clear();
  const admin = anyAccount('admin');
  await signInEmail(admin.email);
});
afterEach(() => { clearStubAccount(); server.resetHandlers(); });

const mount = () => render(<QueryClientProvider client={queryClient}><AuditPage /></QueryClientProvider>);

/* Pinned review focus: a fault on a read must show the error state and never
   present the previous, now-unconfirmed rows as current. This proves it for a
   REFETCH of the same query (not a new filter, which would be a different
   query key with no prior data to confuse the point) by seeding a real row,
   letting the page render it, then failing the very next request for the
   same list and checking the table is gone, not merely stale underneath the
   error. */
test('a refetch failure replaces the table with the error state, not stale rows', async () => {
  const id = writeAudit({ who: { employeeCode: 'A', name: 'Dee' }, act: 'Permission changed', entity: 'userType', entityId: 'employee' });
  mount();

  await screen.findByTestId(tid.audit.table);
  expect(screen.getByTestId(tid.audit.row(id))).toHaveTextContent('Permission changed');

  server.use(http.get('/api/v1/audit', () => HttpResponse.json(
    { code: 'fault', message: 'The server could not complete that. Nothing has been changed.', next: 'Try again.' }, { status: 500 })));
  await queryClient.invalidateQueries({ queryKey: ['audit'] });

  const error = await screen.findByTestId(tid.audit.error);
  expect(error).toHaveTextContent('The audit log could not be loaded');
  expect(error).toHaveTextContent('Reload the page');
  expect(screen.queryByTestId(tid.audit.table)).not.toBeInTheDocument();
  expect(screen.queryByTestId(tid.audit.row(id))).not.toBeInTheDocument();
});

test('search keeps focus while results load', async () => {
  const id = writeAudit({ who: { employeeCode: 'A', name: 'Dee' }, act: 'Permission changed', entity: 'userType', entityId: 'employee' });
  mount();
  await screen.findByTestId(tid.audit.table);

  /* hold the next read open so the page is between keystrokes */
  let release: () => void = () => {};
  const gate = new Promise<void>(r => { release = r; });
  server.use(http.get('/api/v1/audit', async () => { await gate; return HttpResponse.json({ items: [], total: 0 }); }));
  const box = screen.getByTestId(tid.audit.filterText);
  box.focus();
  fireEvent.change(box, { target: { value: 'perm' } });

  expect(screen.getByTestId(tid.audit.filterText)).toBe(box);
  expect(box).toHaveFocus();
  expect(box).toHaveValue('perm');
  /* the rows already on screen stay, dimmed, until the new ones arrive (the
     read starts once the typing pauses, row 92, so the dimming waits for it) */
  expect(screen.getByTestId(tid.audit.row(id))).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId(tid.audit.table)).toHaveAttribute('aria-busy', 'true'));
  expect(screen.getByTestId(tid.audit.row(id))).toBeInTheDocument();
  expect(box).toHaveFocus();
  release();
  await waitFor(() => expect(screen.queryByTestId(tid.audit.row(id))).not.toBeInTheDocument());
  expect(box).toHaveFocus();
});

test('shows the total beyond 200', async () => {
  for (let i = 0; i < 205; i++) writeAudit({ who: { employeeCode: 'A', name: 'Dee' }, act: `Change ${i}`, entity: 'userType', entityId: 'employee' });
  mount();
  await screen.findByTestId(tid.audit.table);
  const note = await screen.findByTestId(tid.audit.total);
  expect(note).toHaveTextContent(/Showing the latest 200 of \d+ entries/);
  const total = Object.keys(store.coll('audit')).length;
  expect(note).toHaveTextContent(`of ${total} entries`);
});

test('a log that fits shows no truncation note', async () => {
  writeAudit({ who: { employeeCode: 'A', name: 'Dee' }, act: 'One', entity: 'userType', entityId: 'employee' });
  mount();
  await screen.findByTestId(tid.audit.table);
  expect(screen.queryByTestId(tid.audit.total)).not.toBeInTheDocument();
});

/* ui-review row 92: the Who and Search boxes ask the server once the typing
   pauses (about 250ms), not on every character. */
test('typing in Search or Who asks once, after a pause, not on every character', async () => {
  writeAudit({ who: { employeeCode: 'A', name: 'Dee' }, act: 'Permission changed', entity: 'userType', entityId: 'employee' });
  const asked: string[] = [];
  server.events.on('request:start', ({ request }) => { const u = new URL(request.url); if (u.pathname === '/api/v1/audit') asked.push(u.search); });
  try {
    mount();
    await screen.findByTestId(tid.audit.table);
    const before = asked.length;
    const box = screen.getByTestId(tid.audit.filterText);
    for (const v of ['p', 'pe', 'per', 'perm']) fireEvent.change(box, { target: { value: v } });
    expect(asked.length).toBe(before);
    await waitFor(() => expect(asked.length).toBe(before + 1));
    expect(asked.at(-1)).toBe('?q=perm');
    const who = screen.getByTestId(tid.audit.filterWho);
    for (const v of ['D', 'De', 'Dee']) fireEvent.change(who, { target: { value: v } });
    await waitFor(() => expect(asked.length).toBe(before + 2));
    expect(asked.at(-1)).toBe('?who=Dee&q=perm');
  } finally { server.events.removeAllListeners(); }
});

/* ui-review row 93: the empty state is true to what is on screen. */
test('no entries at all says nothing is recorded yet; filters that match nothing say so, with Clear filters', async () => {
  /* signing in wrote one entry: start from an empty log */
  const log = store.coll('audit');
  for (const k of Object.keys(log)) Reflect.deleteProperty(log, k);
  mount();
  expect(await screen.findByTestId(tid.audit.empty)).toHaveTextContent('Nothing recorded yet. Every change anyone makes appears here.');
  expect(screen.queryByTestId(tid.audit.clear)).toBeNull();
  const id = writeAudit({ who: { employeeCode: 'A', name: 'Dee' }, act: 'Permission changed', entity: 'userType', entityId: 'employee' });
  await queryClient.invalidateQueries({ queryKey: ['audit'] });
  await screen.findByTestId(tid.audit.row(id));
  fireEvent.change(screen.getByTestId(tid.audit.filterText), { target: { value: 'no such words' } });
  await waitFor(() => expect(screen.getByTestId(tid.audit.empty)).toHaveTextContent('No entries match these filters.'));
  fireEvent.click(screen.getByTestId(tid.audit.clear));
  expect(await screen.findByTestId(tid.audit.row(id))).toBeInTheDocument();
  expect(screen.getByTestId(tid.audit.filterText)).toHaveValue('');
});
