/* The portal dashboard's data, as QniConnect's Dashboard and
   BusinessCentralService loaded it (docs/superpowers/inventory/portal.md,
   HOME.R1 to HOME.R11), one strictly serial sequence (HOME.R2):
     1. the company (HOME.R4 to HOME.R6): from the environment when it has
        one, else looked up (HOME.C1), every failure swallowed;
     2. the profile (HOME.C2), with its company recovery (HOME.R7), its
        storage (HOME.R10) and session init (HOME.C5);
     3. the payslips (HOME.C3), which read the employeeNo step 2 stored.
   A profile that fails leaves the page without a person and fetches no
   payslips (HOME.R9). A token that needs interaction is passed on: the
   adapter is already redirecting.
   The dev-mode mock answers QniConnect fell back to (HOME.X1 to HOME.X4) are
   gone: the fake /bc server answers in development (Ruling Q3). */
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { logger } from '@/lib/logger';
import { clientTenantCompanies } from '@/contract/bc/environments';
import { sessionInit } from '@/contract/bc/session';
import { employeeCurrent, payslipPdf, payslipsList, type EmployeeProfile, type EmployeeProfileQuery, type Payslip } from '@/contract/bc/payroll';
import { bcApi } from './client';
import { bcContext, type BcEnvironment } from './context';
import { bcEvents } from './events';
import { isInteractionRequired, ZERO_COMPANY_ID } from './account-setup';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
interface Company { id?: string | null; name?: string | null; displayName?: string | null }

/* HOME.R6 and HOME.R7: the company whose name or display name is the
   environment's company name, trimmed and lower-cased, exactly. */
const norm = (s: unknown) => str(s).trim().toLowerCase();
const matching = (companies: unknown[], companyName: string): Company | undefined => {
  const want = norm(companyName);
  return companies.find((c): c is Company => !!c && typeof c === 'object'
    && (norm((c as Company).name) === want || norm((c as Company).displayName) === want));
};
/* Store the match's id and name, or forget both. A match without an id is
   no match: QniConnect stored the text "undefined" for it. */
const remember = (company: Company | undefined): string | null => {
  const id = str(company?.id);
  if (company && id) {
    bcContext.setClientCompanyId(id);
    bcContext.setClientCompanyName(str(company.name) || str(company.displayName));
    return id;
  }
  bcContext.setClientCompanyId(null);
  bcContext.setClientCompanyName(null);
  return null;
};

/* Step 1 (HOME.R4 to HOME.R6). Never throws but for a token that needs interaction. */
export async function fetchClientCompanies(env: BcEnvironment): Promise<void> {
  const companyId = str(env.company_Id), companyName = str(env.companyName);
  if (companyId && companyId !== ZERO_COMPANY_ID) {
    bcContext.setClientCompanyId(companyId);
    if (companyName) bcContext.setClientCompanyName(companyName);
    return;
  }
  const registrationId = bcContext.registrationId();
  if (!registrationId) { logger.warn('No registrationId stored, so the companies are not looked up.'); return; }
  try {
    const response = await bcApi(clientTenantCompanies, { body: { environmentName: env.name, registrationId } });
    const companies: unknown = Array.isArray(response) ? response : response.value;
    if (!Array.isArray(companies)) { logger.warn('The company list is not a list:', response); return; }
    bcContext.setClientCompanies(companies);
    remember(companyName ? matching(companies, companyName) : undefined);
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error fetching client companies:', e);
  }
}

/* HOME.R7: no company stored, but the environment names one and the last
   company list is stored: look it up there. */
function recoverClientCompanyId(): void {
  if (bcContext.clientCompanyId()) return;
  const companyName = str(bcContext.environment()?.companyName);
  const companies = bcContext.clientCompanies();
  if (!companyName || !Array.isArray(companies) || companies.length === 0) return;
  remember(matching(companies, companyName));
}

/* HOME.C2's query: each param only when it has a value, in this order. */
export function profileQuery(): z.input<typeof EmployeeProfileQuery> {
  const q: Record<string, string> = {};
  const registrationId = bcContext.registrationId(), environment = bcContext.environment()?.name, company = bcContext.clientCompanyId();
  const email = bcContext.userEmail();
  if (registrationId) q.registrationId = registrationId;
  if (environment) q.clientEnvironment = environment;
  if (company) q.clientCompanyId = company;
  if (email) q.email = email.toLowerCase();
  return q;
}

/* QniConnect read currentUser.email.toLowerCase() for X-User-Email before
   sending anything, so without an email the profile fails here (HOME.R8). */
const NO_EMAIL = 'There is no signed-in email address to look the employee up by.';

