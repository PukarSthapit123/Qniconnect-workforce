/* 1c group 7: My home, the month calendar, and My documents (brief D7, D12,
   D13). One read gives an employee's month as the server paints it: each day's
   timesheet record, and the tenant's bank holidays, with the month's
   totals and live key and the figures around the calendar. The employee is the
   one signed in, or the one being viewed as. Documents are per employee and are
   listed only: opening one is not built. Payroll documents (payslips, P60,
   P11D, P45) are Business Central's, read through /bc (src/contract/bc), so
   this list no longer carries them (Task 25). */
import { z } from 'zod';
import { defineEndpoint } from './endpoints';
import { RecordMeta } from './common';
import { IsoDate } from './employees';
import { TsState } from './timesheets';

/* the same as src/domain/home.ts (the contract test holds them together) */
export const GlyphKey = z.enum(['ok', 'pend', 'resub', 'back', 'draft']);
export type GlyphKey = z.infer<typeof GlyphKey>;
export const GlyphTone = z.enum(['ok', 'pend', 'att', 'draft']);
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Give the month as YYYY-MM.');

export const HomeDay = z.object({
  date: IsoDate,
  /* the day's timesheet record, its state and the time on it ("7h 30m") */
  /* waitingOn: mgrok only, the chain role the day waits on (module 8 review M3) */
  ts: z.object({ state: TsState, minutes: z.number().int().nonnegative(), text: z.string(), waitingOn: z.string().optional() }).nullable(),
  glyph: GlyphKey.nullable(),
  /* the bank holiday's name, or '' */
  bankHoliday: z.string(),
  today: z.boolean(), future: z.boolean(),
  /* approved, or in a pay period that has closed */
  locked: z.boolean(),
});
export type HomeDay = z.infer<typeof HomeDay>;
export const MonthKey = z.object({
  states: z.array(z.object({ key: GlyphKey, glyph: z.string(), tone: GlyphTone, label: z.string(), count: z.number().int() })),
});
export const HomeMonth = z.object({
  month: Month, label: z.string(), thisMonth: Month, bounds: z.object({ min: Month, max: Month }), today: IsoDate,
  employee: z.object({ code: z.string(), name: z.string(), location: z.string() }),
  /* "Good afternoon, Amara" and "Support Worker · Shift worker · Willow House" */
  greeting: z.string(), who: z.string(),
  leadingBlanks: z.number().int().min(0).max(6),
  days: z.array(HomeDay),
  totals: z.object({ minutes: z.number().int() }),
  /* "36.5h recorded", or '' */
  summary: z.string(),
  key: MonthKey,
  /* today, whichever month is shown */
  todayDay: HomeDay,
  /* this week: time recorded and the contracted hours (0 for bank) */
  week: z.object({ minutes: z.number().int(), text: z.string(), contracted: z.number().nonnegative() }),
  /* the latest timesheet day sent back */
  sentBack: z.object({ date: IsoDate, reason: z.string() }).nullable(),
  /* what the day dialog may offer: hours (Timesheet on and own_ts) */
  can: z.object({ recordHours: z.boolean() }),
});
export type HomeMonth = z.infer<typeof HomeMonth>;

export const DocumentRow = RecordMeta.extend({
  employeeCode: z.string(), name: z.string(), category: z.string(), date: IsoDate, owner: z.string(), source: z.string(),
});
export type DocumentRow = z.infer<typeof DocumentRow>;
export const MyDocuments = z.object({
  employee: z.object({ code: z.string(), name: z.string() }),
  items: z.array(DocumentRow),
});
export type MyDocuments = z.infer<typeof MyDocuments>;

export const getHome = defineEndpoint({ method: 'GET', path: '/api/v1/home', query: z.object({ month: Month.optional() }), response: HomeMonth,
  capability: 'own_home', errors: [422],
  summary: 'My month: each day\'s timesheet state and bank holiday, with the totals, the live key and the figures around it. From the month before this one to twelve months ahead; outside it is 422 (field month).' });
export const listMyDocuments = defineEndpoint({ method: 'GET', path: '/api/v1/documents/mine', response: MyDocuments, capability: 'own_home', errors: [403],
  summary: 'My documents (the payroll ones come from Business Central). Refused while Documents is switched off.' });
export const getDocument = defineEndpoint({ method: 'GET', path: '/api/v1/documents/:id', params: z.object({ id: z.string().min(1).max(40) }), response: DocumentRow,
  capability: 'own_home', errors: [403, 404], summary: 'One of my documents. Someone else\'s is not found (404).' });
