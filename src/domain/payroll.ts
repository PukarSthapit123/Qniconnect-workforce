/* How QniConnect's portal writes payroll values (docs/superpowers/inventory/portal.md):
   dates, money, initials and PDF file names, as the dashboard (HOME) and the
   PDF preview (PDF) show them. Documents (DOCS) uses the same date rule. */

/* HOME.R19 formatDate: '' for nothing; a value that is not a date stays as
   it is (so 'N/A' stays N/A); otherwise dd/mm/yyyy. A date-only value
   (2022-01-15) is that calendar day everywhere: QniConnect parsed it as UTC
   midnight and showed the day before west of UTC, a display defect fixed
   here (Ruling Q2). */
export function formatPortalDate(value: string | null | undefined): string {
  if (!value) return '';
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
}

/* HOME.R14, HOME.R18: £ and the amount, en-GB, always two decimals; nothing is £0.00. */
export const pounds = (value: number | null | undefined): string =>
  `£${(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* HOME.R13: the first character of every space-separated word, as written:
   'Jane Anne Smith' is JAS. */
export const portalInitials = (name: string): string => name.split(' ').map(w => w.charAt(0)).join('');

/* HOME.R12: the greeting's name is the first word of the full name. */
export const firstWord = (name: string): string => name.split(' ')[0] ?? '';

/* HOME.R22: the dashboard's download, 'Payslip-' and the period with each
   run of whitespace made a hyphen. */
export const payslipFileName = (period: string): string => `Payslip-${period.replace(/\s+/g, '-')}.pdf`;

/* PDF.R6: the preview's download, from its title: whitespace runs made
   hyphens, then anything outside letters, digits, - _ and . dropped;
   document.pdf with no title. */
export const pdfFileName = (title: string | undefined): string =>
  title ? `${title.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_.]/g, '')}.pdf` : 'document.pdf';

/* The bytes of a base64 PDF (no data: prefix). Throws on base64 that is not. */
export function pdfBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