/* Step 2: HOME.C2, then its storage and HOME.C5 (HOME.R10). Throws on any failure. */
export async function fetchEmployeeProfile(): Promise<EmployeeProfile> {
  recoverClientCompanyId();
  const email = bcContext.userEmail();
  if (!email) throw new Error(NO_EMAIL);
  const profile = await bcApi(employeeCurrent, { query: profileQuery() });
  bcContext.setEmployeeNo('');
  if (profile.id) {
    bcContext.setEmployeeRecord(profile.id, profile);
    if (profile.employeeNo) {
      bcContext.setEmployeeNo(profile.employeeNo);
      try {
        logger.log('Session init:', await bcApi(sessionInit, {
          body: { registrationId: bcContext.registrationId() || '', userEmail: email.toLowerCase(), employeeNo: profile.employeeNo } }));
      } catch (e) {
        logger.error('Session init with the employee number failed:', e);
      }
    }
  }
  return profile;
}

/* Step 3: HOME.C3. A failure is no payslips (BCS:495-499). */
export async function fetchPayslips(): Promise<Payslip[]> {
  try {
    return await bcApi(payslipsList);
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error fetching payslips:', e);
    return [];
  }
}

/* HOME.C4: the PDF as base64. Throws when it cannot be had. */
export async function fetchPayslipPdf(systemId: string): Promise<string> {
  const r = await bcApi(payslipPdf, { params: { systemId }, body: { systemId } });
  if (!r.value) throw new Error('Invalid response format from payslip PDF API');
  return r.value;
}

/* What the dashboard shows of the person (HOME.R11): QniConnect's defaults,
   'N/A' where it had one. The department is the environment's, not the
   employee's. NI category joins only the parts there are, 'N/A' with none:
   QniConnect wrote the word "undefined" for a missing part (HOME.R17, fixed
   under Ruling Q2). */
export interface DashboardPerson {
  name: string; position: string; department: string; employeeId: string; email: string; joinDate: string;
  payFrequency: string; taxCode: string; niNumber: string; niCategory: string; phone: string;
  address: string; address2: string; addressLine3: string; addressLine4: string; city: string; postCode: string;
}
export interface PortalPerson { name: string; email: string }
export function toDashboardPerson(p: EmployeeProfile, user: PortalPerson, env: BcEnvironment): DashboardPerson {
  return {
    name: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || user.name,
    position: p.jobTitle || 'Employee',
    department: str(env.department),
    employeeId: p.employeeNo || 'N/A',
    email: p.email || user.email,
    joinDate: p.employmentDate || 'N/A',
    payFrequency: p.frequency || 'N/A',
    taxCode: p.hmrcTaxCode || 'N/A',
    niNumber: p.nationalInsuranceNumber || 'N/A',
    niCategory: [p.niClassCode, p.nationalInsuranceCode].filter(Boolean).join(' ') || 'N/A',
    phone: p.mobilePhoneNo || 'N/A',
    address: p.address || 'N/A',
    address2: p.address2 || 'N/A',
    addressLine3: p.addressLine3 || '',
    addressLine4: p.addressLine4 || '',
    city: p.city || '',
    postCode: p.postCode || '',
  };
}

/* person null: the profile could not be read (HOME.R9). */
export interface Dashboard { person: DashboardPerson | null; payslips: Payslip[] }

export async function loadDashboard(user: PortalPerson, env: BcEnvironment): Promise<Dashboard> {
  await fetchClientCompanies(env);
  let profile: EmployeeProfile;
  try {
    profile = await fetchEmployeeProfile();
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error fetching employee data:', e);
    return { person: null, payslips: [] };
  }
  /* EP:158-166: stored again, and the bell told, only with a number */
  bcContext.setEmployeeNo('');
  if (profile.employeeNo) {
    bcContext.setEmployeeNo(profile.employeeNo);
    bcEvents.emit('employee-no-ready');
  } else logger.warn('The profile has no employeeNo, so notifications cannot load.');
  const person = toDashboardPerson(profile, user, env);
  return { person, payslips: await fetchPayslips() };
}

/* HOME.R1 and HOME.R3: the sequence runs again whenever the user or the
   environment changes, and not at all without both. */
export const dashboardKey = (user: PortalPerson | null, env: BcEnvironment | null) =>
  ['bc', 'dashboard', user?.email ?? '', user?.name ?? '', env?.id ?? '', env?.name ?? '', str(env?.companyName), str(env?.company_Id)] as const;

export function useDashboard(user: PortalPerson | null, env: BcEnvironment | null) {
  return useQuery({
    queryKey: dashboardKey(user, env),
    queryFn: () => {
      if (!user || !env) throw new Error('No signed-in user or environment.');
      return loadDashboard(user, env);
    },
    enabled: !!user && !!env,
  });
}
