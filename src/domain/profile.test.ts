/* The profile page's Business Central record (docs/superpowers/inventory/
   portal.md, PROF): how each value is mapped, masked and written. */
import { formatProfileDate, maskValue, profileAddress, toProfileView } from './profile';

const USER = { name: 'Ana Account', email: 'ana@contoso.com' };

test('PROF.R7: dates are "15 January 2022"; nothing, or N/A, is N/A; a value that is not a date stays as it is', () => {
  expect(formatProfileDate('2022-01-15')).toBe('15 January 2022');
  expect(formatProfileDate('2022-01-05T10:00:00')).toBe('05 January 2022');
  expect(formatProfileDate('')).toBe('N/A');
  expect(formatProfileDate(null)).toBe('N/A');
  expect(formatProfileDate('N/A')).toBe('N/A');
  expect(formatProfileDate('sometime')).toBe('sometime');
});

test('PROF.R7: a date-only value is that calendar day in any timezone (fixed, as HOME.R19)', () => {
  /* QniConnect parsed 2022-01-01 as UTC midnight, the day before west of UTC */
  expect(formatProfileDate('2022-01-01')).toBe('01 January 2022');
  expect(formatProfileDate('1990-12-31')).toBe('31 December 1990');
  /* the timezone cannot be changed under a running test on every machine, so
     this proves the date-only value never goes through a UTC Date at all */
  const local = vi.spyOn(Date.prototype, 'toLocaleDateString');
  try {
    expect(formatProfileDate('2022-01-01')).toBe('01 January 2022');
    expect(local).not.toHaveBeenCalled();
  } finally { local.mockRestore(); }
});

test('PROF.R10: masking keeps the last N characters; short values are all stars; nothing is N/A', () => {
  expect(maskValue('QQ123456C', 3)).toBe('******56C');
  expect(maskValue('1257L', 2)).toBe('***7L');
  expect(maskValue('12345678', 4)).toBe('****5678');
  expect(maskValue('200000', 2)).toBe('****00');
  expect(maskValue('AB', 2)).toBe('**');
  expect(maskValue('A', 4)).toBe('*');
  expect(maskValue('', 4)).toBe('N/A');
  expect(maskValue(null, 4)).toBe('N/A');
  expect(maskValue('N/A', 4)).toBe('N/A');
  /* a number is masked as its digits, where QniConnect threw (inventory A3) */
  expect(maskValue(12345678, 4)).toBe('****5678');
});

test('PROF.R9, PROF.R13: text is "" when missing; position is Employee and status Active by default; the name falls back to the account', () => {
  const v = toProfileView({}, USER);
  expect(v).toMatchObject({ name: 'Ana Account', email: 'ana@contoso.com', phone: '', gender: '', employeeId: '', position: 'Employee', status: 'Active',
    hoursWorked: '', taxCode: '', niNumber: '', niCategory: '', bankName: '', bankAccountName: '', bankAccountNo: '', bankBranchNo: '',
    payFrequency: '', pensionSet: '', pensionProvider: '', pensionContribution: '', birthDate: '', joinDate: '' });
  const full = toProfileView({ firstName: 'Jane', middleName: 'Anne', lastName: 'Smith', jobTitle: 'Nurse', status: 'On leave', email: 'j@x.y',
    mobilePhoneNo: '07700', employeeNo: 'E1', weeklyHoursWorked: 37.5, frequency: 'Monthly' }, USER);
  expect(full).toMatchObject({ name: 'Jane Anne Smith', position: 'Nurse', status: 'On leave', email: 'j@x.y', phone: '07700', employeeId: 'E1',
    hoursWorked: '37.5', payFrequency: 'Monthly' });
});

test('PROF.R11: Account name is the bank account name, not the employee name (fixed, Ruling Q2)', () => {
  expect(toProfileView({ firstName: 'Jane', lastName: 'Smith', bankAccountName: 'J A Smith & Co' }, USER).bankAccountName).toBe('J A Smith & Co');
  expect(toProfileView({ firstName: 'Jane', lastName: 'Smith' }, USER).bankAccountName).toBe('');
});

test('PROF.R15: NI category joins the class and the code; with one missing it is the other; with both, nothing', () => {
  expect(toProfileView({ niClassCode: 'Class 1', nationalInsuranceCode: 'A' }, USER).niCategory).toBe('Class 1 A');
  expect(toProfileView({ nationalInsuranceCode: 'A' }, USER).niCategory).toBe('A');
  expect(toProfileView({ niClassCode: 'Class 1' }, USER).niCategory).toBe('Class 1');
  expect(toProfileView({}, USER).niCategory).toBe('');
});

test('PROF.R16: the pension values are the raw values, as text, never formatted', () => {
  expect(toProfileView({ pensionSet: 'Auto-enrolment', pensionProvider: 'NEST', pensionContribution: 5 }, USER))
    .toMatchObject({ pensionSet: 'Auto-enrolment', pensionProvider: 'NEST', pensionContribution: '5' });
});

test('PROF.R8: the address is the first line with ", address2", then line 3, line 4, "city, postcode", "county, country", each only when there is one', () => {
  const v = (p: Parameters<typeof toProfileView>[0]) => profileAddress(toProfileView(p, USER));
  expect(v({ address: '1 Road', address2: 'Flat 2', addressLine3: 'Hamlet', addressLine4: 'Parish', city: 'London', postCode: 'N1 1AA', county: 'Greater London', country: 'United Kingdom' }))
    .toEqual(['1 Road, Flat 2', 'Hamlet', 'Parish', 'London, N1 1AA', 'Greater London, United Kingdom']);
  expect(v({ address: '1 Road', postCode: 'N1 1AA', country: 'United Kingdom' })).toEqual(['1 Road', 'N1 1AA', 'United Kingdom']);
  /* no first line: the second stands alone (QniConnect began the line with a comma) */
  expect(v({ address2: 'Flat 2', city: 'London' })).toEqual(['Flat 2', 'London']);
  expect(v({})).toEqual([]);
});
