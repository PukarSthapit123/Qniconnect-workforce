import { Pill } from '@/ui';
import { FAKE_SERVER_ON } from '@/lib/fake-server';

/* A Workforce part of a merged page (spec §4, N19) that runs on the fake
   /api/v1 server says so: on Profile, "propose a change", the approval queue
   and the Workforce record; on People & access, the Workforce records beside
   the live portal logins. Nothing is shown once the real service answers. */
export function NotConnected({ testId, note = 'This part runs on sample data until the workforce service is connected. The payroll record is live.' }: {
  testId: string; note?: string;
}) {
  if (!FAKE_SERVER_ON) return null;
  return <Pill testId={testId} tone="neu" note={note}>Not yet connected</Pill>;
}
