import { useState, type FormEvent } from 'react';
import { Database, ExternalLink, Globe, Plus, Server } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { Banner, Button, Card, Field, Modal, Page, PageHead, Pill, SelectBox, TextInput } from '@/ui';
import { useSession } from '@/shell/SessionProvider';
import { bcContext } from '@/api/bc/context';
import { BcError } from '@/api/bc/client';
import { adminEnvironmentsKey, adminInstance, createAdminEnvironment, useAdminEnvironments } from '@/api/bc/admin';
import { EMPTY_ENVIRONMENT_FORM, ENVIRONMENT_TYPES, environmentFormError, formatDateTime, type AdminEnvironment, type EnvironmentForm } from '@/domain/admin';

const LOAD_FAILED = 'Failed to load environments. Please try again.';
const ACTIVATE_FAILED = 'Failed to activate environment. Please try again.';

/* Setup › Business Central › Environments: QniConnect's environment
   management (docs/superpowers/inventory/admin.md, ENV) on the design system.
   The list loads when the page opens and not again while it is open (ENV.R1).
   A new environment is added to the list as the backend returns it (R3).

   "Set as default" changes the environment the app works in, without the
   backend activate call QniConnect never made (Ruling Q10): this session's
   environment becomes the one chosen, its company id is never the text
   "true", and this page's later calls carry it as X-BC-Environment (ENV.R6).
   The Default badge is this page's own and is gone after a reload (R7).

   Not ported (Ruling needed, see the Task 19 report): the row menu's Sync,
   Edit and Delete, which did nothing (Sync and Delete only logged; Edit went
   to a route that does not exist, R8 to R10). */
export function EnvironmentsPage() {
  const q = useAdminEnvironments();
  const queryClient = useQueryClient();
  const { setEnvironment } = useSession();
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const environments = q.data ?? [];
  const error = activateError ?? (q.isError ? LOAD_FAILED : null);

  const setDefault = (id: string) => {
    setActivateError(null);
    const env = environments.find(e => e.id === id);
    if (!env) { logger.error(`Environment ${id} not found`); setActivateError(ACTIVATE_FAILED); return; }
    adminInstance.setEnvironment(env.id);
    setEnvironment({ id: env.id, name: env.name, type: env.type, url: env.url, companyName: env.companyName, ...(env.companyId ? { company_Id: env.companyId } : {}) });
    /* the company belongs to the environment: the old one's is never kept for the new one */
    bcContext.setClientCompanyId(env.companyId || null);
    bcContext.setClientCompanyName(env.companyId ? env.companyName || null : null);
    setDefaultId(env.id);
  };
  const added = (env: AdminEnvironment) => {
    queryClient.setQueryData<AdminEnvironment[]>(adminEnvironmentsKey, list => [...(list ?? []), env]);
    setAdding(false);
  };

  const add = <Button testId={tid.aenv.add} kind="primary" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add environment</Button>;
  return (
    <Page testId={tid.page('aenv')}>
      <PageHead title="Environments" tip="Manage your Business Central environments." tipTestId={tid.head.tip('aenv')} actions={add} />
      {error && <Banner testId={tid.aenv.error} tone="err" title={error} />}
      {q.isPending
        ? <p data-testid={tid.aenv.loading} role="status" className="text-text-secondary">Loading the environments&hellip;</p>
        : environments.length === 0
          ? (
            <Card testId={tid.aenv.empty} className="flex flex-col items-center px-xl py-2xl text-center">
              <span aria-hidden="true" className="mb-md grid size-12 place-items-center rounded-pill bg-surface-tint text-text-muted [&_svg]:size-6"><Server /></span>
              <h2 className="mb-xs text-base">No environments found.</h2>
              <p className="mb-lg text-sm text-text-secondary">Get started by adding your first environment.</p>
              <Button testId={tid.aenv.emptyAdd} kind="primary" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add environment</Button>
            </Card>)
          : (
            <ul data-testid={tid.aenv.list} className="mb-md overflow-hidden rounded-card border bg-surface-card">
              {environments.map((env, i) => <EnvironmentRow key={env.id || `new-${i}`} env={env} isDefault={env.id !== '' && env.id === defaultId} onSetDefault={() => setDefault(env.id)} />)}
            </ul>)}
      <AddEnvironment open={adding} onOpenChange={setAdding} onAdded={added} />
    </Page>);
}

/* ENV.C1's type sets the tile's colour; the type is also written out, so the
   colour never carries it alone. */
const TYPE_TILE: Record<string, string> = { Production: 'bg-ok-surface text-ok', Sandbox: 'bg-info-surface text-info' };

