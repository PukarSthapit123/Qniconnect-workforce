import type { Payslip } from '@/contract/bc/payroll';
import type { FiscalYear } from '@/contract/bc/documents';
import { defaultYear, derivedYears, fiscalYearOf, payslipsIn, taxDocumentFileName, taxDocumentTitle, taxDocumentsFor, yearLabel, yearOptions, yearsFor } from './documents';

test('DOCS.R3: the UK tax year starts on 6 April; nothing or a non-date is no year', () => {
  expect(fiscalYearOf('2025-04-05')).toBe('2024/2025');
  expect(fiscalYearOf('2025-04-06')).toBe('2025/2026');
  expect(fiscalYearOf('2026-01-28')).toBe('2025/2026');
  expect(fiscalYearOf('2026-07-28')).toBe('2026/2027');
  expect(fiscalYearOf('2026-05-01T09:00:00')).toBe('2026/2027');
  expect(fiscalYearOf('')).toBeNull();
  expect(fiscalYearOf(null)).toBeNull();
  expect(fiscalYearOf('soon')).toBeNull();
});

test('DOCS.R3: worked out from the payslips: their own year first, then the expected payment date, then the pay date; once each, newest first', () => {
  const slips: Payslip[] = [
    { payDate: '2026-07-28' }, { payDate: '2026-03-28' }, { payDate: '2026-02-28', expectedPaymentDate: '2026-04-10' },
    { fiscalYear: '2019/2020', payDate: '2026-07-28' }, { payDate: 'not a date' }, {},
  ];
  expect(derivedYears(slips)).toEqual([
    { fiscalYear: '2026/2027', active: false }, { fiscalYear: '2025/2026', active: false }, { fiscalYear: '2019/2020', active: false }]);
});

test('DOCS.R2: the API\'s years when it succeeded with some, else the payslips\'', () => {
  const api: FiscalYear[] = [{ fiscalYear: '2024/2025', active: false }, { fiscalYear: '2025/2026', active: true }];
  const slips: Payslip[] = [{ payDate: '2026-07-28' }];
  expect(yearOptions({ success: true, data: api }, slips)).toEqual([{ fiscalYear: '2024/2025', active: false }, { fiscalYear: '2025/2026', active: true }]);
  expect(yearOptions({ success: true, data: [] }, slips)).toEqual([{ fiscalYear: '2026/2027', active: false }]);
  expect(yearOptions({ success: false, data: [] }, slips)).toEqual([{ fiscalYear: '2026/2027', active: false }]);
});

test('DOCS.R4: the active year, else the first, else none', () => {
  expect(defaultYear([{ fiscalYear: 'a', active: false }, { fiscalYear: 'b', active: true }])).toBe('b');
  expect(defaultYear([{ fiscalYear: 'a', active: false }, { fiscalYear: 'b', active: false }])).toBe('a');
  expect(defaultYear([])).toBeNull();
});

test('DOCS.R5: the payslips of the chosen year, by their own year or their date, in the API\'s order; all with none chosen', () => {
  const a: Payslip = { id: 'a', payDate: '2026-07-28' }, b: Payslip = { id: 'b', payDate: '2026-03-28' };
  const c: Payslip = { id: 'c', fiscalYear: '2026/2027', payDate: '2020-01-01' }, d: Payslip = { id: 'd', expectedPaymentDate: '2026-05-01', payDate: '2026-03-01' };
  expect(payslipsIn([a, b, c, d], '2026/2027')).toEqual([a, c, d]);
  expect(payslipsIn([a, b, c, d], '2025/2026')).toEqual([b]);
  expect(payslipsIn([a, b, c, d], null)).toEqual([a, b, c, d]);
});

test('DOCS.R8: the active year says so', () => {
  expect(yearLabel({ fiscalYear: '2026/2027', active: true })).toBe('2026/2027 (Active)');
  expect(yearLabel({ fiscalYear: '2025/2026', active: false })).toBe('2025/2026');
});

test('DOCS.R6: P11D only with validP11D', () => {
  expect(taxDocumentsFor(true).map(d => d.type)).toEqual(['P60', 'P11D', 'P45']);
  expect(taxDocumentsFor(false).map(d => d.type)).toEqual(['P60', 'P45']);
  expect(taxDocumentsFor(true).filter(d => d.byYear).map(d => d.type)).toEqual(['P60', 'P11D']);
});

test('FYM.R5: a P60 is for a closed year flagged printable, both strictly; anything else for every year, in order', () => {
  const years: FiscalYear[] = [
    { id: 1, fiscalYear: 'open', active: true, allowP60Print: true }, { id: 2, fiscalYear: 'closed', active: false, allowP60Print: true },
    { id: 3, fiscalYear: 'no flag', active: false }, { id: 4, fiscalYear: 'unprintable', active: false, allowP60Print: false },
    { id: 5, fiscalYear: 'no active', allowP60Print: true },
  ];
  expect(yearsFor('P60', years).map(y => y.fiscalYear)).toEqual(['closed']);
  expect(yearsFor('P11D', years)).toEqual(years);
});

test('DOCS.R16: a tax document\'s title and file name carry its year; P45 has none', () => {
  expect(taxDocumentTitle('P60', '2024/2025')).toBe('P60 - 2024/2025');
  expect(taxDocumentFileName('P60', '2024/2025')).toBe('P60_2024/2025.pdf');
  expect(taxDocumentTitle('P45')).toBe('P45');
  expect(taxDocumentFileName('P45')).toBe('P45.pdf');
});
