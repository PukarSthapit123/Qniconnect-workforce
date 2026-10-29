/* 1c journeys (configuration and communication). They run on social
   (Brightpath, every module on, the Social Care & Charity template) unless a
   test says otherwise, with the employees of support/read.ts: Dee Fitzgerald is
   the admin; Rachel Hussain (CP-1001) manages Willow House, whose
   eleven employees include Amara Okafor (CP-1042); Grace Whitmore
   (CP-1288) works at Beacon Court. Rachel's inbox holds one unread item,
   "3 timesheets awaiting your approval" (ntf_seed_0008), which opens Approvals.
   Rachel's queue is delegated to Dee from 24 to 31 August (dlg_1). */
import { expect, type Page } from '@playwright/test';
import { tid } from '../../src/testids';
import type { Reply } from './read';
import { stored } from './read';

export { AMARA, DEE, GRACE, RACHEL } from './read';

type Get = { get(path: string): Promise<Reply> };
export interface TenantRead { version: number; name: string; template: string; modules: Record<string, boolean>; flags: Record<string, boolean> }
export async function tenantOf(api: Get): Promise<TenantRead> {
  const r = await api.get('/api/v1/tenant');
  expect(r.status, 'tenant').toBe(200);
  return r.body as TenantRead;
}
export interface InboxRead { items: { id: string; title: string; read: boolean; area: string; link: { path: string; label: string } | null }[]; unread: number }
export async function inboxOf(api: Get): Promise<InboxRead> {
  const r = await api.get('/api/v1/notifications/me');
  expect(r.status, 'my notifications').toBe(200);
  return r.body as InboxRead;
}

export interface AuditStored { act: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string }
/* the audit rows the fake server holds, for the entities given (all when none) */
export const auditRows = async (page: Page, ...entities: string[]) =>
  (await stored<AuditStored>(page, 'audit')).filter(a => !entities.length || entities.includes(a.entity));

/* Everything the fake server holds but the sessions, which a sign-in writes,
   and the empty collections a read brings into being: a write that was
   refused must leave all of it exactly as it was. */
export const wholeStore = (page: Page): Promise<Record<string, unknown>> =>
  page.evaluate(() => {
    const raw = localStorage.getItem('qnipay.app.store');
    const db = raw ? (JSON.parse(raw) as { data: Record<string, unknown> }).data : {};
    delete db.sessions;
    return Object.fromEntries(Object.entries(db).filter(([, v]) => !(v && typeof v === 'object' && !Object.keys(v).length)));
  });

/* an info toast, found by its words (never by its position) */
export const info = (page: Page, text: string | RegExp) => page.getByTestId(tid.toast.info).filter({ hasText: text });
export const refusedToast = (page: Page, text: string | RegExp) => page.getByTestId(tid.toast.error).filter({ hasText: text });

/* A module's drill-in, ready to switch. */
export async function openModule(page: Page, code: string) {
  await page.goto(`/setup/amods?m=${code}`);
  await page.getByTestId(tid.amods.moduleCard).waitFor();
}
