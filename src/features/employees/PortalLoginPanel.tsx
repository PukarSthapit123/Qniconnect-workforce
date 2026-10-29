import { useMemo, useState, type FormEvent } from 'react';
import { KeyRound, MoreHorizontal, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { tid } from '@/testids';
import type { Employee } from '@/contract/employees';
import { logger } from '@/lib/logger';
import { AdminCard, Avatar, Banner, Button, CheckboxField, CheckRow, ChipButton, Empty, Field, FilterBar, Modal, Pill, Row, SearchFilter, SelectBox, Small, TextInput } from '@/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/shadcn/dropdown-menu';
import { createPortalUser, setPortalUserStatus, updatePortalUser, updatePortalUsersList, usePortalUsers } from '@/api/bc/portal-users';
import {
  applyCreated, applyEdited, EMPTY_PORTAL_USER, filterPortalUsers, joinPeople, lastLoginText, portalStatus, portalUserFormError, ROLES,
  rowActions, sanitisePortalUser, tabCounts, USERS_TABS, withAdminFlag, type PortalUserForm, type PortalUserRow, type UsersTab,
} from '@/domain/people-access';
import { NotConnected } from '@/features/profile/NotConnected';

const LOAD_FAILED = 'Failed to load users. Please try again.';
const STATUS_FAILED = { activate: 'Failed to activate user. Please try again.', deactivate: 'Failed to deactivate user. Please try again.' } as const;
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message) || fallback;

/* People & access › Portal logins: QniConnect's user management
   (docs/superpowers/inventory/admin.md, USERS) on the design system, shown
   only to a portal admin (N18). Who can sign in to QniConnect, live from
   Business Central: add (invite), activate, deactivate, the administrator
   flag and whether they have signed in yet.

   The list loads once (USERS.R1) and every change is made to it in place
   from the answer (R5, R10, R12). Each login is matched to its Workforce
   record by employee number in the browser only (N19); `employees` is null
   when the Workforce side is not this person's to see, and then no match is
   shown at all.

   Changed on the way (Ruling Q2, listed in the Task 20 report): an
   administrator's row says it cannot be changed instead of opening a menu
   that says so (R4); a new attempt clears the last failure's banner (R5);
   Enter and the button run the same checks (R9); the form keeps what was
   typed while the list behind it changes (R14). */
