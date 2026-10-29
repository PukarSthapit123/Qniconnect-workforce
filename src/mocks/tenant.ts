/* 1c group 1: the tenant record, and the module, feature and settings
   switches on it. Every rule is src/domain/modules.ts's; the handlers build its
   inputs from the store and write its outputs. One audit row per request; a
   refusal or a fault writes nothing, because serve() restores the store.

   One home per setting (D6): the weekly grid's capture and layout live on
   timesheetConfig, so a write here goes through to that record and module 2
   keeps reading one source. */
import { store } from './store';
import { bump, refuse } from './http';
import { serve } from './serve';
import { actor } from './auth';
import { writeAudit } from './audit';
import { recordAt } from './world';
import { casesInProgress } from './onboarding-cases';
import { getTenant, setFlag, setModule, updateTenantSettings, type ModuleEffect, type Tenant } from '@/contract/tenant';
import type { TimesheetConfig } from '@/contract/timesheets';
import {
  DEFAULT_EXTRAS, flagBy, flagChangeText, moduleSwitchText, subName, switchFlag, switchModule,
  type Refusal as DomainRefusal,
} from '@/domain/modules';

interface Meta { id: string; version: number; updatedAt: string }
/* What the tenant record holds. weekGrid and weekLayout are read from their
   own home into the view. */
export type StoredTenant = Omit<Tenant, 'extras'> & { extras: { breaksMax: number; vehiclesMax: number } };
interface StoredType extends Meta { code: string; name: string; capabilities: string[] }

const NO_TENANT = { code: 'not-found', message: 'This tenant has no settings loaded.', next: 'Reload the page. If it keeps happening, report it.' };
export const tenantRec = (): StoredTenant => recordAt(store.coll<StoredTenant>('tenant'), 'tenant') ?? refuse(404, NO_TENANT);
export const saveTenant = (t: StoredTenant, changes: Partial<StoredTenant>) => {
  const saved = bump(t, changes);
  store.coll<StoredTenant>('tenant')[saved.id] = saved;
  return saved;
};
export const tsConfig = () => recordAt(store.coll<TimesheetConfig>('timesheetConfig'), 'timesheetConfig');
const count = (coll: string) => Object.keys(store.coll(coll)).length;

/* D4: open work counts every timesheet day still awaiting a decision, mgrok (with payroll) included (module 8 group 4). */
export function requireWeekStartChangeAllowed(t: Pick<StoredTenant, 'weekStart'>, next: Tenant['weekStart']) {
  if (next === t.weekStart) return;
  const timesheets = Object.values(store.coll<{ state: string }>('timesheetDays'))
    .filter(d => d.state === 'pend' || d.state === 'back' || d.state === 'resub' || d.state === 'mgrok').length;
  if (timesheets) refuse(409, {
    code: 'week-start-in-use',
    message: `The week start cannot change while ${timesheets} timesheet ${timesheets === 1 ? 'day is' : 'days are'} open.`,
    next: 'Finish or close those timesheets, then try again.',
  });
}

export function view(t: StoredTenant): Tenant {
  const tc = tsConfig();
  return {
    ...t,
    flags: Object.fromEntries(Object.entries(t.flags).map(([k, v]) => [k, Boolean(v)])),
    restore: t.restore ?? {},
    extras: { weekGrid: tc?.weekGrid ?? DEFAULT_EXTRAS.weekGrid, weekLayout: tc?.weekLayout ?? DEFAULT_EXTRAS.weekLayout,
      breaksMax: t.extras?.breaksMax ?? DEFAULT_EXTRAS.breaksMax, vehiclesMax: t.extras?.vehiclesMax ?? DEFAULT_EXTRAS.vehiclesMax },
  };
}
const refuseWith = (r: DomainRefusal): never =>
  refuse(r.status, { code: r.code, message: r.message, next: r.next, ...(r.field ? { field: r.field } : {}) });

