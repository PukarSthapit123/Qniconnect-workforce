/* The /api/v1 modules, as the backend hand-off groups them
   (docs/superpowers/handoff/backend-inputs.md, scripts/handoff.ts) and as
   VITE_FAKE_MODULES names them (src/lib/fake-modules.ts): Timesheet's and
   Onboarding's endpoints by their first path segment, and everything else
   (session, tenant, people, access, approvals, notifications, ...) is Core. */
export const MODULES = ['core', 'timesheet', 'onboarding'] as const;
export type Module = (typeof MODULES)[number];

const TIMESHEET = ['timesheets', 'timesheet-days', 'timesheet-config', 'clock'];

export function moduleOf(path: string): Module {
  const first = path.replace(/^\/api\/v1\//, '').split('/')[0] ?? '';
  if (first === 'onboarding') return 'onboarding';
  if (TIMESHEET.includes(first)) return 'timesheet';
  return 'core';
}
