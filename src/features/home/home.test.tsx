import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { tid } from '@/testids';
import { server } from '@/mocks/node';
import { bcStore } from '@/mocks/bc/seed';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { resetTo, signInAs } from '@/test/api-helpers';
import { everyTab } from '@/domain/nav';
import { HomePage } from './HomePage';

/* Home: QniConnect's payslip dashboard (docs/superpowers/inventory/portal.md,
   HOME.R9, HOME.R12 to HOME.R23) for Amara Okafor (CP-1042) on the social
   seed, against the fake /bc server: eight monthly payslips, July 2026 first. */
withFakeServer();
const BASE = import.meta.env.REACT_APP_API_BASE_URL ?? '';
beforeEach(async () => { resetTo('social'); bcStore.reset(); await signInAs('employee'); });
const open = async () => { renderPage(<HomePage />, '/work/home'); await screen.findByTestId(tid.home.summary); };
const text = (id: string) => screen.getByTestId(id).textContent;
/* the page title, without the tip beside it */
const title = () => screen.getByRole('heading', { level: 1 }).firstChild?.textContent;
const amara = () => {
  const p = bcStore.db.profiles.find(x => x.employeeNo === 'CP-1042');
  if (!p) throw new Error('no fake profile for CP-1042');
  return p;
};
const slips = () => bcStore.db.payslips.filter(p => p.employeeNo === 'CP-1042');
/* the six table rows, in order */
const rows = () => within(screen.getByTestId(tid.home.payslips)).getAllByRole('row').slice(1);

test('home: the dashboard for the signed-in employee, loading first, with full test id coverage', async () => {
  renderPage(<HomePage />, '/work/home');
  expect(await screen.findByTestId(tid.home.loading)).toHaveTextContent('Loading your payroll…');
  await screen.findByTestId(tid.home.summary);
  expect(screen.queryByTestId(tid.home.failed)).toBeNull();
  expect(screen.queryByText(/undefined/)).toBeNull();
  expectTestIdCoverage(document.body);
});

test('HOME.R12: "Welcome back, <first name>", and the line under it', async () => {
  await open();
  expect(title()).toBe('Welcome back, Amara');
  /* the line under it is the title's tip: the design system's head has no lede paragraph */
  expect(screen.getByTestId(tid.home.tip)).toBeInTheDocument();
  expect(document.getElementById(`${tid.home.tip}-text`)).toHaveTextContent("Here's what's happening with your payroll.");
});

test('HOME.R13: the initials of every word, the name, position and department, and the three tags', async () => {
  Object.assign(amara(), { firstName: 'Jane', middleName: 'Anne', lastName: 'Smith' });
  await open();
  expect(text(tid.home.avatar)).toBe('JAS');
  expect(text(tid.home.name)).toBe('Jane Anne Smith');
  /* the social environment has no department: no bullet after the position */
  expect(text(tid.home.role)).toBe('Support Worker');
  expect(text(tid.home.employeeId)).toBe('Employee ID: CP-1042');
  expect(text(tid.home.joined)).toBe('Joined: 14/02/2022');
  expect(text(tid.home.frequency)).toBe('Monthly pay');
});

test('HOME.R13: an environment with a department shows it after the position', async () => {
  const env = JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}') as Record<string, unknown>;
  localStorage.setItem('activeEnvironment', JSON.stringify({ ...env, department: 'Care' }));
  await open();
  expect(text(tid.home.role)).toBe('Support Worker • Care');
});

