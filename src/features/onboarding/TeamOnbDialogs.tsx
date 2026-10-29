import { useState } from 'react';
import { tid } from '@/testids';
import { Button, Fact, Field, FormWarn, Modal, Small, TextInput, toastInfo } from '@/ui';
import {
  useChaseStarter, useInviteToPortal, useRejectOnboardingDocument, useStarterOnboarding, useVerifyOnboardingDocument, type OnbQueueRow, type TrackerRow,
} from '@/api/onboarding';
import { NotConnected } from '@/features/profile/NotConnected';
import { FileRecordView } from './OnbDocuments';

/* The dialogs the tracker opens. */

/* Once a starter has started, the portal invite is offered (spec N19, plan
   step 5). While Onboarding runs on the fake server the invite is recorded
   on their case there, never sent to /bc/portalUsers, so it says so; the
   login itself is added on People & access until the two are connected. */
export interface PortalOffer { name: string; email: string; case: { id: string; version: number } }
export function PortalInviteOffer({ offer, onClose }: { offer: PortalOffer; onClose(): void }) {
  const send = useInviteToPortal();
  return (
    <Modal open testId={tid.tonb.portalOffer} onOpenChange={o => { if (!o) onClose(); }} title={`Send ${offer.name} a portal invite?`}
      footer={<>
        <Button testId={tid.tonb.portalNotNow} kind="ghost" onClick={onClose}>Not now</Button>
        <Button testId={tid.tonb.portalSend} kind="primary" pending={send.isPending(`onboarding/portal-invite/${offer.case.id}`)}
          onClick={() => send.mutate({ case: offer.case }, { onSuccess: x => { toastInfo(x.summary); onClose(); } })}>Send portal invite</Button>
      </>}>
      <p className="mb-md text-sm">{offer.name} is active. A QniConnect portal login lets them see their payslips and tax documents{offer.email ? <>, signing in with <b className="font-semibold">{offer.email}</b></> : null}.</p>
      <div className="flex flex-wrap items-center gap-sm">
        <NotConnected testId={tid.tonb.portalNotConnected}
          note="Onboarding runs on sample data until the workforce service is connected, so the invite is recorded here. Add their login on People & access." />
        <Small>The invite is recorded here. Their login is added on People &amp; access.</Small>
      </div>
    </Modal>);
}

/* onb-review, onb-verify and onb-reject (qnipay-workforce-v15.html:11632-
   11690): a decision made without looking at the document is not a check, so
   the document is put in front of the employee deciding, with whether it is
   needed and whether it stops them starting, and the decision is made from
   there. Rejecting needs a reason the starter sees (D4); the server owns that
   rule and answers an empty one at the reason field. The case version is the
   one the queue last read, so after a 412 the next attempt sends the fresh one. */
export function CheckDialog({ x, onClose }: { x: OnbQueueRow; onClose(): void }) {
  const [reason, setReason] = useState('');
  const verify = useVerifyOnboardingDocument(), reject = useRejectOnboardingDocument();
  const key = `onboarding/case/${x.caseRef.id}`, busy = verify.isPending(key) || reject.isPending(key);
  const vars = { case: x.caseRef, employeeCode: x.employee.code, doc: x.document.id };
  const refused = reject.refusal?.field === 'reason' ? null : reject.refusal ?? verify.refusal;
  const done = (s: { summary: string }) => { toastInfo(s.summary); onClose(); };
  return (
    <Modal open onOpenChange={o => { if (!o) onClose(); }} title={x.document.label} scope={x.employee.name} width="wide"
      footer={<>
        <Button testId={tid.tonb.notNow} kind="ghost" onClick={onClose}>Not now</Button>
        <Button testId={tid.tonb.reject} kind="ghost" pending={busy}
          onClick={() => { verify.clearFieldErrors(); reject.mutate({ ...vars, reason: reason.trim() }, { onSuccess: done }); }}>Reject</Button>
        <Button testId={tid.tonb.verify} kind="primary" pending={busy}
          onClick={() => { reject.clearFieldErrors(); verify.mutate(vars, { onSuccess: done }); }}>Verify</Button>
      </>}>
      <FileRecordView f={x.file} alt={x.document.label} title={x.file.name} imageTestId={tid.tonb.checkImage} noPreviewTestId={tid.tonb.checkNoPreview} />
      <Fact label="Needed">{x.document.req ? 'Required' : 'Optional'}</Fact>
      <Fact label="Stops them starting">{x.document.blocks ? 'Yes' : 'No'}</Fact>
      <div className="mt-md">
        <Field label="Reason, if you are rejecting it" error={reject.fieldError('reason')}>
          <TextInput testId={tid.tonb.reason} value={reason} maxLength={300} placeholder={`Shown to ${x.employee.first} so they know what to send`}
            onChange={e => { setReason(e.target.value); reject.clearFieldErrors(); }} />
        </Field>
      </div>
      {refused && <FormWarn testId={tid.tonb.checkWarn}>{refused.message} <span className="opacity-90">{refused.next}</span></FormWarn>}
    </Modal>);
}

/* onb-activate refused and onb-chase (v15:11700-11723): what is outstanding,
   read again from the server as the dialog opens, and Chase them, which tells
   the starter in the app. */
export function NotReadyDialog({ r, canChase, onClose }: { r: TrackerRow; canChase: boolean; onClose(): void }) {
  const fresh = useStarterOnboarding(r.employee.code);
  const chase = useChaseStarter();
  const bl = fresh.data?.toStart ?? r.blockers, n = bl.length;
  return (
    <Modal open onOpenChange={o => { if (!o) onClose(); }} title={`${r.employee.name} is not ready to start`}
      footer={<>
        <Button testId={tid.tonb.notReadyClose} kind="ghost" onClick={onClose}>Close</Button>
        {canChase && <Button testId={tid.tonb.chase} kind="secondary" pending={chase.isPending(`onboarding/chase/${r.employee.code}`)}
          onClick={() => chase.mutate({ employeeCode: r.employee.code }, { onSuccess: x => { toastInfo(x.summary); onClose(); } })}>Chase them</Button>}
      </>}>
      <div data-testid={tid.tonb.notReady}>
        <Small testId={tid.tonb.notReadyTemplate} className="mb-sm">Onboarding template: {(fresh.data?.template ?? r.template).name}</Small>
        <Small className="mb-sm">{n} thing{n === 1 ? '' : 's'} outstanding. Somebody who has not completed these cannot be scheduled or paid,
          so they cannot be made active.</Small>
        {bl.map((b, i) => (
          <div key={`${b.kind}/${b.id}`} data-testid={tid.tonb.blocker(i)} className="flex items-center gap-md border-b px-md py-[10px] text-sm last:border-b-0">
            {b.why}</div>))}
      </div>
    </Modal>);
}
