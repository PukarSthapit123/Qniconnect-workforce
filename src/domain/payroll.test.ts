import { firstWord, formatPortalDate, payslipFileName, pdfBytes, pdfFileName, portalInitials, pounds } from './payroll';

/* How the portal writes payroll values (docs/superpowers/inventory/portal.md). */
test('HOME.R19: dates are dd/mm/yyyy; nothing is empty; what is not a date stays as it is; a date-only value is that day in any timezone', () => {
  expect(formatPortalDate('')).toBe('');
  expect(formatPortalDate(undefined)).toBe('');
  expect(formatPortalDate(null)).toBe('');
  expect(formatPortalDate('N/A')).toBe('N/A');
  expect(formatPortalDate('not a date')).toBe('not a date');
  /* QniConnect parsed this as UTC midnight, so west of UTC it showed 14/01/2022 (fixed, Ruling Q2) */
  expect(formatPortalDate('2022-01-15')).toBe('15/01/2022');
  expect(formatPortalDate('2026-07-28T12:00:00')).toBe(new Date('2026-07-28T12:00:00').toLocaleDateString('en-GB'));
  expect(formatPortalDate('2026-07-28T12:00:00')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
});

test('HOME.R14 and HOME.R18: money is £ and en-GB with two decimals; nothing is £0.00', () => {
  expect(pounds(1234.5)).toBe('£1,234.50');
  expect(pounds(0)).toBe('£0.00');
  expect(pounds(undefined)).toBe('£0.00');
  expect(pounds(null)).toBe('£0.00');
  expect(pounds(1.005)).toMatch(/^£1\.0[01]$/);
});

test('HOME.R12 and HOME.R13: the first word of the name, and the initials of every word, as written', () => {
  expect(firstWord('Jane Anne Smith')).toBe('Jane');
  expect(portalInitials('Jane Anne Smith')).toBe('JAS');
  expect(portalInitials('amara okafor')).toBe('ao');
  expect(portalInitials('')).toBe('');
});

test('HOME.R22 and PDF.R6: the file names', () => {
  expect(payslipFileName('July 2026')).toBe('Payslip-July-2026.pdf');
  expect(payslipFileName('6  Apr\t2024')).toBe('Payslip-6-Apr-2024.pdf');
  expect(pdfFileName('Payslip - 6 Apr 2024')).toBe('Payslip---6-Apr-2024.pdf');
  expect(pdfFileName('P60 - 2024/2025')).toBe('P60---20242025.pdf');
  expect(pdfFileName(undefined)).toBe('document.pdf');
  expect(pdfFileName('')).toBe('document.pdf');
});

test('a base64 PDF decodes to its bytes, and base64 that is not throws', () => {
  expect([...pdfBytes(btoa('%PDF'))]).toEqual([37, 80, 68, 70]);
  expect(() => pdfBytes('%%%')).toThrow();
});
