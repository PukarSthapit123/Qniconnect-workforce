/* Field-level history: one entry per field that changed, before → after, in the
   words the audit log and the employee record show. */
export const FIELD_LABELS: Record<string, string> = {
  code: 'Employee ID', name: 'Full name', firstName: 'First name', middleName: 'Middle names', lastName: 'Last name', knownAs: 'Known as', email: 'Work email', phone: 'Mobile number', address: 'Home address',
  emergencyFirstName: 'Emergency contact first name', emergencyLastName: 'Emergency contact last name', emergencyPhone: 'Emergency number', bankAccount: 'Bank account number',
  bankSortCode: 'Sort code', position: 'Position', workPattern: 'Work pattern', employmentType: 'Employment type', grade: 'Pay grade', level: 'Pay level',
  location: 'Site', department: 'Department', manager: 'Line manager', contractedHours: 'Contracted hours',
  maxHours: 'Maximum hours', night: 'Night work permitted', resource: 'Business Central resource no.',
  cis: 'Paid under CIS', start: 'Start date', end: 'End date', state: 'Status', userType: 'Access role',
};
export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

export function historyValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.map(historyValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, keys: readonly string[]) {
  return keys
    .map(field => ({ field, from: historyValue(before[field]), to: historyValue(after[field]) }))
    .filter(d => d.from !== d.to);
}
