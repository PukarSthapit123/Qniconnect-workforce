import type { AuditEntry } from '@/api/audit';
import { describeChange } from '@/lib/format';

/* How an audit entry reads, shared by the Audit log and the Setup index's
   Recent changes, so the two describe one change in the same words. */
export const ENTITY_LABEL: Record<string, string> = { userType: 'Access role', account: 'User account', session: 'Session',
  employee: 'Employee', profileChange: 'Profile change', workPattern: 'Work pattern', location: 'Site', department: 'Department',
  costCentre: 'Cost centre', position: 'Position', project: 'Project', timesheetDay: 'Timesheet',
  timesheetConfig: 'Timesheet setup', tenant: 'Tenant', savedData: 'Saved data', setupPreset: 'Setup preset' };

export const whoLabel = (who: AuditEntry['who']) => (who.viewingAs ? `${who.name} (as ${who.viewingAs})` : who.name);
const recordLabel = (e: AuditEntry) => `${ENTITY_LABEL[e.entity] ?? e.entity}: ${e.entityId}`;
/* The prototype's Detail column: everything about the change beyond who and
   what, in one muted line. Here that is the record, the change and the reason. */
export const detail = (e: AuditEntry) => [recordLabel(e), describeChange(e.before, e.after), e.reason].filter(Boolean).join(' · ');

/* The Audit log's count beside its filters (taste review 2026-10-26, Phase
   2): "1 entry", "12 entries", or "1–50 of 1,284" when the log holds more
   than it shows. */
const NUMBER = new Intl.NumberFormat('en-GB');
export function auditCount(shown: number, total: number): string {
  if (total > shown) return `1–${NUMBER.format(shown)} of ${NUMBER.format(total)}`;
  return `${NUMBER.format(total)} ${total === 1 ? 'entry' : 'entries'}`;
}
