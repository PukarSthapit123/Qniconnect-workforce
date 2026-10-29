import { render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { queryClient } from '@/api/query';
import { tid } from '@/testids';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { clearStubAccount, setStubAccount } from '@/test/api-helpers';
import { DevSignIn, pickDevAccount } from './DevSignIn';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { store.reset('social'); queryClient.clear(); });
afterEach(() => { clearStubAccount(); });

const mount = (path = '/dev/sign-in') => render(
  <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><DevSignIn /></MemoryRouter></QueryClientProvider>);
const seed = () => Object.values(store.coll<{ email: string; userType: string }>('accounts'));

test('the dev picker lists every seed person, grouped by user type', async () => {
  mount();
  for (const type of ['employee', 'manager', 'admin']) {
    const group = await screen.findByTestId(tid.devSignIn.group(type));
    for (const a of seed().filter(x => x.userType === type)) expect(within(group).getByTestId(tid.devSignIn.account(a.email))).toHaveTextContent(a.email);
  }
  expect(screen.queryByTestId(tid.devSignIn.unmatched)).not.toBeInTheDocument();
  expectTestIdCoverage();
});

test('sent here unmatched, it says why in one sentence, naming the Microsoft account', async () => {
  setStubAccount('somebody@contoso.com');
  mount('/dev/sign-in?unmatched=1');
  expect(await screen.findByTestId(tid.devSignIn.unmatched))
    .toHaveTextContent('somebody@contoso.com is not one of the sample people the development data knows, so pick someone to sign in as.');
});

test('a pick is kept for the tab, and is the stub account too when the stub signs in', () => {
  pickDevAccount({ email: 'amara.okafor@brightpath.org', name: 'Amara Okafor' }, false);
  expect(sessionStorage.getItem('qniconnect.devAccount')).toBe('amara.okafor@brightpath.org');
  expect(sessionStorage.getItem('qniconnect.stubAccount')).toBeNull();
  pickDevAccount({ email: 'amara.okafor@brightpath.org', name: 'Amara Okafor' }, true);
  expect(JSON.parse(sessionStorage.getItem('qniconnect.stubAccount') ?? '{}')).toMatchObject({ email: 'amara.okafor@brightpath.org', name: 'Amara Okafor' });
});
