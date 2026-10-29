/* bcServe(endpoint, fn): the one way a /bc or /session endpoint gets a fake
   handler, as serve() is for /api/v1. It registers at
   REACT_APP_API_BASE_URL + ep.path (an absolute URL, which the MSW worker
   intercepts cross-origin in dev), then in order:
     1. 401 when the endpoint takes a token and the request has no Bearer;
     2. reads the caller's email from the token's payload, unverified (the
        auth stub's tokens are unsigned; preferred_username, then email);
     3. path params, the query and the body, against the endpoint's schemas
        (400 with QniConnect's { message } shape);
     4. fn, which answers a value, or a Response for anything but 200;
     5. in dev and test, the value against ep.response (a loud 500).
   Two endpoints that share a method and path (two call sites of one backend
   route, such as AUTH.C1 and AUTH.C3) share one handler: serve one of them. */
import { http, HttpResponse, type HttpHandler, type JsonBodyType } from 'msw';
import type { z } from 'zod';
import type { BcEndpoint } from '@/contract/bc/endpoints';

type Out<S> = S extends z.ZodType ? z.output<S> : undefined;
export interface BcServed<E extends BcEndpoint> {
  request: Request;
  params: E extends { params: z.ZodType } ? Out<E['params']> : Record<string, never>;
  query: E extends { query: z.ZodType } ? Out<E['query']> : Record<string, never>;
  body: E extends { request: z.ZodType } ? Out<E['request']> : undefined;
  /* from the Bearer token, unverified; null for a 'none' endpoint without one */
  email: string | null;
}

const CHECK_RESPONSES = import.meta.env.DEV || import.meta.env.MODE === 'test';
const METHOD = { GET: http.get, POST: http.post, PUT: http.put, PATCH: http.patch, DELETE: http.delete } as const;

/* The backend's refusal shape as QniConnect read it: { message } (AUTH.R12). */
export const bcRefuse = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  HttpResponse.json({ ...extra, message }, { status });

const decodeSegment = (segment: string): unknown => {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};
/* The email a token names, without checking its signature. */
export function tokenEmail(token: string): string | null {
  try {
    const claims = decodeSegment(token.split('.')[1] ?? '') as Record<string, unknown>;
    const email = [claims.preferred_username, claims.email, claims.upn].find((v): v is string => typeof v === 'string' && v !== '');
    return email ?? null;
  } catch {
    return null;
  }
}

const firstIssue = (e: z.ZodError) => {
  const issue = e.issues[0];
  return `${issue?.path.join('.') || 'the request'}: ${issue?.message ?? 'not valid'}`;
};

export function bcServe<const E extends BcEndpoint>(ep: E, fn: (ctx: BcServed<E>) => unknown): HttpHandler {
  const base = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
  const name = `${ep.method} ${ep.path}`;
  return METHOD[ep.method](base + ep.path, async ({ request, params }) => {
    const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null;
    if (ep.token !== 'none' && !bearer) return bcRefuse(401, 'Authorization has been denied for this request.');
    const email = bearer ? tokenEmail(bearer) : null;

    let p: unknown = {}, q: unknown = {}, body: unknown = undefined;
    if (ep.params) {
      const r = ep.params.safeParse(params);
      if (!r.success) return bcRefuse(400, `${name}: ${firstIssue(r.error)}`);
      p = r.data;
    }
    if (ep.query) {
      const r = ep.query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!r.success) return bcRefuse(400, `${name}: ${firstIssue(r.error)}`);
      q = r.data;
    }
    if (ep.request) {
      const r = ep.request.safeParse(await request.json().catch(() => undefined));
      if (!r.success) return bcRefuse(400, `${name}: ${firstIssue(r.error)}`);
      body = r.data;
    }

    let data: unknown;
    try {
      data = fn({ request, params: p, query: q, body, email } as BcServed<E>);
    } catch (e) {
      console.error(e);
      return bcRefuse(500, `${name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (data instanceof Response) return data;
    if (CHECK_RESPONSES) {
      const r = ep.response.safeParse(data);
      if (!r.success) {
        const message = `${name} answered with a response its contract does not allow (${firstIssue(r.error)}).`;
        console.error(message);
        return bcRefuse(500, message);
      }
    }
    return HttpResponse.json(data as JsonBodyType);
  });
}