export function PortalLoginPanel({ employees, invite, onInviteClose, onOpenRecord }: {
  /* null: not this person's to see (no column); undefined: still loading */
  employees: readonly Employee[] | null | undefined;
  /* a Workforce record's "Invite to the portal": the add form, filled in from it */
  invite?: PortalUserForm | null; onInviteClose?(): void;
  onOpenRecord?(employeeCode: string): void;
}) {
  const q = usePortalUsers(true);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<UsersTab>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; user: PortalUserRow } | null>(null);
  const users = useMemo(() => q.data ?? [], [q.data]);
  const matched = useMemo(() => {
    if (employees === null) return null;
    const m = new Map<PortalUserRow, Employee>();
    if (!employees) return { m, loading: true };
    for (const r of joinPeople(employees, users)) if (r.portal && r.employee) m.set(r.portal, r.employee);
    return { m, loading: false };
  }, [employees, users]);
  const shown = filterPortalUsers(users, tab, search);
  const counts = tabCounts(users);
  const banner = error ?? (q.isError ? LOAD_FAILED : null);

  /* USERS.R5: the row's status changes in place; nothing is read again */
  const setStatus = async (u: PortalUserRow, action: 'activate' | 'deactivate') => {
    if (busy) return;
    setBusy(u.id); setError(null);
    const status = action === 'activate' ? 'Active' : 'Inactive';
    try {
      await setPortalUserStatus(u.id, status);
      updatePortalUsersList(queryClient, list => list.map(x => (x.id === u.id ? { ...x, status } : x)));
    } catch (e) {
      logger.error(`Error trying to ${action} user:`, e);
      setError(STATUS_FAILED[action]);
    } finally { setBusy(null); }
  };
  const creating = form?.mode === 'create' || Boolean(invite);
  const closeForm = () => { setForm(null); if (invite) onInviteClose?.(); };

  const add = <Button testId={tid.ausers.add} kind="primary" small onClick={() => setForm({ mode: 'create' })}><Plus aria-hidden="true" />Add user</Button>;
  return (
    <AdminCard testId={tid.ausers.panel} icon={<KeyRound />} title="Portal logins"
      desc="Who can sign in to QniConnect, from Business Central. An administrator also manages these logins, the environments and the authorization.">
      {banner && <Banner testId={tid.ausers.error} tone="err" title={banner} />}
      <FilterBar>
        <div role="group" aria-label="Show" className="inline-flex flex-wrap gap-xs">
          {/* USERS.R3: the counts are the whole list's, whatever the search */}
          {USERS_TABS.map(t => (
            <ChipButton key={t.key} testId={tid.ausers.tab(t.key)} on={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} <span className="tabular-nums">{counts[t.key]}</span>
            </ChipButton>))}
        </div>
        <SearchFilter testId={tid.ausers.search} label="Search portal users" placeholder="Search by name or email" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="ml-auto max-md:ml-0">{add}</span>
      </FilterBar>

      {q.isPending
        ? <p data-testid={tid.ausers.loading} role="status" className="text-text-secondary">Loading the portal users&hellip;</p>
        : shown.length === 0
          ? <Empty testId={tid.ausers.empty}>No users found matching your criteria.{' '}
              <Button testId={tid.ausers.clear} kind="link" onClick={() => { setSearch(''); setTab('all'); }}>Clear filters</Button></Empty>
          : (
            <Table data-testid={tid.ausers.list} variant="records" dense>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  {matched && <TableHead><span className="inline-flex items-center gap-xs">Workforce record<span className="normal-case tracking-normal"><NotConnected testId={tid.people.notConnected} note={NOT_CONNECTED} /></span></span></TableHead>}
                  <TableHead>Last login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(u => <UserRow key={u.id || u.email} u={u} employee={matched ? (matched.loading ? 'loading' : matched.m.get(u) ?? null) : undefined} busy={busy === u.id}
                  onOpenRecord={onOpenRecord} onStatus={a => void setStatus(u, a)} onEdit={() => { setError(null); setForm({ mode: 'edit', user: u }); }} />)}
              </TableBody>
            </Table>)}

      {(creating || form?.mode === 'edit') && (
        <UserDialog key={form?.mode === 'edit' ? `edit-${form.user.id}` : `create-${invite?.email ?? ''}`}
          user={form?.mode === 'edit' ? form.user : null} initial={form?.mode === 'edit' ? null : invite ?? null} onClose={closeForm}
          onSaved={(typed, result, user) => {
            /* USERS.R10 and R12: the list changes in place, the dialog closes */
            updatePortalUsersList(queryClient, list => (user ? applyEdited(list, user.id, typed, result) : applyCreated(list, result ?? {})));
            closeForm();
          }} />)}
    </AdminCard>);
}

const NOT_CONNECTED = 'Matched by employee number to the Workforce records, which run on sample data until the workforce service is connected. The portal logins are live.';

