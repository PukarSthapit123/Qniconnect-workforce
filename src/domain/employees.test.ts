import { displayName, newEmployeeProblem, employeeEditProblem, type EmployeeContext, type EmployeeDraft } from './employees';

const ctx: EmployeeContext = {
  employees: [
    { code: 'CP-1042', name: 'Amara Okafor', email: 'amara.okafor@brightpath.org' },
    { code: 'EMP014', name: 'Manish Nepal', email: 'manish.nepal@dogmagroup.co.uk' },
    { code: 'EMP015', name: 'Prashesh', email: 'manish.nepal@dogmagroup.co.uk' },
  ],
  locations: ['WH', 'BC'], departments: ['CARE'], positions: ['SW'], workPatterns: ['shift', 'casual'],
  grades: ['SW'], levels: ['P1'],
};
const draft = (over: Partial<EmployeeDraft> = {}): EmployeeDraft => ({
  code: 'CP-9001', firstName: 'Test', middleName: '', lastName: 'Employee', knownAs: '', email: 'test.employee@brightpath.org', contractedHours: 30, maxHours: 45,
  location: 'WH', workPattern: 'shift', department: 'CARE', position: 'SW', grade: '', level: '', ...over });

describe('newEmployeeProblem, in the prototype\'s order', () => {
  test('a valid draft passes', () => { expect(newEmployeeProblem(draft(), ctx)).toBeNull(); });
  test('a first and a last name are required, each as payroll holds it', () => {
    expect(newEmployeeProblem(draft({ firstName: '  ' }), ctx)).toEqual({ field: 'firstName', message: 'A first name is required.' });
    expect(newEmployeeProblem(draft({ lastName: '' }), ctx)).toEqual({ field: 'lastName', message: 'A last name is required. Payroll reports it to HMRC.' });
    expect(newEmployeeProblem(draft({ middleName: 'x'.repeat(31) }), ctx)?.field).toBe('middleName');
    expect(newEmployeeProblem(draft({ knownAs: 'x'.repeat(30) }), ctx)).toBeNull();
  });
  test("a grade or level must be one of payroll's", () => {
    expect(newEmployeeProblem(draft({ grade: 'SW', level: 'P1' }), ctx)).toBeNull();
    expect(newEmployeeProblem(draft({ grade: 'ZZ' }), ctx)).toEqual({ field: 'grade', message: 'There is no pay grade with the code ZZ.' });
    expect(newEmployeeProblem(draft({ level: 'ZZ' }), ctx)?.field).toBe('level');
  });
  test('CR The employee ID format is checked, with an example from this roster', () => {
    expect(newEmployeeProblem(draft({ code: 'no spaces' }), ctx)?.message).toMatch(/employee ID is letters.*like CP-1042/);
  });
  test('a duplicate employee ID is refused', () => {
    expect(newEmployeeProblem(draft({ code: 'CP-1042' }), ctx)?.message).toMatch(/already in use/);
  });
  test('a work email is required, because it is how they sign in', () => {
    expect(newEmployeeProblem(draft({ email: '' }), ctx)).toEqual({ field: 'email', message: 'A work email address is required. It is how they sign in.' });
  });
  test('an email must look like one', () => {
    expect(newEmployeeProblem(draft({ email: 'not-an-email' }), ctx)?.message).toBe('That does not look like an email address.');
  });
  test('one address, one account', () => {
    expect(newEmployeeProblem(draft({ email: 'Amara.Okafor@brightpath.org' }), ctx)?.message)
      .toBe('amara.okafor@brightpath.org is already used by Amara Okafor. One address, one account.');
  });
  test('contracted hours are bounded', () => {
    expect(newEmployeeProblem(draft({ contractedHours: 90 }), ctx)).toEqual({ field: 'contractedHours', message: 'Contracted hours must be between 0 and 80.' });
    expect(newEmployeeProblem(draft({ contractedHours: Number.NaN }), ctx)?.field).toBe('contractedHours');
  });
  test('contracted hours cannot exceed the maximum', () => {
    expect(newEmployeeProblem(draft({ contractedHours: 50, maxHours: 40 }), ctx)).toEqual({ field: 'contractedHours', message: 'Contracted hours cannot exceed the maximum.' });
  });
  test('a zero maximum is "no maximum", as in the prototype', () => {
    expect(newEmployeeProblem(draft({ contractedHours: 30, maxHours: 0 }), ctx)).toBeNull();
  });
  test('a site and a work pattern are required and must exist', () => {
    expect(newEmployeeProblem(draft({ location: '' }), ctx)).toEqual({ field: 'location', message: 'A site is required.' });
    expect(newEmployeeProblem(draft({ location: 'ZZ' }), ctx)).toEqual({ field: 'location', message: 'There is no site with the code ZZ.' });
    expect(newEmployeeProblem(draft({ workPattern: '' }), ctx)).toEqual({ field: 'workPattern', message: 'A work pattern is required.' });
    expect(newEmployeeProblem(draft({ workPattern: 'robot' }), ctx)?.field).toBe('workPattern');
  });
  test('an optional department or position must exist when given', () => {
    expect(newEmployeeProblem(draft({ department: '' }), ctx)).toBeNull();
    expect(newEmployeeProblem(draft({ department: 'OPS' }), ctx)).toEqual({ field: 'department', message: 'There is no department with the code OPS.' });
    expect(newEmployeeProblem(draft({ position: 'XX' }), ctx)?.field).toBe('position');
  });
});

