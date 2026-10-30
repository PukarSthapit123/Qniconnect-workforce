/* Setup · Employees (spec D12, N19): the Workforce records and the portal
   logins, joined by employee number in the browser only, and the portal
   user rules of docs/superpowers/inventory/admin.md (USERS) as pure
   functions. */
import type { Employee } from '@/contract/employees';
import {
  applyCreated, applyEdited, filterPortalUsers, joinPeople, lastLoginText, portalStatus, portalUserFormError, rowActions,
  sanitisePortalUser, tabCounts, toPortalUserRow, withAdminFlag, type PortalUserRow,
} from './people-access';

const emp = (code: string, name = code): Employee => ({ code, name } as Employee);
const pu = (id: string, employeeNo: string, extra: Partial<PortalUserRow> = {}): PortalUserRow =>
  ({ id, name: `User ${id}`, email: `${id}@b.c`, status: 'Active', isAdmin: false, lastLogin: null, role: 'User', employeeNo, ...extra });

describe('joinPeople', () => {
  test('joins on employee number', () => {
    const rows = joinPeople([emp('CP-1'), emp('CP-2')], [pu('u2', 'CP-2'), pu('u1', 'CP-1')]);
    expect(rows.map(r => [r.employeeCode, r.employee?.code, r.portal?.id])).toEqual([['CP-1', 'CP-1', 'u1'], ['CP-2', 'CP-2', 'u2']]);
  });
  test('keeps portal-only rows', () => {
    const rows = joinPeople([emp('CP-1')], [pu('u1', 'CP-1'), pu('u9', 'BC-9')]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ employeeCode: 'BC-9', portal: pu('u9', 'BC-9') });
    expect(rows[1]).not.toHaveProperty('employee');
  });
  test('keeps employee-only rows', () => {
    const rows = joinPeople([emp('CP-1'), emp('CP-2')], [pu('u1', 'CP-1')]);
    expect(rows[1]).toEqual({ employeeCode: 'CP-2', employee: emp('CP-2') });
    expect(rows[1]).not.toHaveProperty('portal');
  });
  test('a portal user with a blank employeeNo stays unmatched', () => {
    const rows = joinPeople([emp('CP-1')], [pu('u1', ''), pu('u2', '   ')]);
    expect(rows).toEqual([
      { employeeCode: 'CP-1', employee: emp('CP-1') },
      { employeeCode: null, portal: pu('u1', '') },
      { employeeCode: null, portal: pu('u2', '   ') },
    ]);
  });
  test('two portal users with one employee number: the first is joined, the second stays unmatched beside it', () => {
    const rows = joinPeople([emp('CP-1')], [pu('u1', 'CP-1'), pu('u2', 'CP-1')]);
    expect(rows.map(r => [r.employeeCode, r.employee?.code ?? null, r.portal?.id])).toEqual([['CP-1', 'CP-1', 'u1'], ['CP-1', null, 'u2']]);
  });
  test('the match is exact: case and spacing are not forgiven', () => {
    const rows = joinPeople([emp('CP-1')], [pu('u1', 'cp-1'), pu('u2', ' CP-1')]);
    expect(rows.filter(r => r.employee && r.portal)).toEqual([]);
  });
});