function UserRow({ u, employee, busy, onOpenRecord, onStatus, onEdit }: {
  /* the matched record; null: none matches; 'loading': the records are being read; undefined: no column */
  u: PortalUserRow; employee: Employee | null | 'loading' | undefined; busy: boolean;
  onOpenRecord?(code: string): void; onStatus(a: 'activate' | 'deactivate'): void; onEdit(): void;
}) {
  const s = portalStatus(u.status), actions = rowActions(u), who = u.name || u.email || 'this user';
  return (
    <Row testId={tid.ausers.row(u.id)}>
      <TableCell kind="title">
        <span className="flex min-w-0 items-center gap-sm">
          <Avatar name={u.name || u.email || '?'} />
          <span className="min-w-0">
            <span className="block font-semibold">{u.name || <span className="text-text-muted">No name</span>}</span>
            <span className="block text-xs font-normal break-all text-text-muted">{u.email}</span>
          </span>
        </span>
      </TableCell>
      {employee !== undefined && (
        <TableCell label="Workforce record"><span data-testid={tid.ausers.record(u.id)}>
          {employee === 'loading'
            ? <span className="text-text-muted">—</span>
            : employee
            ? onOpenRecord
              ? <Button testId={tid.ausers.recordOpen(u.id)} kind="link" onClick={() => onOpenRecord(employee.code)}
                  aria-label={`Open the Workforce record of ${employee.name}, ${employee.code}`}><span className="tabular-nums">{employee.code}</span></Button>
              : <span className="tabular-nums">{employee.code}</span>
            : <Pill testId={tid.ausers.noRecord(u.id)} tone="neu" className="border bg-surface-card" note={u.employeeNo.trim() ? `No Workforce record has the employee number ${u.employeeNo}.` : 'This login has no employee number, so it matches no Workforce record.'}>No Workforce record</Pill>}
        </span></TableCell>)}
      <TableCell label="Last login"><span data-testid={tid.ausers.lastLogin(u.id)} className="tabular-nums">{lastLoginText(u.lastLogin)}</span></TableCell>
      <TableCell label="Status">
        <span className="inline-flex flex-wrap gap-xs">
          <Pill testId={tid.ausers.status(u.id)} tone={s.tone}>{s.label}</Pill>
          {u.isAdmin && <Pill testId={tid.ausers.admin(u.id)} tone="info">Admin</Pill>}
        </span>
      </TableCell>
      <TableCell kind="foot" className="text-right whitespace-nowrap">
        {actions === 'locked'
          ? <Small testId={tid.ausers.locked(u.id)}>Admin users cannot be modified</Small>
          : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button testId={tid.ausers.menu(u.id)} kind="ghost" small pending={busy} aria-label={`Actions for ${who}`}><MoreHorizontal aria-hidden="true" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                {actions.map(a => a === 'edit'
                  ? <DropdownMenuItem key={a} data-testid={tid.ausers.edit(u.id)} onSelect={onEdit} className="min-h-touch md:min-h-0">Edit user</DropdownMenuItem>
                  : <DropdownMenuItem key={a} data-testid={a === 'activate' ? tid.ausers.activate(u.id) : tid.ausers.deactivate(u.id)} onSelect={() => onStatus(a)}
                      className="min-h-touch md:min-h-0">{a === 'activate' ? 'Activate user' : 'Deactivate user'}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>)}
      </TableCell>
    </Row>);
}

/* USERS' create and edit modals: QniConnect's fields and checks (R6 to R9),
   the sanitised form sent (C2, C3), a refusal keeping the dialog open with
   what the server said (R11, R12). */
function UserDialog({ user, initial, onClose, onSaved }: {
  user: PortalUserRow | null; initial: PortalUserForm | null; onClose(): void;
  onSaved(typed: PortalUserForm, result: Parameters<typeof applyCreated>[1] | null | undefined, user: PortalUserRow | null): void;
}) {
  const mode = user ? 'edit' : 'create';
  const [f, setF] = useState<PortalUserForm>(() => user
    ? { name: user.name, email: user.email, role: user.role || 'User', isAdmin: user.isAdmin }
    : initial ?? EMPTY_PORTAL_USER);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* a role the backend sent that QniConnect's two do not include is shown as it is, never silently changed */
  const roles = [...ROLES, ...(ROLES.includes(f.role as (typeof ROLES)[number]) ? [] : [f.role])];
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const invalid = portalUserFormError(sanitisePortalUser(f), mode);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError(null);
    try {
      const result = user ? await updatePortalUser(user.id, f) : await createPortalUser(f);
      onSaved(f, result, user);
    } catch (err) {
      logger.error(`Error ${user ? 'updating' : 'creating'} user:`, err);
      setError(errorText(err, user ? 'Failed to update user. Please try again.' : 'Failed to create user. Please try again.'));
    } finally { setSaving(false); }
  };
  return (
    <Modal open onOpenChange={o => { if (!o) onClose(); }} title={user ? 'Edit user' : 'Add new user'}
      description={user ? user.email : 'Create a new portal user account. The user will receive an email with login instructions.'}
      footer={<>
        <Button testId={tid.ausers.cancel} kind="ghost" onClick={onClose}>Cancel</Button>
        <Button testId={tid.ausers.save} kind="primary" pending={saving} onClick={() => void submit()}>
          {user ? (saving ? 'Saving…' : 'Save changes') : (saving ? 'Creating…' : 'Create user')}</Button>
      </>}>
      <form data-testid={tid.ausers.form} noValidate onSubmit={e => void submit(e)}>
        {error && <p data-testid={tid.ausers.formError} role="alert" className="mb-md rounded-sm border border-err bg-err-surface px-md py-sm text-sm text-err">{error}</p>}
        <Field label="Full name" required><TextInput testId={tid.ausers.name} autoComplete="off" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email address" required><TextInput testId={tid.ausers.email} type="email" inputMode="email" autoComplete="off" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role">
          <SelectBox testId={tid.ausers.role} value={f.role} disabled={f.isAdmin} onValueChange={role => setF({ ...f, role })} options={roles.map(r => ({ value: r, label: r }))} />
        </Field>
        <CheckRow control={<CheckboxField testId={tid.ausers.isAdmin} checked={f.isAdmin} onCheckedChange={v => setF(withAdminFlag(f, v === true))} />}>Administrator access</CheckRow>
        <Small className="mb-md block">Administrators can manage users, environments, and authentication settings.</Small>
        {f.isAdmin && <Banner tone="warn" title="Administrators have complete access to all portal features and can manage other users." />}
        {/* Enter submits the form; the visible button is the dialog's footer's */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>);
}
