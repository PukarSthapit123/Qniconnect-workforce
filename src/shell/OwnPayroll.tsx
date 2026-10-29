import { tid } from '@/testids';
import { Banner } from '@/ui';
import { useCurrentSession } from './SessionProvider';

/* Business Central payroll (payslips, tax documents, the payroll record)
   always belongs to the signed-in account: /bc knows nothing of the
   Workforce view-as. So while looking at the app as someone else it is
   neither asked for nor shown, as the bell (Shell.tsx useInbox) and Business
   Central setup (shellData.tsx isPortalAdmin) already do; the viewed
   person's Workforce data stays (final review I1). */
export const useOwnPayroll = (): boolean => !useCurrentSession()?.viewingAs;

/* What Home, Documents and My profile show in the payroll's place. */
export function PayrollHidden() {
  const name = useCurrentSession()?.viewingAs?.name;
  return (
    <Banner testId={tid.shell.payrollHidden} tone="info" title="Payroll details are not shown while you look at the app as someone else.">
      Payslips, tax documents and the payroll record are your own{name ? `, not ${name}'s` : ''}. Choose Return to my account to see yours.
    </Banner>);
}
