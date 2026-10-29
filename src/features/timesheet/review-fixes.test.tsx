import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '@/mocks/store';
import { tid } from '@/testids';
import type { TimesheetDay } from '@/contract/timesheets';
import { renderPage, withFakeServer } from '@/test/render-page';
import { resetTo, signInAs, signInEmail } from '@/test/api-helpers';
import { plural } from '@/lib/format';
import { TeamEmployeesPage } from '@/features/employees/TeamEmployeesPage';
import { TimesheetPage } from './TimesheetPage';
import { TeamTimesheetsPage } from './TeamTimesheetsPage';
import { TimesheetSetupPage } from './TimesheetSetupPage';

/* Task 22: the Timesheet fixes from the UI review (docs/reference/workforce/ui-review-2026-10-18.md, P0, P1, Part C "timesheet").
   The Sunday-start week labels are in timesheet.test.tsx and the clock-change nights in domain/timesheet.test.ts. */
withFakeServer();
beforeEach(() => resetTo('qnipay'));
const BIGYAN = 'bigyan.poudel@dogmagroup.co.uk', SANJEEV = 'sanjeev.thakuri@dogmagroup.co.uk', PUKAR = 'pukar.sthapit@dogmagroup.co.uk';
const BIGYAN_DAY = 'tsd_EMP004_2026-08-12', BIJAY_DAY = 'tsd_EMP005_2026-08-11', JAMIR_DAY = 'tsd_EMP007_2026-08-10';
const days = () => store.coll<TimesheetDay>('timesheetDays');
const dayRec = (id: string) => {
  const d = days()[id];
  if (!d) throw new Error(`no day ${id}`);
  return d;
};
const set = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const openDay = async (url = '/work/ts') => {
  renderPage(<TimesheetPage />, url);
  await userEvent.click(await screen.findByTestId(tid.ts.view('day')));
  return screen.findByTestId(tid.dayForm.field('start'));
};

describe('My timesheet, day view (review rows 9 to 12, P1 #10)', () => {
  beforeEach(async () => { await signInEmail(BIGYAN); });

  test('Save draft spins on its own and Submit day waits, not both spinning for one click', async () => {
    await openDay();
    set(tid.dayForm.field('start'), '09:00');
    set(tid.dayForm.field('finish'), '17:00');
    const save = screen.getByTestId(tid.dayForm.save), submit = screen.getByTestId(tid.dayForm.submit);
    fireEvent.click(save);
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(submit).not.toHaveAttribute('aria-busy');
    expect(submit).toBeDisabled();
    await screen.findByTestId(tid.toast.info);
    await waitFor(() => expect(screen.getByTestId(tid.dayForm.submit)).toBeEnabled());
  });

  test('Submit day spins on its own and Save draft waits', async () => {
    await openDay();
    set(tid.dayForm.field('start'), '09:00');
    set(tid.dayForm.field('finish'), '17:00');
    fireEvent.click(screen.getByTestId(tid.dayForm.submit));
    expect(screen.getByTestId(tid.dayForm.submit)).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId(tid.dayForm.save)).not.toHaveAttribute('aria-busy');
    expect(screen.getByTestId(tid.dayForm.save)).toBeDisabled();
    await screen.findByTestId(tid.toast.info);
  });

  test('Copy yesterday is disabled on the first day of the week, and says why', async () => {
    await openDay('/work/ts?date=2026-08-10');
    const copy = screen.getByTestId(tid.ts.copyDay);
    expect(copy).toBeDisabled();
    expect(copy).toHaveAttribute('title', 'This is the first day of the week, so there is no earlier day to copy.');
    await userEvent.click(screen.getByTestId(tid.ts.dayNext));
    await waitFor(() => expect(screen.getByTestId(tid.ts.copyDay)).toBeEnabled());
  });

  test('moving off a day with unsaved times asks first, and keeping it stays on the day with the times', async () => {
    await openDay();
    set(tid.dayForm.field('start'), '09:00');
    await userEvent.click(screen.getByTestId(tid.ts.dayPrev));
    expect(await screen.findByTestId(tid.modal.title)).toHaveTextContent('Discard this day’s changes?');
    expect(screen.getByTestId(tid.ts.dayLabel)).toHaveTextContent('Thu 13 Aug');
    await userEvent.click(screen.getByTestId(tid.modal.cancel));
    await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    expect(screen.getByTestId(tid.ts.dayLabel)).toHaveTextContent('Thu 13 Aug');
    expect(screen.getByTestId(tid.dayForm.field('start'))).toHaveValue('09:00');
  });

  test('Discard moves to the other day, and a day with nothing changed moves without asking', async () => {
    await openDay();
    await userEvent.click(screen.getByTestId(tid.ts.dayPrev));
    expect(await screen.findByTestId(tid.ts.dayLabel)).toHaveTextContent('Wed 12 Aug');
    expect(screen.queryByTestId(tid.modal.root)).toBeNull();
    set(tid.dayForm.field('start'), '06:00');
    await userEvent.click(screen.getByTestId(tid.ts.dayNext));
    await userEvent.click(await screen.findByTestId(tid.modal.confirm));
    await waitFor(() => expect(screen.getByTestId(tid.ts.dayLabel)).toHaveTextContent('Thu 13 Aug'));
  });
});

