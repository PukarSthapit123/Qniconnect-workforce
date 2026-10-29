/* npm run handoff: writes docs/superpowers/handoff/backend-inputs.md, the
   backend step's input. It is generated from the two endpoint registries, so it
   lists every call the app makes exactly once (scripts/handoff.test.ts):
   - /api/v1 (ENDPOINTS, src/contract): grouped by module, with each
     operation's capability and refusal statuses, and the refusal codes the
     fake server's handlers answer in that module;
   - /bc, /session and /auth (BC_ENDPOINTS, src/contract/bc): the wire as
     QniConnect sends it today (token audience, headers, credentials) and the
     response fields the app reads, as the checklist for the real-backend check;
   - the open questions of the design's section 14, copied from the spec, and
     the known gaps and backlog recorded during the build. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { ENDPOINTS, type Endpoint } from '../src/contract';
import { moduleOf, type Module } from '../src/contract/modules';
import { BC_ENDPOINTS, type BcEndpoint, type BcHeader } from '../src/contract/bc/endpoints';
import { refusalStatuses } from './openapi';

const ROOT = resolve(import.meta.dirname, '..');
export const HANDOFF_PATH = 'docs/superpowers/handoff/backend-inputs.md';
const SPEC = 'docs/superpowers/specs/2026-10-19-qniconnect-workforce-merge-design.md';

/* Each file in src/contract/bc registers its endpoints on import; importing
   them all here means a new file cannot be left out of the note. */
