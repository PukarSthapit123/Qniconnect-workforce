/* The fake Documents reads (portal inventory DOCS.C1 to DOCS.C4), answered
   from bcStore (payroll-seed.ts):
   - the fiscal years, newest first, as a bare list;
   - a P60 for a closed year flagged printable, a P11D for a closed year when
     the profile says there is one, each the caller's own only;
   - no P45: nobody in the seeds has left, so it is refused as Business
     Central would refuse it.
   Business Central's refusals come back as { error: { code, message } } with
   a CorrelationId on the end of the message, which is the shape
   formatBCErrorMessage (SHARED.F2) cuts down for the screen. */
import { HttpResponse } from 'msw';
import { fiscalYearsList, p11dPdf, p45Pdf, p60Pdf, type FiscalYearsResponse, type TaxDocumentResponse } from '@/contract/bc/documents';
import { bcServe } from './serve';
import { bcStore } from './seed';
import { minimalPdf } from './pdf';
import type { FakeProfile } from './payroll-seed';

let correlation = 0;
/* Business Central's refusal, as the QniConnect API passes it on */
export const bcError = (status: number, code: string, message: string) => HttpResponse.json(
  { error: { code, message: `${message}  CorrelationId: 7c1e${String(++correlation).padStart(4, '0')}-0b5d-4e8a-a6f2-fake` } }, { status });

/* The employee the GUID names, when it is the caller's own record */
function ownProfile(employeeId: string, email: string | null): FakeProfile | Response {
  const profile = bcStore.db.profiles.find(p => p.id === employeeId);
  if (!profile) return bcError(404, 'BadRequest_ResourceNotFound', `The employee ${employeeId} does not exist.`);
  const caller = email ? bcStore.userByEmail(email) : undefined;
  if (caller && caller.employeeNo !== profile.employeeNo) return bcError(403, 'Authorization_Forbidden', 'This document belongs to another employee.');
  return profile;
}
const nameOf = (p: FakeProfile) => `${p.firstName} ${p.lastName} (${p.employeeNo})`;
/* the year asked for, or the latest closed one when none is */
const yearAsked = (taxYear: string | undefined) => {
  const years = bcStore.db.fiscalYears;
  return taxYear ? years.find(y => y.fiscalYear === taxYear) : years.find(y => !y.active);
};

export const bcDocumentsHandlers = [
  bcServe(fiscalYearsList, (): FiscalYearsResponse => bcStore.db.fiscalYears.map(y => ({ ...y }))),

  bcServe(p60Pdf, ({ params, body, email }): TaxDocumentResponse | Response => {
    const who = ownProfile(params.employeeId, email);
    if (who instanceof Response) return who;
    const year = yearAsked(body.taxYear);
    if (!year) return bcError(404, 'BadRequest_NotFound', `There is no fiscal year ${body.taxYear ?? ''}.`);
    if (year.active || !year.allowP60Print) return bcError(400, 'Application_DialogException', `No P60 can be printed for ${year.fiscalYear}.`);
    return { value: minimalPdf([`P60 End of year certificate - ${year.fiscalYear}`, nameOf(who),
      `Tax year ${year.startDate} to ${year.endDate}`, `Tax code ${who.hmrcTaxCode}`, `NI number ${who.nationalInsuranceNumber}`]) };
  }),

  bcServe(p11dPdf, ({ params, body, email }): TaxDocumentResponse | Response => {
    const who = ownProfile(params.employeeId, email);
    if (who instanceof Response) return who;
    if (!who.validP11D) return bcError(404, 'BadRequest_NotFound', 'No P11D has been filed for this employee.');
    const year = yearAsked(body.taxYear);
    if (!year) return bcError(404, 'BadRequest_NotFound', `There is no fiscal year ${body.taxYear ?? ''}.`);
    if (year.active) return bcError(400, 'Application_DialogException', `No P11D has been filed for ${year.fiscalYear} yet.`);
    return { value: minimalPdf([`P11D Expenses and benefits - ${year.fiscalYear}`, nameOf(who),
      `Tax year ${year.startDate} to ${year.endDate}`, 'Private medical insurance GBP 612.00']) };
  }),

  bcServe(p45Pdf, ({ params, email }): TaxDocumentResponse | Response => {
    const who = ownProfile(params.employeeId, email);
    if (who instanceof Response) return who;
    return bcError(404, 'BadRequest_NotFound', 'No P45 has been issued, because this employee has not left.');
  }),
];