test('HOME.R14: the latest payslip is the first the server sent, unsorted; no payslips says so', async () => {
  await open();
  const july = slips().find(p => p.period === 'July 2026');
  expect(text(tid.home.latestNet)).toBe(`£${july?.netPay.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  expect(text(tid.home.latestPeriod)).toBe('Period: July 2026');
  expect(text(tid.home.latestPaid)).toBe('Paid on: 28/07/2026');
});

test('HOME.R14: the API order is kept, a zero is £0.00, and a missing net pay no longer breaks the page', async () => {
  server.use(http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([
    { id: 'a', systemId: 's-a', period: 'March 2026', payDate: '2026-03-28', grossPay: 1234.5, taxPaid: 0, netPay: 0 },
    { id: 'b', systemId: 's-b', period: 'July 2026', payDate: '2026-07-28', grossPay: 2000, taxPaid: 300, netPay: 1500 },
  ])));
  await open();
  expect(text(tid.home.latestNet)).toBe('£0.00');
  expect(text(tid.home.latestPeriod)).toBe('Period: March 2026');
});

test('HOME.R14: no payslips', async () => {
  server.use(http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([])));
  await open();
  expect(text(tid.home.latestEmpty)).toBe('No payslips found');
  expect(screen.queryByTestId(tid.home.latestNet)).toBeNull();
});

test('HOME.R14: a payslip with no net pay shows £0.00 in the card rather than breaking the page (Ruling Q2)', async () => {
  server.use(http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([{ id: 'c', period: 'June 2026', payDate: '2026-06-28' }])));
  await open();
  expect(text(tid.home.latestNet)).toBe('£0.00');
});

test('HOME.R15: tax code, NI number and NI category, in the clear', async () => {
  await open();
  expect(text(tid.home.taxCode)).toBe('Tax code: 1257L');
  expect(text(tid.home.niNumber)).toBe('NI number: QQ104200C');
  expect(text(tid.home.niCategory)).toBe('NI category: Class 1 A');
  /* Task 24: the three cards' names are in sentence case, as every label is */
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(expect.arrayContaining(['Latest payslip', 'Tax information', 'Contact information']));
});

test('HOME.R16: email, phone and the address on its lines; an N/A second line is left out', async () => {
  Object.assign(amara(), { address2: 'Flat 4', addressLine3: 'Highgate', addressLine4: '' });
  await open();
  expect(text(tid.home.email)).toBe('amara.okafor@brightpath.org');
  expect(text(tid.home.phone)).toBe('07700 900777');
  const address = screen.getByTestId(tid.home.address);
  expect(address.innerHTML).toBe('19 Barrow Road, Flat 4<br>Highgate<br>London, N6 7QA');
});

test('HOME.R16: with no address at all the address is N/A, and no second line, town or postcode is added', async () => {
  const { address: _a, address2: _b, addressLine3: _c, addressLine4: _d, city: _e, postCode: _f, mobilePhoneNo: _g, ...rest } = amara();
  void [_a, _b, _c, _d, _e, _f, _g];
  bcStore.db.profiles = bcStore.db.profiles.map(p => (p.employeeNo === 'CP-1042' ? rest : p));
  await open();
  expect(screen.getByTestId(tid.home.address).innerHTML).toBe('N/A');
  expect(text(tid.home.phone)).toBe('N/A');
});

test('HOME.R17: an NI category with a part missing never shows "undefined"', async () => {
  Object.assign(amara(), { niClassCode: undefined, nationalInsuranceCode: 'A' });
  await open();
  expect(text(tid.home.niCategory)).toBe('NI category: A');
  expect(document.body).not.toHaveTextContent(/undefined/);
});

test('HOME.R18: six rows, the first six payslips in order, money in pounds, Tax from taxPaid; placeholders fill the rest', async () => {
  await open();
  expect(within(screen.getByTestId(tid.home.payslips)).getAllByRole('columnheader').map(h => h.textContent))
    .toEqual(['Period', 'Pay date', 'Gross pay', 'Tax', 'Net pay', 'Actions']);
  expect(screen.getByRole('heading', { name: /recent payslips/i })).toBeInTheDocument();
  expect(rows()).toHaveLength(6);
  const all = slips();
  const july = all[0];
  if (!july) throw new Error('no payslips seeded');
  const cells = within(screen.getByTestId(tid.home.payslip(0))).getAllByRole('cell').map(c => c.textContent);
  const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  expect(cells.slice(0, 5)).toEqual(['July 2026', '28/07/2026', gbp(july.grossPay), gbp(july.taxPaid), gbp(july.netPay)]);
  expect(rows().map(r => within(r).getAllByRole('cell')[0]?.textContent)).toEqual(['July 2026', 'June 2026', 'May 2026', 'April 2026', 'March 2026', 'February 2026']);
  /* the seventh and eighth payslips are not shown, and there is no "view all" */
  expect(screen.queryByText('January 2026')).toBeNull();
  expect(screen.queryByRole('link', { name: /all payslips|view all/i })).toBeNull();

  server.use(http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([
    { id: 'x', systemId: 's-x', period: 'July 2026', payDate: '2026-07-28', grossPay: 1000, taxAmount: 999, netPay: 900 },
  ])));
  cleanup();
  await open();
  expect(rows()).toHaveLength(6);
  expect(within(screen.getByTestId(tid.home.payslip(0))).getAllByRole('cell').map(c => c.textContent).slice(2, 4)).toEqual(['£1,000.00', '£0.00']);
  for (const n of [1, 2, 3, 4, 5]) expect(within(screen.getByTestId(tid.home.placeholder(n))).getAllByRole('cell').map(c => c.textContent)).toEqual(['—', '—', '—', '—', '—', '—']);
});

test('HOME.R9: a profile that cannot be read leaves the page in its blanks, fetches no payslips, and now says so', async () => {
  let payslipCalls = 0;
  server.use(
    http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ message: 'down' }, { status: 500 })),
    http.get(`${BASE}/bc/payslips`, () => { payslipCalls++; return HttpResponse.json([]); }),
  );
  renderPage(<HomePage />, '/work/home');
  expect(await screen.findByTestId(tid.home.failed)).toHaveTextContent('Your payroll details could not be loaded.Reload the page to try again.');
  expect(title()).toBe('Welcome back');
  expect(text(tid.home.name)).toBe('');
  expect(text(tid.home.employeeId)).toBe('Employee ID: ');
  expect(text(tid.home.joined)).toBe('Joined: ');
  expect(text(tid.home.frequency)).toBe(' pay');
  expect(text(tid.home.taxCode)).toBe('Tax code: ');
  expect(text(tid.home.latestEmpty)).toBe('No payslips found');
  expect(within(screen.getByTestId(tid.home.payslips)).getAllByRole('row').slice(1)).toHaveLength(6);
  expect(payslipCalls).toBe(0);
});

describe('payslip PDFs', () => {
  const pdfRequests: string[] = [];
  beforeEach(() => { pdfRequests.length = 0; server.events.on('request:start', ({ request }) => { if (request.url.includes('/pdf')) pdfRequests.push(new URL(request.url).pathname); }); });
  afterEach(() => { server.events.removeAllListeners(); });

  test('HOME.R20: while one PDF is fetched, every row\'s buttons wait; a payslip with no systemId asks for nothing', async () => {
    server.use(http.post(`${BASE}/bc/payslips/:systemId/pdf`, async () => { await delay(150); return HttpResponse.json({ value: btoa('%PDF-1.4') }); }));
    await open();
    /* QniConnect's title tooltips are the buttons' visible words and accessible names now */
    expect(screen.getByTestId(tid.home.view(0))).toHaveAccessibleName('View payslip for July 2026');
    expect(screen.getByTestId(tid.home.download(0))).toHaveAccessibleName('Download payslip for July 2026');
    await userEvent.click(screen.getByTestId(tid.home.view(0)));
    for (let r = 0; r < 6; r++) for (const id of [tid.home.view(r), tid.home.download(r)]) {
      const b = screen.getByTestId(id);
      expect(b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true', id).toBe(true);
    }
    await screen.findByTestId(tid.pdf.frame);
    await waitFor(() => expect(screen.getByTestId(tid.home.download(1))).toBeEnabled());

    server.use(http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([{ id: 'n', period: 'July 2026', payDate: '2026-07-28', netPay: 1 }])));
    cleanup();
    pdfRequests.length = 0;
    await open();
    await userEvent.click(screen.getByTestId(tid.home.view(0)));
    await userEvent.click(screen.getByTestId(tid.home.download(0)));
    expect(pdfRequests).toEqual([]);
    expect(screen.queryByTestId(tid.toast.error)).toBeNull();
  });

  test('HOME.R20: a PDF that cannot be had is said (QniConnect stayed silent), and the buttons come back', async () => {
    server.use(http.post(`${BASE}/bc/payslips/:systemId/pdf`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
    await open();
    await userEvent.click(screen.getByTestId(tid.home.view(0)));
    expect(await screen.findByTestId(tid.toast.error)).toHaveTextContent('The payslip for July 2026 could not be opened.');
    expect(screen.queryByTestId(tid.pdf.frame)).toBeNull();
    expect(screen.getByTestId(tid.home.view(0))).toBeEnabled();
    /* an answer without a PDF is the same */
    server.use(http.post(`${BASE}/bc/payslips/:systemId/pdf`, () => HttpResponse.json({})));
    await userEvent.click(screen.getByTestId(tid.home.download(1)));
    await waitFor(() => expect(screen.getAllByTestId(tid.toast.error).some(t => t.textContent?.includes('June 2026 could not be saved'))).toBe(true));
  });

  test('HOME.R21: View opens the preview, titled "Payslip - <period>", showing the PDF', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.home.view(1)));
    const box = await screen.findByTestId(tid.modal.root);
    expect(within(box).getByTestId(tid.modal.title)).toHaveTextContent('Payslip - June 2026');
    const frame = within(box).getByTestId(tid.pdf.frame);
    expect(frame).toHaveAccessibleName('PDF Viewer');
    expect(frame.getAttribute('src')).toMatch(/^data:application\/pdf;base64,JVBERi0xLjQK/);
    expect(pdfRequests).toEqual([`${new URL(BASE).pathname.replace(/\/$/, '')}/bc/payslips/${slips()[1]?.systemId}/pdf`]);
    expectTestIdCoverage(document.body);
  });

  test('HOME.R22: Download saves the PDF as Payslip-<period>.pdf, and keeps the file for 30 seconds', async () => {
    const created: Blob[] = [];
    const names: string[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { created.push(b as Blob); return 'blob:payslip'; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    const timer = vi.spyOn(globalThis, 'setTimeout');
    await open();
    await userEvent.click(screen.getByTestId(tid.home.download(0)));
    await waitFor(() => expect(names).toEqual(['Payslip-July-2026.pdf']));
    expect(created[0]?.type).toBe('application/pdf');
    expect(new TextDecoder().decode(new Uint8Array(await (created[0] as Blob).arrayBuffer())).startsWith('%PDF-1.4')).toBe(true);
    expect(timer.mock.calls.some(([, ms]) => ms === 30_000)).toBe(true);
    expect(screen.queryByTestId(tid.modal.root)).toBeNull();

    /* base64 that is not: nothing is saved, and it is said */
    server.use(http.post(`${BASE}/bc/payslips/:systemId/pdf`, () => HttpResponse.json({ value: '%%%not base64%%%' })));
    await userEvent.click(screen.getByTestId(tid.home.download(2)));
    expect(await screen.findByTestId(tid.toast.error)).toHaveTextContent('The payslip for May 2026 could not be saved.');
    expect(names).toHaveLength(1);
    for (const s of [create, revoke, click, timer]) s.mockRestore();
  });
});

test('HOME.R23: the dead QniConnect screens are not ported: no payslips, benefits, support or settings page', () => {
  const views = everyTab().map(t => t.view);
  for (const v of ['payslips', 'benefits', 'support', 'settings']) expect(views).not.toContain(v);
  expect(everyTab().map(t => t.path)).not.toContain('/work/payslips');
});
