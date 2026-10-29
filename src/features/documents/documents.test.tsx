import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { tid } from '@/testids';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { bcStore } from '@/mocks/bc/seed';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { resetTo, signInAs } from '@/test/api-helpers';
import { DocumentsPage } from './DocumentsPage';

/* Documents, merged (docs/superpowers/inventory/portal.md, DOCS, FYM): the
   payslips and tax documents from the fake /bc server, Workforce's documents
   from the fake /api/v1, for Amara Okafor (CP-1042) on the social seed:
   eight monthly payslips, July 2026 first, four in 2026/2027 (the open year)
   and four in 2025/2026, and a P11D. */
withFakeServer();
const BASE = import.meta.env.REACT_APP_API_BASE_URL ?? '';
const PATH = new URL(BASE).pathname.replace(/\/$/, '');
beforeEach(async () => { resetTo('social'); bcStore.reset(); await signInAs('employee'); });

const open = async () => { renderPage(<DocumentsPage />, '/work/docs'); await screen.findByTestId(tid.docs.tax); };
const text = (id: string) => screen.getByTestId(id).textContent;
const payslipRows = () => within(screen.getByTestId(tid.docs.payslips)).getAllByRole('row').slice(1);
const periods = () => payslipRows().map(r => within(r).getAllByRole('cell')[0]?.textContent);
const amara = () => {
  const p = bcStore.db.profiles.find(x => x.employeeNo === 'CP-1042');
  if (!p) throw new Error('no fake profile for CP-1042');
  return p;
};
const isWaiting = (id: string) => { const b = screen.getByTestId(id); return b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true'; };
const pickYear = async (year: string) => {
  await userEvent.click(screen.getByTestId(tid.docs.year));
  await userEvent.click(await screen.findByTestId(`${tid.docs.year}-option-${year}`));
};
/* the requests the page sends to /bc, as "METHOD /path" */
let sent: string[] = [];
beforeEach(() => { sent = []; server.events.on('request:start', ({ request }) => { const u = new URL(request.url); if (u.href.startsWith(BASE)) sent.push(`${request.method} ${u.pathname.slice(PATH.length)}`); }); });
afterEach(() => { server.events.removeAllListeners(); });
const count = (call: string) => sent.filter(s => s === call).length;
/* the banner's message, without its title and Dismiss */
const said = () => screen.getByTestId(tid.docs.banner).querySelector('[role="alert"]')?.textContent;

test('docs: payroll slot no longer says Not yet connected', async () => {
  await open();
  await screen.findByTestId(tid.docs.card);
  expect(screen.queryByText('Not yet connected')).toBeNull();
  expect(screen.queryByText(/Pay information & payroll documents/)).toBeNull();
  /* the slot is filled: the payslips and the tax documents, live */
  expect(screen.getByRole('heading', { name: 'Payslips' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Tax documents' })).toBeInTheDocument();
  expect(payslipRows().length).toBeGreaterThan(0);
});

test('docs: loading first, then the payslips, the tax documents, the security note and Workforce\'s documents, with full test id coverage', async () => {
  renderPage(<DocumentsPage />, '/work/docs');
  expect(await screen.findByTestId(tid.docs.payLoading)).toHaveTextContent('Loading your payslips and tax documents…');
  await screen.findByTestId(tid.docs.tax);
  await screen.findByTestId(tid.docs.card);
  expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Documents');
  expect(document.getElementById(`${tid.docs.headTip}-text`)).toHaveTextContent('Access and manage your employment documents.');
  expect(text(tid.docs.secure)).toMatch(/^Secure access to payroll documentsThis portal provides controlled and secure access/);
  expect(screen.queryByTestId(tid.docs.banner)).toBeNull();
  expect(document.body).not.toHaveTextContent(/undefined/);
  expectTestIdCoverage(document.body);
});

test('Workforce documents, unchanged: my seven, no Open action, and the source of each', async () => {
  await open();
  const card = await screen.findByTestId(tid.docs.card);
  expect(screen.getByText('My work · Documents · Amara Okafor')).toBeInTheDocument();
  expect(within(card).getAllByTestId(/^docs-row-/)).toHaveLength(7);
  expect(within(card).getByTestId(tid.docs.row('doc_CP-1042_3'))).toHaveTextContent('DBS certificate');
  expect(within(card).getByTestId(tid.docs.row('doc_CP-1042_3'))).toHaveTextContent('Compliance · 31/03/2024 · HRIS');
  expect(screen.getByTestId(tid.docs.openNote)).toHaveTextContent('Opening documents is a future enhancement.');
  expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /^Open/ })).toBeNull();
});

test('Documents switched off: the Workforce section is left out, and the payslips and tax documents stay', async () => {
  (store.coll<{ flags: Record<string, unknown> }>('tenant').tenant ?? { flags: {} }).flags.DOCS = false;
  await open();
  await waitFor(() => expect(screen.queryByTestId(tid.docs.loading)).toBeNull());
  expect(screen.queryByTestId(tid.docs.card)).toBeNull();
  expect(screen.queryByTestId(tid.docs.error)).toBeNull();
  expect(screen.queryByText(/switched off/)).toBeNull();
  expect(payslipRows().length).toBeGreaterThan(0);
  expect(screen.getByTestId(tid.docs.taxRow('P60'))).toBeInTheDocument();
});

test('DOCS.R7: the payslips and the tax documents are both on the page, and choosing a year asks for nothing', async () => {
  await open();
  const before = sent.length;
  await pickYear('2025/2026');
  expect(screen.getByTestId(tid.docs.tax)).toBeInTheDocument();
  expect(sent.length).toBe(before);
});

/* QniConnect's tab switch kept the error banner (DOCS.R7); its Fiscal year
   dropdown did too (DOCS.R14). Here the year is the Fiscal year select: an
   open banner stays through a change of it, with its words unchanged. */
test('DOCS.R7, DOCS.R14: an open banner survives a change of the Fiscal year select', async () => {
  await open();
  await userEvent.click(screen.getByTestId(tid.docs.taxView('P45')));
  await waitFor(() => expect(said()).toBe('No P45 has been issued, because this employee has not left.'));
  await pickYear('2025/2026');
  expect(periods()).toEqual(['March 2026', 'February 2026', 'January 2026', 'December 2025']);
  expect(said()).toBe('No P45 has been issued, because this employee has not left.');
  await pickYear('2026/2027');
  expect(said()).toBe('No P45 has been issued, because this employee has not left.');
  /* Task 24: QniConnect's words say what happened; the banner adds what to do next */
  expect(screen.getByTestId(tid.docs.bannerNext)).toHaveTextContent('Try again in a moment. If it keeps happening, ask your payroll administrator.');
});

describe('the payslips', () => {
  test('DOCS.R8: the year filter offers each year, "(Active)" after the open one, and starts on it (DOCS.R4)', async () => {
    await open();
    expect(screen.getByLabelText('Fiscal year')).toBe(screen.getByTestId(tid.docs.year));
    expect(text(tid.docs.year)).toBe('2026/2027 (Active)');
    await userEvent.click(screen.getByTestId(tid.docs.year));
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['2026/2027 (Active)', '2025/2026', '2024/2025', '2023/2024', '2022/2023']);
    await userEvent.keyboard('{Escape}');
  });

  test('DOCS.R5: the payslips of the chosen year, in the order the server sent them', async () => {
    await open();
    expect(periods()).toEqual(['July 2026', 'June 2026', 'May 2026', 'April 2026']);
    await pickYear('2025/2026');
    expect(periods()).toEqual(['March 2026', 'February 2026', 'January 2026', 'December 2025']);
    await pickYear('2024/2025');
    expect(screen.queryByTestId(tid.docs.payslips)).toBeNull();
    expect(text(tid.docs.payslipsEmpty)).toBe('No payslips foundNo payslips are available for the selected fiscal year. Try selecting a different year or contact your administrator.');
  });

  test('DOCS.R8: with no years at all the filter says so and cannot be opened (it no longer says Loading for good)', async () => {
    server.use(http.get(`${BASE}/bc/fiscalyears`, () => HttpResponse.json([])), http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([])));
    await open();
    expect(screen.getByTestId(tid.docs.year)).toBeDisabled();
    expect(text(tid.docs.year)).toBe('No fiscal years');
    expect(screen.getByTestId(tid.docs.payslipsEmpty)).toBeInTheDocument();
  });

  test('DOCS.R9: Period, Pay date (the expected payment date first), Gross pay, Tax (taxAmount, else taxPaid), Net pay, in pounds', async () => {
    server.use(http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([
      { id: 'a', systemId: 's-a', period: 'May 2026', payDate: '2026-05-28', expectedPaymentDate: '2026-05-29', grossPay: 2345.5, taxAmount: 0, taxPaid: 300, netPay: 2000 },
      { id: 'b', systemId: 's-b', period: 'April 2026', payDate: '2026-04-28', taxPaid: 12.3 },
    ])));
    await open();
    expect(within(screen.getByTestId(tid.docs.payslips)).getAllByRole('columnheader').map(h => h.textContent))
      .toEqual(['Period', 'Pay date', 'Gross pay', 'Tax', 'Net pay', 'Actions']);
    const cells = (row: number) => within(screen.getByTestId(tid.docs.payslip(row))).getAllByRole('cell').map(c => c.textContent).slice(0, 5);
    expect(cells(0)).toEqual(['May 2026', '29/05/2026', '£2,345.50', '£0.00', '£2,000.00']);
    expect(cells(1)).toEqual(['April 2026', '28/04/2026', '£0.00', '£12.30', '£0.00']);
    expect(screen.getByTestId(tid.docs.payslipView(0))).toHaveAccessibleName('View payslip for May 2026');
    expect(screen.getByTestId(tid.docs.payslipDownload(0))).toHaveAccessibleName('Download payslip for May 2026');
  });

  test('DOCS.R20: View opens the preview, titled "Payslip - <period>", showing the PDF', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.docs.payslipView(1)));
    const box = await screen.findByTestId(tid.modal.root);
    expect(within(box).getByTestId(tid.modal.title)).toHaveTextContent('Payslip - June 2026');
    expect(within(box).getByTestId(tid.pdf.frame).getAttribute('src')).toMatch(/^data:application\/pdf;base64,JVBERi0xLjQK/);
    const june = bcStore.db.payslips.find(p => p.employeeNo === 'CP-1042' && p.period === 'June 2026');
    expect(sent).toContain(`POST /bc/payslips/${june?.systemId}/pdf`);
    expectTestIdCoverage(document.body);
  });

  test('DOCS.R19: Download saves the PDF as Payslip-<period>.pdf and keeps the file for 30 seconds (DOCS.R20)', async () => {
    const names: string[] = [], created: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { created.push(b as Blob); return 'blob:payslip'; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    const timer = vi.spyOn(globalThis, 'setTimeout');
    try {
      await open();
      await userEvent.click(screen.getByTestId(tid.docs.payslipDownload(0)));
      await waitFor(() => expect(names).toEqual(['Payslip-July-2026.pdf']));
      expect(created[0]?.type).toBe('application/pdf');
      expect(timer.mock.calls.some(([, ms]) => ms === 30_000)).toBe(true);
      expect(screen.queryByTestId(tid.modal.root)).toBeNull();
    } finally { create.mockRestore(); revoke.mockRestore(); click.mockRestore(); timer.mockRestore(); }
  });

  test('DOCS.R12: no systemId says "Payslip ID is missing" and asks for nothing; a refused PDF says the server\'s words', async () => {
    server.use(http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([
      { id: 'n', period: 'July 2026', payDate: '2026-07-28' }, { id: 'm', systemId: 's-m', period: 'June 2026', payDate: '2026-06-28' }])));
    server.use(http.post(`${BASE}/bc/payslips/:systemId/pdf`, () => HttpResponse.json({ message: 'Payslip s-m is not posted yet' }, { status: 404 })));
    await open();
    await userEvent.click(screen.getByTestId(tid.docs.payslipView(0)));
    expect(await screen.findByTestId(tid.docs.banner)).toHaveTextContent('Document not availablePayslip ID is missing');
    expect(sent.filter(s => s.endsWith('/pdf'))).toEqual([]);
    await userEvent.click(screen.getByTestId(tid.docs.payslipView(1)));
    await waitFor(() => expect(text(tid.docs.banner)).toContain('Payslip s-m is not posted yet'));
    expect(screen.queryByTestId(tid.pdf.frame)).toBeNull();
    /* an answer with no PDF in it */
    server.use(http.post(`${BASE}/bc/payslips/:systemId/pdf`, () => HttpResponse.json({})));
    await userEvent.click(screen.getByTestId(tid.docs.payslipDownload(1)));
    await waitFor(() => expect(text(tid.docs.banner)).toContain('Invalid response format from payslip PDF API'));
  });

  test('DOCS.R15: anything else that goes wrong says "An error occurred while processing your request"', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('no blobs'); });
    try {
      await open();
      await userEvent.click(screen.getByTestId(tid.docs.payslipDownload(0)));
      await waitFor(() => expect(said()).toBe('An error occurred while processing your request'));
      expect(screen.getByTestId(tid.docs.payslipDownload(0))).toBeEnabled();
    } finally { create.mockRestore(); }
  });

  test('DOCS.R21: while one document is fetched every row\'s buttons wait, the tax documents\' too, and come back after', async () => {
    server.use(http.post(`${BASE}/bc/payslips/:systemId/pdf`, async () => { await delay(150); return HttpResponse.json({ value: btoa('%PDF-1.4') }); }));
    await open();
    await userEvent.click(screen.getByTestId(tid.docs.payslipView(0)));
    expect(screen.getByTestId(tid.docs.payslipView(0))).toHaveAttribute('aria-busy', 'true');
    for (const id of [tid.docs.payslipDownload(0), tid.docs.payslipView(1), tid.docs.payslipDownload(3), tid.docs.taxView('P60'), tid.docs.taxDownload('P45')])
      expect(isWaiting(id), id).toBe(true);
    await screen.findByTestId(tid.pdf.frame);
    await waitFor(() => expect(screen.getByTestId(tid.docs.taxView('P60'))).toBeEnabled());
  });
});