const BC_DIR = resolve(ROOT, 'src/contract/bc');
for (const f of readdirSync(BC_DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts')).sort())
  await import(pathToFileURL(resolve(BC_DIR, f)).href);

/* ---------- /api/v1 ---------- */

/* The grouping is the app's own (src/contract/modules.ts), the one
   VITE_FAKE_MODULES switches by, so the note and the switch cannot disagree. */
export { moduleOf, type Module };
const MODULES: { key: Module; title: string; mocks: RegExp }[] = [
  { key: 'core', title: 'Core', mocks: /^(?!timesheets|clock|onboarding).*/ },
  { key: 'timesheet', title: 'Timesheet', mocks: /^(timesheets|clock)\.ts$/ },
  { key: 'onboarding', title: 'Onboarding', mocks: /^onboarding.*\.ts$/ },
];

/* Refusal codes, read from the fake server's handler sources. The shared ones
   come from the session, capability, validation and If-Match checks every
   module goes through; the rest are each module's own. Dev-only fault
   injection (dev.ts, faults.ts) is not the backend's. */
const MOCKS = resolve(ROOT, 'src/mocks');
const SHARED_MOCKS = ['auth.ts', 'http.ts', 'serve.ts', 'world.ts'];
const NOT_BACKEND = ['dev.ts', 'faults.ts', 'handlers.ts', 'browser.ts', 'node.ts', 'store.ts'];
const codesIn = (files: string[]) => [...new Set(files.flatMap(f =>
  [...readFileSync(resolve(MOCKS, f), 'utf8').matchAll(/code: *'([A-Za-z_-]+)'/g)].map(m => m[1] ?? '')))].sort((a, b) => a.localeCompare(b));
const mockFiles = readdirSync(MOCKS).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts') && !NOT_BACKEND.includes(n) && !SHARED_MOCKS.includes(n)).sort();

const STATUS: Record<number, string> = {
  401: 'signed out', 403: 'not allowed (capability, viewing as someone else, not started, or switched off)', 404: 'not found',
  409: 'refused by the state of the data', 412: 'stale If-Match', 422: 'not valid (field names the part)', 428: 'If-Match missing',
};
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function apiRow(e: Endpoint) {
  const flags = [e.versioned && 'If-Match', e.public && 'public', e.allowedWhileViewing && 'allowed while viewing as',
    e.allowedWhileOnboarding && 'allowed while onboarding'].filter(Boolean).join(', ');
  return `| \`${e.method} ${e.path}\` | ${e.capability ? `\`${e.capability}\`` : '(signed in)'} | ${refusalStatuses(e).join(', ')} | ${flags} | ${cell(e.summary)} |`;
}

function apiSection(): string[] {
  const out = ['## /api/v1: the Workforce API', '',
    'The fake server answers these today (src/mocks); the backend builds them. The draft OpenAPI document is `contract/openapi.json` (`npm run openapi`), with the request and response schemas. Every operation needs a bearer token (Entra, login scope) unless marked public, sends the refusal shape `{ code, message, next, field?, usedBy? }` on any refusal, and a write marked If-Match carries the record version as a bare whole number.', '',
    'Refusal statuses: ' + Object.entries(STATUS).map(([s, d]) => `${s} ${d}`).join('; ') + '.', '',
    `Shared refusal codes (every module): ${codesIn(SHARED_MOCKS).map(c => `\`${c}\``).join(', ')}.`, '',
    'Left out on purpose: the fake server\'s own development endpoints (`devOnly`: the demo account list and the saved-data controls).', ''];
  for (const m of MODULES) {
    const eps = ENDPOINTS.filter(e => !e.devOnly && moduleOf(e.path) === m.key).sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
    const codes = codesIn(mockFiles.filter(f => m.mocks.test(f)));
    out.push(`### ${m.title} (${eps.length} operations)`, '',
      `Refusal codes this module's handlers answer: ${codes.map(c => `\`${c}\``).join(', ') || 'none beyond the shared ones'}.`, '',
      '| Operation | Capability | Refusal statuses | Flags | Summary |', '|---|---|---|---|---|', ...eps.map(apiRow), '');
  }
  return out;
}

/* ---------- /bc, /session, /auth ---------- */

const AUDIENCE: Record<BcEndpoint['token'], string> = {
  none: 'none: no Authorization header',
  login: 'login: `Bearer` token for `User.Read openid profile email` (Microsoft Graph)',
  bc: 'bc: `Bearer` token for `https://api.businesscentral.dynamics.com/.default`',
};
const HEADER_SOURCE: Record<BcHeader, string> = {
  'X-BC-Environment': 'the active environment\'s id (`activeEnvironment`)',
  'X-Registration-ID': '`registrationId`',
  'X-Client-Environment': 'the active environment\'s name (`activeEnvironment`)',
  'X-Client-Company-ID': '`clientCompanyId`',
  'X-Employee-No': '`employeeNo`',
  'X-LocalStorage-EmployeeNo': '`employeeNo`',
  'X-User-Email': 'the signed-in account\'s email, lower case',
  'X-Session-Request-Time': 'the time of the request, `Date.now()` in milliseconds',
};
const INVENTORY: Record<string, string> = {
  AUTH: 'auth.md', HOME: 'portal.md', DOCS: 'portal.md', PROF: 'portal.md', BELL: 'portal.md',
  ADM: 'admin.md', USERS: 'admin.md', ENV: 'admin.md', AUTHZ: 'admin.md', REG: 'public.md',
};

interface Field { name: string; optional: boolean }
type Json = { type?: string | string[]; properties?: Record<string, Json>; required?: string[]; items?: Json; anyOf?: Json[]; oneOf?: Json[] };
/* The fields a schema names, as dotted paths (a list's items as name[].field),
   with those that may be missing or null marked. Unknown fields always pass. */
function fieldsOf(schema: z.ZodType): Field[] {
  const out = new Map<string, boolean>();
  const walk = (s: Json, prefix: string, optional: boolean, depth: number) => {
    const branches = s.anyOf ?? s.oneOf;
    if (branches) {
      const nullable = branches.some(b => b.type === 'null');
      for (const b of branches) if (b.type !== 'null') walk(b, prefix, optional || nullable, depth);
      return;
    }
    if (s.items) { walk(s.items, prefix ? `${prefix}[]` : '', optional, depth); return; }
    if (!s.properties || depth > 3) return;
    for (const [k, child] of Object.entries(s.properties)) {
      const name = prefix ? `${prefix}.${k}` : k;
      const opt = optional || !(s.required ?? []).includes(k) || (child.anyOf ?? []).some(b => b.type === 'null');
      out.set(name, (out.get(name) ?? true) && opt);
      walk(child, name, opt, depth + 1);
    }
  };
  walk(z.toJSONSchema(schema, { unrepresentable: 'any', io: 'output' }) as Json, '', false, 0);
  return [...out].map(([name, optional]) => ({ name, optional }));
}
const fieldList = (fs: Field[]) => fs.map(f => `\`${f.name}\`${f.optional ? ' (may be missing)' : ''}`).join(', ');

