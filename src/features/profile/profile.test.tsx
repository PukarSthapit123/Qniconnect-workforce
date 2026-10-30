import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { bcStore } from '@/mocks/bc/seed';
import userEvent from '@testing-library/user-event';
import { store } from '@/mocks/store';
import { tid } from '@/testids';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { accountOf, caller, fault, employeeOf, resetTo, signInAs, snapshot, tokenFor } from '@/test/api-helpers';
import { queryClient } from '@/api/query';
import { tenantKeys } from '@/api/tenant';
import { ProfilePage } from './ProfilePage';

withFakeServer();
beforeEach(async () => { resetTo('social'); await signInAs('employee'); });
const me = () => employeeOf(accountOf('employee').employeeCode);
const openPropose = async () => {
  renderPage(<ProfilePage />);
  await userEvent.click(await screen.findByTestId(tid.profile.propose));
  await screen.findByTestId(tid.profile.send);
};
const set = (key: string, value: string) => fireEvent.change(screen.getByTestId(tid.profile.field(key)), { target: { value } });

test('my profile shows my own record and details, with full test id coverage', async () => {
  renderPage(<ProfilePage />);
  expect(await screen.findByTestId(tid.profile.value('phone'))).toHaveTextContent(String(me().phone));
  expect(screen.getByTestId(tid.profile.fact('code'))).toHaveTextContent(String(me().code));
  expectTestIdCoverage(document.body);
});
test('proposing a change sends it for approval and leaves the record as it was, with full test id coverage', async () => {
  const was = String(me().phone);
  await openPropose();
  expectTestIdCoverage(document.body);
  set('phone', '07700 900461');
  await userEvent.click(screen.getByTestId(tid.profile.send));
  expect(await screen.findByTestId(tid.toast.info)).toHaveTextContent('Sent for approval · Mobile number');
  expect(me().phone).toBe(was);
  expect(await screen.findByTestId(tid.profile.pending('phone'))).toHaveTextContent('07700 900461 awaiting approval');
});
test('the emergency contact reads as one name, is proposed as first and last name, and shows the whole new name awaiting approval', async () => {
  const first = String(me().emergencyFirstName), last = String(me().emergencyLastName);
  renderPage(<ProfilePage />);
  expect(await screen.findByTestId(tid.profile.value('emergencyContact'))).toHaveTextContent([first, last].filter(Boolean).join(' ') || '—');
  expect(screen.queryByTestId(tid.profile.value('emergencyFirstName'))).toBeNull();
  await userEvent.click(screen.getByTestId(tid.profile.propose));
  await screen.findByTestId(tid.profile.send);
  set('emergencyLastName', 'Okonjo');
  await userEvent.click(screen.getByTestId(tid.profile.send));
  expect(await screen.findByTestId(tid.profile.pending('emergencyContact'))).toHaveTextContent(`${[first, 'Okonjo'].filter(Boolean).join(' ')} awaiting approval`);
});
test('a field already awaiting approval cannot be proposed again, and bank details say payroll checks them', async () => {
  await caller(await tokenFor('employee'))('POST', '/api/v1/profile-changes', { changes: [{ field: 'phone', to: '07700 900461' }], note: '' });
  await openPropose();
  expect(screen.getByTestId(tid.profile.field('phone'))).toBeDisabled();
  expect(screen.getByTestId(tid.profile.payroll('bankAccount'))).toHaveTextContent('Payroll checks this');
  expect(screen.queryByTestId(tid.profile.payroll('phone'))).toBeNull();
});
test('an unchanged form is refused inline and raises nothing', async () => {
  const before = snapshot('profileChanges');
  await openPropose();
  await userEvent.click(screen.getByTestId(tid.profile.send));
  expect(await screen.findByTestId(tid.profile.warn)).toHaveTextContent('Nothing has changed.');
  expect(snapshot('profileChanges')).toEqual(before);
});
test('a failed send shows the refusal and raises nothing', async () => {
  const before = snapshot('profileChanges');
  await openPropose();
  set('address', '1 New Street');
  await fault('POST', '/api/v1/profile-changes');
  await userEvent.click(screen.getByTestId(tid.profile.send));
  expect(await screen.findByTestId(tid.toast.error)).toHaveTextContent('Nothing has been changed');
  expect(snapshot('profileChanges')).toEqual(before);
});
test('with self-service switched off, the page says so and offers no change', async () => {
  const t = store.coll<{ flags: Record<string, unknown> }>('tenant').tenant;
  if (!t) throw new Error('no tenant');
  t.flags = { ...t.flags, SELF_EDIT: false };
  renderPage(<ProfilePage />);
  expect(await screen.findByTestId(tid.profile.off)).toHaveTextContent('switched off');
  expect(screen.queryByTestId(tid.profile.propose)).toBeNull();
});

