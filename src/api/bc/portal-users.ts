/* Setup · Employees' portal user calls (docs/superpowers/inventory/admin.md,
   USERS). QniConnect's UserManagement used the admin pages' shared service
   instance (BCS.R12), so its calls carry X-BC-Environment only once Set as
   default has given that instance an environment (ENV.R6d), as Environments'
   do. Activating and deactivating is updateUserStatus's own fetch (USERS.C4,
   which is AUTH.C6): Content-Type and the token, nothing else (USERS.R18).

   The list loads once when the page opens (USERS.R1); a change updates the
   list in place from the answer, and nothing is read again. QniConnect's
   development fallbacks (its five made-up users, the "development mode"
   status success) are gone: the fake /bc server answers (Ruling Q3). */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { portalUserCreate, portalUsersList, portalUserUpdate, type BcPortalUser } from '@/contract/bc/portal-users';
import { portalUserUpdateStatus } from '@/contract/bc/session';
import { sanitisePortalUser, toPortalUserRow, type PortalUserForm, type PortalUserRow } from '@/domain/people-access';
import { bcApi } from './client';
import { shared } from './admin';

/* USERS.C1: `response.value || []`. */
export async function fetchPortalUsers(): Promise<PortalUserRow[]> {
  const r = await bcApi(portalUsersList, { headerValues: shared() });
  return (r.value || []).map(toPortalUserRow);
}
export const portalUsersKey = ['bc', 'portal-users'] as const;
/* Only for a portal admin (spec N18): nobody else is asked. */
export function usePortalUsers(enabled: boolean) {
  return useQuery({ queryKey: portalUsersKey, queryFn: fetchPortalUsers, enabled, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
}
/* The list as this page holds it, changed in place (USERS.R5, R10, R12). */
export const updatePortalUsersList = (qc: QueryClient, change: (users: PortalUserRow[]) => PortalUserRow[]) =>
  qc.setQueryData<PortalUserRow[]>(portalUsersKey, users => change(users ?? []));

/* USERS.C2: the form sanitised (USERS.R7). */
export const createPortalUser = (form: PortalUserForm): Promise<BcPortalUser> =>
  bcApi(portalUserCreate, { body: sanitisePortalUser(form), headerValues: shared() });
/* USERS.C3: the same sanitising (USERS.R8); the answer may be empty. */
export const updatePortalUser = (userId: string, form: PortalUserForm): Promise<BcPortalUser | null | undefined> =>
  bcApi(portalUserUpdate, { params: { userId }, body: sanitisePortalUser(form), headerValues: shared() });
/* USERS.C4: success is no refusal; the answer is not read. */
export async function setPortalUserStatus(userId: string, status: 'Active' | 'Inactive'): Promise<void> {
  await bcApi(portalUserUpdateStatus, { params: { userId }, body: { status } });
}