function EnvironmentRow({ env, isDefault, onSetDefault }: { env: AdminEnvironment; isDefault: boolean; onSetDefault(): void }) {
  const key = env.id || env.name;
  return (
    <li data-testid={tid.aenv.row(key)} className="flex flex-wrap items-start gap-md border-b px-lg py-md last:border-b-0 max-md:px-md">
      <span aria-hidden="true" className={cn('grid size-[34px] shrink-0 place-items-center rounded-sm [&_svg]:size-[19px]', TYPE_TILE[env.type] ?? 'bg-neu-surface text-neu')}><Server /></span>
      {/* on a phone the details take the row and the actions wrap under them,
          so the address is not squeezed into a column a word wide */}
      <div className="min-w-0 flex-1 max-md:basis-[calc(100%-46px)]">
        <div className="flex flex-wrap items-center gap-sm">
          <b className="text-sm font-semibold">{env.name}</b>
          <span className="text-xs text-text-muted">{env.type}</span>
          {isDefault && <Pill testId={tid.aenv.isDefault(key)} tone="ok">Default</Pill>}
        </div>
        <div className="mt-[3px] flex flex-wrap gap-x-md gap-y-[2px] text-xs text-text-muted">
          <span className="inline-flex min-w-0 items-center gap-xs break-all"><Globe aria-hidden="true" className="size-[13px] shrink-0" />{env.url}</span>
          <span className="inline-flex items-center gap-xs"><Database aria-hidden="true" className="size-[13px] shrink-0" />{env.version || 'Unknown version'}</span>
          <span>Last synchronised: {formatDateTime(env.lastSync, 'Never')}</span>
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-sm">
        {!isDefault && <Button testId={tid.aenv.setDefault(key)} small onClick={onSetDefault}>Set as default</Button>}
        {/* ENV.R11: the environment's own address, in a new tab; with no
            address there is nothing to open, so no button that does nothing */}
        {env.url && <a data-testid={tid.aenv.open(key)} href={env.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${env.name} in a new tab`}
          className="grid size-[34px] place-items-center rounded-sm text-text-secondary transition-[scale] duration-(--dur-press) ease-(--ease-out) hover:bg-surface-tint hover:text-text-primary focus-visible:shadow-focus active:scale-[0.94] max-md:size-11 [&_svg]:size-4">
          <ExternalLink aria-hidden="true" /></a>}
      </div>
    </li>);
}

/* ENV's create modal: QniConnect's fields, checked as it checked them (ENV.R2),
   sent as typed (ENV.C2). A refusal keeps the dialog open with what the
   server said (R3). Enter in any field adds, as the form's submit did (R4). */
function AddEnvironment({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange(o: boolean): void; onAdded(env: AdminEnvironment): void }) {
  const [form, setForm] = useState<EnvironmentForm>(EMPTY_ENVIRONMENT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof EnvironmentForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const close = (o: boolean) => { if (!o) { setForm(EMPTY_ENVIRONMENT_FORM); setError(null); } onOpenChange(o); };
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const invalid = environmentFormError(form);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError(null);
    try {
      const env = await createAdminEnvironment(form);
      setForm(EMPTY_ENVIRONMENT_FORM);
      onAdded(env);
    } catch (err) {
      logger.error('Error creating environment:', err);
      setError((err instanceof BcError || err instanceof Error ? err.message : '') || 'Failed to create environment. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onOpenChange={close} title="Add environment" description="Connect a new Business Central environment to your portal."
      footer={<>
        <Button testId={tid.aenv.cancel} kind="ghost" onClick={() => close(false)}>Cancel</Button>
        <Button testId={tid.aenv.save} kind="primary" pending={busy} onClick={() => void submit()}>{busy ? 'Creating…' : 'Add environment'}</Button>
      </>}>
      <form id="aenv-form" noValidate onSubmit={e => void submit(e)}>
        {error && <p data-testid={tid.aenv.formError} role="alert" className="mb-md rounded-sm border border-err bg-err-surface px-md py-sm text-sm text-err">{error}</p>}
        <Field label="Environment name" required><TextInput testId={tid.aenv.name} placeholder="Production" value={form.name} onChange={e => set('name')(e.target.value)} /></Field>
        <Field label="Environment type">
          <SelectBox testId={tid.aenv.type} value={form.type} onValueChange={set('type')} options={ENVIRONMENT_TYPES.map(t => ({ value: t, label: t }))} />
        </Field>
        <Field label="Environment URL" required><TextInput testId={tid.aenv.url} type="url" inputMode="url" placeholder="https://businesscentral.dynamics.com/production" value={form.url} onChange={e => set('url')(e.target.value)} /></Field>
        <Field label="Company ID (optional)"><TextInput testId={tid.aenv.companyId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.companyId} onChange={e => set('companyId')(e.target.value)} /></Field>
        <Field label="Company name" required><TextInput testId={tid.aenv.companyName} placeholder="CRONUS UK Ltd." value={form.companyName} onChange={e => set('companyName')(e.target.value)} /></Field>
        {/* Enter submits the form; the visible button is the dialog's footer's */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>);
}
