/* 1c group 7: My home, the month calendar (brief D7, D13). The prototype's
   essHome, dayInfo, calKey, greeting and whoLine (qnipay-workforce-v15.html:
   5323-5433, 6244-6256, 6307-6327). One answer per day: the timesheet gives what was recorded, and the tenant
   gives its bank holidays. The server
   paints the days with these rules; the page only draws them. */
import { MONTH_SHORT, addDays, dayIndex, formatDay, pad, parseIso } from './time';
import type { TsState } from './timesheet';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/* ------------------------------------------------------------- months */
/* A month is "YYYY-MM". */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const monthOf = (iso: string) => iso.slice(0, 7);
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1, t = y * 12 + m + n;
  return `${Math.floor(t / 12)}-${pad((t % 12 + 12) % 12 + 1)}`;
}
/* "August 2026" */
export const monthLabel = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;
/* Every date in the month, first to last. */
export function monthDates(month: string): string[] {
  const first = `${month}-01`, out: string[] = [];
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}
/* How many blank cells come before the 1st in the tenant's calendar grid. */
export const leadingBlanks = (month: string) => dayIndex(`${month}-01`);

/* CAL_MIN and CAL_MAX, worked out rather than fixed: from the month before
   today's to twelve months ahead (July 2026 to August 2027). */
export interface MonthBounds { min: string; max: string }
export const MONTHS_AHEAD = 12;
export const monthBounds = (today: string): MonthBounds =>
  ({ min: shiftMonth(monthOf(today), -1), max: shiftMonth(monthOf(today), MONTHS_AHEAD) });
export const inBounds = (month: string, b: MonthBounds) => MONTH_RE.test(month) && month >= b.min && month <= b.max;
export const outOfBoundsProblem = (b: MonthBounds) => ({
  field: 'month', message: `The calendar runs from ${monthLabel(b.min)} to ${monthLabel(b.max)}.`,
});

/* ----------------------------------------------------- greeting and who */
/* greeting(): by the hour on the tenant's clock. */
export function greeting(time: string): string {
  const h = Number(time.slice(0, 2));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/* whoLine(): the job (or the type when there is no job), the type when it
   says something the job does not, and the location. */
export function whoLine(o: { job: string; type: string; location: string }): string {
  const bits = [o.job || o.type];
  if (o.type && o.job && o.type.toLowerCase() !== o.job.toLowerCase()) bits.push(o.type);
  bits.push(o.location);
  return bits.filter(Boolean).join(' · ');
}

/* -------------------------------------------------------- a day's glyph */
/* ✓ approved · ◷ awaiting a decision · ↻ resubmitted · ✕ sent back · ✎ draft. The
   tone is the calendar's own state colour. In this order the key lists them. */
export type GlyphKey = 'ok' | 'pend' | 'resub' | 'back' | 'draft';
export type GlyphTone = 'ok' | 'pend' | 'att' | 'draft';
export interface Glyph { key: GlyphKey; glyph: string; tone: GlyphTone; label: string }
export const GLYPHS: Record<GlyphKey, Glyph> = {
  ok: { key: 'ok', glyph: '✓', tone: 'ok', label: 'Approved' },
  pend: { key: 'pend', glyph: '◷', tone: 'pend', label: 'Submitted, awaiting a decision' },
  resub: { key: 'resub', glyph: '↻', tone: 'pend', label: 'Resubmitted, awaiting a decision' },
  back: { key: 'back', glyph: '✕', tone: 'att', label: 'Sent back' },
  draft: { key: 'draft', glyph: '✎', tone: 'draft', label: 'Draft, not submitted' },
};
export const GLYPH_ORDER: readonly GlyphKey[] = ['ok', 'pend', 'resub', 'back', 'draft'];

/* dayInfo's state, as the cell shows it: a recorded day carries its timesheet
   state; anything else is plain. */
export function dayGlyph(d: { ts: TsState | null }): GlyphKey | null {
  /* approved by the manager and waiting on payroll is still awaiting a decision (module 8) */
  if (d.ts === 'mgrok') return 'pend';
  return d.ts ?? null;
}

/* ------------------------------------------------- the month's live key */
/* What a day contributes to the key and the month line. */
export interface KeyDay {
  glyph: GlyphKey | null;
  minutes: number;
}
export interface MonthKey {
  states: { key: GlyphKey; glyph: string; tone: GlyphTone; label: string; count: number }[];
}
/* calKey(): only what the month holds, each with its count. */
export function monthKey(days: readonly KeyDay[]): MonthKey {
  const states = GLYPH_ORDER.map(k => ({ ...GLYPHS[k], label: GLYPHS[k].label.split(',')[0] ?? GLYPHS[k].label, count: days.filter(d => d.glyph === k).length }))
    .filter(s => s.count > 0).map(({ key, glyph, tone, label, count }) => ({ key, glyph, tone, label, count }));
  return { states };
}
export const keyIsEmpty = (k: MonthKey) => !k.states.length;

/* The month's totals, derived the same way the cells are. */
export interface MonthTotals { minutes: number }
export const monthTotals = (days: readonly KeyDay[]): MonthTotals => ({
  minutes: days.reduce((n, d) => n + d.minutes, 0),
});
/* "36.5h recorded", or '' for an empty month. */
export function monthSummary(t: MonthTotals): string {
  return t.minutes ? `${(t.minutes / 60).toFixed(1)}h recorded` : '';
}

/* ------------------------------------------------------------- wording */
/* "Thu 13 Aug" */
export const shortDate = (iso: string) => formatDay(iso);
/* "13 Aug" */
export const dayMonth = (iso: string) => { const d = parseIso(iso); return `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()] ?? ''}`; };