describe('the line manager', () => {
  const refused = { field: 'manager', message: 'There is no employee with the code CP-9999.' };
  test('a code that names an employee is accepted, on create and on edit', () => {
    expect(newEmployeeProblem(draft({ manager: 'EMP014' }), ctx)).toBeNull();
    expect(employeeEditProblem(draft({ code: 'CP-1042' }), { manager: 'EMP014' }, ctx)).toBeNull();
  });
  test('a code that names no one is refused, on create and on edit', () => {
    expect(newEmployeeProblem(draft({ manager: 'CP-9999' }), ctx)).toEqual(refused);
    expect(employeeEditProblem(draft({ code: 'CP-1042' }), { manager: 'CP-9999' }, ctx)).toEqual(refused);
  });
  test('blank, and an outside manager written as a name, are accepted', () => {
    expect(employeeEditProblem(draft({ code: 'CP-1042' }), { manager: '' }, ctx)).toBeNull();
    expect(employeeEditProblem(draft({ code: 'CP-1042' }), { manager: 'Eddie Harford' }, ctx)).toBeNull();
  });
});

describe('employeeEditProblem', () => {
  test('a record from Business Central with no last name stays editable without one', () => {
    expect(employeeEditProblem(draft({ lastName: '' }), { lastName: '', contractedHours: 20 }, ctx)).toBeNull();
  });
  const emp015: EmployeeDraft = draft({ code: 'EMP015', firstName: 'Prashesh', lastName: '', email: 'manish.nepal@dogmagroup.co.uk', contractedHours: 40, maxHours: 48 });
  test('editing hours on a record whose seed email is shared does not trip the email rule', () => {
    expect(employeeEditProblem(emp015, { contractedHours: 30 }, ctx)).toBeNull();
  });
  test('an unchanged email, even in the patch, is not re-checked', () => {
    expect(employeeEditProblem(emp015, { email: 'Manish.Nepal@dogmagroup.co.uk' }, ctx)).toBeNull();
  });
  test('a changed email is checked for clashes, ignoring the employee themself', () => {
    expect(employeeEditProblem(emp015, { email: 'amara.okafor@brightpath.org' }, ctx)?.message).toMatch(/already used by Amara Okafor/);
    const amara = draft({ code: 'CP-1042', email: 'amara.okafor@brightpath.org' });
    expect(employeeEditProblem(amara, { email: 'amara.okafor+x@brightpath.org' }, ctx)).toBeNull();
  });
  test('a record with no email can be edited without adding one', () => {
    expect(employeeEditProblem(draft({ email: '' }), { maxHours: 40 }, ctx)).toBeNull();
  });
  test('the hours rule reads the merged record', () => {
    expect(employeeEditProblem(draft({ contractedHours: 30, maxHours: 45 }), { maxHours: 20 }, ctx)?.message).toBe('Contracted hours cannot exceed the maximum.');
  });
  test('a name cannot be blanked, and a site cannot be removed', () => {
    expect(employeeEditProblem(draft(), { firstName: '' }, ctx)?.field).toBe('firstName');
    expect(employeeEditProblem(draft(), { lastName: ' ' }, ctx)?.field).toBe('lastName');
    expect(employeeEditProblem(draft(), { location: '' }, ctx)?.field).toBe('location');
    expect(employeeEditProblem(draft(), { location: 'ZZ' }, ctx)?.field).toBe('location');
  });
});

describe('displayName', () => {
  const n = (firstName: string, middleName: string, lastName: string, knownAs = '') => displayName({ firstName, middleName, lastName, knownAs });
  test('every part in order, so nothing is guessed or dropped', () => {
    expect(n('Ankit', 'Krishna', 'Shrestha')).toBe('Ankit Krishna Shrestha');
    expect(n('Ana', '', 'de la Cruz')).toBe('Ana de la Cruz');
    expect(n('Prashesh', '', '')).toBe('Prashesh');
  });
  test('a known-as name stands in for the first and middle names', () => {
    expect(n('Margaret', 'Anne', 'Hull', 'Peggy')).toBe('Peggy Hull');
  });
});
