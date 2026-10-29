import { useState, type ReactNode } from 'react';
import { tid } from '@/testids';
import type { Employee } from '@/contract/employees';
import { LIFECYCLE, EMPLOYEE_STATES } from '@/domain/lifecycle';
import { portalStatus, type PortalUserRow } from '@/domain/people-access';
import { Button, Card, Count, Empty, FilterBar, EmployeeName, Pill, Row, SearchFilter, SelectFilter } from '@/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { useEmployees, type StateFilter } from '@/api/employees';
import { useDimension, useEmployeeTypes, useNames } from '@/api/reference';
import { StatePill } from './StatePill';

/* The prototype's state filter (mgrEmployees, v15:7640-7644): the default is
   the employees who are actually here; leavers and archived records are
   reachable, not in the way. */
const STATE_OPTIONS = [{ value: 'here', label: 'Currently here' },
  ...EMPLOYEE_STATES.map(s => ({ value: s, label: LIFECYCLE[s].label })), { value: 'all', label: 'Every state' }];
const ALL = 'all';
const isStateFilter = (v: string): v is StateFilter => v === 'here' || v === ALL || (EMPLOYEE_STATES as readonly string[]).includes(v);

/* Ported from admEmployees (v15:8041-8084) and mgrEmployees (7613-7665). Admin:
   Employee ID, Name, Employee type, Department, Location, Manager, State.
   Team: Name, Employee ID, Employee type, State. Who somebody is, never what
   they are contracted to: hours live on the record and on Contracts. The
   prototype's inline type and location selects wrote on every change without
   an audit, so here they are read-only and changed through Edit. */
/* People & access (D12): each record's portal login, joined by employee
   number in the browser (N19). `loaded` is false until the logins are read. */
export interface PortalSide { byCode: ReadonlyMap<string, PortalUserRow>; loaded: boolean; onInvite(p: Employee): void }

/* A record's portal login, in a cell or on the record: its status and the
   administrator flag, or none, with an invitation to the portal. */
export function PortalLogin({ side, p, testId, inviteTestId }: { side: PortalSide; p: Employee; testId: string; inviteTestId: string }) {
  if (!side.loaded) return <span data-testid={testId} className="text-text-muted">—</span>;
  const u = side.byCode.get(p.code);
  if (u) {
    const s = portalStatus(u.status);
    return <span data-testid={testId} className="inline-flex flex-wrap gap-xs"><Pill tone={s.tone}>{s.label}</Pill>{u.isAdmin && <Pill tone="info">Admin</Pill>}</span>;
  }
  return (
    <span data-testid={testId} className="inline-flex flex-wrap items-center gap-sm">
      <span className="text-text-muted">No portal login</span>
      {/* the add form needs an email; without one, the record is edited first */}
      {p.email.trim() && <Button testId={inviteTestId} kind="link" onClick={() => side.onInvite(p)} aria-label={`Invite ${p.name} to the portal`}>Invite</Button>}
    </span>);
}

export function EmployeesList({ variant, total, onOpen, actions, portal }: {
  variant: 'admin' | 'team'; total?: number; onOpen(p: Employee): void; actions?: (p: Employee) => ReactNode; portal?: PortalSide;
}) {
  const [state, setState] = useState<StateFilter>('here');
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const list = useEmployees(state, q.trim()), names = useNames();
  const locations = useDimension('locations'), types = useEmployeeTypes();
  const rows = (list.data ?? []).filter(p => (loc === ALL || p.location === loc) && (type === ALL || p.employeeType === type)
    && (category === ALL || p.category === category));
  const team = variant === 'team';
  return (
    <>
      <FilterBar>
        <SearchFilter testId={tid.employees.search} label="Search employees" value={q} onChange={e => setQ(e.target.value)}
          placeholder={team ? 'Search name or ID' : 'Search name, ID or job profile'} />
        {team
          ? <SelectFilter testId={tid.employees.categoryFilter} label="Worker category" value={category} onValueChange={setCategory}
              options={[{ value: ALL, label: 'Everyone' }, { value: 'Contracted', label: 'Contracted' }, { value: 'Bank', label: 'Bank' }]} />
          : <>
            <SelectFilter testId={tid.employees.locationFilter} label="Location" searchable value={loc} onValueChange={setLoc}
              options={[{ value: ALL, label: 'All locations' }, ...(locations.data ?? []).map(l => ({ value: l.code, label: l.name }))]} />
            <SelectFilter testId={tid.employees.typeFilter} label="Employee type" searchable value={type} onValueChange={setType}
              options={[{ value: ALL, label: 'All employee types' }, ...(types.data ?? []).map(t => ({ value: t.code, label: t.name }))]} />
          </>}
        <SelectFilter testId={tid.employees.stateFilter} label="State" value={state} options={STATE_OPTIONS}
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
              <TableHead>Employee type</TableHead>
              {!team && <><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Manager</TableHead></>}
              <TableHead>State</TableHead>
              {portal && <TableHead>Portal login</TableHead>}
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(p => {
              const code = <TableCell label="Employee ID" className="tabular-nums">{p.code}</TableCell>;
              return (
                <Row key={p.id} testId={tid.employees.row(p.code)}>
                  {team ? null : code}
                  <TableCell kind="title"><EmployeeName name={p.name} /></TableCell>
                  {team ? code : null}
                  <TableCell label="Employee type">{names.type(p.employeeType)}</TableCell>
                  {!team && <>
                    <TableCell label="Department" className="text-text-muted">{names.department(p.department)}</TableCell>
                    <TableCell label="Location">{names.location(p.location)}</TableCell>
                    <TableCell label="Manager" empty={!p.manager} className="text-text-muted">{names.manager(p.manager, p.code)}</TableCell>
                  </>}
                  <TableCell label="State"><StatePill testId={tid.employees.state(p.code)} state={p.state} withNote /></TableCell>
                  {portal && <TableCell label="Portal login"><PortalLogin side={portal} p={p} testId={tid.people.portalCol(p.code)} inviteTestId={tid.people.invite(p.code)} /></TableCell>}
                  <TableCell kind="foot" className="text-right whitespace-nowrap">
                    <span className="inline-flex gap-xs">{actions?.(p)}
                      <Button testId={tid.employees.open(p.code)} kind="ghost" small onClick={() => onOpen(p)}>Open</Button></span>
                  </TableCell>
                </Row>);
            })}
          </TableBody>
        </Table>)}
    </>);
}
