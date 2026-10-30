/* The fake Business Central's payroll (spec N20): one employee record per
   Workforce seed employee who has started, keyed by the Workforce employee
   code as employeeNo (as the portal users are, seed.ts), and their monthly
   payslips up to the frozen clock's last pay day, newest first. Built from
   the Workforce seed files, so the two cannot drift. Shapes are the fields
   the portal inventory says QniConnect read (HOME.C2, HOME.C3). The money is
   made up, but adds up: net is gross less tax and National Insurance. */
import { seededCollection, TENANTS } from '../store';
import { managerName } from '@/domain/manager';

export interface FakeProfile {
  id: string; employeeNo: string; email: string;
  firstName: string; middleName: string; lastName: string; jobTitle: string; employmentDate?: string; manager?: string;
  address?: string; address2?: string; addressLine3?: string; addressLine4?: string; city?: string; postCode?: string;
  frequency: string; hmrcTaxCode: string; nationalInsuranceNumber: string; niClassCode: string; nationalInsuranceCode: string;
  weeklyHoursWorked: number; mobilePhoneNo?: string;
  /* Documents (DOCS.R6): whether a P11D exists for this employee */
  validP11D: boolean;
  /* Profile (PROF): the rest of the record the profile page reads */
  birthDate: string; status: string; country: string;
  bankName: string; bankAccountName: string; bankAccountNo: string; bankBranchNo: string;
  pensionSet: string; pensionProvider: string; pensionContribution: string;
}
/* A payroll notification (BELL.C1), with whose it is */
export interface FakeNotification {
  systemId: string; employeeNo: string; message: string; seen: boolean; createdDate: string; createdTime: string;
}
export interface FakePayslip {
  id: string; systemId: string; employeeNo: string; period: string; payDate: string; grossPay: number; taxPaid: number; netPay: number;
}

interface SeedEmployee {
  code: string; name: string; email?: string; phone?: string; address?: string; position?: string; manager?: string;
  contractedHours?: number; state: string; start?: string; bankAccount?: string; bankSortCode?: string;
}
interface SeedPosition { code: string; name: string }