describe('USERS rules', () => {
  test('USERS.C1 fields: a user without a name or email reads as blank, not a crash; isAdmin is a truth test', () => {
    expect(toPortalUserRow({ id: 'u1', isAdmin: null, status: 'Active' })).toEqual(
      { id: 'u1', name: '', email: '', status: 'Active', isAdmin: false, lastLogin: null, role: '', employeeNo: '' });
    expect(toPortalUserRow({ id: 'u2', name: 'A', email: 'a@b.c', isAdmin: true, lastLogin: '2026-07-01T09:00:00Z', role: 'Admin', employeeNo: 'E1', status: null }))
      .toMatchObject({ isAdmin: true, lastLogin: '2026-07-01T09:00:00Z', role: 'Admin', employeeNo: 'E1', status: '' });
  });

  const list = [
    pu('a', '', { name: 'Ann Active', email: 'ann@x.org', status: 'Active' }),
    pu('p', '', { name: 'Pat Pending', email: 'pat@x.org', status: 'PendingFirstLogin' }),
    pu('i', '', { name: 'Ian Inactive', email: 'ian@x.org', status: 'Inactive' }),
    pu('d', '', { name: 'Dee Admin', email: 'dee@x.org', status: 'Active', isAdmin: true }),
    pu('o', '', { name: 'Odd Status', email: 'odd@x.org', status: 'Suspended' }),
  ];
  const nth = (i: number): PortalUserRow => { const u = list[i]; if (!u) throw new Error(`no user ${i}`); return u; };
  test('USERS.R2: all, active, inactive (with pending) and admins; then a case-insensitive search on name or email, not trimmed', () => {
    const ids = (tab: Parameters<typeof filterPortalUsers>[1], q = '') => filterPortalUsers(list, tab, q).map(u => u.id);
    expect(ids('all')).toEqual(['a', 'p', 'i', 'd', 'o']);
    expect(ids('active')).toEqual(['a', 'd']);
    expect(ids('inactive')).toEqual(['p', 'i']);
    expect(ids('admin')).toEqual(['d']);
    expect(ids('all', 'ANN')).toEqual(['a']);
    expect(ids('all', 'X.ORG')).toEqual(['a', 'p', 'i', 'd', 'o']);
    expect(ids('active', 'dee@')).toEqual(['d']);
    /* the term is not trimmed */
    expect(ids('all', ' ann')).toEqual([]);
  });
  test('USERS.R3: the tab counts come from the whole list, whatever the search', () => {
    expect(tabCounts(list)).toEqual({ all: 5, active: 2, inactive: 2, admin: 1 });
  });
  test('USERS.R4: an admin has no actions; otherwise Activate unless Active, Deactivate when Active, and always Edit', () => {
    expect(rowActions(nth(3))).toEqual('locked');
    expect(rowActions(nth(0))).toEqual(['deactivate', 'edit']);
    expect(rowActions(nth(1))).toEqual(['activate', 'edit']);
    expect(rowActions(nth(2))).toEqual(['activate', 'edit']);
    expect(rowActions(nth(4))).toEqual(['activate', 'edit']);
  });
  test('USERS.C1 status badge: Active, Pending (first login), Inactive, and anything else as sent', () => {
    expect(portalStatus('Active')).toEqual({ label: 'Active', tone: 'ok' });
    expect(portalStatus('PendingFirstLogin')).toEqual({ label: 'Pending first login', tone: 'warn' });
    expect(portalStatus('Inactive')).toEqual({ label: 'Inactive', tone: 'neu' });
    expect(portalStatus('Suspended')).toEqual({ label: 'Suspended', tone: 'neu' });
    expect(portalStatus('')).toEqual({ label: 'Unknown', tone: 'neu' });
  });
  test('USERS.R6: ticking administrator access makes the role Admin; unticking leaves it', () => {
    const f = { name: 'A', email: 'a@b.c', role: 'User', isAdmin: false };
    expect(withAdminFlag(f, true)).toEqual({ ...f, role: 'Admin', isAdmin: true });
    expect(withAdminFlag({ ...f, role: 'Admin', isAdmin: true }, false)).toEqual({ ...f, role: 'Admin', isAdmin: false });
  });
  test('USERS.R7: create checks, in order, after sanitising: required, then the email, then 100 characters', () => {
    const s = sanitisePortalUser({ name: '  <b>Ann</b> Lee ', email: '  Ann@X.ORG ', role: 'User', isAdmin: false });
    expect(s).toEqual({ name: 'Ann Lee', email: 'ann@x.org', role: 'User', isAdmin: false });
    /* the name is not trimmed again after the tags go */
    expect(sanitisePortalUser({ name: '<i>x</i> <b></b>', email: 'a@b.c', role: 'User', isAdmin: false }).name).toBe('x ');
    const err = (name: string, email: string) => portalUserFormError(sanitisePortalUser({ name, email, role: 'User', isAdmin: false }), 'create');
    expect(err('', 'a@b.c')).toBe('Name and email are required fields.');
    expect(err('  ', 'a@b.c')).toBe('Name and email are required fields.');
    expect(err('<b></b>', 'a@b.c')).toBe('Name and email are required fields.');
    expect(err('Ann', '')).toBe('Name and email are required fields.');
    expect(err('', 'not-an-email')).toBe('Name and email are required fields.');
    expect(err('Ann', 'ann@x')).toBe('Please enter a valid email address.');
    expect(err('Ann', 'ann @x.org')).toBe('Please enter a valid email address.');
    expect(err('x'.repeat(101), 'not an email')).toBe('Please enter a valid email address.');
    expect(err('x'.repeat(101), 'a@b.c')).toBe('Name must be 100 characters or fewer.');
    expect(err('x'.repeat(100), 'a@b.c')).toBeNull();
  });
  test('USERS.R8: edit checks the same way; only the first message differs', () => {
    const err = (name: string, email: string) => portalUserFormError(sanitisePortalUser({ name, email, role: 'User', isAdmin: false }), 'edit');
    expect(err('', 'a@b.c')).toBe('Name and email are required.');
    expect(err('Ann', 'ann@x')).toBe('Please enter a valid email address.');
    expect(err('x'.repeat(101), 'a@b.c')).toBe('Name must be 100 characters or fewer.');
    expect(err('Ann', 'a@b.c')).toBeNull();
  });
  test('USERS.R10: a created user is added at the end, Active unless the answer says otherwise', () => {
    const made = applyCreated([nth(0)], { id: 'n1', name: 'New', email: 'new@x.org' });
    expect(made.map(u => [u.id, u.status])).toEqual([['a', 'Active'], ['n1', 'Active']]);
    expect(applyCreated([], { id: 'n2', name: 'New', email: 'n@x.org', status: 'PendingFirstLogin' })[0]?.status).toBe('PendingFirstLogin');
  });
  test('USERS.R12: an edited row takes what was typed, then whatever the answer says over it', () => {
    const typed = { name: 'Ann Typed', email: 'ann@x.org', role: 'Admin', isAdmin: false };
    expect(applyEdited(list, 'a', typed, null).find(u => u.id === 'a')).toMatchObject({ name: 'Ann Typed', role: 'Admin', status: 'Active' });
    expect(applyEdited(list, 'a', typed, { name: 'Ann Server', status: 'Inactive' }).find(u => u.id === 'a')).toMatchObject({ name: 'Ann Server', status: 'Inactive', role: 'Admin' });
    /* other rows are untouched */
    expect(applyEdited(list, 'a', typed, null).filter(u => u.id !== 'a')).toEqual(list.slice(1));
  });
  test('USERS.R15: the last login as 01 Jul 2026, never Never-as-Invalid Date', () => {
    expect(lastLoginText('2026-07-01T09:00:00Z')).toBe('01 Jul 2026');
    expect(lastLoginText(null)).toBe('Never');
    expect(lastLoginText('')).toBe('Never');
    expect(lastLoginText('not a date')).toBe('Never');
  });
});
