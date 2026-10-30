import type { ReactNode } from 'react';
import { tid } from '@/testids';
import type { HistoryEntry, Employee } from '@/contract/employees';
import { Avatar, Button, Fact, GroupLabel, Modal, Small } from '@/ui';
import { useHistory, useEmployee } from '@/api/employees';
import { useNames } from '@/api/reference';
import { fieldLabel } from '@/domain/history';
import { LIFECYCLE, isEmployeeState } from '@/domain/lifecycle';
import { formatDate, formatDateTime } from '@/lib/format';
import { StatePill } from './StatePill';
import { PortalLogin, type PortalSide } from './EmployeesList';

export const perWeek = (h: number, none: string) => (h > 0 ? `${h} h per week` : none);
const shown = (field: string, v: string) => (!v ? '—' : field === 'state' && isEmployeeState(v) ? LIFECYCLE[v].label : v);
/* one text node, so it reads (and is found) as one line: "Contracted hours: 37.5 → 30" */
/* `manager` turns a stored employee code into the manager's name */
export const historyLine = (h: HistoryEntry, manager: (stored: string) => string = v => v) => {
  const show = (v: string) => (h.field === 'manager' && v ? manager(v) : shown(h.field, v));
  return `${fieldLabel(h.field)}: ${show(h.from)} → ${show(h.to)}`;
};

/* Ported from the prototype's employeeBox (qnipay-workforce-v15.html:10204-
   10244): the employee's name, role and site under an avatar with their state
   beside it, then the shared workforce record, one fact to a line. The rota,
   timesheet and leave figures the prototype showed are not part of this build, so this build shows the contract and the record's own field
   history instead. */
export function EmployeeRecord({ employeeId, onClose, actions, portal }: {
  employeeId: string; onClose(): void; actions?: (p: Employee) => ReactNode;
  /* Setup · Employees, for a portal admin: the record's portal login (N19) */
  portal?: PortalSide;
}) {
  const employee = useEmployee(employeeId), history = useHistory(employeeId), names = useNames();
  const p = employee.data, login = p && portal?.byCode.get(p.code);
  return (
    <Modal open onOpenChange={o => { if (!o) onClose(); }} title={p?.name ?? 'Employee'}
      footer={<>
        <Button testId={tid.employee.close} kind="ghost" onClick={onClose}>Close</Button>
        {p && actions?.(p)}</>}>
      {employee.isPending && <p className="text-text-secondary">Loading the record&hellip;</p>}
      {employee.isError && <p data-testid={tid.employee.error} role="alert" className="text-err">This record could not be loaded. Close it and try again.</p>}
      {p && <div data-testid={tid.employee.record}>
        <div className="mb-lg flex flex-wrap items-center gap-md">
          <Avatar name={p.name} large />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{p.name}</div>
            <Small>{names.job(p.position)} · {names.type(p.workPattern)} · {names.location(p.location)} · <span className="tabular-nums">{p.code}</span></Small>
          </div>
          <div className="ml-auto"><StatePill testId={tid.employee.state} state={p.state} /></div>
        </div>
        <GroupLabel>Shared workforce record</GroupLabel>
        <Fact label="Work email" testId={tid.employee.fact('email')}>{p.email || '—'}</Fact>
        <Fact label="Work pattern" testId={tid.employee.fact('workPattern')}>{names.type(p.workPattern)}</Fact>
        <Fact label="Position" testId={tid.employee.fact('position')}>{names.job(p.position)}</Fact>
        <Fact label="Department" testId={tid.employee.fact('department')}>{names.department(p.department)}</Fact>
        <Fact label="Site" testId={tid.employee.fact('location')}>{names.location(p.location)}</Fact>
        <Fact label="Line manager" testId={tid.employee.fact('manager')}>{names.manager(p.manager, p.code)}</Fact>
        <Fact label="Business Central resource no." testId={tid.employee.fact('resource')}>{p.resource || '—'}</Fact>

        {portal && <>
          <GroupLabel className="mt-lg">Portal login</GroupLabel>
          {portal.banner}
          {/* the login's own actions are here, not on the row (user ruling 2026-10-27: one View per row) */}
          <Fact label="QniConnect sign-in"><span className="inline-flex flex-wrap items-center gap-sm">
            <PortalLogin side={portal} p={p} testId={tid.people.recordPortal} inviteTestId={tid.people.recordInvite} />
            {login && portal.menu?.(login)}</span></Fact>
        </>}

        <GroupLabel className="mt-lg">Contract</GroupLabel>
        <Fact label="Employment type" testId={tid.employee.fact('employmentType')}>{p.employmentType}</Fact>
        <Fact label="Contracted hours" testId={tid.employee.fact('contractedHours')}>{perWeek(p.contractedHours, `${p.employmentType} · no contracted hours`)}</Fact>
        <Fact label="Maximum hours" testId={tid.employee.fact('maxHours')}>{perWeek(p.maxHours, 'No maximum set')}</Fact>
        <Fact label="Employment" testId={tid.employee.fact('employment')}>{formatDate(p.start)}{p.end ? ` to ${formatDate(p.end)}` : ''}</Fact>

        <div data-testid={tid.employee.history}>
          <GroupLabel className="mt-lg">History</GroupLabel>
          {history.data?.length
            ? <ul className="flex flex-col">{history.data.map(h => (
              <li key={h.id} data-testid={tid.employee.historyRow(h.id)} className="border-b py-sm text-sm last:border-b-0">
                <div>{historyLine(h, v => names.manager(v, p.code))}</div>
                <Small>{formatDateTime(h.at)} · {h.by.name}{h.reason ? ` · ${h.reason}` : ''}</Small>
              </li>))}</ul>
            : <Small>No changes recorded yet.</Small>}
        </div>
      </div>}
    </Modal>);
}
