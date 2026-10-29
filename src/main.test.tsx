/* Final review M4 (Ruling A3's upgrade): when sign-in cannot start (MSAL's
   initialise or its redirect handling rejects), the page says so and how to
   go on, instead of staying blank with an unhandled rejection. */
import { screen } from '@testing-library/react';
import { setAuth } from '@/auth';
import { logger } from '@/lib/logger';
import { testAuth } from '@/test/api-helpers';
import { tid } from '@/testids';

vi.mock('./mocks/browser', () => ({ startFakeServer: async () => undefined }));
vi.mock('./mocks/auth-stub', async () => {
  const { testAuth: base } = await import('@/test/api-helpers');
  return { stubAuth: { ...base, init: () => Promise.reject(new Error('endpoints_resolution_error')) } };
});

afterEach(() => { setAuth(testAuth); document.body.innerHTML = ''; });

test('a sign-in that cannot start shows a card saying so, with Reload, and is logged', async () => {
  const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  document.body.innerHTML = '<div id="root"></div>';
  await import('./main');
  expect(await screen.findByTestId(tid.shell.startFailed)).toHaveTextContent('QniConnect could not start sign-in. Reload the page.');
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  expect(logged).toHaveBeenCalledWith('Sign-in could not start:', expect.any(Error));
  logged.mockRestore();
}, 30_000);