describe('the tax documents', () => {
  test('DOCS.R10: Document type, Description and Actions, one row per document: P60, P11D and P45 (Ruling Q4)', async () => {
    await open();
    expect(within(screen.getByTestId(tid.docs.tax)).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Document type', 'Description', 'Actions']);
    expect(within(screen.getByTestId(tid.docs.tax)).getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').slice(0, 2).map(c => c.textContent)))
      .toEqual([['P60', 'End of year certificate'], ['P11D', 'Expenses and benefits statement'], ['P45', 'Details of employee leaving work']]);
    expect(screen.getByTestId(tid.docs.taxView('P60'))).toHaveAccessibleName('View P60');
    expect(screen.getByTestId(tid.docs.taxDownload('P11D'))).toHaveAccessibleName('Download P11D');
  });

  test('DOCS.R6: no P11D row unless the profile says there is one', async () => {
    amara().validP11D = false;
    await open();
    expect(screen.queryByTestId(tid.docs.taxRow('P11D'))).toBeNull();
    expect(screen.getByTestId(tid.docs.taxRow('P60'))).toBeInTheDocument();
  });

  test('DOCS.R6: a profile that cannot be read shows no tax documents and the empty state, keeps the payslips, and now says so', async () => {
    localStorage.setItem('employeeNo', 'CP-1042');
    server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
    renderPage(<DocumentsPage />, '/work/docs');
    await screen.findByTestId(tid.docs.taxEmpty);
    expect(text(tid.docs.taxEmpty)).toBe('No tax documents foundNo tax documents are available for the selected year. Tax documents like P60s are typically issued annually at the end of the tax year, and P45s when you leave employment.');
    expect(text(tid.docs.taxFailed)).toContain('Your tax documents could not be loaded.');
    expect(periods()).toEqual(['July 2026', 'June 2026', 'May 2026', 'April 2026']);
  });

  test('DOCS.R11, DOCS.R13: with no employee GUID stored a tax document says so and asks for nothing', async () => {
    await open();
    localStorage.removeItem('employeeData'); localStorage.removeItem('employeeId');
    const before = sent.length;
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P60')));
    expect(await screen.findByTestId(tid.docs.banner)).toHaveTextContent('Employee GUID is required but not available');
    expect(screen.queryByTestId(tid.modal.root)).toBeNull();
    expect(sent.length).toBe(before);
  });

  test('DOCS.R13, DOCS.R18: P60 reads the fiscal years again, every time, and asks for the year in "Select fiscal year for P60"', async () => {
    await open();
    expect(count('GET /bc/fiscalyears')).toBe(1);
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P60')));
    const box = await screen.findByTestId(tid.modal.root);
    expect(within(box).getByTestId(tid.modal.title)).toHaveTextContent('Select fiscal year for P60');
    await within(box).findByTestId(tid.docs.fyPrompt);
    expect(count('GET /bc/fiscalyears')).toBe(2);
    await userEvent.click(within(box).getByTestId(tid.docs.fyCancel));
    await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    await userEvent.click(screen.getByTestId(tid.docs.taxDownload('P11D')));
    expect(within(await screen.findByTestId(tid.modal.root)).getByTestId(tid.modal.title)).toHaveTextContent('Select fiscal year for P11D');
    await screen.findByTestId(tid.docs.fyPrompt);
    expect(count('GET /bc/fiscalyears')).toBe(3);
  });

  test('DOCS.R14: fiscal years that cannot be read say so over the page, and the dialog still opens, with none to choose', async () => {
    await open();
    server.use(http.get(`${BASE}/bc/fiscalyears`, () => HttpResponse.json({ error: { code: 'X', message: 'Fiscal years are locked. CorrelationId: 1' } }, { status: 500 })));
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P60')));
    expect(await screen.findByTestId(tid.docs.fyEmpty)).toHaveTextContent('No fiscal years available');
    expect(said()).toBe('Failed to load fiscal years: Fiscal years are locked.');
    expect(screen.getByTestId(tid.docs.fyConfirm)).toBeDisabled();
  });

  test('DOCS.R16, DOCS.R17: a chosen year closes the dialog at once and opens the P60 for it, titled "P60 - <year>"', async () => {
    let p60Body = '';
    server.events.on('request:start', ({ request }) => { if (request.url.endsWith('/p60')) void request.clone().text().then(b => { p60Body = b; }); });
    server.use(http.post(`${BASE}/bc/employees/:employeeId/p60`, async () => { await delay(100); return HttpResponse.json({ value: btoa('%PDF-1.4 p60') }); }));
    await open();
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P60')));
    await screen.findByTestId(tid.docs.fyPrompt);
    await userEvent.click(screen.getByTestId(tid.docs.fyOption(1)));
    await userEvent.click(screen.getByTestId(tid.docs.fyConfirm));
    /* closed while the document is fetched, and the rows wait */
    await waitFor(() => expect(screen.queryByTestId(tid.docs.fyPrompt)).toBeNull());
    expect(screen.getByTestId(tid.docs.taxView('P60'))).toHaveAttribute('aria-busy', 'true');
    expect(isWaiting(tid.docs.payslipView(0))).toBe(true);
    const box = await screen.findByTestId(tid.pdf.frame);
    expect(within(screen.getByTestId(tid.modal.root)).getByTestId(tid.modal.title)).toHaveTextContent('P60 - 2024/2025');
    expect(box.getAttribute('src')).toBe(`data:application/pdf;base64,${btoa('%PDF-1.4 p60')}`);
    expect(JSON.parse(p60Body)).toEqual({ employeeId: amara().id, taxYear: '2024/2025' });
  });

  test('DOCS.R16: Download saves "<type>_<year>.pdf"; a refusal is said in Business Central\'s words, cut at the CorrelationId', async () => {
    const names: string[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tax');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    try {
      await open();
      await userEvent.click(screen.getByTestId(tid.docs.taxDownload('P11D')));
      await screen.findByTestId(tid.docs.fyPrompt);
      await userEvent.click(screen.getByTestId(tid.docs.fyOption(2)));
      await userEvent.click(screen.getByTestId(tid.docs.fyConfirm));
      await waitFor(() => expect(names).toEqual(['P11D_2024/2025.pdf']));
      expect(screen.queryByTestId(tid.docs.banner)).toBeNull();
      /* the open year has no P11D yet */
      await userEvent.click(screen.getByTestId(tid.docs.taxView('P11D')));
      await screen.findByTestId(tid.docs.fyPrompt);
      await userEvent.click(screen.getByTestId(tid.docs.fyOption(0)));
      await userEvent.click(screen.getByTestId(tid.docs.fyConfirm));
      await waitFor(() => expect(said()).toBe('No P11D has been filed for 2026/2027 yet.'));
      expect(screen.queryByTestId(tid.pdf.frame)).toBeNull();
    } finally { create.mockRestore(); revoke.mockRestore(); click.mockRestore(); }
  });

  test('DOCS.R16: an answer with no PDF says QniConnect\'s words', async () => {
    server.use(http.post(`${BASE}/bc/employees/:employeeId/p60`, () => HttpResponse.json({})));
    await open();
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P60')));
    await screen.findByTestId(tid.docs.fyPrompt);
    await userEvent.click(screen.getByTestId(tid.docs.fyOption(0)));
    await userEvent.click(screen.getByTestId(tid.docs.fyConfirm));
    await waitFor(() => expect(said()).toBe('Invalid response format from P60 document API'));
  });

  test('Ruling Q4: P45 asks for no year, sends the employee alone, and says Business Central\'s refusal', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P45')));
    await waitFor(() => expect(said()).toBe('No P45 has been issued, because this employee has not left.'));
    expect(screen.queryByTestId(tid.docs.fyPrompt)).toBeNull();
    expect(sent).toContain(`POST /bc/employees/${amara().id}/p45`);
    expect(count('GET /bc/fiscalyears')).toBe(1);
    /* where Business Central has one, it opens titled "P45" */
    server.use(http.post(`${BASE}/bc/employees/:employeeId/p45`, () => HttpResponse.json({ value: btoa('%PDF-1.4 p45') })));
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P45')));
    await screen.findByTestId(tid.pdf.frame);
    expect(text(tid.modal.title)).toBe('P45');
    expect(screen.queryByTestId(tid.docs.banner)).toBeNull();
  });

  test('DOCS error state: the banner is dismissed by its button, stays through a year chosen in the dialog, and goes when the next document is asked for', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P45')));
    await screen.findByTestId(tid.docs.banner);
    await userEvent.click(screen.getByTestId(tid.docs.bannerDismiss));
    expect(screen.queryByTestId(tid.docs.banner)).toBeNull();
    /* a refusal, then a year chosen for a P60 that works: the old words stay (as in QniConnect) */
    await userEvent.click(screen.getByTestId(tid.docs.taxView('P11D')));
    await screen.findByTestId(tid.docs.fyPrompt);
    await userEvent.click(screen.getByTestId(tid.docs.fyOption(0)));
    await userEvent.click(screen.getByTestId(tid.docs.fyConfirm));
    await screen.findByTestId(tid.docs.banner);
    await pickYear('2025/2026');
    expect(screen.getByTestId(tid.docs.banner)).toBeInTheDocument();
    /* the next document asked for clears it */
    await userEvent.click(screen.getByTestId(tid.docs.payslipView(0)));
    await screen.findByTestId(tid.pdf.frame);
    expect(screen.queryByTestId(tid.docs.banner)).toBeNull();
  });
});

