import { useState } from 'react';
import { tid } from '@/testids';
import type { Employee } from '@/contract/employees';
import { Button, ChoiceList, ChoiceRow, Empty, Field, FormWarn, Modal, Small, TextInput, toastInfo } from '@/ui';
import { useMoveEmployee } from '@/api/employees';
import { LIFECYCLE, type EmployeeState } from '@/domain/lifecycle';
import { StatePill } from './StatePill';

/* Ported from the prototype's emp-lifecycle dialog (qnipay-workforce-v15.html:
   11793-11834): only the states this record can reach, each with what it
   means, and a reason kept on the record. Which moves are legal is the server's
   rule; a refused move is shown here and changes nothing. */
export function LifecycleDialog({ employee, onClose }: { employee: Employee; onClose(): void }) {
  const [to, setTo] = useState<EmployeeState | ''>('');
  const [reason, setReason] = useState('');
  const move = useMoveEmployee();
  const from = LIFECYCLE[employee.state];
  const save = () => move.mutate({ employee, to, reason }, {
    onSuccess: d => { toastInfo(`${d.record.name} → ${LIFECYCLE[d.record.state].label}`); onClose(); },
  });
  /* a refused move names where this record can go */
  const warn = move.refusal ? `${move.refusal.message} ${move.refusal.code === 'transition' ? move.refusal.next : ''}`.trim() : null;
  return (
    <Modal open onOpenChange={o => { if (!o) onClose(); }} title={employee.name}
      footer={<>
        <Button testId={tid.lifecycle.cancel} kind="ghost" onClick={onClose}>Cancel</Button>
        <Button testId={tid.lifecycle.save} kind="primary" pending={move.anyPending} onClick={save}>Change state</Button></>}>
      <div className="mb-md flex flex-wrap items-center gap-sm">
        <StatePill testId={tid.lifecycle.from} state={employee.state} />
        <Small>{from.note}</Small>
      </div>
      <h3 className="mb-sm border-b pb-xs text-xs font-[650] tracking-normal text-text-secondary">Move to</h3>
      {from.next.length
        ? <ChoiceList label="Move to">{from.next.map(s => (
          <ChoiceRow key={s} testId={tid.lifecycle.option(s)} name="lifecycle-to" value={s} checked={to === s} onChange={() => setTo(s)}
            title={LIFECYCLE[s].label} note={LIFECYCLE[s].note} />))}</ChoiceList>
        : <Empty>This record cannot move any further.</Empty>}
      <Field label="Reason" required error={move.fieldError('reason')}>
        <TextInput testId={tid.lifecycle.reason} value={reason} placeholder="Recorded against the change" onChange={e => setReason(e.target.value)} /></Field>
      {warn && <FormWarn testId={tid.lifecycle.warn}>{warn}</FormWarn>}
    </Modal>);
}
