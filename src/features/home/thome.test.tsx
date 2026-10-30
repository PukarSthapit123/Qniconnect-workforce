import { screen, waitFor, within } from '@testing-library/react';
import { store } from '@/mocks/store';
import { tid } from '@/testids';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { caller, resetTo, signInAs, tokenFor } from '@/test/api-helpers';
import { TeamHomePage } from './TeamHomePage';

/* The social seed at the frozen clock: Rachel Hussain manages Willow House;
   Team Home's counts are read from the same queues its pages read. Documents'
   tests moved with the page to src/features/documents/documents.test.tsx. */
withFakeServer();
beforeEach(() => resetTo('social'));
const shown = (n: number) => (n === 0 ? 'Nothing waiting' : `${n} waiting`);

test('Team Home: one card per My Team page, each with the count its own page reads, Open where a page has none, and full test id coverage', async () => {
  const token = await signInAs('manager'), mgr = caller(token);
  const body = async <T,>(path: string) => (await mgr('GET', path)).body as T;
  const queue = await body<{ counts: { pend: number; resub: number } }>('/api/v1/approvals/timesheets?status=pend');
  renderPage(<TeamHomePage />, '/team/thome');
  const grid = await screen.findByTestId(tid.thome.grid);
  /* the manager's location: the line under the title */
  expect(screen.getByRole('heading', { level: 1 }).nextElementSibling).toHaveTextContent(/^Willow House$/);
  expect(within(grid).queryByTestId(tid.thome.card('thome'))).toBeNull();
  expect(within(grid).getByTestId(tid.thome.card('tteam'))).toHaveAttribute('href', '/team/tteam');
  await waitFor(() => expect(screen.getByTestId(tid.thome.count('tteam'))).toHaveTextContent(shown(queue.counts.pend + queue.counts.resub)));
  expect(screen.getByTestId(tid.thome.count('temployees'))).toHaveTextContent('Open');
  /* something is waiting somewhere in the seed, and a waiting count is in the warning ink */
  const waitingCounts = ['tteam'].map(v => screen.getByTestId(tid.thome.count(v))).filter(e => /\d+ waiting/.test(e.textContent ?? ''));
  expect(waitingCounts.length).toBeGreaterThan(0);
  for (const e of waitingCounts) expect(e.className).toMatch(/text-warn/);
  expectTestIdCoverage(document.body);
});

test('Team Home loses a page’s card with its module: Timesheet off takes Approvals', async () => {
  const admin = caller(await tokenFor('admin'));
  const v = store.coll<{ version: number }>('tenant').tenant?.version ?? 0;
  expect((await admin('PATCH', '/api/v1/tenant/modules/TS', { on: false }, v)).status).toBe(200);
  await signInAs('manager');
  renderPage(<TeamHomePage />, '/team/thome');
  const grid = await screen.findByTestId(tid.thome.grid);
  expect(within(grid).getByTestId(tid.thome.card('temployees'))).toBeInTheDocument();
  expect(within(grid).queryByTestId(tid.thome.card('tteam'))).toBeNull();
});
