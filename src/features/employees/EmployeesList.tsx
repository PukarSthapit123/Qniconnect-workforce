import { useState, type ReactNode } from 'react';
import { KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { tid } from '@/testids';
import type { Employee } from '@/contract/employees';
import { LIFECYCLE, EMPLOYEE_STATES } from '@/domain/lifecycle';
import { LOGIN_FILTERS, loginMatches, portalStatus, type LoginFilter, type PortalUserRow } from '@/domain/people-access';
import { Button, Card, Count, Empty, FilterBar, EmployeeName, Row, SearchFilter, SelectFilter, Tip } from '@/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { useEmployees, type StateFilter } from '@/api/employees';
import { useDimension, useWorkPatterns, useNames } from '@/api/reference';
import { cn } from '@/lib/utils';
import { StatePill } from './StatePill';
import { LoginStatus } from './PortalLoginPanel';

/* The prototype's state filter (mgrEmployees, v15:7640-7644): the default is
   the employees who are actually here; leavers and archived records are
   reachable, not in the way. */
const STATE_OPTIONS = [{ value: 'here', label: 'Currently here' },
  ...EMPLOYEE_STATES.map(s => ({ value: s, label: LIFECYCLE[s].label })), { value: 'all', label: 'Every status' }];
const ALL = 'all';
const isStateFilter = (v: string): v is StateFilter => v === 'here' || v === ALL || (EMPLOYEE_STATES as readonly string[]).includes(v);

/* Ported from admEmployees (v15:8041-8084) and mgrEmployees (7613-7665). Admin:
   Employee ID, Name, Work pattern, Department, Site, Line manager, Status.
   Team: Name, Employee ID, Work pattern, Status. The prototype's inline type
   and location selects wrote on every change without an audit, so here they
   are read-only and changed through Edit, on the record.
   User ruling 2026-10-27: Hours is a column (the Working hours page is gone);
   a row has one View, as a payslip does (Edit, Change status and the portal
   login's actions are on the record); the portal login is a tick beside the
   Status pill, not a column of its own; a login no record matches is not
   listed here. */
/* Setup · Employees (D12): one table of people. Each record carries its
   portal login, joined by employee number in the browser (N19). `loaded` is
   false until the logins are read. */
export interface PortalSide {
  byCode: ReadonlyMap<string, PortalUserRow>; loaded: boolean; onInvite(p: Employee): void;
  menu?(u: PortalUserRow): ReactNode;
  /* a failed login action, shown where it was taken: on the record while it is open */
  banner?: ReactNode;
}

/* The portal login as a symbol of access beside the Status pill: none, no
   login; an envelope, invited and not signed in yet; a green key, signs in;
   a lock, switched off; an amber key, someone who has left and can still
   sign in (the one to act on). A shield marks a portal admin. Each says so
   to a screen reader; the Status header's tip is the legend. */
export const LOGIN_LEGEND = 'Portal login, beside the status: an envelope, invited and not signed in yet. A green key, signs in. '
  + 'A lock, the login is switched off. An amber key, has left and can still sign in. A shield, a portal admin. Nothing, no portal login.';
export function LoginMark({ side, p, testId }: { side: PortalSide; p: Employee; testId: string }) {
  if (!side.loaded) return null;
  const u = side.byCode.get(p.code);
  const gone = p.state === 'leaver' || p.state === 'archived';
  const [mark, label] = !u ? [null, 'No portal login']
    : u.status === 'Active' ? [gone ? 'risk' : 'on', gone ? 'Has left and can still sign in to the portal' : 'Signs in to the portal']
    : u.status === 'Inactive' ? ['off', 'Portal login switched off']
    : ['sent', `Invited to the portal, ${portalStatus(u.status).label.toLowerCase()}`];
  return (
    <span data-testid={testId} data-login={mark ?? 'none'} className="inline-flex items-center gap-[2px]">
      {mark === 'sent' && <Mail aria-hidden="true" className="size-4 text-text-muted" />}
      {mark === 'on' && <KeyRound aria-hidden="true" className="size-4 text-ok" />}
      {mark === 'off' && <Lock aria-hidden="true" className="size-4 text-text-muted" />}
      {mark === 'risk' && <KeyRound aria-hidden="true" className="size-4 text-warn" />}
      {u?.isAdmin && <ShieldCheck aria-hidden="true" className="size-3.5 text-info" />}
      <span className="sr-only">{label}{u?.isAdmin ? ', portal admin' : ''}</span>
    </span>);
}

/* A record's portal login, on the record: its status, the administrator flag
   and the last sign-in (the row shows only its LoginMark), or none, with an
   invitation to the portal. */
export function PortalLogin({ side, p, testId, inviteTestId }: { side: PortalSide; p: Employee; testId: string; inviteTestId: string }) {
  if (!side.loaded) return <span data-testid={testId} className="text-text-muted">—</span>;
  const u = side.byCode.get(p.code);
  if (u) return <span data-testid={testId}><LoginStatus u={u} /></span>;
  return (
    <span data-testid={testId} className="inline-flex flex-wrap items-center gap-sm">
      <span className="text-text-muted">No portal login</span>
      {/* the add form needs an email; without one, the record is edited first */}
      {p.email.trim() && <Button testId={inviteTestId} kind="link" onClick={() => side.onInvite(p)} aria-label={`Invite ${p.name} to the portal`}>Invite</Button>}
    </span>);
}

export function EmployeesList({ variant, total, onOpen, portal }: {
  variant: 'admin' | 'team'; total?: number; onOpen(p: Employee): void; portal?: PortalSide;
}) {
  const [state, setState] = useState<StateFilter>('here');
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [employmentType, setEmploymentType] = useState(ALL);
  const [login, setLogin] = useState<LoginFilter>('all');
  const list = useEmployees(state, q.trim()), names = useNames();
  const locations = useDimension('locations'), types = useWorkPatterns();
  const rows = (list.data ?? []).filter(p => (loc === ALL || p.location === loc) && (type === ALL || p.workPattern === type)
    && (employmentType === ALL || p.employmentType === employmentType) && (!portal?.loaded || loginMatches(portal.byCode.get(p.code), login)));
  const team = variant === 'team';
  /* Admin on a tablet (768 to 1099px): the nine columns ran past the screen
     and hid the row's button. Work pattern, department, location and manager
     fold into a line under the name there, and come back as columns from
     1100px. A phone keeps its records card, which labels every cell (taste
     review 2026-10-26, Phase 1 item 1). */
  const wide = 'md:max-[1099px]:hidden';
  return (
    <>
      <FilterBar>
        <SearchFilter testId={tid.employees.search} label="Search employees" value={q} onChange={e => setQ(e.target.value)}
          placeholder={team ? 'Search name or ID' : 'Search name, ID or position'} />
        {team
          ? <SelectFilter testId={tid.employees.employmentTypeFilter} label="Employment type" value={employmentType} onValueChange={setEmploymentType}
              options={[{ value: ALL, label: 'Everyone' }, { value: 'Contracted', label: 'Contracted' }, { value: 'Bank', label: 'Bank' }]} />
          : <>
            <SelectFilter testId={tid.employees.locationFilter} label="Site" searchable value={loc} onValueChange={setLoc}
              options={[{ value: ALL, label: 'All sites' }, ...(locations.data ?? []).map(l => ({ value: l.code, label: l.name }))]} />
            <SelectFilter testId={tid.employees.typeFilter} label="Work pattern" searchable value={type} onValueChange={setType}
              options={[{ value: ALL, label: 'All work patterns' }, ...(types.data ?? []).map(t => ({ value: t.code, label: t.name }))]} />
            {portal && <SelectFilter testId={tid.employees.loginFilter} label="Portal login" value={login} options={[...LOGIN_FILTERS]}
              onValueChange={v => { const f = LOGIN_FILTERS.find(x => x.value === v); if (f) setLogin(f.value); }} />}
          </>}
        <SelectFilter testId={tid.employees.stateFilter} label="Status" value={state} options={STATE_OPTIONS}
          onValueChange={v => { if (isStateFilter(v)) setState(v); }} />
        {list.data && <Count testId={tid.employees.count}>{rows.length} of {total ?? list.data.length}</Count>}
      </FilterBar>

      {list.isPending && <p className="text-text-secondary">Loading employees&hellip;</p>}
      {list.isError && <p data-testid={tid.employees.error} role="alert" className="text-err">
        The employees list could not be loaded, so nothing here is current. Reload the page to try again.</p>}
      {list.isSuccess && rows.length === 0 && <Card><Empty testId={tid.employees.empty}>Nobody matches that filter.</Empty></Card>}
      {list.isSuccess && rows.length > 0 && (
        <Table data-testid={tid.employees.table} variant="records" dense>
          <TableHeader>
            <TableRow>
              {team ? <><TableHead>Name</TableHead><TableHead>Employee ID</TableHead></>
                : <><TableHead>Employee ID</TableHead><TableHead>Name</TableHead></>}
              <TableHead className={team ? undefined : wide}>Work pattern</TableHead>
              {!team && <><TableHead className={wide}>Department</TableHead><TableHead className={wide}>Site</TableHead>
                <TableHead className={wide}>Line manager</TableHead></>}
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Status{portal && <Tip testId={tid.people.loginLegend} text={LOGIN_LEGEND} />}</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(p => {
              const code = <TableCell label="Employee ID" className="tabular-nums">{p.code}</TableCell>;
              return (
                <Row key={p.id} testId={tid.employees.row(p.code)}>
                  {team ? null : code}
                  {/* the name never wraps while another column has room */}
                  <TableCell kind="title" className="md:whitespace-nowrap"><EmployeeName name={p.name} />
                    {!team && <span className="hidden pl-[35px] text-xs whitespace-normal text-text-muted md:max-[1099px]:block">
                      {[names.type(p.workPattern), names.department(p.department), names.location(p.location), p.manager && names.manager(p.manager, p.code)]
                        .filter(Boolean).join(' · ')}</span>}</TableCell>
                  {team ? code : null}
                  <TableCell label="Work pattern" className={team ? undefined : wide}>{names.type(p.workPattern)}</TableCell>
                  {!team && <>
                    <TableCell label="Department" className={cn('text-text-muted', wide)}>{names.department(p.department)}</TableCell>
                    <TableCell label="Site" className={wide}>{names.location(p.location)}</TableCell>
                    <TableCell label="Line manager" empty={!p.manager} className={cn('text-text-muted', wide)}>{names.manager(p.manager, p.code)}</TableCell>
                  </>}
                  <TableCell label="Hours" empty={!(p.contractedHours > 0)} className="text-right whitespace-nowrap tabular-nums">
                    {p.contractedHours > 0 ? `${p.contractedHours} h` : <span className="text-text-muted">—</span>}</TableCell>
                  <TableCell label="Status"><span className="inline-flex items-center gap-sm">
                    <StatePill testId={tid.employees.state(p.code)} state={p.state} withNote />
                    {portal && <LoginMark side={portal} p={p} testId={tid.people.portalCol(p.code)} />}</span></TableCell>
                  <TableCell kind="foot" className="text-right whitespace-nowrap">
                    <Button testId={tid.employees.open(p.code)} kind="ghost" small onClick={() => onOpen(p)} aria-label={`View ${p.name}`}>View</Button>
                  </TableCell>
                </Row>);
            })}
          </TableBody>
        </Table>)}
    </>);
}
