/* Spec N19 and plan step 5: when a manager starts a new starter, the portal
   invite is offered, and it is a fake-server call (POST /api/v1/onboarding/
   cases/:id/portal-invite) while Onboarding runs on the fake server: never a
   /bc call, so real portal data never meets fake onboarding data on the wire.
   The qnipay seed: Pukar Sthapit (EMP001) tracks onboarding at Manchester;
   Tom Achterberg (EMP003) is preboarding there. */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { tid } from '@/testids';
import type { OnboardingCaseRecord } from '@/contract/onboarding';
import { renderPage, withFakeServer } from '@/test/render-page';
import { audits, resetTo, signInEmail } from '@/test/api-helpers';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { TeamOnboardingPage } from './TeamOnboardingPage';

withFakeServer();
const BC = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
const caseOf = (code: string) => {
  const c = store.coll<OnboardingCaseRecord>('onboardingCases')[`onb_${code}`];
  if (!c) throw new Error(`no case for ${code}`);
  return c;
};
const complete = () => Object.assign(caseOf('EMP003'), {
  steps: { personal: 'done', contact: 'done', emergency: 'done', additional: 'done', documents: 'done', policies: 'done' },
  docs: { rtw: 'verified', addr: 'verified', photo: 'verified' },
});
let requests: { method: string; url: string; ifMatch: string | null }[] = [];
beforeEach(async () => {
  resetTo('qnipay');
  complete();
  await signInEmail('pukar.sthapit@dogmagroup.co.uk');
  requests = [];
  server.events.on('request:start', ({ request }) => { requests.push({ method: request.method, url: request.url, ifMatch: request.headers.get('If-Match') }); });
});
afterEach(() => { server.events.removeAllListeners(); });
const bcCalls = () => requests.filter(r => r.url.startsWith(BC) || new URL(r.url).pathname.startsWith('/bc/'));
const start = async () => {
  renderPage(<TeamOnboardingPage />, '/team/tonb');
  const button = await screen.findByTestId(tid.tonb.start('EMP003'));
  /* from here on: signing in made the portal check, which is /bc's own */
  requests = [];
  await userEvent.click(button);
  return screen.findByTestId(tid.tonb.portalOffer);
};

test('onboarding: starting offers the portal invite on the fake server', async () => {
  const offer = await start();
  expect(offer).toHaveTextContent('Send Tom Achterberg a portal invite?');
  expect(screen.getByTestId(tid.tonb.portalNotConnected)).toHaveTextContent('Not yet connected');
  expectTestIdCoverage(document.body);
  const version = caseOf('EMP003').version;
  await userEvent.click(screen.getByTestId(tid.tonb.portalSend));
  await waitFor(() => expect(screen.queryByTestId(tid.tonb.portalOffer)).toBeNull());
  const invite = requests.filter(r => r.url.endsWith('/portal-invite'));
  expect(invite).toEqual([{ method: 'POST', url: expect.stringMatching(/\/api\/v1\/onboarding\/cases\/onb_EMP003\/portal-invite$/), ifMatch: String(version) }]);
  expect(new URL(invite[0]?.url ?? '').origin).toBe(window.location.origin);
  await waitFor(() => expect(screen.queryAllByTestId(tid.toast.info).map(t => t.textContent).join(' | '))
    .toContain('The portal invite for Tom Achterberg is recorded.'));
  expect(caseOf('EMP003').portalInvitedAt).toBeTruthy();
  expect(audits().map(a => a.act)).toContain('Portal invite recorded');
  /* N19: nothing went to /bc */
  expect(bcCalls()).toEqual([]);
});

test('onboarding: Not now closes the offer, and nothing is sent', async () => {
  await start();
  await userEvent.click(screen.getByTestId(tid.tonb.portalNotNow));
  expect(screen.queryByTestId(tid.tonb.portalOffer)).toBeNull();
  expect(requests.filter(r => r.url.endsWith('/portal-invite'))).toEqual([]);
  expect(caseOf('EMP003').portalInvitedAt ?? '').toBe('');
  expect(bcCalls()).toEqual([]);
});
