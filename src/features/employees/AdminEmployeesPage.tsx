import { tid } from '@/testids';
import { GuideButton, Page, PageHead } from '@/ui';
import { useCaps } from '@/shell/useCaps';
import { usePortalAdmin } from '@/shell/shellData';
import { ProfileQueue } from '@/features/profile/ProfileQueue';
import { NotConnected } from '@/features/profile/NotConnected';
import { EmployeesWorkspace } from './EmployeesWorkspace';
import { PortalLoginPanel, usePortalLogins } from './PortalLoginPanel';

const VIEW = 'aemployees';
const TITLE = 'Employees';
const TIP = 'Each Workforce record, with whether that person can sign in to the QniConnect portal, matched by employee number.';
const RECORDS_NOTE = 'The Workforce records run on sample data until the workforce service is connected. The portal logins are live.';

/* Setup · Employees (spec D12; admEmployees, qnipay-workforce-v15.html:
   8041): one admin page and one table, each person once, keyed by employee
   number. The two sources sit behind two gates (N18):
   - the Workforce records (the fake /api/v1), for master_data: the one
     employee record Timesheet reads, with the bank detail changes a manager
     has approved waiting for payroll above them (D3);
   - the portal logins (the real /bc/portalUsers, inventory USERS), for a
     portal admin: isAdmin wins for QniConnect admin access (D8), so an
     administrator without master_data still manages the logins.
   They meet in the browser only, by employee number, and a person on one
   side only is kept (N19): a record without a login offers an invitation on
   the record; a login without a record is not listed here (user ruling
   2026-10-27), only on the logins-only list. The records say "Not yet
   connected" while they run on the fake server. */
export function AdminEmployeesPage() {
  const caps = useCaps(), portalAdmin = usePortalAdmin();
  if (!caps.has('master_data')) return <LoginsOnly />;
  return portalAdmin ? <WithLogins bankQueue={caps.has('bank_verify')} /> : <Records bankQueue={caps.has('bank_verify')} />;
}

const head = (
  <p data-testid={tid.people.records} className="mb-md flex flex-wrap items-center gap-sm text-xs text-text-muted">
    <NotConnected testId={tid.people.recordsNotConnected} note={RECORDS_NOTE} /></p>);

/* the logins are read only for a portal admin, so the hook lives here */
function WithLogins({ bankQueue }: { bankQueue: boolean }) {
  const logins = usePortalLogins();
  return (
    <EmployeesWorkspace variant="admin" view={VIEW} title={TITLE} tip={TIP} above={bankQueue ? <ProfileQueue stage="payroll" /> : undefined}
      listHead={head} portal={logins} />);
}
function Records({ bankQueue }: { bankQueue: boolean }) {
  return (
    <EmployeesWorkspace variant="admin" view={VIEW} title={TITLE} tip={TIP} above={bankQueue ? <ProfileQueue stage="payroll" /> : undefined}
      listHead={head} />);
}

/* A portal admin without master_data: the portal logins alone. No Workforce
   record is read, so none is matched. */
function LoginsOnly() {
  return (
    <Page testId={tid.page(VIEW)}>
      <PageHead title={TITLE} tip={TIP} tipTestId={tid.head.tip(VIEW)} actions={<GuideButton view={VIEW} />} />
      <PortalLoginPanel />
    </Page>);
}