function inventoryLinks(ids: string): string {
  return ids.split(',').map(s => s.trim()).map(id => {
    const file = INVENTORY[id.split('.')[0] ?? ''];
    return file ? `[${id}](../inventory/${file})` : id;
  }).join(', ');
}

function bcSection(): string[] {
  const out = ['## /bc, /session and /auth: the QniConnect API, unchanged on the wire', '',
    'Each call goes to `REACT_APP_API_BASE_URL` + path and is exactly what QniConnect sends today (spec section 5, Ruling Q1). This is the checklist for the real-backend check: for each row, confirm the backend accepts the request as described and answers at least the fields listed. Response schemas are lenient: unknown fields pass, and a field marked "may be missing" was guarded in QniConnect\'s code. The fake for these is `src/mocks/bc` (`VITE_FAKE_BC=off` sends them to the real backend in dev).', '',
    'Context headers carry the stored value, or an empty string when there is none, unless marked "only when set" (then left out when empty). The admin pages pass their own environment for `X-BC-Environment`.', ''];
  const groups: [string, (e: BcEndpoint) => boolean][] = [
    ['Sign-in and session', e => /^AUTH\./.test(e.inventory)],
    ['Employee portal', e => /^(HOME|DOCS|PROF|BELL)\./.test(e.inventory)],
    ['Admin', e => /^(ADM|USERS|ENV|AUTHZ)\./.test(e.inventory)],
    ['Public pages', e => /^REG\./.test(e.inventory)],
  ];
  const placed = new Set<BcEndpoint>();
  for (const [title, test] of groups) {
    const eps = BC_ENDPOINTS.filter(e => !placed.has(e) && test(e));
    if (!eps.length) continue;
    out.push(`### ${title}`, '');
    for (const e of eps) { placed.add(e); out.push(...bcEntry(e)); }
  }
  const rest = BC_ENDPOINTS.filter(e => !placed.has(e));
  if (rest.length) { out.push('### Other', ''); for (const e of rest) out.push(...bcEntry(e)); }
  return out;
}

