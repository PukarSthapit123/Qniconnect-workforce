// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENDPOINTS } from '../src/contract';
import { BC_ENDPOINTS } from '../src/contract/bc/endpoints';
import { buildHandoff, HANDOFF_PATH, moduleOf } from './handoff';

/* Task 25: the backend hand-off note (docs/superpowers/handoff/backend-inputs.md)
   is generated from the two registries, so it cannot miss or repeat a call. */
const note = buildHandoff();
const count = (needle: string) => note.split(needle).length - 1;
const must = <T,>(x: T | undefined, what: string): T => { if (x === undefined) throw new Error(`no ${what} is registered`); return x; };
const apiKey = (e: { method: string; path: string }) => `\`${e.method} ${e.path}\``;
const bcKey = (e: { method: string; path: string; inventory: string }) => `\`${e.method} ${e.path}\` (${e.inventory})`;

test('lists every registered endpoint once', () => {
  const production = ENDPOINTS.filter(e => !e.devOnly);
  expect(production.length).toBeGreaterThan(100);
  for (const e of production) expect(count(apiKey(e)), apiKey(e)).toBe(1);
  /* the fake server's own (devOnly) endpoints are not the backend's to build */
  for (const e of ENDPOINTS.filter(x => x.devOnly)) expect(count(apiKey(e)), apiKey(e)).toBe(0);
  expect(BC_ENDPOINTS.length).toBeGreaterThan(20);
  for (const e of BC_ENDPOINTS) expect(count(bcKey(e)), bcKey(e)).toBe(1);
});

test('groups /api/v1 by module: core, timesheet, onboarding', () => {
  expect(moduleOf('/api/v1/onboarding/cases')).toBe('onboarding');
  expect(moduleOf('/api/v1/timesheets/:id')).toBe('timesheet');
  expect(moduleOf('/api/v1/timesheet-days')).toBe('timesheet');
  expect(moduleOf('/api/v1/timesheet-config')).toBe('timesheet');
  expect(moduleOf('/api/v1/clock')).toBe('timesheet');
  expect(moduleOf('/api/v1/employees')).toBe('core');
  const core = note.indexOf('### Core'), ts = note.indexOf('### Timesheet'), onb = note.indexOf('### Onboarding');
  expect(core).toBeGreaterThan(-1);
  expect(ts).toBeGreaterThan(core);
  expect(onb).toBeGreaterThan(ts);
  for (const e of ENDPOINTS.filter(x => !x.devOnly)) {
    const at = note.indexOf(apiKey(e));
    const [from, to] = ({ core: [core, ts], timesheet: [ts, onb], onboarding: [onb, note.length] } as const satisfies Record<string, readonly [number, number]>)[moduleOf(e.path)];
    expect(at > from && at < to, `${apiKey(e)} sits under its module`).toBe(true);
  }
});

test('each /api/v1 row carries its capability and its refusal statuses', () => {
  const row = (e: { method: string; path: string }) => note.split('\n').find(l => l.includes(apiKey(e))) ?? '';
  const withCap = must(ENDPOINTS.find(e => !e.devOnly && e.capability), 'endpoint with a capability');
  expect(row(withCap)).toContain(`\`${withCap.capability ?? ''}\``);
  const versioned = must(ENDPOINTS.find(e => !e.devOnly && e.versioned), 'versioned endpoint');
  expect(row(versioned)).toMatch(/412.*428/);
  /* each module names the refusal codes its handlers answer */
  expect(note).toMatch(/`TS_INVALID`/);
  expect(note).toMatch(/`module-off`/);
  expect(note).toMatch(/`version-required`/);
});

test('each /bc and /session row records the wire: token audience, headers, credentials and the response fields read', () => {
  const section = (e: (typeof BC_ENDPOINTS)[number]) => {
    const start = note.indexOf(bcKey(e));
    const next = note.indexOf('\n#### ', start + 1);
    return note.slice(start, next === -1 ? undefined : next);
  };
  const payslips = must(BC_ENDPOINTS.find(e => e.path === '/bc/payslips'), '/bc/payslips');
  const s = section(payslips);
  expect(s).toContain('https://api.businesscentral.dynamics.com/.default');
  for (const h of payslips.headers) expect(s).toContain(`\`${h}\``);
  expect(s).toContain("credentials 'include'");
  expect(s).toMatch(/Response fields read/);
  expect(s).toContain('`grossPay`');
  const init = must(BC_ENDPOINTS.find(e => e.path === '/session/init'), '/session/init');
  expect(section(init)).toMatch(/no Authorization header/);
});

test('carries the open questions from spec section 14 and the backlog', () => {
  const spec = readFileSync(resolve(import.meta.dirname, '../docs/superpowers/specs/2026-10-19-qniconnect-workforce-merge-design.md'), 'utf8').replace(/\r\n/g, '\n');
  const q = spec.slice(spec.indexOf('## 14.'));
  for (const line of q.split('\n').filter(l => l.startsWith('- '))) expect(note).toContain(line);
  expect(note).toContain('## Known gaps and backlog');
  expect(note).toMatch(/Ruling Q18/);
});

test('the committed note is the generated one', () => {
  const committed = readFileSync(resolve(import.meta.dirname, '..', HANDOFF_PATH), 'utf8').replace(/\r\n/g, '\n');
  expect(committed).toBe(note);
});

/* Ruling F1 and Task 25 Minor 2: the intro says how /api/v1 switches between
   the fake and the real backend per module, and what "may be missing" means. */
test('the intro names VITE_FAKE_MODULES and says "may be missing" is about the schema, not the backend', () => {
  const intro = note.slice(0, note.indexOf('## /api/v1'));
  expect(intro).toContain('`VITE_FAKE_MODULES`');
  expect(intro).toContain('`core,ts`');
  expect(intro).toContain('"May be missing" means the app\'s response schema tolerates the field\'s absence, not that the field is optional for the backend');
});
