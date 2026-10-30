import { useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, MoreHorizontal, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { tid } from '@/testids';
import { logger } from '@/lib/logger';
import { AdminCard, Avatar, Banner, Button, CheckboxField, CheckRow, ChipButton, Empty, Field, FilterBar, Modal, Pill, Row, SearchFilter, SelectBox, Small, TextInput } from '@/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/shadcn/dropdown-menu';
import { createPortalUser, setPortalUserStatus, updatePortalUser, updatePortalUsersList, usePortalUsers } from '@/api/bc/portal-users';
import {
  applyCreated, applyEdited, EMPTY_PORTAL_USER, filterPortalUsers, lastLoginText, portalStatus, portalUserFormError, ROLES,
  rowActions, sanitisePortalUser, tabCounts, USERS_TABS, withAdminFlag, type PortalUserForm, type PortalUserRow, type UsersTab,
} from '@/domain/people-access';

const LOAD_FAILED = 'Failed to load users. Please try again.';
const STATUS_FAILED = { activate: 'Failed to activate user. Please try again.', deactivate: 'Failed to deactivate user. Please try again.' } as const;
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message) || fallback;

/* Portal logins: QniConnect's user management (docs/superpowers/inventory/
   admin.md, USERS), for a portal admin only (N18). Who can sign in to
   QniConnect, live from Business Central: add (invite), activate,
   deactivate, the administrator flag and whether they have signed in yet.
   Setup · Employees shows them in its one table beside each Workforce
   record; a portal admin without master_data gets PortalLoginPanel alone.

   The list loads once (USERS.R1) and every change is made to it in place
   from the answer (R5, R10, R12).

   Changed on the way (Ruling Q2, listed in the Task 20 report): an
   administrator's row says it cannot be changed instead of opening a menu
   that says so (R4); a new attempt clears the last failure's banner (R5);
   Enter and the button run the same checks (R9); the form keeps what was
   typed while the list behind it changes (R14). */
export interface PortalLogins {
  users: readonly PortalUserRow[] | undefined; pending: boolean;
  /* the last failure, or the list's own: shown above whichever table lists the logins */
  banner: ReactNode;
  /* a login's menu, or what an administrator's says instead; `beforeEdit` closes what it sits in (the record) before the edit form opens */
  menu(u: PortalUserRow, beforeEdit?: () => void): ReactNode;
  openCreate(initial?: PortalUserForm): void;
  /* the add or edit form, while one is open */
  dialog: ReactNode;
}
export function usePortalLogins(): PortalLogins {
  const q = usePortalUsers(true);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: 'create'; initial: PortalUserForm | null } | { mode: 'edit'; user: PortalUserRow } | null>(null);
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
  return {
    users: q.data, pending: q.isPending,
    banner: banner && <Banner testId={tid.ausers.error} tone="err" title={banner} />,
    menu: (u, beforeEdit) => <LoginMenu u={u} busy={busy === u.id} onStatus={a => void setStatus(u, a)} onEdit={() => { beforeEdit?.(); setError(null); setForm({ mode: 'edit', user: u }); }} />,
    openCreate: initial => { setError(null); setForm({ mode: 'create', initial: initial ?? null }); },
    dialog: form && (
      <UserDialog key={form.mode === 'edit' ? `edit-${form.user.id}` : `create-${form.initial?.email ?? ''}`}
        user={form.mode === 'edit' ? form.user : null} initial={form.mode === 'edit' ? null : form.initial} onClose={() => setForm(null)}
        onSaved={(typed, result, user) => {
          /* USERS.R10 and R12: the list changes in place, the dialog closes */
          updatePortalUsersList(queryClient, list => (user ? applyEdited(list, user.id, typed, result) : applyCreated(list, result ?? {})));
          setForm(null);
        }} />),
  };
}

/* A login's status and administrator flag, and when it last signed in. */
export function LoginStatus({ u }: { u: PortalUserRow }) {
  const s = portalStatus(u.status);
  return (
    <span className="inline-flex flex-col gap-[2px]">
      <span className="inline-flex flex-wrap gap-xs">
        <Pill testId={tid.ausers.status(u.id)} tone={s.tone}>{s.label}</Pill>
        {u.isAdmin && <Pill testId={tid.ausers.admin(u.id)} tone="info">Admin</Pill>}
      </span>
      <Small>Last login <span data-testid={tid.ausers.lastLogin(u.id)} className="tabular-nums">{lastLoginText(u.lastLogin)}</span></Small>
    </span>);
}

