import { faultsHandler } from './faults';
import { devHandlers } from './dev';
import { sessionHandlers } from './session';
import { tenantHandlers } from './tenant';
import { accessHandlers } from './access';
import { auditHandlers } from './audit-handlers';
import { employeesHandlers } from './employees';
import { transitionHandlers } from './transitions';
import { dimensionHandlers } from './dimensions';
import { workPatternHandlers } from './work-patterns';
import { profileHandlers } from './profile';
import { timesheetHandlers } from './timesheets';
import { savedDataHandlers } from './saved-data';
import { presetHandlers } from './setup-presets';
import { notificationHandlers } from './notifications';
import { approvalHandlers } from './approvals';
import { homeHandlers } from './home';
import { clockHandlers } from './clock';
import { onboardingHandlers } from './onboarding';
import { onboardingTemplateHandlers } from './onboarding-templates';
import { payCodeHandlers } from './pay-codes';
import { payGradeHandlers } from './pay-grades';
import type { HttpHandler } from 'msw';
import { SERVED_HANDLERS } from './serve';
import { fakeModules } from '@/lib/fake-modules';
import { moduleOf } from '@/contract/modules';
/* Order matters: faults first, so they can pre-empt any endpoint. */
export const handlers = [faultsHandler, ...devHandlers, ...sessionHandlers, ...tenantHandlers, ...accessHandlers, ...auditHandlers, ...employeesHandlers, ...transitionHandlers, ...dimensionHandlers, ...workPatternHandlers, ...profileHandlers, ...timesheetHandlers, ...savedDataHandlers, ...presetHandlers, ...notificationHandlers, ...approvalHandlers, ...homeHandlers, ...clockHandlers, ...onboardingHandlers, ...onboardingTemplateHandlers, ...payCodeHandlers, ...payGradeHandlers /* feature handlers appended by later tasks */];

/* What the fake server registers for /api/v1: every handler, unless
   VITE_FAKE_MODULES names some modules, in which case only those modules' endpoint
   handlers (spec N9 and R4, src/lib/fake-modules.ts); the rest pass through to the real
   backend. The fault hook and the fake server's own controls (/api/_dev) are not a
   module's and always stay. Read when called, so browser.ts and node.ts see the mode's value. */
export function apiHandlersIfOn(): HttpHandler[] {
  const on = fakeModules();
  return handlers.filter(h => !SERVED_HANDLERS.has(h) || on.has(moduleOf(String(h.info.path))));
}
