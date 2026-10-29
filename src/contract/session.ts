import { z } from 'zod';
import { defineEndpoint } from './endpoints';

export const SessionAccount = z.object({ email: z.string(), userType: z.enum(['employee', 'manager', 'admin']), employeeCode: z.string(), name: z.string() });
/* The signed-in account as the account menu shows it: who, their role and
   what it is for, and where they work. */
export const SessionAccountView = SessionAccount.extend({ roleName: z.string(), roleDescription: z.string(), locationName: z.string() });
/* The Workforce session of the signed-in Microsoft account (spec section 6):
   who they are on the fake server, and what they may do. There is no token
   of its own: every call carries the Microsoft one. */
export const Session = z.object({
  account: SessionAccountView, capabilities: z.array(z.string()),
  /* roleName: the display name of the viewed employee's user type (D11), so
     the role pill shows a renamed role while viewing as someone */
  viewingAs: z.object({ employeeCode: z.string(), name: z.string(), userType: SessionAccount.shape.userType, roleName: z.string() }).optional(),
  /* module 5 D8: the employee whose eyes this is (the viewed one while viewing as) is a
     candidate or preboarding while the Onboarding module is on, so they see the portal only */
  onboarding: z.boolean(),
});
export type Session = z.infer<typeof Session>;
export const ViewAsRequest = z.object({ employeeCode: z.string() });
/* One employee the account menu offers to view as: one per role (and one per
   employee type among employees), so the list shows how the app differs
   rather than listing the workforce. */
export const ViewAsEmployee = z.object({ employeeCode: z.string(), name: z.string(), userType: SessionAccount.shape.userType,
  roleName: z.string(), locationName: z.string(), onboarding: z.boolean() });
export type ViewAsEmployee = z.infer<typeof ViewAsEmployee>;
export const DemoAccount = z.object({ email: z.string(), name: z.string(), userType: SessionAccount.shape.userType, employeeCode: z.string() });

export const getSession = defineEndpoint({ method: 'GET', path: '/api/v1/session', response: Session, summary: 'The Workforce session of the signed-in Microsoft account, opened on its first use' });
export const deleteSession = defineEndpoint({ method: 'DELETE', path: '/api/v1/session', response: z.null(), allowedWhileViewing: true, allowedWhileOnboarding: true, summary: 'Sign out: ends the Workforce session (view-as included); the client then signs out of Microsoft' });
export const startViewAs = defineEndpoint({ method: 'POST', path: '/api/v1/session/view-as', request: ViewAsRequest, response: Session, capability: 'perm_cfg', summary: 'Look at the app as another employee, as a preview in which changes are off; audited' });
export const listViewAsEmployees = defineEndpoint({ method: 'GET', path: '/api/v1/session/view-as/employees', response: z.array(ViewAsEmployee), capability: 'perm_cfg', summary: 'Who the account menu offers to view as: at most five, one per role' });
export const endViewAs = defineEndpoint({ method: 'DELETE', path: '/api/v1/session/view-as', response: Session, allowedWhileViewing: true, summary: 'Return to your own account' });
export const listAccounts = defineEndpoint({ method: 'GET', path: '/api/v1/session/accounts', response: z.array(DemoAccount), public: true, devOnly: true, summary: 'The seed people the dev sign-in picker offers (development and tests only)' });
