/* Setup · Employees (spec D12, N19): one admin page, each person keyed by
   employee number, with their portal login (real /bc/portalUsers) and their
   Workforce record (the fake /api/v1). The two never meet on the wire: they
   are joined here, in the browser, and a row unmatched on either side is
   kept. Then the portal user rules of QniConnect's UserManagement
   (docs/superpowers/inventory/admin.md, USERS) as pure functions; the panel
   is src/features/employees/PortalLoginPanel.tsx.

   Fixed on the way (Ruling Q2; listed in the Task 20 report):
   - a portal user without a name or email reads as blank: QniConnect called
     `user.name.toLowerCase()` and the page crashed (USERS.C1);
   - an unreadable last login is "Never", not "Invalid Date" (USERS.R15);
   - "PendingFirstLogin" reads "Pending first login", in sentence case. */
import type { Employee } from '@/contract/employees';
import type { BcPortalUser } from '@/contract/bc/portal-users';

/* USERS.C1, as the page reads it. */
export interface PortalUserRow {
  id: string; name: string; email: string; status: string; isAdmin: boolean;
  lastLogin: string | null; role: string; employeeNo: string;
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export function toPortalUserRow(u: BcPortalUser): PortalUserRow {
  return {
    id: str(u.id), name: str(u.name), email: str(u.email), status: str(u.status), isAdmin: Boolean(u.isAdmin),
    lastLogin: str(u.lastLogin) || null, role: str(u.role), employeeNo: str(u.employeeNo),
  };
}

/* ---------- the join (N19) ---------- */

export interface PersonRow { employeeCode: string | null; employee?: Employee; portal?: PortalUserRow }

/* Joined on employee.code === portalUser.employeeNo, exactly. Every employee
   comes first, in the order given, each with the first portal user carrying
   their number; then every portal user left over, in theirs. A blank
   employeeNo matches nobody, and a second user with a number already joined
   stays a row of its own. */
export function joinPeople(employees: readonly Employee[], portalUsers: readonly PortalUserRow[]): PersonRow[] {
  const taken = new Set<PortalUserRow>();
  const byNo = new Map<string, PortalUserRow>();
  for (const u of portalUsers) if (u.employeeNo.trim() && !byNo.has(u.employeeNo)) byNo.set(u.employeeNo, u);
  const rows: PersonRow[] = employees.map(employee => {
    const portal = byNo.get(employee.code);
    if (!portal || taken.has(portal)) return { employeeCode: employee.code, employee };
    taken.add(portal);
    return { employeeCode: employee.code, employee, portal };
  });
  for (const u of portalUsers) if (!taken.has(u)) rows.push({ employeeCode: u.employeeNo.trim() ? u.employeeNo : null, portal: u });
  return rows;
}

/* ---------- the list (USERS.R2 to R4) ---------- */

export type UsersTab = 'all' | 'active' | 'inactive' | 'admin';
export const USERS_TABS: readonly { key: UsersTab; label: string }[] = [
  { key: 'all', label: 'All users' }, { key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }, { key: 'admin', label: 'Admins' },
];
const inTab = (u: PortalUserRow, tab: UsersTab): boolean => {
  switch (tab) {
    case 'all': return true;
    case 'active': return u.status === 'Active';
    case 'inactive': return u.status === 'Inactive' || u.status === 'PendingFirstLogin';
    case 'admin': return u.isAdmin;
  }
};
/* USERS.R2: the tab, then a case-insensitive search on name or email (the term as typed, not trimmed). */
export function filterPortalUsers<U extends PortalUserRow>(users: readonly U[], tab: UsersTab, q: string): U[] {
  const term = q.toLowerCase();
  return users.filter(u => inTab(u, tab) && (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)));
}
/* Setup · Employees' one table: QniConnect's tabs as a filter on each row's
   login, plus the people with none. */
