/* The profile page's Business Central record as QniConnect's EmployeeProfile
   showed it (docs/superpowers/inventory/portal.md, PROF): the values it
   mapped from the profile (EPR:74-131), its date format (PROF.R7), its
   masking (PROF.R10) and its address block (PROF.R8).
   Fixed under Ruling Q2: Account name is the bank account's name, not the
   employee's (PROF.R11); a date-only value is its own calendar day in any
   timezone (as HOME.R19); a number to mask is masked, not a crash (A3); and
   an address with no first line no longer starts with a comma. */
import type { EmployeeProfile } from '@/contract/bc/payroll';

export interface ProfileView {
  name: string; birthDate: string; gender: string;
  email: string; phone: string;
  address: string; address2: string; addressLine3: string; addressLine4: string; city: string; county: string; postCode: string; country: string;
  employeeId: string; position: string; joinDate: string; hoursWorked: string; status: string;
  taxCode: string; niNumber: string; niCategory: string;
  bankName: string; bankAccountName: string; bankAccountNo: string; bankBranchNo: string; payFrequency: string;
  pensionSet: string; pensionProvider: string; pensionContribution: string;
}

/* `x || ''`, as text */
const t = (v: unknown): string => (v ? String(v) : '');

/* EPR:74-131, every value `|| ''` but the name (the account's when the
   profile has none), the position (Employee) and the status (Active),
   PROF.R9 and PROF.R13. NI category is the class and the code, each only
   when there is one (PROF.R15). */
export function toProfileView(p: EmployeeProfile, user: { name: string; email: string }): ProfileView {
  return {
    name: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || user.name,
    birthDate: t(p.birthDate), gender: t(p.gender),
    email: p.email || user.email, phone: t(p.mobilePhoneNo),
    address: t(p.address), address2: t(p.address2), addressLine3: t(p.addressLine3), addressLine4: t(p.addressLine4),
    city: t(p.city), county: t(p.county), postCode: t(p.postCode), country: t(p.country),
    employeeId: t(p.employeeNo), position: p.jobTitle || 'Employee', joinDate: t(p.employmentDate),
    hoursWorked: t(p.weeklyHoursWorked), status: p.status || 'Active',
    taxCode: t(p.hmrcTaxCode), niNumber: t(p.nationalInsuranceNumber),
    niCategory: [p.niClassCode, p.nationalInsuranceCode].filter(Boolean).join(' '),
    bankName: t(p.bankName), bankAccountName: t(p.bankAccountName), bankAccountNo: t(p.bankAccountNo), bankBranchNo: t(p.bankBranchNo),
    payFrequency: t(p.frequency),
    pensionSet: t(p.pensionSet), pensionProvider: t(p.pensionProvider), pensionContribution: t(p.pensionContribution),
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* PROF.R7 formatDate: N/A for nothing or N/A; a value that is not a date
   stays as it is; else "15 January 2022" (en-GB, two-digit day, long month). */
export function formatProfileDate(value: string | null | undefined): string {
  if (!value || value === 'N/A') return 'N/A';
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) {
    const month = MONTHS[Number(day[2]) - 1];
    if (month) return `${day[3]} ${month} ${day[1]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* PROF.R10 maskValue: N/A for nothing or N/A; all stars when no longer than
   the part shown; else stars and the last `showLast` characters. */
export function maskValue(value: unknown, showLast = 4): string {
  if (!value || value === 'N/A') return 'N/A';
  const s = String(value);
  if (s.length <= showLast) return '*'.repeat(s.length);
  return '*'.repeat(s.length - showLast) + s.slice(-showLast);
}

/* PROF.R8: the address block's lines. */
export function profileAddress(v: ProfileView): string[] {
  const first = [v.address, v.address2].filter(Boolean).join(', ');
  const cityLine = [v.city, v.postCode].filter(Boolean).join(', ');
  const regionLine = [v.county, v.country].filter(Boolean).join(', ');
  return [first, v.addressLine3, v.addressLine4, cityLine, regionLine].filter(Boolean);
}