/* Suite GUIDES: "The documents link survived the banner removal" (essProfile,
   v15:5647): Open documents goes to My documents while the Document centre is
   on, and is not offered while it is off. */
test('Open documents goes to My documents while the Document centre is on, and is gone while it is off', async () => {
  const view = renderPage(<ProfilePage />);
  expect(await screen.findByTestId(tid.profile.docs)).toHaveAttribute('href', '/work/docs');
  view.unmount();
  const t = store.coll<{ flags: Record<string, unknown> }>('tenant').tenant;
  if (!t) throw new Error('no tenant');
  t.flags = { ...t.flags, DOCS: false };
  renderPage(<ProfilePage />);
  await screen.findByTestId(tid.profile.value('phone'));
  await waitFor(() => expect(queryClient.getQueryState(tenantKeys.all)?.status).toBe('success'));
  expect(screen.queryByTestId(tid.profile.docs)).toBeNull();
});

/* The merged Profile (spec §4; portal inventory PROF): QniConnect's
   Business Central record in six sections, from /bc/employees/current, for
   Amara Okafor (CP-1042), and Workforce's propose-a-change flow on top,
   labelled "Not yet connected" while /api/v1 is the fake server. */
describe('the Business Central sections', () => {
  const BASE = import.meta.env.REACT_APP_API_BASE_URL ?? '';
  const PATH = new URL(BASE).pathname.replace(/\/$/, '');
  let sent: string[] = [];
  beforeEach(() => {
    bcStore.reset();
    sent = [];
    server.events.on('request:start', ({ request }) => {
      const u = new URL(request.url);
      if (u.href.startsWith(BASE)) sent.push(`${request.method} ${u.pathname.slice(PATH.length)}${u.search}`);
    });
  });
  afterEach(() => { server.events.removeAllListeners(); });
  const amara = () => {
    const p = bcStore.db.profiles.find(x => x.employeeNo === 'CP-1042');
    if (!p) throw new Error('no fake profile for CP-1042');
    return p;
  };
  const open = async () => { renderPage(<ProfilePage />, '/work/profile'); await screen.findByTestId(tid.profile.bcSection('personal')); };
  const value = (key: string) => screen.getByTestId(tid.profile.bcValue(key)).textContent;
  const SECTIONS = ['personal', 'contact', 'employment', 'tax', 'banking', 'pension'];

  test('PROF.R2: six sections in order: personal, contact, employment, tax and NI, banking, pension, with full test id coverage', async () => {
    await open();
    const titles = SECTIONS.map(k => within(screen.getByTestId(tid.profile.bcSection(k))).getByRole('heading').textContent);
    expect(titles).toEqual(['Personal information', 'Contact information', 'Employment details', 'Tax and National Insurance', 'Banking details', 'Pension information']);
    const all = screen.getAllByTestId(/^profile-bc-section-/).map(el => el.getAttribute('data-testid'));
    expect(all).toEqual(SECTIONS.map(k => tid.profile.bcSection(k)));
    await screen.findByTestId(tid.profile.value('phone'));
    expectTestIdCoverage(document.body);
  });

  test('loading first, then the record', async () => {
    renderPage(<ProfilePage />, '/work/profile');
    expect(await screen.findByTestId(tid.profile.bcLoading)).toHaveTextContent('Loading your payroll record…');
    await screen.findByTestId(tid.profile.bcSection('personal'));
    expect(screen.queryByTestId(tid.profile.bcLoading)).toBeNull();
  });

  test('PROF.R3, PROF.R7: personal: full name, date of birth as "dd Month yyyy", gender', async () => {
    amara().birthDate = '1984-03-07';
    Object.assign(amara(), { gender: 'Female' });
    await open();
    const s = within(screen.getByTestId(tid.profile.bcSection('personal')));
    expect(s.getByText('Full name')).toBeInTheDocument();
    expect(value('name')).toBe('Amara Okafor');
    expect(value('birthDate')).toBe('07 March 1984');
    expect(value('gender')).toBe('Female');
  });

  test('PROF.R4, PROF.R8: contact: email, phone, and the address block line by line', async () => {
    Object.assign(amara(), { address2: 'Flat 4', county: 'Greater London' });
    await open();
    expect(value('email')).toBe('amara.okafor@brightpath.org');
    expect(value('phone')).toBe('07700 900777');
    const lines = [...screen.getByTestId(tid.profile.bcValue('address')).querySelectorAll('span')].map(l => l.textContent);
    expect(lines).toEqual(['19 Barrow Road, Flat 4', 'London, N6 7QA', 'Greater London, United Kingdom']);
  });

  test('PROF.R5, PROF.R13: employment: employee ID, position, start date, weekly hours, status; Employee and Active by default', async () => {
    await open();
    expect(value('employeeId')).toBe('CP-1042');
    expect(value('position')).toBe(amara().jobTitle);
    expect(value('joinDate')).toBe('14 February 2022');
    expect(value('hoursWorked')).toBe('37.5');
    expect(value('status')).toBe('Active');
  });

  test('PROF.R13: with no job title and no status, the position is Employee and the status Active', async () => {
    Object.assign(amara(), { jobTitle: '', status: '' });
    await open();
    expect(value('position')).toBe('Employee');
    expect(value('status')).toBe('Active');
  });

  test('PROF.R10, PROF.R15: tax code and NI number are masked until revealed, each on its own; NI category is never masked', async () => {
    await open();
    expect(value('taxCode')).toBe('***7L');
    expect(value('niNumber')).toBe('******00C');
    expect(value('niCategory')).toBe('Class 1 A');
    const tax = screen.getByTestId(tid.profile.bcReveal('taxCode'));
    expect(tax).toHaveAccessibleName('Show tax code');
    expect(tax).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(tax);
    expect(value('taxCode')).toBe('1257L');
    expect(tax).toHaveAccessibleName('Hide tax code');
    expect(tax).toHaveAttribute('aria-pressed', 'true');
    /* the NI number keeps its own state */
    expect(value('niNumber')).toBe('******00C');
    await userEvent.click(screen.getByTestId(tid.profile.bcReveal('niNumber')));
    expect(value('niNumber')).toBe('QQ104200C');
    await userEvent.click(tax);
    expect(value('taxCode')).toBe('***7L');
    expect(value('niNumber')).toBe('QQ104200C');
  });

  test('PROF.R6, PROF.R10, PROF.R11: banking: bank, account name (the account\'s, fixed), account number and sort code behind one reveal, payment frequency', async () => {
    amara().bankAccountName = 'A Okafor';
    await open();
    expect(value('bankName')).toBe(amara().bankName);
    /* QniConnect showed the employee's name here (PROF.R11, fixed under Ruling Q2) */
    expect(value('bankAccountName')).toBe('A Okafor');
    expect(value('bankAccountNo')).toBe('****8715');
    expect(value('bankBranchNo')).toBe('****18');
    expect(value('payFrequency')).toBe('Monthly');
    /* one toggle reveals both */
    expect(screen.queryByTestId(tid.profile.bcReveal('bankBranchNo'))).toBeNull();
    await userEvent.click(screen.getByTestId(tid.profile.bcReveal('bankAccount')));
    expect(value('bankAccountNo')).toBe('10428715');
    expect(value('bankBranchNo')).toBe('472918');
    expect(value('taxCode')).toBe('***7L');
  });

  test('PROF.R16: pension: set, provider and contribution, as sent', async () => {
    await open();
    expect(within(screen.getByTestId(tid.profile.bcSection('pension'))).getByText('Contribution')).toBeInTheDocument();
    expect([value('pensionSet'), value('pensionProvider'), value('pensionContribution')]).toEqual(['Auto-enrolment', 'NEST', '5%']);
  });

  test('PROF.R9, PROF.R10: a missing value is empty; a missing date or masked value is N/A, and revealed it is empty', async () => {
    /* undefined fields are left out of the answer */
    const p = amara() as unknown as Record<string, unknown>;
    for (const k of ['birthDate', 'employmentDate', 'hmrcTaxCode', 'bankAccountNo', 'bankBranchNo', 'pensionSet', 'mobilePhoneNo', 'bankName']) p[k] = undefined;
    await open();
    expect(value('birthDate')).toBe('N/A');
    expect(value('joinDate')).toBe('N/A');
    expect(value('taxCode')).toBe('N/A');
    expect(value('bankAccountNo')).toBe('N/A');
    expect(value('bankBranchNo')).toBe('N/A');
    expect(value('pensionSet')).toBe('');
    expect(value('phone')).toBe('');
    expect(value('bankName')).toBe('');
    await userEvent.click(screen.getByTestId(tid.profile.bcReveal('taxCode')));
    expect(value('taxCode')).toBe('');
  });

  test('PROF.R12: a record that cannot be read says so (fixed, Ruling Q15) and leaves the sections blank: text empty, dates and masked values N/A', async () => {
    server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
    await open();
    expect(screen.getByTestId(tid.profile.bcFailed)).toHaveTextContent('Your payroll record could not be loaded.');
    expect(value('name')).toBe('');
    expect(value('birthDate')).toBe('N/A');
    expect(value('taxCode')).toBe('N/A');
    expect(value('niCategory')).toBe('');
    expect(value('position')).toBe('');
    /* Workforce's own parts still show */
    expect(await screen.findByTestId(tid.profile.value('phone'))).toBeInTheDocument();
  });

  test('PROF.R1, PROF.R14: one call, HOME.C2, with its storage; nothing on the record can be changed here', async () => {
    await open();
    /* after sign-in (the portal check, its session init and the environment check), the page's own calls */
    const page = () => sent.slice(sent.findIndex(x => x.startsWith('GET /bc/employees/current'))).filter(x => !x.startsWith('GET /bc/notifications'));
    await waitFor(() => expect(page()).toHaveLength(2));
    expect(page()).toEqual([
      'GET /bc/employees/current?registrationId=REG-DEMO-0001&clientEnvironment=Production&email=amara.okafor%40brightpath.org',
      'POST /session/init']);
    expect(localStorage.getItem('employeeNo')).toBe('CP-1042');
    expect(localStorage.getItem('employeeId')).toBe(amara().id);
    expect(JSON.parse(localStorage.getItem('employeeData') ?? '{}')).toMatchObject({ employeeNo: 'CP-1042' });
    for (const k of SECTIONS) {
      const s = screen.getByTestId(tid.profile.bcSection(k));
      expect(within(s).queryAllByRole('textbox')).toEqual([]);
      expect(within(s).queryAllByRole('button').every(b => b.getAttribute('data-testid')?.startsWith('profile-bc-reveal-'))).toBe(true);
    }
  });

  test('the Workforce parts say "Not yet connected" while the Workforce server is the fake one; the payroll record does not', async () => {
    await open();
    expect(await screen.findByTestId(tid.profile.notConnected('details'))).toHaveTextContent('Not yet connected');
    expect(screen.getByTestId(tid.profile.notConnected('record'))).toHaveTextContent('Not yet connected');
    for (const k of SECTIONS) expect(within(screen.getByTestId(tid.profile.bcSection(k))).queryByText('Not yet connected')).toBeNull();
  });
});
