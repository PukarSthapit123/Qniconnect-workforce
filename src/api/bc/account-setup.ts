/* Account setup's calls, as QniConnect's TenantVerificationService,
   EnvironmentSelector and FirstLoginHandler made them (inventory AUTH.C3 to
   AUTH.C6, AUTH.R47 to AUTH.R57, AUTH.R67). Sequenced calls rather than
   queries: each runs once, when the page or a button asks. The one change
   from QniConnect: a token that needs interaction stops here (the adapter
   is already redirecting) instead of cleaning the session up behind it. */
import { auth } from '@/auth';
import { logger } from '@/lib/logger';
import { clientTenantCompaniesSetup, environmentsList, registrationFilter, type BcEnvironmentItem, type ClientTenantCompaniesResponse } from '@/contract/bc/environments';
import { portalUserUpdateStatus, portalUserVerifyAccess } from '@/contract/bc/session';
import { bcApi, BcError } from './client';
import { bcContext } from './context';
import { cleanupSession } from './cleanup';

export const ZERO_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

export const isInteractionRequired = (e: unknown) => e instanceof Error && e.name === 'InteractionRequiredAuthError';
const textOf = (v: unknown) => (typeof v === 'string' ? v : '');
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/* An environment as TenantVerificationService mapped it (AUTH.C4 "Response fields read"). */
export interface EnvironmentOption {
  id: string; name: string; type: string; url: string; status: string; companyName: string; company_Id: string;
}
export const toEnvironmentOption = (e: BcEnvironmentItem): EnvironmentOption => ({
  id: e.id || e.environmentId || '',
  name: e.environmentName || e.name || '',
  type: e.environmentType || e.type || 'Production',
  url: e.environmentUrl || e.url || '',
  status: e.status || 'Active',
  companyName: e.companyName || e.company_Name || '',
  company_Id: e.company_Id || e.companyId || '',
});
/* AUTH.R52 */
export const hasCompanyId = (e: { company_Id?: string }) => !!e.company_Id && e.company_Id !== ZERO_COMPANY_ID;

export interface AccessResult { exists?: boolean; isActive?: boolean; message?: string; requiresRedirect?: boolean }
/* The account can go on (AUTH.R49): any of these turns it away. */
export const accessDenied = (r: AccessResult) => !!r.requiresRedirect || !r.exists || !r.isActive;

/* AUTH.C3 through verifyUserAccess (AUTH.R47, AUTH.R48). Never throws but
   for a token that needs interaction: every failure is a refusal, and the
   session is cleaned up. */
export async function verifyUserAccess(user: { email: string; oid: string }): Promise<AccessResult> {
  try {
    const r = await bcApi(portalUserVerifyAccess, { body: { email: user.email, userId: user.oid } });
    /* strict: an absent exists or isActive does not clean up */
    const requiresRedirect = r.exists === false || r.isActive === false;
    if (requiresRedirect) cleanupSession();
    const registrationId = r.userData?.registrationId;
    if (registrationId) bcContext.setRegistrationId(registrationId);
    return { exists: r.exists, isActive: r.isActive, message: r.message, requiresRedirect };
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error verifying user access:', e);
    cleanupSession();
    let message = e instanceof Error ? e.message : '';
    if (e instanceof BcError) {
      const d = record(e.data);
      if (e.status === 404) message = textOf(d.message) || 'User not found in Business Central Portal';
      else message = textOf(d.message) || 'Failed to verify user access';
    }
    return { exists: false, isActive: false, message: message || 'Error verifying user access', requiresRedirect: true };
  }
}

/* AUTH.C4 through getAvailableEnvironments (AUTH.R47, AUTH.R50): filtered by
   the stored registration id when there is one. Never throws but for a token
   that needs interaction: a failure is an empty list. */
export async function availableEnvironments(): Promise<EnvironmentOption[]> {
  const registrationId = bcContext.registrationId();
  try {
    const data = await bcApi(environmentsList, registrationId ? { query: { $filter: registrationFilter(registrationId) } } : {});
    return (data.value || data.environments || []).map(toEnvironmentOption);
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error getting environments:', e);
    return [];
  }
}

/* AUTH.R57: what QniConnect took to mean the environment's Business Central
   authorization is incomplete, flagged for the admin's banner (AUTH.R45). */
const flagForAdmin = (environmentName: string, code: string) => {
  try {
    localStorage.setItem('adminAuthIncomplete', 'true');
    localStorage.setItem('adminAuthEnvironment', environmentName);
    localStorage.setItem('adminAuthErrorCode', code);
  } catch { /* no storage: nothing to flag */ }
};
const authish = (m: string) => ['getClientToken', 'auth', 'token', 'unauthorized', 'permission'].some(s => m.includes(s));
function httpAuthProblem(e: BcError): boolean {
  if (e.status === 401 || e.status === 403) return true;
  const d = record(e.data);
  if (Object.keys(d).length === 0 && e.text) {
    /* a body that was not JSON: QniConnect tested its raw text */
    return ['getClientToken', 'No HTTP resource was found', 'auth', 'token'].some(s => e.text.includes(s));
  }
  const message = textOf(d.message) || textOf(d.error);
  const bcMessage = textOf(record(record(d.responseData).error).message);
  return bcMessage.includes('getClientToken') || ['No HTTP resource was found', 'auth', 'token'].some(s => message.includes(s));
}

/* AUTH.R53 and AUTH.R57: the chosen environment has no company yet, so the
   backend is asked to look it up (AUTH.C5), then the list is read again for
   it. Every failure is logged (and, when it looks like authorization,
   flagged): the person always goes on. Gives the company id found, if any.
   The exception, as everywhere in this file: a token that needs interaction
   is thrown on, since MSAL is already redirecting (final review M2). */
export async function lookUpCompany(env: EnvironmentOption): Promise<string | null> {
  let token: string | null;
  try {
    token = await auth().token('login');
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error in company setup:', e);
    if (authish(e instanceof Error ? e.message : '')) flagForAdmin(env.name, 'SETUP_ERROR');
    return null;
  }
  const registrationId = bcContext.registrationId();
  if (!token || !registrationId) { logger.warn('Missing authentication token or registration ID, but continuing anyway'); return null; }
  let r: ClientTenantCompaniesResponse;
  try {
    r = await bcApi(clientTenantCompaniesSetup, { body: { environmentName: env.name, registrationId } });
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Failed to fetch client tenant companies:', e);
    if (e instanceof BcError ? httpAuthProblem(e) : authish(e instanceof Error ? e.message : ''))
      flagForAdmin(env.name, e instanceof BcError ? String(e.status) : 'FETCH_ERROR');
    return null;
  }
  if (!r.updateResult?.success) { logger.warn('Company ID update not successful, but continuing anyway'); return null; }
  try {
    const found = (await availableEnvironments()).find(x => x.id === env.id);
    return found?.company_Id || null;
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error refreshing environments:', e);
    return null;
  }
}

/* AUTH.C6 for the first-login overlay (AUTH.R67, AUTH.R68): throws unless
   the answer says success. */
export async function activatePortalUser(userId: string): Promise<void> {
  const r = await bcApi(portalUserUpdateStatus, { params: { userId }, body: { status: 'Active' } });
  if (!r.success) throw new Error(r.message || 'Failed to update user status');
}
