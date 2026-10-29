/* The fake dashboard reads (portal inventory HOME.C2 to HOME.C4), answered
   from bcStore's payroll (payroll-seed.ts):
   - the employee is the portal user the query's email names, else the
     token's, matched to its record by employeeNo;
   - the payslips are the X-Employee-No header's (the employee number the
     profile stored), newest first; none without one, as the dashboard only
     asks once it has the profile;
   - a payslip's PDF is a small real PDF naming the payslip. */
import { employeeCurrent, payslipPdf, payslipsList, type EmployeeProfile, type PayslipPdfResponse, type PayslipsResponse } from '@/contract/bc/payroll';
import { bcRefuse, bcServe } from './serve';
import { bcStore } from './seed';
import { minimalPdf } from './pdf';

const profileFor = (email: string | null) => {
  const user = email ? bcStore.userByEmail(email) : undefined;
  return user ? bcStore.db.profiles.find(p => p.employeeNo === user.employeeNo) : undefined;
};

export const bcPayrollHandlers = [
  bcServe(employeeCurrent, ({ query, email }): EmployeeProfile | Response => {
    const profile = profileFor(query.email || email);
    if (!profile) return bcRefuse(404, 'No employee record was found for this account in Business Central.');
    return { ...profile };
  }),
  bcServe(payslipsList, ({ request }): PayslipsResponse => {
    const employeeNo = request.headers.get('X-Employee-No') ?? '';
    return bcStore.db.payslips.filter(p => employeeNo && p.employeeNo === employeeNo)
      .sort((a, b) => b.payDate.localeCompare(a.payDate))
      .map(({ employeeNo: _owner, ...p }) => { void _owner; return p; });
  }),
  bcServe(payslipPdf, ({ params, email }): PayslipPdfResponse | Response => {
    const slip = bcStore.db.payslips.find(p => p.systemId === params.systemId);
    if (!slip) return bcRefuse(404, `No payslip ${params.systemId} was found.`);
    /* the calling employee's own payslips only */
    const employeeNo = profileFor(email)?.employeeNo;
    if (employeeNo && employeeNo !== slip.employeeNo) return bcRefuse(403, 'This payslip belongs to another employee.');
    const who = bcStore.db.profiles.find(p => p.employeeNo === slip.employeeNo);
    return { value: minimalPdf([
      `Payslip - ${slip.period}`, `${who ? `${who.firstName} ${who.lastName}` : ''} (${slip.employeeNo})`, `Paid on ${slip.payDate}`,
      `Gross pay GBP ${slip.grossPay.toFixed(2)}`, `Tax GBP ${slip.taxPaid.toFixed(2)}`, `Net pay GBP ${slip.netPay.toFixed(2)}`,
    ]) };
  }),
];
