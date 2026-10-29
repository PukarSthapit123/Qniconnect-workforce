import type { z } from 'zod';
import { Refusal } from '@/contract/common';
import { pathParamNames, type Endpoint } from '@/contract/endpoints';
import { FAKE_SERVER_ON } from '@/lib/fake-server';
import { fakeModuleOn } from '@/lib/fake-modules';
import { DEV_ACCOUNT_HEADER, devAccount } from '@/lib/dev-account';
import { auth } from '@/auth';
import { sendableToken, UnsignedTokenError } from '@/auth/unsigned';
import { bcContext } from './bc/context';

export class ApiError extends Error {
  constructor(public status: number, public refusal: Refusal) { super(refusal.message); }
}
const UNREADABLE: Refusal = { code: 'unreadable', message: 'The server sent something this screen cannot read. Nothing has been changed on screen.', next: 'Reload the page. If it happens again, report it.' };
/* The auth stub's unsigned token, refused before it could reach a real server (src/auth/unsigned.ts). */
const UNSIGNED: Refusal = { code: 'unsigned-token', message: 'This sign-in is a test sign-in, so it was not sent to a real server. Nothing was sent.', next: 'Sign in with your Microsoft account to continue.' };
const NETWORK: Refusal = { code: 'network', message: 'The server could not be reached, so nothing was saved.', next: 'Check your connection and try again.' };
/* The Microsoft token could not be had without asking the person again
   (InteractionRequiredAuthError): the adapter has already started that, so
   the call is answered 401 with its own code, so SessionProvider does not
   start a second redirect (review M4). */
export const INTERACTION_REQUIRED = 'interaction-required';
const NO_TOKEN: Refusal = { code: INTERACTION_REQUIRED, message: 'Your sign-in needs renewing, so nothing was sent.', next: 'Sign in again to continue.' };

/* What every /api/v1 call carries besides its own headers (spec section 6):
   the Microsoft login token, X-BC-Environment and X-Registration-ID when
   environment selection has stored them, and, while the fake server runs,
   the dev picker's choice of seed person. Whether the fake answers is per
   module (VITE_FAKE_MODULES): a module on the real backend is never handed
   the stub's unsigned token or the picker's choice. */
async function sessionHeaders(path: string): Promise<Record<string, string>> {
  /* FAKE_SERVER_ON first, here: the literal is what lets a production build drop the dev picker (build:check) */
  const fake = FAKE_SERVER_ON && fakeModuleOn(path);
  const headers: Record<string, string> = {};
  let token: string | null;
  try { token = await auth().token('login'); }
  catch (e) { if (e instanceof Error && e.name === 'InteractionRequiredAuthError') throw new ApiError(401, NO_TOKEN); throw e; }
  if (token) {
    try { headers.Authorization = `Bearer ${sendableToken(token, fake)}`; }
    catch (e) { if (e instanceof UnsignedTokenError) throw new ApiError(401, UNSIGNED); throw e; }
  }
  const environment = bcContext.environment()?.id, registrationId = bcContext.registrationId();
  if (environment) headers['X-BC-Environment'] = environment;
  if (registrationId) headers['X-Registration-ID'] = registrationId;
  if (fake) {
    const dev = devAccount();
    if (dev) headers[DEV_ACCOUNT_HEADER] = dev;
  }
  return headers;
}

/* What a call to one endpoint must carry, worked out from its definition: the
   path parameters it declares, a body shaped like its request schema, its
   query, and If-Match when it is versioned. Anything the endpoint does not
   declare cannot be passed. */
type Opts<E extends Endpoint> =
  (E extends { params: z.ZodType } ? { params: z.input<E['params']> } : { params?: never }) &
  (E extends { request: z.ZodType } ? { body: z.input<E['request']> } : { body?: never }) &
  (E extends { query: z.ZodType } ? { query?: z.input<E['query']> } : { query?: never }) &
  (E extends { versioned: true } ? { ifMatch: number } : { ifMatch?: never });
type Args<E extends Endpoint> = E extends { params: z.ZodType } | { request: z.ZodType } | { versioned: true } ? [opts: Opts<E>] : [opts?: Opts<E>];
interface LooseOpts { params?: Record<string, unknown>; body?: unknown; query?: Record<string, unknown>; ifMatch?: number }

/* Builds the URL, refusing (by throwing, before anything is sent) when a path
   parameter the endpoint declares is missing or empty: an empty segment would
   otherwise quietly address a different resource. */
export function buildUrl(ep: Endpoint, opts: LooseOpts): string {
  let url: string = ep.path;
  for (const k of pathParamNames(ep.path)) {
    const v = opts.params?.[k];
    if (v === undefined || v === null || v === '') throw new Error(`${ep.method} ${ep.path} needs the path parameter "${k}".`);
    url = url.replace(`:${k}`, encodeURIComponent(String(v)));
  }
  const q = Object.entries(opts.query ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)] as [string, string]);
  if (q.length) url += '?' + new URLSearchParams(q).toString();
  return url;
}

export async function api<E extends Endpoint>(ep: E, ...[opts]: Args<E>): Promise<z.infer<E['response']>> {
  const o = (opts ?? {}) as LooseOpts;
  const url = buildUrl(ep, o);
  const headers: Record<string, string> = { Accept: 'application/json', ...await sessionHeaders(ep.path) };
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  if (o.ifMatch !== undefined) headers['If-Match'] = String(o.ifMatch);
  let res: Response;
  try {
    res = await fetch(url, { method: ep.method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  } catch {
    /* offline, DNS failure, an aborted request: fetch rejects rather than resolving with a
       response, so there is no status or body to parse. status 0 marks "never reached the
       server" for anything that inspects it. */
    throw new ApiError(0, NETWORK);
  }
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const r = Refusal.safeParse(data);
    throw new ApiError(res.status, r.success ? r.data : UNREADABLE);
  }
  const parsed = ep.response.safeParse(data);
  if (!parsed.success) throw new ApiError(res.status, UNREADABLE);
  /* Zod 4's safeParse types its `data` via a `this`-typed return, which does not
     specialise through a generic `E['response']`; TS sees `data: unknown` here even
     though the runtime value was validated against ep.response. The guard above is
     what makes this assertion sound. */
  return parsed.data as z.infer<E['response']>;
}