describe('My timesheet, a day sent back (review row 11)', () => {
  test('the approver’s reason sits above the entry form, not below the stats', async () => {
    await signInEmail(SANJEEV);
    renderPage(<TimesheetPage />);
    await userEvent.click(await screen.findByTestId(tid.ts.view('day')));
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByTestId(tid.ts.dayPrev));
    const banner = await screen.findByTestId(tid.ts.banner('back'));
    const form = screen.getByTestId(tid.dayForm.save);
    expect(banner.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('My timesheet, the week grid (review row 21)', () => {
  beforeEach(async () => { await signInEmail(BIGYAN); });
  test('adding an allocation moves focus to its first field instead of toasting, and removing one goes back to the row above', async () => {
    renderPage(<TimesheetPage />);
    await screen.findByTestId(tid.week.grid);
    await userEvent.click(screen.getByTestId(tid.week.addAlloc));
    await screen.findByTestId(tid.week.row(1));
    await waitFor(() => expect(screen.getByTestId(tid.week.ctx(1, 'project'))).toHaveFocus());
    expect(screen.queryByTestId(tid.toast.info)).toBeNull();
    await userEvent.click(screen.getByTestId(tid.week.delAlloc(1)));
    await waitFor(() => expect(screen.getByTestId(tid.week.ctx(0, 'project'))).toHaveFocus());
    expect(screen.queryByTestId(tid.toast.info)).toBeNull();
  });
});

describe('Team timesheets queue (review rows 14 to 19)', () => {
  beforeEach(async () => { await signInEmail(PUKAR); });

  test('the queue says it is loading until the days arrive', async () => {
    renderPage(<TeamTimesheetsPage />);
    expect(await screen.findByTestId(tid.tteam.loading)).toHaveTextContent('Loading the queue');
    await screen.findByTestId(tid.tteam.row(BIGYAN_DAY));
    expect(screen.queryByTestId(tid.tteam.loading)).toBeNull();
  });

  test('the row action reads "Send back", as the dialog and its confirm do', async () => {
    renderPage(<TeamTimesheetsPage />);
    await screen.findByTestId(tid.tteam.row(BIGYAN_DAY));
    expect(screen.getByTestId(tid.tteam.ret(BIGYAN_DAY))).toHaveTextContent(/^Send back$/);
  });

  const refuse = async () => {
    renderPage(<TeamTimesheetsPage />);
    await screen.findByTestId(tid.tteam.row(JAMIR_DAY));
    dayRec(JAMIR_DAY).employeeCode = 'EMP001';
    await userEvent.click(screen.getByTestId(tid.tteam.approve(JAMIR_DAY)));
    await screen.findByTestId(tid.tteam.refusal);
  };
  test('a refusal above the table goes when the filter changes', async () => {
    await refuse();
    await userEvent.click(screen.getByTestId(tid.tteam.filter('all')));
    await waitFor(() => expect(screen.queryByTestId(tid.tteam.refusal)).toBeNull());
  });
  test('a refusal above the table goes when the search changes', async () => {
    await refuse();
    await userEvent.type(screen.getByTestId(tid.tteam.search), 'a');
    await waitFor(() => expect(screen.queryByTestId(tid.tteam.refusal)).toBeNull());
  });

  test('the bulk approval toast is one short line, and the detail goes on the second line', async () => {
    dayRec(BIJAY_DAY).state = 'ok';
    dayRec(JAMIR_DAY).state = 'ok';
    renderPage(<TeamTimesheetsPage />);
    await screen.findByTestId(tid.tteam.row(BIGYAN_DAY));
    await userEvent.click(screen.getByTestId(tid.tteam.approveAll));
    await userEvent.click(await screen.findByTestId(tid.tteam.bulkAck));
    await userEvent.click(screen.getByTestId(tid.tteam.bulkConfirm));
    const toast = await screen.findByTestId(tid.toast.info), next = screen.getByTestId(tid.toast.next);
    expect(toast.firstElementChild).toHaveTextContent(/^1 approved · 7h 30m$/);
    expect(next).toHaveTextContent(/^1 colleague$/);
  });
});

test('plural counts and names one thing once (review row 18)', () => {
  expect(plural(1, 'record')).toBe('1 record');
  expect(plural(2, 'record')).toBe('2 records');
  expect(plural(0, 'colleague')).toBe('0 colleagues');
  expect(plural(1, 'day', 'days')).toBe('1 day');
});

describe('Proxy entry toast (review row 20)', () => {
  test('the toast reads who, when and how long, and the next line says who recorded it', async () => {
    await signInEmail(PUKAR);
    renderPage(<TeamEmployeesPage />);
    await userEvent.click(await screen.findByTestId(tid.employees.open('EMP005')));
    await userEvent.click(await screen.findByTestId(tid.proxy.open));
    fireEvent.change(await screen.findByTestId(tid.dayForm.field('start')), { target: { value: '07:00' } });
    fireEvent.change(screen.getByTestId(tid.dayForm.field('finish')), { target: { value: '15:00' } });
    await userEvent.click(screen.getByTestId(tid.proxy.submitDay));
    const toast = await screen.findByTestId(tid.toast.info);
    expect(toast.firstElementChild).toHaveTextContent('Submitted for Bijay Shrestha · 13/08/2026 · 08:00');
    expect(screen.getByTestId(tid.toast.next)).toHaveTextContent('Recorded as entered by you. Bijay has been told.');
  });
});

describe('Timesheet setup, pay rules (review row 22)', () => {
  test('removing a rule keeps the focused rule below it in place', async () => {
    await signInAs('admin');
    renderPage(<TimesheetSetupPage />);
    await screen.findByTestId(tid.mts.card('allowances'));
    const have = () => screen.queryAllByTestId(/^mts-pay-row-/).length;
    while (have() < 3) await userEvent.click(screen.getByTestId(tid.mts.payAdd));
    const second = screen.getByTestId(tid.mts.payTrigger(1));
    second.focus();
    fireEvent.change(second, { target: { value: 'second rule' } });
    const count = have();
    await userEvent.click(screen.getByTestId(tid.mts.payRemove(0)));
    await waitFor(() => expect(have()).toBe(count - 1));
    expect(screen.getByTestId(tid.mts.payTrigger(0))).toBe(second);
    expect(second).toHaveValue('second rule');
  });
});

describe('the clock card (review row 23)', () => {
  test('a break starting does not show the other buttons as pending', async () => {
    resetTo('social');
    await signInAs('employee');
    renderPage(<TimesheetPage />);
    await screen.findByTestId(tid.clock.card);
    await userEvent.click(screen.getByTestId(tid.clock.clockIn));
    const out = await screen.findByTestId(tid.clock.clockOut);
    await userEvent.click(screen.getByTestId(tid.clock.breakStart));
    expect(out).not.toHaveAttribute('aria-busy');
    await screen.findByTestId(tid.clock.resume);
  });
});