/* "19 Barrow Road, London N6 7QA": the street, then the town and postcode. */
const POSTCODE = /^(.*?)\s*([A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2})$/;
function splitAddress(address: string | undefined): Pick<FakeProfile, 'address' | 'city' | 'postCode'> {
  if (!address) return {};
  const [street = '', ...rest] = address.split(', ');
  const tail = rest.join(', ');
  const m = POSTCODE.exec(tail);
  return m ? { address: street, city: m[1] ?? '', postCode: m[2] ?? '' } : { address };
}
const digits = (code: string) => (code.replace(/\D/g, '') + '000000').slice(0, 6);
const round2 = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* Pay days: the 28th of each month, the eight before the frozen clock's August 2026. */
const PAY_MONTHS = Array.from({ length: 8 }, (_, i) => { const d = new Date(Date.UTC(2026, 6 - i, 28)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });

function payslipsFor(e: SeedEmployee): FakePayslip[] {
  const rate = 12.6 + (Number(digits(e.code)) % 5) * 0.85;
  const hours = e.contractedHours || 20;
  const gross = round2(hours * 52 / 12 * rate);
  const tax = round2(Math.max(0, gross - 1047.5) * 0.2);
  const ni = round2(Math.max(0, gross - 1048) * 0.08);
  const started = e.start ? e.start.slice(0, 7) : '';
  return PAY_MONTHS
    .map(({ y, m }) => ({ y, m, ym: `${y}-${String(m + 1).padStart(2, '0')}` }))
    .filter(({ ym }) => !started || ym >= started)
    .map(({ y, m, ym }) => ({
      id: `ps-${e.code}-${ym}`, systemId: `5e${digits(e.code)}-${ym.replace('-', '')}-4a7b-9c1d-payslip`, employeeNo: e.code,
      period: `${MONTHS[m]} ${y}`, payDate: `${ym}-28`, grossPay: gross, taxPaid: tax, netPay: round2(gross - tax - ni),
    }));
}

function profileOf(e: SeedEmployee, jobs: Map<string, string>, people: readonly SeedEmployee[]): FakeProfile {
  const [firstName = '', ...rest] = e.name.split(' ');
  return {
    id: `f1${digits(e.code)}-ec2e-f011-9a4a-${e.code.toLowerCase()}`, employeeNo: e.code, email: e.email ?? '',
    firstName, middleName: '', lastName: rest.join(' '), jobTitle: jobs.get(e.position ?? '') ?? '',
    ...(e.start ? { employmentDate: e.start } : {}), ...(e.manager ? { manager: managerName(e.manager, e.code, people) } : {}),
    ...splitAddress(e.address),
    frequency: 'Monthly', hmrcTaxCode: '1257L', nationalInsuranceNumber: `QQ${digits(e.code)}C`,
    niClassCode: 'Class 1', nationalInsuranceCode: 'A', weeklyHoursWorked: e.contractedHours ?? 0,
    ...(e.phone ? { mobilePhoneNo: e.phone } : {}),
    /* every other employee has taxable benefits, so has a P11D */
    validP11D: Number(e.code.replace(/\D/g, '')) % 2 === 0,
    ...personal(e),
  };
}

/* The profile page's personal, banking and pension details (PROF). Made
   up, but steady per employee: the account number ends in the four digits
   Workforce holds, and the sort code is Workforce's. */
const BANKS = ['Barclays', 'Lloyds Bank', 'NatWest', 'HSBC UK', 'Santander UK'];
function personal(e: SeedEmployee) {
  const n = Number(digits(e.code));
  const last4 = /(\d{4})$/.exec(e.bankAccount ?? '')?.[1] ?? digits(e.code).slice(2);
  return {
    birthDate: `${1968 + n % 30}-${String(1 + n % 12).padStart(2, '0')}-${String(1 + n % 28).padStart(2, '0')}`,
    status: 'Active', country: 'United Kingdom',
    bankName: BANKS[n % BANKS.length] ?? 'Barclays', bankAccountName: e.name,
    bankAccountNo: `${digits(e.code).slice(0, 4)}${last4}`, bankBranchNo: (e.bankSortCode ?? '20-00-00').replace(/-/g, ''),
    pensionSet: 'Auto-enrolment', pensionProvider: 'NEST', pensionContribution: '5%',
  };
}

/* Each employee's payroll notifications, newest first: the last payslip,
   the P60 for the year that closed in April, and the new tax code. All are
   seen, so the bell's count, which many screens and their pictures show, is
   Workforce's alone until a test marks one unseen. */
function notificationsFor(e: SeedEmployee): FakeNotification[] {
  const id = (k: string) => `nt${digits(e.code)}-${k}-4c1d-8e2f-bell`;
  return [
    { systemId: id('ps'), employeeNo: e.code, message: 'Your payslip for July 2026 is ready to view.', seen: true, createdDate: '2026-07-28', createdTime: '08:15:00' },
    { systemId: id('p60'), employeeNo: e.code, message: 'Your P60 for 2025/2026 is available in Documents.', seen: true, createdDate: '2026-05-29', createdTime: '10:00:00' },
    { systemId: id('tax'), employeeNo: e.code, message: 'Your tax code for 2026/2027 is 1257L.', seen: true, createdDate: '2026-04-06', createdTime: '07:00:00' },
  ];
}

/* The company's fiscal years (DOCS.C1), newest first: the frozen clock's
   2026/2027 is open (active) and has no P60 yet; the closed years before it
   have, but for 2022/2023, which is closed but flagged not printable. Dates
   as Business Central writes them. */
export interface FakeFiscalYear { id: string; fiscalYear: string; active: boolean; startDate: string; endDate: string; allowP60Print: boolean }
const fiscalYears = (): FakeFiscalYear[] => [2026, 2025, 2024, 2023, 2022].map(y => ({
  id: `fy-${y}`, fiscalYear: `${y}/${y + 1}`, active: y === 2026,
  startDate: `${y}-04-06`, endDate: `${y + 1}-04-05`, allowP60Print: y !== 2026 && y !== 2022,
}));

/* Someone not yet started (a candidate or preboard starter) has no payroll record. */
const NOT_STARTED = new Set(['candidate', 'preboard']);

export function buildPayrollSeed(): { profiles: FakeProfile[]; payslips: FakePayslip[]; fiscalYears: FakeFiscalYear[]; notifications: FakeNotification[] } {
  const profiles: FakeProfile[] = [], payslips: FakePayslip[] = [], notifications: FakeNotification[] = [];
  const seen = new Set<string>();
  for (const tenant of TENANTS) {
    const jobs = new Map((Object.values(seededCollection(tenant, 'positions')) as unknown as SeedPosition[]).map(j => [j.code, j.name]));
    const people = Object.values(seededCollection(tenant, 'employees')) as unknown as SeedEmployee[];
    for (const e of people) {
      if (seen.has(e.code) || NOT_STARTED.has(e.state)) continue;
      seen.add(e.code);
      profiles.push(profileOf(e, jobs, people));
      payslips.push(...payslipsFor(e));
      notifications.push(...notificationsFor(e));
    }
  }
  return { profiles, payslips, fiscalYears: fiscalYears(), notifications };
}
