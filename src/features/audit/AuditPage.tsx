import { useState } from 'react';
import { tid } from '@/testids';
import { Button, Card, Count, FilterBar, Page, PageHead, Row, SearchFilter, SelectFilter } from '@/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { useAudit } from '@/api/audit';
import { formatDateTime } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { auditCount, detail, whoLabel } from './entry';

/* The entities the session, view-as, access and plan 1b handlers write (see
   mocks/session.ts, access.ts, employees.ts and the rest). A future handler adding a new kind of
   audited change should add its label here too. */
const ENTITY_OPTIONS = [
  { value: 'all', label: 'All records' },
  { value: 'userType', label: 'Access roles' },
  { value: 'account', label: 'User accounts' },
  { value: 'session', label: 'Sessions and view-as' },
  { value: 'employee', label: 'Employees' },
  { value: 'profileChange', label: 'Profile changes' },
  { value: 'workPattern', label: 'Work patterns' },
  { value: 'location', label: 'Sites' },
  { value: 'department', label: 'Departments' },
  { value: 'costCentre', label: 'Cost centres' },
  { value: 'position', label: 'Positions' },
  { value: 'project', label: 'Projects' },
  { value: 'timesheetDay', label: 'Timesheets' },
  { value: 'timesheetConfig', label: 'Timesheet setup' },
  { value: 'tenant', label: 'Modules, features and tenant settings' },
  { value: 'savedData', label: 'Saved data' },
  { value: 'setupPreset', label: 'Setup presets' },
];

/* Ported from the prototype's admAudit (qnipay-workforce-v15.html:9682-9688):
   When (12px muted), Who, Action, Detail (12px muted). The filters the spec
   asks for sit above it as the prototype's filter bar of 32px pills. On a
   phone the log is a record list (table.rec): each entry a card titled with
   its date and time, Who and Action labelled, the detail at its foot. One
   row, one data-testid, at every width. */
export function AuditPage() {
  const [entity, setEntity] = useState('all');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  /* the boxes ask once the typing pauses (ui-review row 92); the rows on
     screen stay, dimmed, while the next read comes (src/api/audit.ts) */
  const askedWho = useDebounced(who.trim()), askedQ = useDebounced(q.trim());
  const audit = useAudit({ entity: entity === 'all' ? undefined : entity, who: askedWho || undefined, q: askedQ || undefined });
  const filtered = entity !== 'all' || !!askedWho || !!askedQ;
  const clear = () => { setEntity('all'); setWho(''); setQ(''); };

  return (
    <Page testId={tid.page('iaudit')}>
      <PageHead title="Audit log" tip="Every status change anyone makes, newest first, with who acted and when."
        tipTestId={tid.head.tip('iaudit')} />

      <FilterBar>
        <SelectFilter testId={tid.audit.filterEntity} label="Record type" value={entity} onValueChange={setEntity} options={ENTITY_OPTIONS} />
        <SearchFilter testId={tid.audit.filterWho} label="Who" value={who} onChange={e => setWho(e.target.value)} placeholder="Who" />
        <SearchFilter testId={tid.audit.filterText} label="Search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the log" />
        {audit.isSuccess && <Count testId={tid.audit.count}>{auditCount(audit.data.items.length, audit.data.total)}</Count>}
      </FilterBar>

      {audit.isPending && <p className="text-text-secondary">Loading the audit log&hellip;</p>}

      {audit.isError && (
        <p data-testid={tid.audit.error} role="alert" className="text-err">
          The audit log could not be loaded. Nothing on screen has changed. Reload the page to try again.
        </p>
      )}

      {/* ui-review row 93: true to what is on screen */}
      {audit.isSuccess && audit.data.items.length === 0 && (
        <Card>
          <div data-testid={tid.audit.empty} className="flex flex-col items-center gap-sm px-lg py-2xl text-center text-text-muted">
            {filtered
              ? <>
                <p>No entries match these filters.</p>
                <Button testId={tid.audit.clear} kind="ghost" small onClick={clear}>Clear filters</Button>
              </>
              : <p>Nothing recorded yet. Every change anyone makes appears here.</p>}
          </div>
        </Card>
      )}

      {audit.isSuccess && audit.data.items.length > 0 && (
        <>
          <Table data-testid={tid.audit.table} variant="records" aria-busy={audit.isPlaceholderData} className={audit.isPlaceholderData ? 'opacity-60' : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.data.items.map(entry => (
                <Row key={entry.id} testId={tid.audit.row(entry.id)}>
                  <TableCell kind="title" className="text-xs whitespace-nowrap text-text-muted tabular-nums max-md:text-sm max-md:text-text-primary">{formatDateTime(entry.at)}</TableCell>
                  <TableCell label="Who">{whoLabel(entry.who)}</TableCell>
                  <TableCell label="Action">{entry.act}</TableCell>
                  <TableCell kind="foot" empty={!detail(entry)} className="text-xs text-text-muted">{detail(entry)}</TableCell>
                </Row>
              ))}
            </TableBody>
          </Table>
          {audit.data.total > audit.data.items.length && (
            <p data-testid={tid.audit.total} className="mt-sm text-xs text-text-muted tabular-nums">
              Showing the latest {audit.data.items.length} of {audit.data.total} entries. Filter by record type, who or text to narrow the log.
            </p>
          )}
        </>
      )}
    </Page>);
}