describe('the fiscal year dialog', () => {
  const openFor = async (type: 'P60' | 'P11D') => {
    await userEvent.click(screen.getByTestId(tid.docs.taxView(type)));
    return screen.findByTestId(tid.modal.root);
  };

  test('FYM.R4: while the years are read it says so; then it asks for one', async () => {
    await open();
    server.use(http.get(`${BASE}/bc/fiscalyears`, async () => { await delay(100); return HttpResponse.json(bcStore.db.fiscalYears); }));
    const box = await openFor('P60');
    expect(within(box).getByTestId(tid.docs.fyLoading)).toHaveTextContent('Loading fiscal years…');
    expect(within(box).getByTestId(tid.docs.fyConfirm)).toBeDisabled();
    expect(await within(box).findByTestId(tid.docs.fyPrompt)).toHaveTextContent('Choose a fiscal year to generate the P60 document.');
    expectTestIdCoverage(document.body);
  });

  test('FYM.R5: a P60 is offered for the closed years flagged printable only; a P11D for every year, in the API\'s order', async () => {
    await open();
    let box = await openFor('P60');
    await within(box).findByTestId(tid.docs.fyPrompt);
    expect(within(box).getAllByTestId(/^docs-fy-option-/).map(b => b.firstChild?.firstChild?.textContent)).toEqual(['2025/2026', '2024/2025', '2023/2024']);
    await userEvent.click(within(box).getByTestId(tid.docs.fyCancel));
    await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    box = await openFor('P11D');
    await within(box).findByTestId(tid.docs.fyPrompt);
    expect(within(box).getAllByTestId(/^docs-fy-option-/)).toHaveLength(5);
  });

  test('FYM.R5: when no year is left for a P60 the dialog says so rather than showing an empty list (Ruling Q2)', async () => {
    bcStore.db.fiscalYears = bcStore.db.fiscalYears.map(y => ({ ...y, allowP60Print: false }));
    await open();
    const box = await openFor('P60');
    expect(await within(box).findByTestId(tid.docs.fyNone)).toHaveTextContent('No fiscal year has a P60 ready to print yet.');
    expect(within(box).queryAllByTestId(/^docs-fy-option-/)).toEqual([]);
  });

  test('FYM.R6: each year shows its name and its dates, and the chosen one is marked, one at a time, even with no ids (Ruling Q2)', async () => {
    server.use(http.get(`${BASE}/bc/fiscalyears`, () => HttpResponse.json([
      { fiscalYear: '2025/2026', active: false, startDate: '2025-04-06', endDate: '2026-04-05', allowP60Print: true },
      { fiscalYear: '2024/2025', active: false, startDate: 'from April', endDate: '2025-04-05', allowP60Print: true }])));
    await open();
    const box = await openFor('P60');
    await within(box).findByTestId(tid.docs.fyPrompt);
    expect(text(tid.docs.fyOption(0))).toBe('2025/202606/04/2025 to 05/04/2026');
    expect(text(tid.docs.fyOption(1))).toBe('2024/2025from April to 05/04/2025');
    await userEvent.click(screen.getByTestId(tid.docs.fyOption(1)));
    expect(screen.getByTestId(tid.docs.fyOption(1))).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(tid.docs.fyOption(0))).toHaveAttribute('aria-pressed', 'false');
  });

  test('FYM.R7: Confirm selection waits for a year; FYM.R2: each opening starts with none chosen', async () => {
    await open();
    let box = await openFor('P60');
    await within(box).findByTestId(tid.docs.fyPrompt);
    expect(within(box).getByTestId(tid.docs.fyConfirm)).toBeDisabled();
    await userEvent.click(within(box).getByTestId(tid.docs.fyOption(0)));
    expect(within(box).getByTestId(tid.docs.fyConfirm)).toBeEnabled();
    await userEvent.click(within(box).getByTestId(tid.docs.fyCancel));
    await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    box = await openFor('P60');
    await within(box).findByTestId(tid.docs.fyPrompt);
    expect(within(box).getByTestId(tid.docs.fyOption(0))).toHaveAttribute('aria-pressed', 'false');
    expect(within(box).getByTestId(tid.docs.fyConfirm)).toBeDisabled();
  });

  test('FYM.R1, FYM.R3: Escape, the close button and Cancel close it, and nothing is fetched', async () => {
    await open();
    for (const close of [() => userEvent.keyboard('{Escape}'), () => userEvent.click(screen.getByTestId(tid.modal.close)), () => userEvent.click(screen.getByTestId(tid.docs.fyCancel))]) {
      await openFor('P11D');
      await screen.findByTestId(tid.docs.fyPrompt);
      await close();
      await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    }
    expect(sent.filter(s => /\/p(60|11d|45)$/.test(s))).toEqual([]);
  });
});

test('DOCS.R22: nothing QniConnect left unused is ported: no refresh, filter or "All" control', async () => {
  await open();
  expect(screen.queryByRole('button', { name: /refresh|filter/i })).toBeNull();
  await userEvent.click(screen.getByTestId(tid.docs.year));
  expect((await screen.findAllByRole('option')).map(o => o.textContent)).not.toContain('All');
  await userEvent.keyboard('{Escape}');
});
