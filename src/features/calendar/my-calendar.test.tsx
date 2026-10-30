import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tid } from '@/testids';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { resetTo, signInAs, signInEmail } from '@/test/api-helpers';
import { MyCalendarPage } from './MyCalendarPage';

/* My Calendar (Workforce's My home, moved by Task 16) for Amara Okafor (CP-1042, Willow House) on the social seed at the
   frozen clock, Thursday 13 August 2026 15:30: drafts on 3 to 7 August, a
   day awaiting approval on the 12th, and the summer bank holiday on the 31st. */
withFakeServer();
beforeEach(async () => { resetTo('social'); await signInAs('employee'); });
const open = async () => { renderPage(<MyCalendarPage />, '/work/cal'); return screen.findByTestId(tid.cal.grid); };
const cell = (date: string) => screen.getByTestId(tid.cal.day(date));
const month = () => screen.getByTestId(tid.cal.month).textContent;

test('social: the title, the who-line, the month painted from the timesheet, the figures, and full test id coverage', async () => {
  await open();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Calendar');
  expect(screen.getByTestId(tid.page('cal'))).toBeInTheDocument();
  /* the who-line is the line under the title: the shell already says My work · My Calendar */
  expect(screen.getByRole('heading', { level: 1 }).nextElementSibling).toHaveTextContent(/^Support Worker · Shift · Willow House$/);
  expect(month()).toBe('August 2026');
  expect(within(screen.getByTestId(tid.cal.grid)).getAllByRole('button')).toHaveLength(31);
  expect(cell('2026-08-03')).toHaveAttribute('data-glyph', 'draft');
  expect(cell('2026-08-10')).toHaveAttribute('aria-label', '10 Aug');
  expect(cell('2026-08-12')).toHaveAttribute('data-glyph', 'pend');
  expect(cell('2026-08-13').className).toMatch(/border-2/);
  expect(cell('2026-08-20')).toHaveAttribute('data-future', 'true');
  expect(cell('2026-08-20').className).not.toMatch(/opacity-/); // dimming the whole cell takes its inks below AA
  expect(cell('2026-08-31')).toHaveTextContent('Bank holiday');
  expect(cell('2026-08-31')).toHaveAttribute('aria-label', '31 Aug, Summer bank holiday');
  expect(screen.getByTestId(tid.cal.summary).textContent).toMatch(/^\d+\.\dh recorded$/);
  expectTestIdCoverage(document.body);
});

test('qnipay: the calendar boots on the tenant\'s own data, and the recorded days show, with full test id coverage', async () => {
  resetTo('qnipay');
  await signInEmail('bigyan.poudel@dogmagroup.co.uk');
  await open();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Calendar');
  expect(cell('2026-08-12')).toHaveAttribute('data-glyph', 'pend');
  expect(screen.getByTestId(tid.cal.summary)).not.toHaveTextContent(/shift/);
  expectTestIdCoverage(document.body);
});

test('the key counts what the month holds, omits what it does not, uses the calendar’s own state colours, and says so when the month is empty', async () => {
  await open();
  const key = screen.getByTestId(tid.cal.key);
  expect(within(key).queryByTestId(tid.cal.keyItem('tone', 'E'))).toBeNull();
  expect(within(key).getByTestId(tid.cal.keyItem('state', 'pend'))).toHaveTextContent('◷ Submitted 1');
  expect(within(key).queryByTestId(tid.cal.keyItem('state', 'none'))).toBeNull();
  expect(key).not.toHaveTextContent(/Sent back|Approved|Time off in lieu/);
  /* the key's glyph and the day's glyph are painted by the same class */
  const keyInk = within(key).getByTestId(tid.cal.keyItem('state', 'pend')).querySelector('b')?.className ?? '';
  const dayInk = cell('2026-08-12').lastElementChild?.className ?? '';
  expect(keyInk).toMatch(/text-info/);
  expect(dayInk).toMatch(/text-info/);
  /* one class attribute per cell */
  for (const c of within(screen.getByTestId(tid.cal.grid)).getAllByRole('button')) expect(c.outerHTML.split('>')[0]?.match(/ class="/g)).toHaveLength(1);
  for (let i = 0; i < 12; i++) {
    const was = month();
    await userEvent.click(screen.getByTestId(tid.cal.nextMonth));
    await waitFor(() => expect(month()).not.toBe(was));
  }
  await waitFor(() => expect(screen.getByTestId(tid.cal.keyEmpty)).toHaveTextContent('Nothing recorded this month yet'));
});

test('the month moves within its bounds: the month before this one to twelve months ahead, and This month comes back', async () => {
  await open();
  expect(screen.getByTestId(tid.cal.thisMonth)).toBeDisabled();
  await userEvent.click(screen.getByTestId(tid.cal.prev));
  await waitFor(() => expect(month()).toBe('July 2026'));
  expect(screen.getByTestId(tid.cal.prev)).toBeDisabled();
  await userEvent.click(screen.getByTestId(tid.cal.thisMonth));
  await waitFor(() => expect(month()).toBe('August 2026'));
  for (let i = 0; i < 12; i++) {
    const was = month();
    await userEvent.click(screen.getByTestId(tid.cal.nextMonth));
    await waitFor(() => expect(month()).not.toBe(was));
  }
  expect(month()).toBe('August 2027');
  expect(screen.getByTestId(tid.cal.nextMonth)).toBeDisabled();
  expect(screen.getByTestId(tid.cal.prev)).toBeEnabled();
});

test('the day dialog says what is on the day and links to the page that owns it', async () => {
  await open();
  await userEvent.click(cell('2026-08-10'));
  let box = await screen.findByTestId(tid.modal.root);
  expect(within(box).getByTestId(tid.modal.title)).toHaveTextContent('Mon 10 Aug 2026');
  expect(within(box).getByTestId(tid.cal.dayHours)).toHaveTextContent('Nothing yet');
  expect(within(box).getByTestId(tid.cal.recordHours)).toHaveAttribute('href', '/work/ts?date=2026-08-10');
  expect(within(box).getByTestId(tid.cal.recordHours)).toHaveTextContent('Record hours');
  expectTestIdCoverage(document.body);
  await userEvent.click(within(box).getByTestId(tid.cal.dayClose));
  await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());

  await userEvent.click(cell('2026-08-17'));
  box = await screen.findByTestId(tid.modal.root);
  expect(within(box).queryByTestId(tid.cal.dayState)).toBeNull();
  /* a day still to come has nothing to record yet */
  expect(within(box).queryByTestId(tid.cal.recordHours)).toBeNull();
  await userEvent.click(within(box).getByTestId(tid.cal.dayClose));
  await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());

  await userEvent.click(cell('2026-08-31'));
  box = await screen.findByTestId(tid.modal.root);
  expect(within(box).getByTestId(tid.cal.dayBank)).toHaveTextContent('Summer bank holiday');
});

