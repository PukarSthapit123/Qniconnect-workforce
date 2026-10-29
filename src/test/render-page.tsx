/* Component tests of a whole page: the fake server, a signed-in session, a
   router and the toaster, as the app gives them. */
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';
import { server } from '@/mocks/node';
import { queryClient } from '@/api/query';
import { SessionProvider, useSession } from '@/shell/SessionProvider';
import { Toaster } from '@/ui/shadcn/sonner';
import { accountOf, clearStubAccount, setStubAccount, type Persona } from './api-helpers';

/* The provider signs in (the portal check, then the Workforce session) when
   it mounts, so a page mounts only once the session is in. */
function Ready({ children }: { children: ReactNode }) { return useSession().session ? <>{children}</> : null; }
/* `as` signs in through the auth stub as that persona's first started
   account first; without it, whoever a test already signed in (signInAs,
   signInEmail) is used. */
export function renderPage(ui: ReactElement, path = '/', opts: { as?: Persona } = {}) {
  if (opts.as) setStubAccount(accountOf(opts.as).email);
  queryClient.clear();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}><SessionProvider><Ready>{ui}</Ready></SessionProvider></MemoryRouter>
      <Toaster />
    </QueryClientProvider>);
}
/* Call once at the top of a page test file. sonner keeps its queue outside
   React, so toasts are dismissed between tests or one leaks into the next. */
export function withFakeServer() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => { clearStubAccount(); server.resetHandlers(); toast.dismiss(); });
}