/* Sites off takes the site capability from every employee type (the prototype's mod-off). */
export function sitesOff(): string[] {
  const types = store.coll<StoredType>('employeeTypes');
  const changed: string[] = [];
  for (const t of Object.values(types)) {
    if (!t.capabilities.includes('site')) continue;
    types[t.id] = bump(t, { capabilities: t.capabilities.filter(c => c !== 'site') });
    changed.push(t.name);
  }
  return changed;
}
/* What is left exactly as it was when a module goes off, counted from the store. */
function keptFor(code: string): ModuleEffect['kept'] {
  const rows: [string, string][] = ({
    TS: [['timesheet days', 'timesheetDays']], A: [['timesheet days', 'timesheetDays']],
    B: [['timesheet days', 'timesheetDays'], ['clock records', 'clockRecords']],
  } as Record<string, [string, string][]>)[code] ?? [];
  /* Onboarding: the cases of employees still onboarding, kept for when the module returns */
  if (code === 'ON') return [{ what: 'onboarding cases in progress', count: casesInProgress() }];
  return rows.map(([what, coll]) => ({ what, count: count(coll) }));
}

export const tenantHandlers = [
  serve(getTenant, () => view(tenantRec())),

  serve(setModule, ({ session, params, body, checkVersion }) => {
    const t = tenantRec();
    checkVersion(t);
    const r = switchModule({ modules: t.modules, restore: t.restore ?? {} }, params.code, body.on);
    if (!r.ok) return refuseWith(r.refusal);
    const effect: ModuleEffect = { message: '', kept: [], capturesRestored: [], capturesRemembered: [], siteRemovedFrom: [] };
    if (!r.changed) return { record: view(t), auditId: null, effect: { ...effect, message: `${subName(params.code)} is already ${body.on ? 'on' : 'off'}.` } };
    /* saved first, so what the switch does sees the module as it now is */
    const saved = saveTenant(t, { modules: r.modules, restore: r.restore });
    if (params.code === 'C' && !body.on) effect.siteRemovedFrom = sitesOff();
    if (!body.on) effect.kept = keptFor(params.code);
    effect.capturesRestored = r.brought;
    effect.capturesRemembered = r.remembered;
    effect.message = moduleSwitchText(params.code, body.on,
      { sitesRemovedFrom: effect.siteRemovedFrom.length, brought: r.brought });
    const touched = Object.keys(r.modules).filter(k => t.modules[k] !== r.modules[k]);
    const auditId = writeAudit({ who: actor(session), act: body.on ? 'Module turned on' : 'Module turned off', entity: 'tenant', entityId: params.code,
      before: Object.fromEntries(touched.map(k => [k, Boolean(t.modules[k])])),
      after: { ...Object.fromEntries(touched.map(k => [k, Boolean(r.modules[k])])), detail: effect.message,
        ...(effect.kept.length ? { kept: effect.kept } : {}), ...(r.remembered.length ? { remembered: r.remembered } : {}),
        ...(effect.siteRemovedFrom.length ? { siteRemovedFrom: effect.siteRemovedFrom } : {}) } });
    return { record: view(saved), auditId, effect };
  }),

  serve(setFlag, ({ session, params, body, checkVersion }) => {
    const t = tenantRec();
    checkVersion(t);
    const r = switchFlag(t.modules, t.flags, params.code, body);
    if (!r.ok) return refuseWith(r.refusal);
    const f = flagBy(params.code) ?? refuse(404, NO_TENANT);
    const was = Boolean(t.flags[f.code]), current = view(t).extras;
    /* only what actually differs counts as a change */
    const extras = Object.fromEntries(Object.entries(r.extras).filter(([k, v]) => current[k as keyof typeof current] !== v)) as typeof r.extras;
    const message = flagChangeText(f, was, r.on, extras);
    if (was === r.on && !Object.keys(extras).length) return { record: view(t), auditId: null, message };
    if (extras.weekGrid !== undefined || extras.weekLayout !== undefined) {
      const tc = tsConfig();
      if (!tc) throw new Error('the store has no timesheet config');
      store.coll<TimesheetConfig>('timesheetConfig')[tc.id] = bump(tc, {
        ...(extras.weekGrid !== undefined ? { weekGrid: extras.weekGrid } : {}), ...(extras.weekLayout !== undefined ? { weekLayout: extras.weekLayout } : {}) });
    }
    const stored = { breaksMax: extras.breaksMax ?? current.breaksMax, vehiclesMax: extras.vehiclesMax ?? current.vehiclesMax };
    const saved = saveTenant(t, { flags: { ...t.flags, [f.code]: r.on }, extras: stored });
    const before = { ...(was !== r.on ? { on: was } : {}), ...Object.fromEntries(Object.keys(extras).map(k => [k, current[k as keyof typeof current]])) };
    const auditId = writeAudit({ who: actor(session), act: 'Feature changed', entity: 'tenant', entityId: f.code,
      before, after: { ...(was !== r.on ? { on: r.on } : {}), ...extras, detail: message } });
    return { record: view(saved), auditId, message };
  }),

  serve(updateTenantSettings, ({ session, body, checkVersion }) => {
    const t = tenantRec();
    checkVersion(t);
    const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
    const localeFields = ['timezone', 'dateFormat', 'clock', 'weekStart'] as const;
    if (body.weekStart !== undefined) requireWeekStartChangeAllowed(t, body.weekStart);
    for (const key of localeFields) {
      const value = body[key];
      if (value === undefined || value === t[key]) continue;
      before[key] = t[key]; after[key] = value;
    }
    if (body.fullTimeWeeklyHours !== undefined && body.fullTimeWeeklyHours !== t.fullTimeWeeklyHours) {
      before.fullTimeWeeklyHours = t.fullTimeWeeklyHours;
      after.fullTimeWeeklyHours = body.fullTimeWeeklyHours;
    }
    if (body.financialYear) {
      const financialYear = { ...t.financialYear, ...body.financialYear };
      if (financialYear.start > financialYear.end) refuse(422, {
        code: 'invalid', field: 'financialYear', message: 'The financial year must end on or after it starts.',
        next: 'Choose a valid start and end date.',
      });
      const label = `${financialYear.start.slice(0, 4)}/${financialYear.end.slice(2, 4)}`;
      financialYear.label = label;
      if (JSON.stringify(financialYear) !== JSON.stringify(t.financialYear)) {
        before.financialYear = t.financialYear;
        after.financialYear = financialYear;
      }
    }
    if (body.bankHolidays && JSON.stringify(body.bankHolidays) !== JSON.stringify(t.bankHolidays)) {
      before.bankHolidays = t.bankHolidays;
      after.bankHolidays = body.bankHolidays;
    }
    if (body.name !== undefined && body.name !== t.name) { before.name = t.name; after.name = body.name; }
    const company = { ...t.company };
    for (const [k, v] of Object.entries(body.company ?? {}) as [keyof Tenant['company'], unknown][]) {
      if (v === undefined || company[k] === v) continue;
      before[k] = company[k]; after[k] = v;
      Object.assign(company, { [k]: v });
    }
    if (!Object.keys(after).length) return { record: view(t), auditId: null };
    const nextFinancialYear = after.financialYear as Tenant['financialYear'] | undefined;
    const saved = saveTenant(t, {
      company, ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.dateFormat !== undefined ? { dateFormat: body.dateFormat } : {}),
      ...(body.clock !== undefined ? { clock: body.clock } : {}),
      ...(body.weekStart !== undefined ? { weekStart: body.weekStart } : {}),
      ...(body.fullTimeWeeklyHours !== undefined ? { fullTimeWeeklyHours: body.fullTimeWeeklyHours } : {}),
      ...(nextFinancialYear ? { financialYear: nextFinancialYear } : {}),
      ...(body.bankHolidays !== undefined ? { bankHolidays: body.bankHolidays } : {}),
    });
    const auditId = writeAudit({ who: actor(session), act: Object.keys(after).some(k => ['timezone', 'dateFormat', 'clock', 'weekStart', 'financialYear', 'bankHolidays', 'fullTimeWeeklyHours'].includes(k)) ? 'Calendar settings changed' : 'Organisation settings changed',
      entity: 'tenant', entityId: 'settings', before, after });
    return { record: view(saved), auditId };
  }),
];