function bcEntry(e: BcEndpoint): string[] {
  const lines = [`#### \`${e.method} ${e.path}\` (${e.inventory})`, '', cell(e.summary), '',
    `- Inventory: ${inventoryLinks(e.inventory)}`,
    `- Token: ${AUDIENCE[e.token]}`,
    `- Fixed headers: ${e.literalHeaders.length ? e.literalHeaders.map(h => `\`${h}: application/json\``).join(', ') : 'none'}`,
    `- Context headers, in order: ${e.headers.length ? e.headers.map(h => `\`${h}\` = ${HEADER_SOURCE[h]}${e.whenSet?.includes(h) ? ' (only when set)' : ''}`).join('; ') : 'none'}`,
    `- Fetch option: ${e.credentials === 'include' ? "credentials 'include'" : 'no credentials option (the browser\'s same-origin default)'}`];
  if (e.readsCompanyHeader) lines.push('- Reads the `X-Client-Company-ID` response header and stores it as `clientCompanyId`');
  if (e.anonymous) lines.push('- Made signed out: a 401 is the page\'s own error, not a sign-in prompt');
  if (e.params) lines.push(`- Path parameters: ${Object.keys(e.params.shape).map(k => `\`${k}\``).join(', ')} (put in as given, not URL-encoded)`);
  if (e.query) lines.push(`- Query: ${Object.keys(e.query.shape).map(k => `\`${k}\``).join(', ')} (${e.queryStyle === 'form' ? 'URLSearchParams encoding' : 'encodeURIComponent per value'})`);
  if (e.request) lines.push(`- Request body: ${fieldList(fieldsOf(e.request)) || 'JSON'}`);
  if (e.responseType === 'blob') lines.push('- Response: a file (blob), not JSON');
  else {
    const fs = fieldsOf(e.response);
    lines.push(`- Response fields read: ${fs.length ? fieldList(fs) : 'none (only the status is used)'}`);
  }
  lines.push('');
  return lines;
}

/* ---------- open questions and backlog ---------- */

function openQuestions(): string[] {
  const spec = readFileSync(resolve(ROOT, SPEC), 'utf8').replace(/\r\n/g, '\n');
  const start = spec.indexOf('## 14.');
  if (start === -1) throw new Error(`${SPEC} has no section 14.`);
  const next = spec.indexOf('\n## ', start + 1);
  const body = spec.slice(start, next === -1 ? undefined : next).split('\n').slice(1).join('\n').trim();
  return ['## Open questions (design section 14)', '', `Copied from [the design](../specs/${SPEC.split('/').pop() ?? ''}).`, '', body, ''];
}

const BACKLOG = [
  '## Known gaps and backlog', '',
  'Deferred during the build and recorded in the build ledger. None blocks the backend step.', '',
  '- **Contact address (Ruling Q18, waiting on the user).** The login page shows QniConnect\'s "support@qnipay.com", linking to https://qnipay.com/legal/, as today. The alternatives are a mailto to support@dogmagroup.co.uk or to support@qnipay.com; it is a one-line change.',
  '- **Timesheet daylight-saving and capture items (Task 22).** Breaks that span the clock-change hour are still counted by the wall clock. Not built: the "Clocks change tonight" advisory, "Show more" in the day list (Part C row 16), undo after clocking out (Part C row 23) and the handling of negative durations (Part E #30).',
  '- **Design-system consolidation (Ruling D1, Task 7).** The nine consolidation items in `docs/superpowers/reviews/task-7-design-system.md` that do not visibly affect a ported page stay as a backlog: refactors and component merges, not behaviour.',
  '- **Payroll document rows removed from `/api/v1/documents/mine` (Task 17, Task 25).** The Workforce documents list no longer carries the "Not yet connected" payroll rows; payslips, P60, P11D and P45 come from Business Central through `/bc`. The backend should not build them.',
  '- **Set as Default does not reach the backend (Ruling Q10).** It changes the local active environment only, as QniConnect does today; `POST /bc/environments/activate` is never sent.',
  '',
];

/* Ruling F1 (spec N9, R4) and Task 25 review Minor 2. */
const INTRO = [
  "**Fake or real, per module.** While the app runs with its fake server (`npm run dev`, the tests, `npm run build:demo`), `VITE_FAKE_MODULES` picks which /api/v1 modules the fake answers. Unset, it answers all of them. A comma-separated list such as `core,ts` fakes only those modules (`core`; `timesheet` or `ts`; `onboarding` or `on`; or `none`), and the others go to the real backend at `/api/v1` on the app's own origin. They are never sent the test sign-in's unsigned token, so sign in with Microsoft (`VITE_AUTH=msal`) to use them. The modules are the three sections below. To take a module live (delivery plan phase 5 step 5), leave it out of the list. Under `npm run dev` the app's origin is the Vite dev server, so the backend step adds a `server.proxy` entry for `/api/v1` in vite.config.ts. `VITE_FAKE_BC=off` does the same for all of /bc, /session and /auth at once. A plain production build has no fake server, so every call goes to the real backend.", '',
  "**\"May be missing\"** in the /bc field lists below: \"May be missing\" means the app's response schema tolerates the field's absence, not that the field is optional for the backend. The backend sends every field listed.", '',
];

export function buildHandoff(): string {
  const lines = [
    '# Backend inputs: QniConnect and Workforce', '',
    `Generated by \`npm run handoff\` (scripts/handoff.ts) from the endpoint registries. Do not edit by hand. ${ENDPOINTS.filter(e => !e.devOnly).length} /api/v1 operations, ${BC_ENDPOINTS.length} /bc, /session and /auth calls.`, '',
    ...INTRO, ...apiSection(), ...bcSection(), ...openQuestions(), ...BACKLOG,
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}

if (process.argv[1]?.endsWith('handoff.ts')) {
  const target = resolve(ROOT, HANDOFF_PATH);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buildHandoff());
  console.log(`${HANDOFF_PATH} written`);
}
