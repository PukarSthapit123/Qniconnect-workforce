import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { tid } from '@/testids';
import type { Employee } from '@/contract/employees';
import { GuideButton, Page, PageHead } from '@/ui';
import { useCaps } from '@/shell/useCaps';
import { usePortalAdmin } from '@/shell/shellData';
import { useEmployees } from '@/api/employees';
import { usePortalUsers } from '@/api/bc/portal-users';
import { ProfileQueue } from '@/features/profile/ProfileQueue';
import { NotConnected } from '@/features/profile/NotConnected';
import type { PortalUserForm } from '@/domain/people-access';
import { EmployeesWorkspace } from './EmployeesWorkspace';
import { PortalLoginPanel } from './PortalLoginPanel';

const VIEW = 'aemployees';
const TITLE = 'People & access';
const CRUMB = 'Setup · People & access';
const TIP = 'Each person once: their Workforce record and their QniConnect portal login, matched by employee number.';
const RECORDS_NOTE = 'The Workforce records run on sample data until the workforce service is connected. The portal logins are live.';

/* Setup · People & access (spec D12; admEmployees, qnipay-workforce-v15.html:
   8041): one admin page, each person keyed by employee number, with two
   halves behind two gates (N18):
   - the Workforce records (the fake /api/v1), for master_data: the one
     employee record Timesheet reads, with the bank detail changes a manager
     has approved waiting for payroll above them (D3);
   - the portal logins (the real /bc/portalUsers, inventory USERS), for a
     portal admin: isAdmin wins for QniConnect admin access (D8), so an
     administrator without master_data still manages the logins.
   The halves meet in the browser only, by employee number, and a person on
   one side only is kept (N19). The Workforce half says "Not yet connected"
   while it runs on the fake server. */
export function AdminEmployeesPage() {
  const caps = useCaps(), portalAdmin = usePortalAdmin();
  return caps.has('master_data') ? <WithRecords portalAdmin={portalAdmin} bankQueue={caps.has('bank_verify')} /> : <LoginsOnly />;
}

const toInvite = (p: Employee): PortalUserForm => ({ name: p.name, email: p.email, role: 'User', isAdmin: false });

function WithRecords({ portalAdmin, bankQueue }: { portalAdmin: boolean; bankQueue: boolean }) {
  const [invite, setInvite] = useState<PortalUserForm | null>(null);
  const users = usePortalUsers(portalAdmin);
  const everyone = useEmployees('all', '');
  const [, setParams] = useSearchParams();
  const onInvite = useCallback((p: Employee) => setInvite(toInvite(p)), []);
  const portal = useMemo(() => (portalAdmin ? { users: users.data, onInvite } : undefined), [portalAdmin, users.data, onInvite]);
  /* a login's Workforce record opens as the record's own deep link does */
  const openRecord = (code: string) => setParams(prev => { const next = new URLSearchParams(prev); next.set('employee', code); return next; });
  return (
    <EmployeesWorkspace variant="admin" view={VIEW} title={TITLE} crumb={CRUMB} tip={TIP}
      above={bankQueue ? <ProfileQueue stage="payroll" /> : undefined}
      listHead={
        <h2 data-testid={tid.people.records} className="mb-md flex flex-wrap items-center gap-sm">Workforce records
          <NotConnected testId={tid.people.recordsNotConnected} note={RECORDS_NOTE} /></h2>}
      portal={portal}
      below={portalAdmin
        ? <div className="mt-xl"><PortalLoginPanel employees={everyone.data} invite={invite} onInviteClose={() => setInvite(null)} onOpenRecord={openRecord} /></div>
        : undefined} />);
}

/* A portal admin without master_data: the portal logins alone. No Workforce
   record is read, so none is matched. */
function LoginsOnly() {
  return (
    <Page testId={tid.page(VIEW)}>
      <PageHead title={TITLE} crumb={CRUMB} tip={TIP} tipTestId={tid.head.tip(VIEW)} actions={<GuideButton view={VIEW} />} />
      <PortalLoginPanel employees={null} />
    </Page>);
}
