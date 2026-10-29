/* Documents' own Business Central reads (docs/superpowers/inventory/portal.md,
   DOCS): the fiscal years (DOCS.C1) and the three tax documents, P60
   (DOCS.C2), P11D (DOCS.C3) and P45 (DOCS.C4). The payslips, the profile and
   a payslip's PDF are the dashboard's calls (payroll.ts: DOCS.C0, C0b and
   C0c are HOME.C3, C2 and C4 on the wire).
   All four went through fetchThroughBackend (portal SHARED.R1 to R10):
   Content-Type and Accept, the bc token, credentials include, the
   X-Client-Company-ID response header stored, never X-BC-Environment, and
   the three X- headers HOME.C4 sends, each '' when nothing is stored. */
import { z } from 'zod';
import { defineBcEndpoint, lenient } from './endpoints';

const text = z.string().nullish();

/* A fiscal year as DOCS.C1's readers used it: the label and the tax year
   sent (fiscalYear), the default pick (active, a truthiness test), the P60
   filter (active and allowP60Print, compared strictly, so a missing flag
   simply fails it), the selection (id) and the dates shown. */
export const FiscalYear = lenient({
  id: z.union([z.string(), z.number()]).nullish(),
  fiscalYear: text,
  active: z.boolean().nullish(),
  startDate: text, endDate: text,
  allowP60Print: z.boolean().nullish(),
});
export type FiscalYear = z.infer<typeof FiscalYear>;
/* QniConnect checked `Array.isArray(response)` itself and said "Invalid
   response format from fiscal years API" otherwise, so anything that is an
   object or nothing is let through here for the client to say that. */
export const FiscalYearsResponse = z.union([z.array(FiscalYear), z.looseObject({}), z.null()]);
export type FiscalYearsResponse = z.infer<typeof FiscalYearsResponse>;

export const fiscalYearsList = defineBcEndpoint({
  method: 'GET', path: '/bc/fiscalyears', inventory: 'DOCS.C1',
  summary: "The company's fiscal years, for the year filter and the tax documents (Documents)",
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-Registration-ID', 'X-Client-Environment', 'X-Client-Company-ID'],
  credentials: 'include', readsCompanyHeader: true,
  response: FiscalYearsResponse,
});

/* `response && response.value`: the PDF as base64, without a data: prefix. */
export const TaxDocumentResponse = lenient({ value: text });
export type TaxDocumentResponse = z.infer<typeof TaxDocumentResponse>;
/* `{ employeeId }`, and the tax year only when there is one (BCS:698, 894). */
export const TaxDocumentRequest = z.object({ employeeId: z.string(), taxYear: z.string().optional() });

const taxDocument = { token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-Registration-ID', 'X-Client-Environment', 'X-Client-Company-ID'],
  credentials: 'include', readsCompanyHeader: true,
  /* the employee's GUID, put in as given */
  params: z.object({ employeeId: z.string() }),
  response: TaxDocumentResponse } as const;

export const p60Pdf = defineBcEndpoint({
  method: 'POST', path: '/bc/employees/:employeeId/p60', inventory: 'DOCS.C2',
  summary: "The employee's P60 for a tax year, as a PDF (base64) (Documents)",
  ...taxDocument, request: TaxDocumentRequest,
});
export const p11dPdf = defineBcEndpoint({
  method: 'POST', path: '/bc/employees/:employeeId/p11d', inventory: 'DOCS.C3',
  summary: "The employee's P11D for a tax year, as a PDF (base64) (Documents)",
  ...taxDocument, request: TaxDocumentRequest,
});
/* No QniConnect screen called it (DOCS.C4); Documents offers it beside P60
   and P11D (Ruling Q4). Its body is the employee alone. */
export const p45Pdf = defineBcEndpoint({
  method: 'POST', path: '/bc/employees/:employeeId/p45', inventory: 'DOCS.C4',
  summary: "The employee's P45, as a PDF (base64) (Documents)",
  ...taxDocument, request: z.object({ employeeId: z.string() }),
});
