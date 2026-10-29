/* The portal dashboard's Business Central reads (docs/superpowers/inventory/portal.md,
   HOME): the signed-in employee's profile (HOME.C2), their payslips (HOME.C3)
   and one payslip's PDF (HOME.C4). The company lookup (HOME.C1) is
   environments.ts's clientTenantCompanies and session init (HOME.C5) is
   session.ts's sessionInit: the same calls on the wire.
   All three went through fetchThroughBackend (portal SHARED.R1 to SHARED.R10):
   Content-Type and Accept on every call, GET included; the bc token;
   credentials include; the X-Client-Company-ID response header stored; and
   never X-BC-Environment (SHARED.R6, Ruling Q1). Their context headers are
   sent as '' when nothing is stored (QniConnect's `|| ''`). */
import { z } from 'zod';
import { defineBcEndpoint, lenient } from './endpoints';

/* Every profile field QniConnect read was read through `||` or `&&`
   (HOME.C2 "Response fields read"), so each may be absent, or null. */
const text = z.string().nullish();
export const EmployeeProfile = lenient({
  id: text, employeeNo: text,
  firstName: text, middleName: text, lastName: text,
  jobTitle: text, email: text, employmentDate: text, manager: text,
  address: text, address2: text, addressLine3: text, addressLine4: text, city: text, postCode: text,
  birthDate: text, gender: text, frequency: text, hmrcTaxCode: text, nationalInsuranceNumber: text,
  niClassCode: text, nationalInsuranceCode: text,
  weeklyHoursWorked: z.union([z.number(), z.string()]).nullish(),
  mobilePhoneNo: text,
  /* Documents: `employeeProfile?.validP11D || false` decides whether there is a P11D (DOCS.R6) */
  validP11D: z.boolean().nullish(),
  /* Profile (PROF, all through `|| ''`). maritalStatus and annualSalary were
     read but never shown. The bank numbers and the contribution are masked
     or shown as text, so a number is taken as well (inventory A3). */
  maritalStatus: text, county: text, country: text, status: text,
  bankName: text, bankAccountName: text,
  bankAccountNo: z.union([z.string(), z.number()]).nullish(), bankBranchNo: z.union([z.string(), z.number()]).nullish(),
  annualSalary: z.union([z.number(), z.string()]).nullish(),
  pensionSet: text, pensionProvider: text, pensionContribution: z.union([z.string(), z.number()]).nullish(),
});
export type EmployeeProfile = z.infer<typeof EmployeeProfile>;

/* The query HOME.C2 builds, each param only when it has a value, in this
   order, written as URLSearchParams writes it. */
export const EmployeeProfileQuery = z.object({
  registrationId: z.string().optional(), clientEnvironment: z.string().optional(),
  clientCompanyId: z.string().optional(), email: z.string().optional(),
});

export const employeeCurrent = defineBcEndpoint({
  method: 'GET', path: '/bc/employees/current', inventory: 'HOME.C2, DOCS.C0b', /* and the Profile page's one call (PROF) */
  summary: "The signed-in employee's Business Central record (portal dashboard)",
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-Registration-ID', 'X-Client-Environment', 'X-Client-Company-ID', 'X-User-Email'],
  credentials: 'include', readsCompanyHeader: true,
  query: EmployeeProfileQuery, queryStyle: 'form',
  response: EmployeeProfile,
});

/* A payslip as HOME.C3's and DOCS.C0's readers used it. The money fields
   went through `(x || 0)` or `??` in the tables, and every other field is
   shown or checked through a guard, so each may be absent. Documents also
   reads expectedPaymentDate before payDate, taxAmount before taxPaid, and
   fiscalYear before working one out (DOCS.R3, DOCS.R5, DOCS.R9). */
const money = z.number().nullish();
export const Payslip = lenient({
  id: z.union([z.string(), z.number()]).nullish(),
  systemId: text, period: text, payDate: text,
  grossPay: money, taxPaid: money, netPay: money,
  expectedPaymentDate: text, taxAmount: money, fiscalYear: text,
});
export type Payslip = z.infer<typeof Payslip>;
/* `Array.isArray(response) ? response : []` (BCS:494): anything that is not
   a list is no payslips. */
export const PayslipsResponse = z.preprocess(v => (Array.isArray(v) ? v : []), z.array(Payslip));
export type PayslipsResponse = z.infer<typeof PayslipsResponse>;

export const payslipsList = defineBcEndpoint({
  method: 'GET', path: '/bc/payslips', inventory: 'HOME.C3, DOCS.C0',
  summary: "The signed-in employee's payslips, newest first (portal dashboard)",
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  /* X-Employee-No and X-LocalStorage-EmployeeNo carry the same stored value, read twice */
  headers: ['X-Registration-ID', 'X-Client-Environment', 'X-Client-Company-ID', 'X-Employee-No', 'X-User-Email',
    'X-LocalStorage-EmployeeNo', 'X-Session-Request-Time'],
  credentials: 'include', readsCompanyHeader: true,
  response: PayslipsResponse,
});

/* `response && response.value`: the PDF as base64, without a data: prefix. */
export const PayslipPdfResponse = lenient({ value: text });
export type PayslipPdfResponse = z.infer<typeof PayslipPdfResponse>;

export const payslipPdf = defineBcEndpoint({
  method: 'POST', path: '/bc/payslips/:systemId/pdf', inventory: 'HOME.C4, DOCS.C0c',
  summary: 'One payslip as a PDF (base64), to view or download (portal dashboard)',
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-Registration-ID', 'X-Client-Environment', 'X-Client-Company-ID'],
  credentials: 'include', readsCompanyHeader: true,
  params: z.object({ systemId: z.string() }),
  request: z.object({ systemId: z.string() }), response: PayslipPdfResponse,
});
