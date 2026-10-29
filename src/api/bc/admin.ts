/* The admin pages' calls (docs/superpowers/inventory/admin.md) and where
   each one's X-BC-Environment comes from (BCS.R5, BCS.R12):
   - the overview made its own service instance and set the session's
     environment on it, so its four calls carry that environment whenever
     there is one (ADM.DASH.R2a). Its side effect, rewriting the stored
     environment with fewer fields (R2b), is gone (Ruling Q11);
   - Environments and Authorization shared one instance that held an
     environment only once "Set as default" had been used (ENV.R6d), so
     their calls carry it from then on, and not before. That instance lived
     as long as the page did; so does `sharedEnvironment` here.
   The overview's four calls run one after another, each failure only logged
   and read as nothing (ADM.DASH.R3). A token that needs interaction is
   passed on: the adapter is already redirecting.
   QniConnect's development fallbacks (BCS.R11 and the pages' mock sets) are
   gone: the fake /bc server answers in development (Ruling Q3). */
import { useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import {
  adminEnvironmentsList, adminRegistrationFilter, authRefresh, authStatus, authUrl, environmentCreate, portalRegistration,
  type AuthStatus, type AuthUrlResponse, type EnvironmentCreateRequest,
} from '@/contract/bc/admin';
import { portalUsersList, type BcPortalUser } from '@/contract/bc/portal-users';
import type { BcHeader } from '@/contract/bc/endpoints';
import { toAdminEnvironment, type AdminEnvironment } from '@/domain/admin';
import { bcApi } from './client';
import { bcContext, type BcEnvironment } from './context';
import { isInteractionRequired } from './account-setup';

/* The Environments and Authorization pages' own environment (ENV.R6d). */
let sharedEnvironment: string | null = null;
export const adminInstance = {
  environment: () => sharedEnvironment,
  setEnvironment: (id: string | null) => { sharedEnvironment = id; },
};
export const shared = (): Partial<Record<BcHeader, string>> => ({ 'X-BC-Environment': sharedEnvironment ?? '' });
const own = (env: BcEnvironment | null): Partial<Record<BcHeader, string>> => ({ 'X-BC-Environment': env?.id ?? '' });
const registrationQuery = () => { const r = bcContext.registrationId(); return r ? { registrationId: r } : {}; };
const filterQuery = () => { const r = bcContext.registrationId(); return r ? { $filter: adminRegistrationFilter(r) } : {}; };

/* ---------- the overview (ADM.DASH) ---------- */

export interface OverviewData {
  users: BcPortalUser[];
  environments: AdminEnvironment[];
  auth: { status: string | null; expiresAt: string | null };
  tenant: { name: string; id: string; registrationDate: string | null };
}
async function quietly<T>(what: string, call: () => Promise<T>, none: T): Promise<T> {
  try { return await call(); } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error(`Error fetching ${what}:`, e);
    return none;
  }
}
/* ADM.C1 to ADM.C4, in QniConnect's order, with their fallbacks (ADM.DASH
   "Response fields read"). A registration date the backend does not send is
   unknown, not QniConnect's made-up 1 January 2025 (ADM.DASH fallbacks). */
export async function loadOverview(env: BcEnvironment | null): Promise<OverviewData> {
  const headerValues = own(env);
  const users = await quietly('portal users', async () => {
    const r = await bcApi(portalUsersList, { headerValues });
    return r.value || [];
  }, [] as BcPortalUser[]);
  const environments = await quietly('environments', async () => {
    const r = await bcApi(adminEnvironmentsList, { query: filterQuery(), headerValues });
    return (r.value || r.environments || []).map(toAdminEnvironment);
  }, [] as AdminEnvironment[]);
  const status = await quietly('authorization status', () => bcApi(authStatus, { query: registrationQuery(), headerValues }), null);
  const registration = await quietly('tenant info', () => bcApi(portalRegistration, { headerValues }), null);
  return {
    users, environments,
    auth: { status: status?.status || null, expiresAt: status?.expiresAt || null },
    tenant: {
      name: registration?.companyName || env?.name || 'Unknown',
      id: registration?.id || env?.id || 'Unknown',
      registrationDate: registration?.registrationDate || null,
    },
  };
}
/* ADM.DASH.R1: again whenever the environment changes. */
export function useOverview(env: BcEnvironment | null) {
  return useQuery({ queryKey: ['bc', 'admin', 'overview', env?.id ?? '', env?.name ?? ''], queryFn: () => loadOverview(env) });
}

/* ---------- Environments (ENV) ---------- */

/* ENV.C1, loaded when the page opens (ENV.R1), never again while it is open. */
export async function fetchAdminEnvironments(): Promise<AdminEnvironment[]> {
  const r = await bcApi(adminEnvironmentsList, { query: filterQuery(), headerValues: shared() });
  return (r.value || r.environments || []).map(toAdminEnvironment);
}
export const adminEnvironmentsKey = ['bc', 'admin', 'environments'] as const;
export function useAdminEnvironments() {
  return useQuery({ queryKey: adminEnvironmentsKey, queryFn: fetchAdminEnvironments, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
}
/* ENV.C2: the form as typed (ENV.R2). The answer goes through the list's
   own mapper (QniConnect appended it raw, so an answer without `id` broke the list). */
export async function createAdminEnvironment(form: EnvironmentCreateRequest): Promise<AdminEnvironment> {
  return toAdminEnvironment(await bcApi(environmentCreate, { body: form, headerValues: shared() }));
}

/* ---------- Authorization (AUTHZ) ---------- */

export const fetchAuthStatus = (): Promise<AuthStatus | null> => bcApi(authStatus, { query: registrationQuery(), headerValues: shared() });
/* AUTHZ.C2. The registration id it sends back is stored (AUTHZ.R6). */
export async function fetchAuthUrl(): Promise<AuthUrlResponse> {
  const r = await bcApi(authUrl, { query: registrationQuery(), headerValues: shared() });
  if (r.registrationId) bcContext.setRegistrationId(r.registrationId);
  return r;
}
/* AUTHZ.C3: { registrationId } or {}. */
export const refreshAuthorization = (): Promise<AuthStatus | null> =>
  bcApi(authRefresh, { body: registrationQuery(), headerValues: shared() });
