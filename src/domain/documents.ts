/* Documents' rules (docs/superpowers/inventory/portal.md, DOCS and FYM):
   which fiscal years the payslip filter offers and which it starts on, which
   payslips a year holds, which tax documents there are, and which years a
   tax document can be asked for. Pure, so each rule is tested on its own. */
import type { FiscalYear } from '@/contract/bc/documents';
import type { Payslip } from '@/contract/bc/payroll';

/* The filter's choices: the API's years, or ones worked out from the payslips. */
export interface YearOption { fiscalYear: string; active: boolean }

/* DOCS.R3, getFiscalYearFromDate: the UK tax year a pay date falls in, which
   starts on 6 April, written "2025/2026"; null for no date or one that is not
   a date. A date-only value is that calendar day everywhere: QniConnect read
   it as UTC midnight and so put 6 April in the year before west of UTC, the
   display defect HOME.R19 fixed too (Ruling Q2). */
export function fiscalYearOf(value: string | null | undefined): string | null {
  if (!value) return null;
  let y: number, m: number, d: number;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) { y = Number(day[1]); m = Number(day[2]); d = Number(day[3]); }
  else {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    y = date.getFullYear(); m = date.getMonth() + 1; d = date.getDate();
  }
  const start = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  return `${start}/${start + 1}`;
}

/* DOCS.R5's reading of a payslip's year: its own, else its pay date's. */
export const payslipYear = (p: Payslip): string | null => p.fiscalYear || fiscalYearOf(p.expectedPaymentDate || p.payDate);

/* DOCS.R3: each payslip's year, once, newest first (a plain string sort,
   reversed), none of them the active one. */
export function derivedYears(payslips: Payslip[]): YearOption[] {
  const years = new Set<string>();
  for (const p of payslips) { const y = payslipYear(p); if (y) years.add(y); }
  return [...years].sort().reverse().map(fiscalYear => ({ fiscalYear, active: false }));
}

/* DOCS.R2: the API's years when it gave any, in its order; else DOCS.R3's.
   A year with no label cannot be chosen, so it is left out of the filter. */
export function yearOptions(api: { success: boolean; data: FiscalYear[] }, payslips: Payslip[]): YearOption[] {
  if (api.success && api.data.length > 0) {
    return api.data.filter(y => !!y.fiscalYear).map(y => ({ fiscalYear: y.fiscalYear ?? '', active: !!y.active }));
  }
  return derivedYears(payslips);
}

/* DOCS.R4: the active year, else the first; none with no years. */
export const defaultYear = (options: YearOption[]): string | null => (options.find(o => o.active) ?? options[0])?.fiscalYear ?? null;

/* DOCS.R5: the payslips of the chosen year, in the API's order; all of them
   with no year chosen. */
export const payslipsIn = (payslips: Payslip[], year: string | null): Payslip[] =>
  year === null ? payslips : payslips.filter(p => payslipYear(p) === year);

/* DOCS.R8: "(Active)" after the active year. */
export const yearLabel = (o: YearOption): string => `${o.fiscalYear}${o.active ? ' (Active)' : ''}`;

/* DOCS.R6 and Ruling Q4: the tax documents there are. P60 always; P11D only
   when the profile says there is one; P45 beside them, which QniConnect's
   service could fetch but no screen offered. */
export type TaxDocType = 'P45' | 'P60' | 'P11D';
export interface TaxDocument { type: TaxDocType; description: string; byYear: boolean }
export const TAX_DOCUMENTS: readonly TaxDocument[] = [
  { type: 'P60', description: 'End of year certificate', byYear: true },
  { type: 'P11D', description: 'Expenses and benefits statement', byYear: true },
  { type: 'P45', description: 'Details of employee leaving work', byYear: false },
];
export const taxDocumentsFor = (validP11D: boolean): TaxDocument[] =>
  TAX_DOCUMENTS.filter(d => d.type !== 'P11D' || validP11D);

/* FYM.R5: a P60 is only for a closed year flagged printable, both compared
   strictly; any other document is for any year. API order. */
export const yearsFor = (type: TaxDocType, years: FiscalYear[]): FiscalYear[] =>
  type === 'P60' ? years.filter(y => y.active === false && y.allowP60Print === true) : years;

/* DOCS.R16: a tax document's title, "P60 - 2024/2025"; P45 has no year. */
export const taxDocumentTitle = (type: TaxDocType, year?: string): string => (year ? `${type} - ${year}` : type);
/* DOCS.R16: its download name, "P60_2024/2025.pdf", the slash left for the
   browser to make safe, as QniConnect left it; P45 is "P45.pdf". */
export const taxDocumentFileName = (type: TaxDocType, year?: string): string => (year ? `${type}_${year}.pdf` : `${type}.pdf`);
