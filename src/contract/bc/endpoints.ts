/* The QniConnect API (/bc and /session) as QniConnect calls it today. Each
   endpoint is one call site's row in a behaviour inventory
   (docs/superpowers/inventory/*.md), and records exactly what that call puts
   on the wire, because the real backend expects it unchanged (spec N9):
   - token: which MSAL audience goes in Authorization ('none': no header);
   - literalHeaders: the fixed `application/json` headers QniConnect sent.
     fetchThroughBackend sent Content-Type and Accept; ApiService and the
     plain fetch calls only Content-Type; AUTH.C4 neither;
   - headers: the context headers the row lists, in its order. Each is sent
     with its value from localStorage, or '' (QniConnect's `|| ''`), unless
     it is also in whenSet: those are sent only when they have a value
     (fetchThroughBackend's X-Registration-ID rule, AUTH.R10). Nothing else
     is sent: X-BC-Environment only where the row lists it (Ruling Q1);
   - credentials: 'include' where QniConnect set it; 'default' where it set
     no credentials option at all (the browser's same-origin);
   - readsCompanyHeader: fetchThroughBackend stored the X-Client-Company-ID
     response header (AUTH.R11); the plain fetch calls never read it;
   - query: sent as key=encodeURIComponent(value) ('component', the
     default), or as URLSearchParams writes it ('form');
   - params: `:name` path segments, put in as given, not URL-encoded, as
     QniConnect built them;
   - anonymous: a public page's call, made signed out with no token
     (registration, REG.C1): a 401 is that page's own error, so it does not
     ask whoever holds the session to sign in again.
   Response schemas are lenient (Review focus 3): unknown fields pass, and a
   field is optional wherever the inventory's "Response fields read" table
   says QniConnect's code guarded it. */
import { z } from 'zod';

export type BcHeader = 'X-BC-Environment' | 'X-Registration-ID' | 'X-Client-Environment' | 'X-Client-Company-ID'
  | 'X-Employee-No' | 'X-User-Email' | 'X-LocalStorage-EmployeeNo' | 'X-Session-Request-Time';
export type BcLiteralHeader = 'Content-Type' | 'Accept';

export interface BcEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /* /auth/* is the Business Central authorization (admin AUTHZ, ADM.C3), on the same base */
  path: `/bc/${string}` | `/session/${string}` | `/auth/${string}`;
  summary: string;
  /* the inventory row id(s) this call is, e.g. 'AUTH.C3' */
  inventory: string;
  token: 'none' | 'login' | 'bc';
  literalHeaders: readonly BcLiteralHeader[];
  headers: readonly BcHeader[];
  whenSet?: readonly BcHeader[];
  credentials: 'include' | 'default';
  readsCompanyHeader?: true;
  anonymous?: true;
  request?: z.ZodType; response: z.ZodType; params?: z.ZodObject; query?: z.ZodObject;
  queryStyle?: 'component' | 'form';
  responseType?: 'json' | 'blob';
}

export const BC_ENDPOINTS: BcEndpoint[] = [];

/* Registering here is what puts an endpoint in front of the contract tests
   (every response lenient, every endpoint served by the fake). The literal
   type is kept, so bcApi can tell what each one takes and answers. */
export function defineBcEndpoint<const E extends BcEndpoint>(e: E): E {
  BC_ENDPOINTS.push(e); return e;
}

/* An object schema that keeps fields it does not know. Mark the fields the
   inventory records as guarded with .optional() in the shape itself. */
export const lenient = <S extends z.ZodRawShape>(shape: S) => z.looseObject(shape);
