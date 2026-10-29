/* The profile page's Business Central record, as QniConnect's
   EmployeeProfile loaded it (docs/superpowers/inventory/portal.md, PROF.R1):
   one profile call (HOME.C2) with all its storage (HOME.R7 to HOME.R10:
   employeeNo, employeeId, employeeData and session init), again whenever the
   user or the environment changes, and not at all without both.
   With the number stored, the bell is told (BELL.R2, fixed under Ruling Q2:
   QniConnect's bell waited for the dashboard). */
import { useQuery } from '@tanstack/react-query';
import type { EmployeeProfile } from '@/contract/bc/payroll';
import { bcContext, type BcEnvironment } from './context';
import { bcEvents } from './events';
import { fetchEmployeeProfile, type PortalPerson } from './payroll';

/* Tell the bell, when a profile has just stored the employee number. */
export function announceEmployeeNo(profile: EmployeeProfile): void {
  if (profile.employeeNo && bcContext.employeeNo()) bcEvents.emit('employee-no-ready');
}

/* Throws when the profile cannot be read (PROF.R12). */
export async function loadProfile(): Promise<EmployeeProfile> {
  const profile = await fetchEmployeeProfile();
  announceEmployeeNo(profile);
  return profile;
}

export const profileKey = (user: PortalPerson | null, env: BcEnvironment | null) =>
  ['bc', 'profile', user?.email ?? '', user?.name ?? '', env?.id ?? '', env?.name ?? ''] as const;

export function useBcProfile(user: PortalPerson | null, env: BcEnvironment | null) {
  return useQuery({
    queryKey: profileKey(user, env),
    queryFn: () => {
      if (!user || !env) throw new Error('No signed-in user or environment.');
      return loadProfile();
    },
    enabled: !!user && !!env,
  });
}
