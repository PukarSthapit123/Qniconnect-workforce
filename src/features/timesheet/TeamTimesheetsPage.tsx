import { useState } from 'react';
import { Info } from 'lucide-react';
import { tid } from '@/testids';
import { Banner, Button, GuideButton, Lead, LEAD_PRIMARY, Note, Page, PageHead, Seg, toastRefusal } from '@/ui';
import { useApprovalQueue, type BulkApproved, type QueueRow } from '@/api/timesheets';
import { useCurrentSession } from '@/shell/SessionProvider';
import { useTenant } from '@/shell/shellData';
import { formatDmy, periodStart } from '@/domain/timesheet';
import { plural } from '@/lib/format';
import { TeamQueue } from './TeamQueue';
import { TeamMatrix } from './TeamMatrix';
import { BulkApproveDialog } from './TeamDialogs';

/* Team timesheets: the prototype's mgrTeamTime (qnipay-workforce-v15.html:6990-7034).
   The banner and approve-all read the pending queue, which the server scopes
   to the approver's site and which leaves out the approver's own days.
   Rows a bulk approval could not decide come back as held and stay listed
   under the banner with the reason for each (D7). */
type View = 'day' | 'week';
interface HeldRow { id: string; who: string; reason: string }

export function TeamTimesheetsPage() {
  const session = useCurrentSession();
  const tenant = useTenant();
  const where = session?.account.locationName || 'your site';
  const [view, setView] = useState<View>('day');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [held, setHeld] = useState<HeldRow[]>([]);
  const pend = useApprovalQueue({ status: 'pend' });
  const q = pend.data;
  const n = q?.counts.pend ?? 0;
  const today = q?.now.date;

  const listBack = (res: BulkApproved, rows: readonly QueueRow[]) => setHeld(res.held.map(h => {
    const r = rows.find(x => x.id === h.id);
    return { id: h.id, who: r ? `${r.employeeName} · ${formatDmy(r.date)}` : h.id, reason: h.reason };
  }));
  const openBulk = () => {
    if (!q) return;
    if (!q.bulk.ids.length) {
      toastRefusal({ message: `Nothing pending at ${where}.`, next: q.bulk.outside
        ? `${plural(q.bulk.outside, 'record')} ${q.bulk.outside === 1 ? 'is' : 'are'} pending at other sites and not yours to approve.` : 'Nothing needs a decision from you.' });
      return;
    }
    setHeld([]);
    setBulkOpen(true);
  };
  return (
    <Page testId={tid.page('tteam')}>
      <PageHead title="Approvals" context={today ? `Week commencing ${formatDmy(periodStart(today))}` : undefined}
        tip={tenant.data ? `Timesheets awaiting a decision at ${where}, ${tenant.data.name}.` : undefined} tipTestId={tid.head.tip('tteam')}
        actions={<>
          <GuideButton view="tteam" />
          <Seg label="Show the day queue or the week" value={view} onChange={setView} testId={v => tid.tteam.view(v)}
            options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
        </>} />
      {pend.isError && <p data-testid={tid.tteam.error} role="alert" className="text-err">The queue could not be loaded. Reload the page to try again.</p>}
      {/* The queue's answer leads, on the dark lead surface (ui/Lead), not
          as a warning: timesheets waiting is this page's normal state, and
          a yellow box for it taught that yellow means nothing (taste review
          2026-10-26). The words are the prototype's banner's. */}
      {q && (n > 0
        ? <Lead testId={tid.tteam.pending} labelledBy="tteam-pending-head">
            <div className="flex flex-wrap items-center justify-between gap-md">
              <div className="min-w-0">
                <h2 id="tteam-pending-head" className="text-xl font-semibold">
                  <span className="text-brand-accent tabular-nums">{n}</span> timesheet{n > 1 ? 's' : ''} awaiting your decision</h2>
                <p className="mt-xs text-sm text-shell-ink">
                  {q.oldestPending && <>The oldest was submitted on {formatDmy(q.oldestPending)}. </>}{q.sla && <>The approval SLA for this layer is {q.sla}.</>}</p>
              </div>
              <Button testId={tid.tteam.approveAll} kind="primary" className={LEAD_PRIMARY} onClick={openBulk}>{q.bulk.ids.length === n ? 'Review and approve all' : `Review and approve ${q.bulk.ids.length} pending`}</Button>
            </div>
          </Lead>
        : <Note testId={tid.tteam.clear} tone="done" title="Nothing waiting on you">
            Every submitted timesheet for this period has been decided.</Note>)}
      {held.length > 0 && <Banner testId={tid.tteam.held} tone="info" icon={<Info />} title={`${held.length} timesheet${held.length > 1 ? 's' : ''} held back`}>
        {held.map(h => <span key={h.id} className="block">{h.who}: {h.reason}</span>)}</Banner>}
      {view === 'day'
        ? <TeamQueue returnReasonRequired={q?.returnReasonRequired ?? true} />
        : today && <TeamMatrix today={today} self={session?.account.employeeCode ?? ''} onDone={listBack} />}
      {bulkOpen && q && <BulkApproveDialog queue={q} where={where} onClose={() => setBulkOpen(false)}
        onDone={res => { listBack(res, pend.data?.rows ?? []); setBulkOpen(false); }} />}
    </Page>);
}