/* D16: My Calendar is the timesheet's calendar. Rota shifts, leave and
   notices were cut with their modules (docs/superpowers/cuts.md), so a day
   holds the timesheet, a bank holiday and today, and its dialog offers
   Record hours. */
test('my calendar: no shift, leave or notice layer', async () => {
  await open();
  const page = screen.getByTestId(tid.page('cal'));
  /* the who-line names the work pattern, which may be called Shift; the month itself carries no such layer */
  const month = page.cloneNode(true) as HTMLElement;
  month.querySelector('h1')?.nextElementSibling?.remove();
  expect(month).not.toHaveTextContent(/shift|rota|leave|time off|sick|notice/i);
  expect(page.querySelectorAll('[data-testid*="shift"], [data-testid*="leave"], [data-testid*="notice"], [data-testid*="rota"]')).toHaveLength(0);
  /* what a day does carry: the timesheet's state, a bank holiday, and today */
  expect(cell('2026-08-12')).toHaveAttribute('data-glyph', 'pend');
  expect(cell('2026-08-31')).toHaveTextContent('Bank holiday');
  expect(cell('2026-08-13').className).toMatch(/border-2/);
  for (const c of within(screen.getByTestId(tid.cal.grid)).getAllByRole('button'))
    expect(c.getAttribute('data-glyph') ?? 'none').toMatch(/^(none|ok|pend|draft|att|mut)$/);
  await userEvent.click(cell('2026-08-10'));
  const box = await screen.findByTestId(tid.modal.root);
  expect(box).not.toHaveTextContent(/shift|rota|leave|time off|sick|notice/i);
  expect(within(box).getByTestId(tid.cal.recordHours)).toHaveTextContent('Record hours');
});

/* Review Part C row 75: the arrows step from the month asked for, not from the one still on screen while the next loads */
test('two quick presses on Next month land two months on, and the grid says it is busy meanwhile', async () => {
  await open();
  fireEvent.click(screen.getByTestId(tid.cal.nextMonth));
  expect(screen.getByTestId(tid.cal.grid)).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(screen.getByTestId(tid.cal.nextMonth));
  await waitFor(() => expect(month()).toBe('October 2026'));
  expect(screen.getByTestId(tid.cal.grid)).not.toHaveAttribute('aria-busy');
  fireEvent.click(screen.getByTestId(tid.cal.prev));
  fireEvent.click(screen.getByTestId(tid.cal.prev));
  await waitFor(() => expect(month()).toBe('August 2026'));
});

/* Review Part E row 2: a day cell is about 34px wide at 320px, so its recorded time gives way to the glyph on a phone and
   nothing spills into the next day. The time stays in the day's label and in the day dialog. */
test('a day cell clips its content and hides the recorded time on a phone', async () => {
  await open();
  const c = cell('2026-08-12');
  expect(c.className).toContain('min-w-0');
  expect(c.className).toContain('overflow-hidden');
  const time = within(c).getByText(/\d/, { selector: 'span.tabular-nums' });
  expect(time.className).toContain('max-md:hidden');
  expect(c.getAttribute('aria-label')).toMatch(/recorded$/);
});
