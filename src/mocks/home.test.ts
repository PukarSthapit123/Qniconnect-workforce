import { server } from './node';
import { store } from './store';
import { GlyphKey, HomeMonth, MyDocuments } from '@/contract/home';
import { Refusal } from '@/contract/common';
import { GLYPH_ORDER } from '@/domain/home';
import { caller, resetTo, tokenFor, type Reply, tokenForEmail } from '@/test/api-helpers';

/* The social seed at the frozen clock (Thu 13 Aug 2026, 15:30 in London):
   Amara Okafor (CP-1042, the first employee) works at Willow House. She has draft days 27 July to 7
   August and a pending day on 12 August. 31 August is a bank holiday. */
beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); afterAll(() => server.close());
beforeEach(() => resetTo('social'));

const refusal = (r: Reply) => Refusal.parse(r.body);
const month = (r: Reply) => HomeMonth.parse(r.body);
const dayOf = (m: HomeMonth, date: string) => m.days.find(d => d.date === date);
const asEmployee = async () => caller(await tokenFor('employee'));
async function asEmail(email: string) {
  return caller(await tokenForEmail(email));
}

test('the contract\'s glyphs are the domain\'s, in the key order', () => expect(GlyphKey.options).toEqual([...GLYPH_ORDER]));

test('social: August shows the bank holiday and the recorded days, with the key and the figures around it', async () => {
  const r = await (await asEmployee())('GET', '/api/v1/home');
  expect(r.status).toBe(200);
  const m = month(r);
  expect(m).toMatchObject({ month: '2026-08', label: 'August 2026', thisMonth: '2026-08', today: '2026-08-13', bounds: { min: '2026-07', max: '2027-08' }, leadingBlanks: 5 });
  expect(m.greeting).toBe('Good afternoon, Amara');
  expect(m.who).toBe('Support Worker · Willow House');
  expect(m.days).toHaveLength(31);
  expect(dayOf(m, '2026-08-03')).toMatchObject({ ts: { state: 'draft' }, glyph: 'draft' });
  expect(dayOf(m, '2026-08-10')).toMatchObject({ ts: null, glyph: null });
  expect(dayOf(m, '2026-08-12')).toMatchObject({ ts: { state: 'pend' }, glyph: 'pend' });
  expect(dayOf(m, '2026-08-13')).toMatchObject({ today: true, future: false, glyph: null });
  expect(dayOf(m, '2026-08-17')).toMatchObject({ ts: null, glyph: null });
  expect(dayOf(m, '2026-08-31')).toMatchObject({ bankHoliday: 'Summer bank holiday', future: true });
  expect(m.summary).toMatch(/^\d+\.\dh recorded$/);
  expect(m.key.states.map(s => s.key)).toEqual(['pend', 'draft']);
  expect(m.todayDay.date).toBe('2026-08-13');
  expect(m.can).toEqual({ recordHours: true });
});

test('qnipay: it boots on the tenant\'s own data, and the recorded days show', async () => {
  resetTo('qnipay');
  const r = await (await asEmail('bigyan.poudel@dogmagroup.co.uk'))('GET', '/api/v1/home');
  expect(r.status).toBe(200);
  const m = month(r);
  expect(m.employee.code).toBe('EMP004');
  expect(m.greeting).toMatch(/^Good afternoon, Bigyan$/);
  expect(dayOf(m, '2026-08-12')).toMatchObject({ ts: { state: 'pend' }, glyph: 'pend' });
  expect(m.summary).not.toMatch(/shift/);
});

test('the month must be inside the window: the month before this one to twelve months ahead, else 422 on month', async () => {
  const me = await asEmployee();
  expect((await me('GET', '/api/v1/home?month=2026-07')).status).toBe(200);
  expect(month(await me('GET', '/api/v1/home?month=2027-08')).days).toHaveLength(31);
  for (const bad of ['2026-06', '2027-09']) {
    const r = await me('GET', `/api/v1/home?month=${bad}`);
    expect(r.status).toBe(422);
    expect(refusal(r)).toMatchObject({ code: 'invalid', field: 'month', message: 'The calendar runs from July 2026 to August 2027.', next: 'Choose a month in that range.' });
  }
  expect(refusal(await me('GET', '/api/v1/home?month=2026-13'))).toMatchObject({ field: 'month' });
  expect((await caller(await tokenFor('admin'))('GET', '/api/v1/home')).status).toBe(403);
});

test('documents: my seven, and no payroll rows (those are Business Central\'s); one of mine opens, someone else\'s is not found; Documents off refuses both', async () => {
  const me = await asEmployee();
  const list = MyDocuments.parse((await me('GET', '/api/v1/documents/mine')).body);
  expect(list.items).toHaveLength(7);
  expect(list.items.every(d => d.employeeCode === 'CP-1042')).toBe(true);
  expect(list).not.toHaveProperty('payroll');
  expect((await me('GET', '/api/v1/documents/doc_CP-1042_3')).body).toMatchObject({ name: 'DBS certificate', date: '2024-03-31' });
  const mgr = caller(await tokenFor('manager'));
  expect(MyDocuments.parse((await mgr('GET', '/api/v1/documents/mine')).body).items).toEqual([]);
  const theirs = await mgr('GET', '/api/v1/documents/doc_CP-1042_3');
  expect(theirs.status).toBe(404);
  expect(refusal(theirs).code).toBe('not-found');
  (store.coll<{ flags: Record<string, unknown> }>('tenant').tenant ?? { flags: {} }).flags.DOCS = false;
  for (const path of ['/api/v1/documents/mine', '/api/v1/documents/doc_CP-1042_3']) {
    const r = await me('GET', path);
    expect(r.status).toBe(403);
    expect(refusal(r)).toMatchObject({ code: 'feature-off', message: 'Documents is switched off for this tenant.' });
  }
});
