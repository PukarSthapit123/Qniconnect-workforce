import { bcBaseUrl } from '@/api/bc/client';

/* The fake server's onUnhandledRequest (browser.ts). While the fake /bc is
   registered, a request to REACT_APP_API_BASE_URL that no handler answers
   is an error, so it fails here instead of reaching the real QniConnect API
   with the stub's unsigned token (final review M5); until now only the
   "every endpoint answered by the fake" test (session.test.ts) guarded it.
   Everything else (the dev server's own files, Microsoft, and every /bc
   call while VITE_FAKE_BC is off) passes through, as 'bypass' did. */
export const unhandledRequest = (bcOn: boolean) => (request: Request, print: { warning(): void; error(): void }) => {
  if (!bcOn) return;
  const base = bcBaseUrl();
  if (request.url === base || request.url.startsWith(`${base}/`)) print.error();
};