export type LoginFilter = UsersTab | 'none';
export const LOGIN_FILTERS: readonly { value: LoginFilter; label: string }[] = [
  { value: 'all', label: 'Any portal login' }, { value: 'active', label: 'Login active' }, { value: 'inactive', label: 'Login inactive or pending' },
  { value: 'admin', label: 'Portal admins' }, { value: 'none', label: 'No portal login' },
];
export const loginMatches = (u: PortalUserRow | undefined, f: LoginFilter): boolean => (f === 'none' ? !u : f === 'all' || (!!u && inTab(u, f)));
/* USERS.R3: from the whole list, whatever the search. */
export function tabCounts(users: readonly PortalUserRow[]): Record<UsersTab, number> {
  return { all: users.length, active: users.filter(u => inTab(u, 'active')).length, inactive: users.filter(u => inTab(u, 'inactive')).length, admin: users.filter(u => u.isAdmin).length };
}
/* USERS.R4: an administrator cannot be changed here. */
export type RowAction = 'activate' | 'deactivate' | 'edit';
export function rowActions(u: PortalUserRow): RowAction[] | 'locked' {
  if (u.isAdmin) return 'locked';
  return [u.status === 'Active' ? 'deactivate' : 'activate', 'edit'];
}
/* The status badge (USERS States): anything QniConnect did not know is shown as sent. */
export type StatusTone = 'ok' | 'warn' | 'neu';
export function portalStatus(status: string): { label: string; tone: StatusTone } {
  if (status === 'Active') return { label: 'Active', tone: 'ok' };
  if (status === 'PendingFirstLogin') return { label: 'Pending first login', tone: 'warn' };
  if (status === 'Inactive') return { label: 'Inactive', tone: 'neu' };
  return { label: status || 'Unknown', tone: 'neu' };
}
/* USERS.R15: "01 Jul 2026"; nothing, or nothing readable, is Never. */
export function lastLoginText(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Never' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ---------- the form (USERS.R6 to R8) ---------- */

export interface PortalUserForm { name: string; email: string; role: string; isAdmin: boolean }
export const ROLES = ['User', 'Admin'] as const;
export const EMPTY_PORTAL_USER: PortalUserForm = { name: '', email: '', role: 'User', isAdmin: false };

/* USERS.R6: ticking administrator access makes the role Admin; unticking leaves it. */
export const withAdminFlag = (f: PortalUserForm, isAdmin: boolean): PortalUserForm => ({ ...f, isAdmin, ...(isAdmin ? { role: 'Admin' } : {}) });

/* USERS.R7: the name trimmed, then its tags removed (and not trimmed again);
   the email trimmed and lower-cased. What is sent (USERS.C2, C3). */
export const sanitisePortalUser = (f: PortalUserForm): PortalUserForm =>
  ({ name: f.name.trim().replace(/<[^>]*>/g, ''), email: f.email.trim().toLowerCase(), role: f.role, isAdmin: f.isAdmin });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NAME_MAX = 100;
/* USERS.R7 (create) and R8 (edit), in order, on the sanitised form. */
export function portalUserFormError(f: PortalUserForm, mode: 'create' | 'edit'): string | null {
  if (!f.name || !f.email) return mode === 'create' ? 'Name and email are required fields.' : 'Name and email are required.';
  if (!EMAIL.test(f.email)) return 'Please enter a valid email address.';
  if (f.name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;
  return null;
}

/* USERS.R10: the answer added at the end, Active unless it says otherwise. */
export function applyCreated(users: readonly PortalUserRow[], result: BcPortalUser): PortalUserRow[] {
  return [...users, toPortalUserRow({ status: 'Active', ...result })];
}
/* USERS.R12: the row, then the form as typed, then the answer over both. */
export function applyEdited(users: readonly PortalUserRow[], id: string, typed: PortalUserForm, result: BcPortalUser | null | undefined): PortalUserRow[] {
  return users.map(u => {
    if (u.id !== id) return u;
    const merged: PortalUserRow = { ...u, ...typed };
    if (!result) return merged;
    const r = toPortalUserRow({ ...merged, ...result });
    return r;
  });
}
