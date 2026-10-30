/* Rules for the one workforce record. Ported from the prototype's `emp-save`
   handler, in its order, so the first failing rule is the one reported. */
import { EMPLOYEE_CODE, employeeCodeProblem, type Problem } from './codes';

/* The name as payroll holds it: each part on its own, as HMRC is sent it. */
export interface NameParts { firstName: string; middleName: string; lastName: string; knownAs: string }
/* Business Central's First, Middle and Last Name are 30 characters each */
export const NAME_PART_MAX = 30;
/* The name as shown: the known-as name and the last name, or without one
   every part in order, so nothing is guessed or dropped. */
export function displayName(p: NameParts): string {
  const first = p.knownAs.trim() || [p.firstName.trim(), p.middleName.trim()].filter(Boolean).join(' ');
  return [first, p.lastName.trim()].filter(Boolean).join(' ');
}
const NAME_PARTS = [['firstName', 'A first name'], ['middleName', 'A middle name'], ['lastName', 'A last name'], ['knownAs', 'A known-as name']] as const;
function nameLengthProblem(d: Partial<NameParts>): Problem | null {
  for (const [field, noun] of NAME_PARTS) {
    if ((d[field]?.trim().length ?? 0) > NAME_PART_MAX) return { field, message: `${noun} can be up to ${NAME_PART_MAX} characters, as payroll holds it.` };
  }
  return null;
}
const FIRST_REQUIRED: Problem = { field: 'firstName', message: 'A first name is required.' };
const LAST_REQUIRED: Problem = { field: 'lastName', message: 'A last name is required. Payroll reports it to HMRC.' };

export interface EmployeeDraft extends NameParts {
  code: string; email: string; contractedHours: number; maxHours: number;
  location: string; workPattern: string; department: string; position: string; grade: string; level: string;
  /* an employee code, or the name of a manager outside the company */
  manager?: string;
}
export interface EmployeeContext {
  employees: readonly { code: string; name: string; email: string }[];
  locations: readonly string[]; departments: readonly string[]; positions: readonly string[]; workPatterns: readonly string[];
  /* payroll's Pay Grade and Pay Level codes */
  grades: readonly string[]; levels: readonly string[];
}
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailProblem(raw: string, selfCode: string | null, ctx: EmployeeContext): Problem | null {
  const email = raw.trim().toLowerCase();
  if (!email) return { field: 'email', message: 'A work email address is required. It is how they sign in.' };
  if (!EMAIL.test(email)) return { field: 'email', message: 'That does not look like an email address.' };
  const clash = ctx.employees.find(p => p.code !== selfCode && p.email.toLowerCase() === email);
  if (clash) return { field: 'email', message: `${email} is already used by ${clash.name}. One address, one account.` };
  return null;
}
function hoursProblem(con: number, max: number): Problem | null {
  if (!Number.isFinite(con) || con < 0 || con > 80) return { field: 'contractedHours', message: 'Contracted hours must be between 0 and 80.' };
  if (!Number.isFinite(max) || max < 0 || max > 80) return { field: 'maxHours', message: 'Maximum hours must be between 0 and 80.' };
  /* a zero maximum means none is set, as in the prototype's `if(max&&con>max)` */
  if (max > 0 && con > max) return { field: 'contractedHours', message: 'Contracted hours cannot exceed the maximum.' };
  return null;
}
const REFS = [
  ['location', 'locations', 'site'], ['workPattern', 'workPatterns', 'work pattern'],
  ['department', 'departments', 'department'], ['position', 'positions', 'position'],
  ['grade', 'grades', 'pay grade'], ['level', 'levels', 'pay level'],
] as const;
function refsProblem(d: Partial<EmployeeDraft>, ctx: EmployeeContext): Problem | null {
  for (const [field, list, noun] of REFS) {
    const v = d[field];
    if (v && !ctx[list].includes(v)) return { field, message: `There is no ${noun} with the code ${v}.` };
  }
  /* a manager that is shaped like an employee code must be one; anything else is an outside manager's name */
  const m = d.manager?.trim();
  if (m && EMPLOYEE_CODE.test(m) && !ctx.employees.some(p => p.code === m)) return { field: 'manager', message: `There is no employee with the code ${m}.` };
  return null;
}

export function newEmployeeProblem(d: EmployeeDraft, ctx: EmployeeContext): Problem | null {
  if (!d.firstName.trim()) return FIRST_REQUIRED;
  if (!d.lastName.trim()) return LAST_REQUIRED;
  const length = nameLengthProblem(d);
  if (length) return length;
  const example = ctx.employees.find(p => /^[A-Z]/.test(p.code))?.code ?? 'EMP001';
  return employeeCodeProblem(d.code, ctx.employees.map(p => p.code), example)
    ?? emailProblem(d.email, null, ctx)
    ?? hoursProblem(d.contractedHours, d.maxHours)
    ?? (d.location ? null : { field: 'location', message: 'A site is required.' })
    ?? (d.workPattern ? null : { field: 'workPattern', message: 'A work pattern is required.' })
    ?? refsProblem(d, ctx);
}

/* On edit only what the patch touches is checked, and the email rules run only
   when the email actually changes: records exported from Business Central carry
   blank and shared addresses, and editing their hours must still work. */
export function employeeEditProblem(before: EmployeeDraft, patch: Partial<Omit<EmployeeDraft, 'code'>>, ctx: EmployeeContext): Problem | null {
  if (patch.firstName !== undefined && !patch.firstName.trim()) return FIRST_REQUIRED;
  /* a last name cannot be taken away; a record from Business Central without one stays editable */
  if (patch.lastName !== undefined && !patch.lastName.trim() && before.lastName.trim()) return LAST_REQUIRED;
  const length = nameLengthProblem(patch);
  if (length) return length;
  if (patch.email !== undefined && patch.email.trim().toLowerCase() !== before.email.toLowerCase()) {
    const p = emailProblem(patch.email, before.code, ctx);
    if (p) return p;
  }
  const hours = hoursProblem(patch.contractedHours ?? before.contractedHours, patch.maxHours ?? before.maxHours);
  if (hours) return hours;
  if (patch.location !== undefined && !patch.location) return { field: 'location', message: 'A site is required.' };
  if (patch.workPattern !== undefined && !patch.workPattern) return { field: 'workPattern', message: 'A work pattern is required.' };
  return refsProblem(patch, ctx);
}
