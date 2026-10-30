/* Reading outcomes back through the API, so a journey asserts what the server
   holds, not what the screen claims. */
import { expect, type Page } from '@playwright/test';

export interface Reply { status: number; body: unknown }
export interface Api { get(path: string): Promise<Reply> }
export interface EmployeeRow {
  id: string; version: number; code: string; name: string; state: string; end: string; location: string; email: string;
  contractedHours: number; maxHours: number; phone: string; address: string; bankAccount: string; workPattern: string; resource: string;
}
export interface AuditRow { act: string; entityId: string; reason?: string; before?: unknown; after?: unknown }

export async function everyone(api: Api): Promise<EmployeeRow[]> {
  const r = await api.get('/api/v1/employees?state=all');
  expect(r.status, 'employees list').toBe(200);
  return r.body as EmployeeRow[];
}
export async function employeeByCode(api: Api, code: string): Promise<EmployeeRow> {
  const p = (await everyone(api)).find(x => x.code === code);
  if (!p) throw new Error(`no employee ${code} visible to this session`);
  return p;
}
export async function auditOf(api: Api, entity: string): Promise<AuditRow[]> {
  const r = await api.get(`/api/v1/audit?entity=${entity}`);
  expect(r.status, 'audit log').toBe(200);
  return (r.body as { items: AuditRow[] }).items;
}
export async function rows<T>(api: Api, path: string): Promise<T[]> {
  const r = await api.get(path);
  expect(r.status, path).toBe(200);
  return r.body as T[];
}
/* opens a SelectBox and chooses an option by its value */
export async function pick(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).click();
  await page.getByTestId(`${testId}-option-${value}`).click();
}
export const answered = (page: Page, method: string, tail: RegExp) =>
  page.waitForResponse(r => r.request().method() === method && tail.test(new URL(r.url()).pathname));

/* The Brightpath (social seed) people the journeys sign in as: Rachel Hussain
   (CP-1001) manages Willow House; Amara Okafor (CP-1042) works there; Sana Iqbal
   is a bank worker there; Grace Whitmore (CP-1288) works at Beacon Court; Dee
   Fitzgerald is the admin. */
export const RACHEL = 'rachel.hussain@brightpath.org';
export const AMARA = 'amara.okafor@brightpath.org';
export const SANA = 'sana.iqbal@brightpath.org';
export const GRACE = 'grace.whitmore@brightpath.org';
export const DEE = 'dee.fitzgerald@brightpath.org';

/* Notifications have no read endpoint in this module (the inbox is 1c's), so a
   journey reads them where the fake server keeps them: its persisted store. */
export interface NoteRow { id: string; employeeId: string; area: string; title: string; body: string }
export const stored = <T>(page: Page, coll: string): Promise<T[]> =>
  page.evaluate(c => {
    const raw = localStorage.getItem('qnipay.app.store');
    const db = raw ? (JSON.parse(raw) as { data: Record<string, Record<string, unknown>> }).data : {};
    return Object.values(db[c] ?? {});
  }, coll) as Promise<T[]>;
