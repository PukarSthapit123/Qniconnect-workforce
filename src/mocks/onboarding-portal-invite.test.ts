/* POST /api/v1/onboarding/cases/:id/portal-invite (spec N19): the portal
   invite offered once a starter has started, recorded on the fake server and
   never sent to /bc. The qnipay seed: Pukar Sthapit (EMP001) tracks
   onboarding at Manchester; Tom Achterberg (EMP003) is preboarding there. */
import { server } from './node';
import { store } from './store';
import { Refusal } from '@/contract/common';
import { CaseChanged } from '@/contract/onboarding';
import { audits, caller, resetTo, snapshot, tokenForEmail } from '@/test/api-helpers';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); afterAll(() => server.close());
const BC = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
let bc: string[] = [];
beforeEach(() => {
  resetTo('qnipay');
  bc = [];
  server.events.on('request:start', ({ request }) => { if (request.url.startsWith(BC)) bc.push(`${request.method} ${request.url}`); });
});
afterEach(() => { server.events.removeAllListeners(); });

interface Case { id: string; version: number; startedAt: string; portalInvitedAt?: string; steps: Record<string, string>; docs: Record<string, string> }
const caseOf = (code: string) => {
  const c = store.coll<Case>('onboardingCases')[`onb_${code}`];
  if (!c) throw new Error(`no case for ${code}`);
  return c;
};
const PUKAR = 'pukar.sthapit@dogmagroup.co.uk';
const URL_OF = (id: string) => `/api/v1/onboarding/cases/${id}/portal-invite`;
const WRITES = ['onboardingCases', 'audit', 'employees'];
const started = async () => {
  Object.assign(caseOf('EMP003'), {
    steps: { personal: 'done', contact: 'done', emergency: 'done', additional: 'done', documents: 'done', policies: 'done' },
    docs: { rtw: 'verified', addr: 'verified', photo: 'verified' },
  });
  const pukar = caller(await tokenForEmail(PUKAR));
  const r = await pukar('POST', '/api/v1/onboarding/team/EMP003/start', undefined, caseOf('EMP003').version);
  expect(r.status).toBe(200);
  return pukar;
};

test('a started employee\'s portal invite is recorded on their case, once, and nothing goes to /bc', async () => {
  const pukar = await started();
  bc = [];
  const r = await pukar('POST', URL_OF('onb_EMP003'), undefined, caseOf('EMP003').version);
  expect(r.status).toBe(200);
  const body = CaseChanged.parse(r.body);
  expect(body.record.portalInvitedAt).toBe(store.now());
  expect(body.summary).toBe('The portal invite for Tom Achterberg is recorded. Onboarding is not yet connected to the portal, so add their login on People & access.');
  expect(audits().find(a => a.id === body.auditId)).toMatchObject({ act: 'Portal invite recorded', entity: 'onboardingCase', entityId: 'onb_EMP003' });
  const before = snapshot(...WRITES);
  const again = await pukar('POST', URL_OF('onb_EMP003'), undefined, caseOf('EMP003').version);
  expect(again.status).toBe(409);
  expect(Refusal.parse(again.body)).toMatchObject({ code: 'ALREADY_INVITED', message: 'The portal invite for Tom Achterberg is already recorded.' });
  expect(snapshot(...WRITES)).toEqual(before);
  expect(bc).toEqual([]);
});

test('refused, writing nothing: not started yet, a stale or missing If-Match, an unknown case, and without Track onboarding', async () => {
  const pukar = caller(await tokenForEmail(PUKAR));
  /* a starter, without Track onboarding (signing in writes a row of its own, so before the snapshot) */
  const priya = caller(await tokenForEmail('priya.raman@dogmagroup.co.uk'));
  const before = snapshot(...WRITES);
  const notYet = await pukar('POST', URL_OF('onb_EMP003'), undefined, caseOf('EMP003').version);
  expect(notYet.status).toBe(409);
  expect(Refusal.parse(notYet.body)).toMatchObject({ code: 'NOT_STARTED', next: 'Start them first.' });
  expect((await pukar('POST', URL_OF('onb_EMP003'))).status).toBe(428);
  expect((await pukar('POST', URL_OF('onb_EMP003'), undefined, caseOf('EMP003').version + 5)).status).toBe(412);
  expect((await pukar('POST', URL_OF('onb_NOBODY'), undefined, 1)).status).toBe(404);
  expect((await priya('POST', URL_OF('onb_EMP003'), undefined, caseOf('EMP003').version)).status).toBe(403);
  expect(snapshot(...WRITES)).toEqual(before);
  expect(bc).toEqual([]);
});

test('refused for a starter at another location: a manager looks after onboarding at their own', async () => {
  const pukar = await started();
  const tom = Object.values(store.coll<{ code: string; location: string }>('employees')).find(p => p.code === 'EMP003');
  const elsewhere = Object.keys(store.coll('locations')).find(code => code !== tom?.location);
  if (!tom || !elsewhere) throw new Error('no second location in the qnipay seed');
  tom.location = elsewhere;
  const r = await pukar('POST', URL_OF('onb_EMP003'), undefined, caseOf('EMP003').version);
  expect(r.status).toBe(403);
  expect(Refusal.parse(r.body)).toMatchObject({ code: 'scope' });
  expect(caseOf('EMP003').portalInvitedAt ?? '').toBe('');
});
