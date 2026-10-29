import type { HttpHandler } from 'msw';
import { bcSessionHandlers } from './session';
import { bcEnvironmentHandlers } from './environments';
import { bcPayrollHandlers } from './payroll';
import { bcDocumentsHandlers } from './documents';
import { bcNotificationsHandlers } from './notifications';
import { bcAdminHandlers } from './admin';
import { bcPortalUserHandlers } from './portal-users';
import { bcRegistrationHandlers } from './registration';

/* The fake QniConnect API (/bc and /session). Feature handlers are appended by later tasks. */
export const bcHandlers: HttpHandler[] = [...bcSessionHandlers, ...bcEnvironmentHandlers, ...bcPayrollHandlers, ...bcDocumentsHandlers, ...bcNotificationsHandlers, ...bcAdminHandlers, ...bcPortalUserHandlers,
  ...bcRegistrationHandlers];

/* What the fake server registers: these, unless VITE_FAKE_BC is 'off', in which
   case /bc and /session pass through to REACT_APP_API_BASE_URL (spec N9, R4).
   Read when called, so browser.ts and node.ts see the mode's .env value. */
export const bcHandlersIfOn = (): HttpHandler[] => (import.meta.env.VITE_FAKE_BC === 'off' ? [] : bcHandlers);