function LoginMenu({ u, busy, onStatus, onEdit }: { u: PortalUserRow; busy: boolean; onStatus(a: 'activate' | 'deactivate'): void; onEdit(): void }) {
  const actions = rowActions(u), who = u.name || u.email || 'this user';
  /* USERS.R4: the menu's place in the row, disabled and saying why, rather than a sentence wrapping beside Edit and Open */
  if (actions === 'locked') return (
    <Button testId={tid.ausers.locked(u.id)} kind="ghost" small disabled title="Admin logins cannot be changed here">
      <MoreHorizontal aria-hidden="true" /><span className="sr-only">Admin logins cannot be changed here</span></Button>);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button testId={tid.ausers.menu(u.id)} kind="ghost" small pending={busy} aria-label={`Portal login actions for ${who}`}><MoreHorizontal aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {actions.map(a => a === 'edit'
          ? <DropdownMenuItem key={a} data-testid={tid.ausers.edit(u.id)} onSelect={onEdit} className="min-h-touch md:min-h-0">Edit login</DropdownMenuItem>
          : <DropdownMenuItem key={a} data-testid={a === 'activate' ? tid.ausers.activate(u.id) : tid.ausers.deactivate(u.id)} onSelect={() => onStatus(a)}
              className="min-h-touch md:min-h-0">{a === 'activate' ? 'Activate login' : 'Deactivate login'}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>);
}

/* A portal admin who may not see the Workforce records: the logins alone, with QniConnect's tabs and search. */
export function PortalLoginPanel() {
  const logins = usePortalLogins();
  const [tab, setTab] = useState<UsersTab>('all');
  const [search, setSearch] = useState('');
  const users = logins.users ?? [];
  const shown = filterPortalUsers(users, tab, search);
  const counts = tabCounts(users);
  return (
    <AdminCard testId={tid.ausers.panel} icon={<KeyRound />} title="Portal logins"
      desc="Who can sign in to QniConnect, from Business Central. An administrator also manages these logins, the environments and the authorization.">
      {logins.banner}
      <FilterBar>
        <div role="group" aria-label="Show" className="inline-flex flex-wrap gap-xs">
          {/* USERS.R3: the counts are the whole list's, whatever the search */}
          {USERS_TABS.map(t => (
            <ChipButton key={t.key} testId={tid.ausers.tab(t.key)} on={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} <span className="tabular-nums">{counts[t.key]}</span>
            </ChipButton>))}
        </div>
        <SearchFilter testId={tid.ausers.search} label="Search portal users" placeholder="Search by name or email" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="ml-auto max-md:ml-0"><AddLogin onClick={() => logins.openCreate()} /></span>
      </FilterBar>
      {logins.pending
        ? <p data-testid={tid.ausers.loading} role="status" className="text-text-secondary">Loading the portal users&hellip;</p>
        : shown.length === 0
          ? <Empty testId={tid.ausers.empty}>No users found matching your criteria.{' '}
              <Button testId={tid.ausers.clear} kind="link" onClick={() => { setSearch(''); setTab('all'); }}>Clear filters</Button></Empty>
          : (
            <Table data-testid={tid.ausers.list} variant="records" dense>
              <TableHeader><TableRow>
                <TableHead>User</TableHead><TableHead>Portal login</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {shown.map(u => (
                  <Row key={u.id || u.email} testId={tid.ausers.row(u.id)}>
                    <TableCell kind="title"><LoginName u={u} /></TableCell>
                    <TableCell label="Portal login"><LoginStatus u={u} /></TableCell>
                    <TableCell kind="foot" className="text-right whitespace-nowrap">{logins.menu(u)}</TableCell>
                  </Row>))}
              </TableBody>
            </Table>)}
      {logins.dialog}
    </AdminCard>);
}

export const AddLogin = ({ onClick }: { onClick(): void }) =>
  <Button testId={tid.ausers.add} kind="ghost" small onClick={onClick}><Plus aria-hidden="true" />Add portal login</Button>;

function EmailParts({ email }: { email: string }) {
  const at = email.indexOf('@');
  return at < 1 ? <>{email}</> : <>{email.slice(0, at)}<wbr />{email.slice(at)}</>;
}

/* a login's person: the name, or that it has none, over the email */
export function LoginName({ u }: { u: PortalUserRow }) {
  return (
    <span className="flex min-w-0 items-center gap-sm">
      <Avatar name={u.name || u.email || '?'} />
      <span className="min-w-0">
        <span className="block font-semibold">{u.name || <span className="text-text-muted">No name</span>}</span>
        {/* an address breaks before its @ when it must, never mid-word */}
        <span className="block text-xs font-normal break-normal text-text-muted"><EmailParts email={u.email} /></span>
      </span>
    </span>);
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
