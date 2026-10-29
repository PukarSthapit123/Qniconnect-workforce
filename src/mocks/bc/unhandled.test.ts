/* Final review M5: while the fake /bc answers, a /bc path it has no handler
   for is an error, not a request let through to the real
   REACT_APP_API_BASE_URL carrying the stub's unsigned token. Anything else
   (assets, the dev server, another origin) still passes. With VITE_FAKE_BC
   off there are no bc handlers and every /bc call goes through. */
import { bcBaseUrl } from '@/api/bc/client';
import { unhandledRequest } from './unhandled';

const print = () => ({ warning: vi.fn(), error: vi.fn() });

test('with the fake /bc on, an unhandled request to the QniConnect API is an error', () => {
  const p = print();
  unhandledRequest(true)(new Request(`${bcBaseUrl()}/bc/not-a-real-endpoint`), p);
  expect(p.error).toHaveBeenCalledTimes(1);
  const q = print();
  unhandledRequest(true)(new Request(`${bcBaseUrl()}/session/whatever`), q);
  expect(q.error).toHaveBeenCalledTimes(1);
});

test('other unhandled requests pass, and with the fake /bc off so does /bc', () => {
  for (const url of ['http://localhost:3000/src/main.tsx', 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration']) {
    const p = print();
    unhandledRequest(true)(new Request(url), p);
    expect(p.error, url).not.toHaveBeenCalled();
    expect(p.warning, url).not.toHaveBeenCalled();
  }
  const off = print();
  unhandledRequest(false)(new Request(`${bcBaseUrl()}/bc/payslips`), off);
  expect(off.error).not.toHaveBeenCalled();
});
