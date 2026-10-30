import { render, screen, within } from '@testing-library/react';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { queryClient } from '@/api/query';
import { tid } from '@/testids';
import { App } from '@/App';
import { signInEmail, clearStubAccount } from '@/test/api-helpers';
import { writeAudit } from '@/mocks/audit';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { store.reset('social'); queryClient.clear(); });
afterEach(() => { clearStubAccount(); window.history.pushState({}, '', '/'); });

/* NO MARKUP WITHOUT STYLING: "Card descriptions are behind hover, not
   printed under every title" / "The setup index does the same". */
test('each setup card keeps what its section configures behind hover, and says its page count in words', async () => {
  const admin = Object.values(store.db.accounts as unknown as Record<string, { email: string; userType: string }>).find(a => a.userType === 'admin');
  if (!admin) throw new Error('no seeded admin');
  await signInEmail(admin.email);
  window.history.pushState({}, '', '/setup/asetup');
  render(<App />);
  const card = await screen.findByTestId(tid.setup.card('gov'));
  /* the prototype's .setupcard: the section, then the pages it holds, then
     their count (a pill that says "3 pages" to a screen reader) */
  expect(card).toHaveAccessibleName(/^Governance Permissions · .+ \d+ pages?$/);
  expect(card).toHaveAccessibleDescription('Who may do what, who is told, and who signs it off');
  expect(screen.getByTestId(tid.setup.cardDescription('gov'))).toHaveClass('sr-only');
  expect(card).not.toHaveTextContent('Who may do what');
  /* SETUP_SECTIONS: Modules lists only Modules & features; each module's own
     setup page is reached through that module's drill-in */
  expect(screen.getByTestId(tid.setup.card('mods'))).toHaveAccessibleName('Modules Modules & features 1 page');
  /* HEADER PILLS REMOVED, WARNING RELOCATED: the caution is behind a warning
     icon a keyboard reaches, carries the whole of it, and is not printed */
  const caution = screen.getByTestId(tid.head.caution('asetup'));
  expect(caution).toHaveAttribute('tabindex', '0');
  expect(caution).toHaveAttribute('role', 'note');
  expect(caution).toHaveTextContent(/Drafts, approvals and scheduled releases are a future enhancement/);
  expect(caution.tagName).not.toBe('BUTTON');
  expect(screen.getByTestId(tid.page('asetup'))).not.toHaveTextContent(/Applies immediately/);
});

/* Suite ICONS, CRUMBS AND REDUNDANT COUNTS: "And is dropped where it would
   only repeat the title": the setup index opens on its heading, with no
   "Setup" crumb over a "Setup" title. */
test('the setup index has no crumb that would only repeat its title', async () => {
  const admin = Object.values(store.db.accounts as unknown as Record<string, { email: string; userType: string }>).find(a => a.userType === 'admin');
  if (!admin) throw new Error('no seeded admin');
  await signInEmail(admin.email);
  window.history.pushState({}, '', '/setup/asetup');
  render(<App />);
  const page = await screen.findByTestId(tid.page('asetup'));
  const heading = screen.getByRole('heading', { level: 1 });
  expect(heading).toHaveTextContent('Setup');
  expect(page.firstElementChild).toContainElement(heading);
  expect(within(page).getAllByText(/^Setup$/)).toEqual([heading]);
});

/* Taste review 2026-10-26, Phase 2: the index answers "what changed lately?"
   with the audit log's five newest entries, in the log's own words, and the
   way to the whole log. */
test('Recent changes: the five newest audit entries, newest first, and the way to the audit log', async () => {
  const admin = Object.values(store.db.accounts as unknown as Record<string, { email: string; userType: string }>).find(a => a.userType === 'admin');
  if (!admin) throw new Error('no seeded admin');
  await signInEmail(admin.email);
  /* a minute apart, after the sign-in, so the order is the log's own: newest first */
  for (let i = 1; i <= 7; i++) {
    store.setClock(new Date(Date.UTC(2030, 0, 1, 9, i)).toISOString());
    writeAudit({ who: { employeeCode: 'CP-1002', name: 'Dee Fitzgerald' }, act: `Change ${i}`, entity: 'location', entityId: `LOC-${i}` });
  }
  /* the app's own sign-in writes an entry too, stamped now, whichever clock it reads: earlier than these, so not among the five */
  store.setClock(new Date(Date.UTC(2026, 9, 26, 8, 0)).toISOString());
  window.history.pushState({}, '', '/setup/asetup');
  render(<App />);
  const recent = await screen.findByTestId(tid.setup.recent);
  const rows = await within(recent).findAllByTestId(/^setup-recent-row-/);
  expect(rows).toHaveLength(5);
  expect(rows[0]).toHaveTextContent(/^Change 7Site: LOC-7Dee Fitzgerald · /);
  expect(rows.map(r => r.querySelector('b')?.textContent)).toEqual(['Change 7', 'Change 6', 'Change 5', 'Change 4', 'Change 3']);
  expect(within(recent).getByTestId(tid.setup.recentAll)).toHaveAttribute('href', '/setup/iaudit');
});
