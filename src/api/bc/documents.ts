/* Documents' data, as QniConnect's EmployeeDocuments and
   BusinessCentralService loaded it (docs/superpowers/inventory/portal.md,
   DOCS.R1 to DOCS.R6, DOCS.R11, DOCS.R14, DOCS.R16):
     1. the payslips (DOCS.C0, the dashboard's HOME.C3), [] on failure;
     2. the fiscal years (DOCS.C1), whose failure never stops the payslips;
     3. the year filter's options and its first pick (DOCS.R2 to DOCS.R4);
     4. the profile (DOCS.C0b, the dashboard's HOME.C2, with its storage);
     5. the tax documents the profile allows (DOCS.R6).
   The tax documents and the fiscal years answer QniConnect's shapes,
   { success, data, error }, never throwing, their refusals said through
   formatBCErrorMessage (SHARED.F1 to SHARED.F6). A token that needs
   interaction is passed on: the adapter is already redirecting.
   The dev-mode mock answers (DOCS.X1, DOCS.X2) are gone: the fake /bc
   server answers in development (Ruling Q3). */
import { useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { fiscalYearsList, p11dPdf, p45Pdf, p60Pdf, type FiscalYear } from '@/contract/bc/documents';
import type { EmployeeProfile, Payslip } from '@/contract/bc/payroll';
import { defaultYear, taxDocumentsFor, yearOptions, type TaxDocType, type TaxDocument, type YearOption } from '@/domain/documents';
import { bcApi, BcError } from './client';
import { bcContext, type BcEnvironment } from './context';
import { isInteractionRequired } from './account-setup';
import { fetchEmployeeProfile, fetchPayslips, type PortalPerson } from './payroll';
import { announceEmployeeNo } from './profile';

export const DEFAULT_ERROR = 'An error occurred while processing your request';
const said = (v: unknown): v is string => typeof v === 'string' && v !== '';

/* SHARED.formatBCErrorMessage (BCS:560-595), first match wins:
   F2 the refusal's error.message, cut at the first "CorrelationId:";
   F3 else its error's code, or the error itself when it is text;
   F4 else the refusal's message; F5 else the error's own message;
   F1 else, or F6 when reading the error throws, the default.
   A refusal is bcApi's BcError, whose `data` is what QniConnect read as
   `error.response.data`. An error object with no code fell to the words
   "[object Object]" in QniConnect; it now falls through to F4 and F5
   (Ruling Q2). */
export function formatBCErrorMessage(error: unknown): string {
  try {
    if (!error || typeof error !== 'object') return DEFAULT_ERROR;
    const e = error as { data?: unknown; response?: { data?: unknown }; message?: unknown };
    const data = (error instanceof BcError ? e.data : e.response?.data) as Record<string, unknown> | null | undefined;
    const inner = data && typeof data === 'object' ? data.error : undefined;
    if (inner && typeof inner === 'object') {
      const { message, code } = inner as Record<string, unknown>;
      if (said(message)) return message.split('CorrelationId:')[0]?.trim() ?? DEFAULT_ERROR;
      if (said(code)) return code;
    } else if (said(inner)) return inner;
    if (data && typeof data === 'object' && said(data.message)) return data.message;
    if (said(e.message)) return e.message;
    return DEFAULT_ERROR;
  } catch {
    return DEFAULT_ERROR;
  }
}

export type Outcome<T, Empty> = { success: true; data: T; error: null } | { success: false; data: Empty; error: string };

/* DOCS.C1, getFiscalYears: the years, or the failure shape. */
export async function fetchFiscalYears(): Promise<Outcome<FiscalYear[], []>> {
  try {
    const response = await bcApi(fiscalYearsList);
    if (!Array.isArray(response)) throw new Error('Invalid response format from fiscal years API');
    return { success: true, data: response, error: null };
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error fetching fiscal years:', e);
    return { success: false, data: [], error: formatBCErrorMessage(e) };
  }
}

const ENDPOINT = { P60: p60Pdf, P11D: p11dPdf } as const;

/* DOCS.C2 to DOCS.C4, getP60Pdf, getP11DPdf and getP45Pdf: the PDF as
   base64, or the failure shape. The tax year goes only when there is one,
   and P45 never takes one. */
export async function fetchTaxDocument(type: TaxDocType, employeeId: string, taxYear?: string): Promise<Outcome<string, null>> {
  try {
    if (!employeeId) throw new Error('Employee ID is required');
    const params = { employeeId };
    const response = type === 'P45'
      ? await bcApi(p45Pdf, { params, body: { employeeId } })
      : await bcApi(ENDPOINT[type], { params, body: taxYear ? { employeeId, taxYear } : { employeeId } });
    if (!response.value) throw new Error(`Invalid response format from ${type} document API`);
    return { success: true, data: response.value, error: null };
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error(`Error fetching ${type} PDF:`, e);
    return { success: false, data: null, error: formatBCErrorMessage(e) };
  }
}

/* DOCS.R11: the employee's GUID, from the stored profile's id, else the
   stored employeeId. A stored profile that is not JSON reads as none: in
   QniConnect it threw, and so broke every document, payslips too, with the
   default message (Ruling Q2). */
export function employeeGuid(): string {
  const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  let id: unknown;
  try { id = (JSON.parse(read('employeeData') || '{}') as { id?: unknown } | null)?.id; } catch { id = undefined; }
  return (typeof id === 'string' && id) || read('employeeId') || '';
}

export interface DocumentsData {
  payslips: Payslip[];
  years: YearOption[];
  /* DOCS.R4's first pick; null with no years, which shows every payslip */
  firstYear: string | null;
  /* DOCS.R6: [] when the profile could not be read */
  taxDocuments: TaxDocument[];
  /* the profile could not be read. QniConnect said nothing; the page now does (Ruling Q15) */
  profileFailed: boolean;
}

/* The profile, or null when it could not be read (DOCS.R6). With the
   employee number stored, the bell is told (BELL.R2, fixed: profile.ts). */
async function readProfile(): Promise<EmployeeProfile | null> {
  try {
    const profile = await fetchEmployeeProfile();
    announceEmployeeNo(profile);
    return profile;
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error loading documents:', e);
    return null;
  }
}

/* QniConnect read the payslips first, by the employee number the dashboard
   had stored; opened before the dashboard had run (a link, or a new
   session), the page said there were no payslips. With no number stored the
   profile, which stores it, is now read first (Ruling Q2); the calls are the
   same ones. */
export async function loadDocuments(): Promise<DocumentsData> {
  const profileFirst = !bcContext.employeeNo();
  const early = profileFirst ? await readProfile() : null;
  const payslips = await fetchPayslips();
  const years = yearOptions(await fetchFiscalYears(), payslips);
  const profile = profileFirst ? early : await readProfile();
  return {
    payslips, years, firstYear: defaultYear(years),
    taxDocuments: profile ? taxDocumentsFor(!!profile.validP11D) : [],
    profileFailed: !profile,
  };
}

/* DOCS.R1: loaded again whenever the user or the environment changes, and
   not at all without both. */
export const documentsKey = (user: PortalPerson | null, env: BcEnvironment | null) =>
  ['bc', 'documents', user?.email ?? '', user?.name ?? '', env?.id ?? '', env?.name ?? ''] as const;

export function useDocuments(user: PortalPerson | null, env: BcEnvironment | null) {
  return useQuery({
    queryKey: documentsKey(user, env),
    queryFn: () => {
      if (!user || !env) throw new Error('No signed-in user or environment.');
      return loadDocuments();
    },
    enabled: !!user && !!env,
  });
}
