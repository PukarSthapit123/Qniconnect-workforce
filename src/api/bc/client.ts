/* bcApi: the one way the app calls the QniConnect API (/bc and /session). It
   puts on the wire exactly what the endpoint's inventory row records (see
   src/contract/bc/endpoints.ts), at REACT_APP_API_BASE_URL + path, and keeps
   QniConnect's transport rules (auth inventory AUTH.R7 to AUTH.R12, portal
   SHARED.R1 to SHARED.R10):
   - a token is fetched for 'login' or 'bc' endpoints; none, or QniConnect's
     sentinel tokens, stop the call before anything is sent (AUTH.R7). An
     error from the token (InteractionRequiredAuthError after its redirect)
     is passed on as it is;
   - the auth stub's unsigned token is never sent while the fake /bc is off
     (src/auth/unsigned.ts);
   - X-Client-Company-ID on any response, OK or not, is stored (AUTH.R11),
     for the endpoints that read it;
   - a 401 emits 'auth-required' first, then throws (AUTH.R31; the spec signs
     the user out on any 401, so every endpoint emits it, except a public
     page's anonymous call, whose 401 is that page's own error);
   - a refusal throws BcError, its message `message || error || 'API Error:
     <status>'` from a JSON body, or {} when the body is not JSON (AUTH.R12).
   The one base URL is REACT_APP_API_BASE_URL (Ruling Q5): QniConnect's
   hard-coded fallback hosts are gone, so a missing one fails loudly. */
import type { z } from 'zod';
import { auth } from '@/auth';
import { sendableToken } from '@/auth/unsigned';
import { FAKE_SERVER_ON } from '@/lib/fake-server';
import type { BcEndpoint, BcHeader } from '@/contract/bc/endpoints';
import { bcContext } from './context';
import { bcEvents } from './events';

export class BcError extends Error {
  /* `text` is the refusal's body as sent, for a caller that reads it when it
     is not JSON (environment selection, AUTH.R57). */
  constructor(public status: number, public data: unknown, message?: string, public text = '') {
    super(message ?? BcError.messageFor(status, data));
    this.name = 'BcError';
  }
  /* AUTH.R12 / SHARED.R9. A message or error that is not text (an object)
     falls through to the status line; the object stays in `data`. */
  static messageFor(status: number, data: unknown): string {
    const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const said = [d.message, d.error].find((v): v is string => typeof v === 'string' && v !== '');
    return said ?? `API Error: ${status}`;
  }
}

/* QniConnect's own wording for a call it could not authenticate (AUTH.R7). */
const NO_TOKEN = 'Authentication failed. Please log in again.';
const SENTINELS = new Set(['Not Readable', 'mock-token-for-development']);
const UNREADABLE = 'The server sent something this screen cannot read. Nothing has been changed on screen.';

/* The fake /bc answers only in a build that has the fake server, and only
   while VITE_FAKE_BC is not 'off'. Read per call, so a test can switch it. */
export const fakeBcOn = () => FAKE_SERVER_ON && import.meta.env.VITE_FAKE_BC !== 'off';

export function bcBaseUrl(): string {
  const base = import.meta.env.REACT_APP_API_BASE_URL;
  if (!base) throw new Error('REACT_APP_API_BASE_URL is not set, so the QniConnect API cannot be reached. Set it in the .env file for this mode.');
  return base.replace(/\/+$/, '');
}

type Input<S> = S extends z.ZodType ? z.input<S> : never;
export interface BcOpts<E extends BcEndpoint> {
  params?: E extends { params: z.ZodType } ? Input<E['params']> : never;
  query?: E extends { query: z.ZodType } ? Input<E['query']> : never;
  body?: E extends { request: z.ZodType } ? Input<E['request']> : never;
  signal?: AbortSignal;
  /* A context header's value for this call, in place of the stored one: for
     a caller that held its own (the admin pages' service instances kept their
     own active environment, admin BCS.R5). '' with whenSet leaves it out. */
  headerValues?: Partial<Record<BcHeader, string>>;
}
export type BcResult<E extends BcEndpoint> = E extends { responseType: 'blob' } ? Blob : z.infer<E['response']>;

/* Path params go in as given (QniConnect did not encode them); a missing one
   stops the call rather than address a different resource. */
export function buildBcPath(ep: BcEndpoint, params: Record<string, unknown> = {}, query: Record<string, unknown> = {}): string {
  let path: string = ep.path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined || v === null || v === '') throw new Error(`${ep.method} ${ep.path} needs the path parameter "${k}".`);
    return String(v);
  });
  const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)] as [string, string]);
  if (entries.length) {
    path += '?' + (ep.queryStyle === 'form'
      ? new URLSearchParams(entries).toString()
      : entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'));
  }
  return path;
}

async function bearer(kind: 'login' | 'bc'): Promise<string> {
  const token = await auth().token(kind);
  if (!token || SENTINELS.has(token)) throw new Error(NO_TOKEN);
  return sendableToken(token, fakeBcOn());
}

export async function bcApi<E extends BcEndpoint>(ep: E, opts: BcOpts<E> = {}): Promise<BcResult<E>> {
  const o = opts as { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown; signal?: AbortSignal; headerValues?: Partial<Record<BcHeader, string>> };
  const url = bcBaseUrl() + buildBcPath(ep, o.params, o.query);

  /* In QniConnect's order: the literal headers, Authorization, then the row's
     context headers. */
  const headers: Record<string, string> = {};
  for (const h of ep.literalHeaders) headers[h] = 'application/json';
  if (ep.token !== 'none') headers.Authorization = `Bearer ${await bearer(ep.token)}`;
  for (const h of ep.headers) {
    const v = o.headerValues?.[h] ?? bcContext.headerValue(h);
    if (v === '' && ep.whenSet?.includes(h)) continue;
    headers[h] = v;
  }

  const init: RequestInit = { method: ep.method, headers };
  if (o.body !== undefined) init.body = JSON.stringify(o.body);
  if (ep.credentials === 'include') init.credentials = 'include';
  if (o.signal) init.signal = o.signal;
  const res = await fetch(url, init);

  if (ep.readsCompanyHeader) {
    const companyId = res.headers.get('X-Client-Company-ID');
    if (companyId) bcContext.setClientCompanyId(companyId);
  }
  if (!res.ok) {
    if (res.status === 401 && !ep.anonymous) bcEvents.emit('auth-required');
    const text = await res.text().catch(() => '');
    let data: unknown = {};
    try { data = JSON.parse(text) as unknown; } catch { /* not JSON: {}, as QniConnect's .catch(() => ({})) */ }
    throw new BcError(res.status, data, undefined, text);
  }
  if (ep.responseType === 'blob') return (await res.blob()) as BcResult<E>;
  const data: unknown = await res.json().catch(() => undefined);
  const parsed = ep.response.safeParse(data);
  if (!parsed.success) throw new BcError(res.status, data, UNREADABLE);
  return parsed.data as BcResult<E>;
}
