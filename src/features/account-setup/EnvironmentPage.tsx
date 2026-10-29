/* Environment selection at /account-setup/environment: QniConnect's
   EnvironmentSelector (inventory AUTH.R47 to AUTH.R60, states S11 to S15),
   on the design system. The sign-in gate sends a signed-in person here while
   no environment is chosen, and away again once one is.

   Once per visit: the access check (AUTH.C3), then the list (AUTH.C4). An
   account turned away sees "Access not provisioned"; anything else that goes
   wrong (no environments, a failure) sees "Sign in required". Neither shows
   the reason itself, as in QniConnect. With exactly one environment it is
   chosen for you. Continue looks the company up first when the environment
   has none (AUTH.C5, failures only logged and perhaps flagged for the
   admin), stores the company id (a placeholder if there is still none) and
   the environment, and the gate opens the app. "← Home" clears the session's
   keys, not Microsoft's, and reloads at /.

   One upgrade: while Continue works the list stays on screen with the button
   showing "Processing…", rather than QniConnect's swap to the loading card
   (AUTH.R54), so the page does not flash. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2Icon, Server } from 'lucide-react';
import { accessDenied, availableEnvironments, hasCompanyId, isInteractionRequired, lookUpCompany, verifyUserAccess, ZERO_COMPANY_ID, type EnvironmentOption } from '@/api/bc/account-setup';
import { bcContext } from '@/api/bc/context';
import { clearSessionKeys } from '@/api/bc/cleanup';
import { hardNavigation } from '@/lib/hard-navigation';
import { auth } from '@/auth';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { tid } from '@/testids';
import { Button, Card, IconTile, Pill } from '@/ui';
import { TopBar } from '@/shell/TopBar';
import { usePortal, useSession } from '@/shell/SessionProvider';

type View = { kind: 'loading' } | { kind: 'error'; denied: boolean } | { kind: 'list'; environments: EnvironmentOption[] };

export function EnvironmentPage() {
  const { user } = usePortal();
  const { setEnvironment, signIn, signOut } = useSession();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* once per visit (AUTH.R60), StrictMode's second effect run included; the
     answer lands only while the page is still mounted */
  const started = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const show = (v: View) => { if (mounted.current) setView(v); };
    if (!user) { show({ kind: 'error', denied: false }); return; }
    void (async () => {
      try {
        if (accessDenied(await verifyUserAccess({ email: user.email, oid: user.oid }))) { show({ kind: 'error', denied: true }); return; }
        const environments = await availableEnvironments();
        if (!environments.length) { show({ kind: 'error', denied: false }); return; }
        if (environments.length === 1 && mounted.current) setSelected(environments[0]?.id ?? null);
        show({ kind: 'list', environments });
      } catch (e) {
        /* the token needed interaction: the redirect is under way, so the page stays as it is */
        if (isInteractionRequired(e)) return;
        logger.error('Failed to retrieve Business Central environments:', e);
        show({ kind: 'error', denied: false });
      }
    })();
  }, [user]);

  const onContinue = async (env: EnvironmentOption) => {
    setBusy(true);
    try {
      let companyId = env.company_Id;
      if (!hasCompanyId(env)) companyId = (await lookUpCompany(env)) || companyId;
      /* AUTH.R55: a placeholder rather than nothing */
      companyId = companyId || ZERO_COMPANY_ID;
      bcContext.setClientCompanyId(companyId);
      setEnvironment({ id: env.id, name: env.name, type: env.type || 'Production', url: env.url || '', companyName: env.companyName || '', company_Id: companyId });
    } catch (e) {
      /* the token needed interaction: the redirect is under way, so nothing is stored and the page waits (final review M2) */
      if (isInteractionRequired(e)) return;
      logger.error('Error in environment selection:', e);
      setBusy(false);
      setView({ kind: 'error', denied: false });
    }
  };
  /* AUTH.R58 */
  const onHome = () => { clearSessionKeys(); hardNavigation.go('/'); };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main data-testid={tid.page('account-setup-environment')} className="mx-auto w-full max-w-[1360px] px-xl max-lg:px-md">
        <div className="mx-auto w-[min(520px,100%)] py-2xl max-md:py-lg">
          {view.kind === 'loading' && (
            <Card testId={tid.accountSetup.loading} className="flex items-center justify-center gap-sm py-2xl text-text-secondary">
              <Loader2Icon aria-hidden="true" className="size-5 animate-spin text-brand motion-reduce:animate-none dark:text-brand-accent" />
              <p role="status">Loading your environments…</p>
            </Card>)}
          {view.kind === 'error' && <Refusal denied={view.denied} onAct={() => {
            if (view.denied) { void signOut(); return; }
            /* "Sign in" signs in: with nobody signed in to Microsoft, Microsoft's
               sign-in (Task 15 review); with someone, a fresh load checks again */
            if (!auth().account()) signIn().catch((e: unknown) => { logger.error('Sign-in failed to start:', e); });
            else hardNavigation.go('/');
          }} />}
          {view.kind === 'list' && (
            <EnvironmentList environments={view.environments} selected={selected} busy={busy} onSelect={setSelected}
              onHome={onHome} onContinue={env => void onContinue(env)} />)}
          <p className="mt-lg text-center text-xs text-text-muted">© {new Date().getFullYear()} QniConnect</p>
        </div>
      </main>
    </div>);
}

/* AUTH.S12 and AUTH.S13: QniConnect's two canned cards, their titles and
   buttons in sentence case (Task 24); the sentences are QniConnect's. */
function Refusal({ denied, onAct }: { denied: boolean; onAct(): void }) {
  return (
    <Card testId={tid.accountSetup.error} className="flex flex-col items-center px-xl py-2xl text-center max-md:px-md">
      <span aria-hidden="true" className="mb-md grid size-12 place-items-center rounded-pill bg-err-surface text-err [&_svg]:size-6"><AlertCircle /></span>
      <h1 className="mb-sm">{denied ? 'Access not provisioned' : 'Sign in required'}</h1>
      <p role="alert" className="mb-lg max-w-[44ch] text-text-secondary">
        {denied
          ? 'Your account is authenticated but has not been granted access to QniConnect. Contact your administrator to request access.'
          : 'Your session could not be verified. Please sign in again to continue.'}
      </p>
      <Button testId={tid.accountSetup.errorAction} kind="primary" onClick={onAct}>{denied ? 'Sign out' : 'Sign in'}</Button>
    </Card>);
}

/* AUTH.S14: one choice per environment, as a radio group (arrow keys move
   the choice, as a group of radio buttons does). Only the press scales; the
   chosen fill and border land at once, so a choice made with the arrow keys
   is never a beat behind the key. While Continue works the choices rest,
   with the busy cursor rather than "not allowed". */
function EnvironmentList({ environments, selected, busy, onSelect, onHome, onContinue }: {
  environments: EnvironmentOption[]; selected: string | null; busy: boolean;
  onSelect(id: string): void; onHome(): void; onContinue(env: EnvironmentOption): void;
}) {
  const chosen = environments.find(e => e.id === selected) ?? null;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + environments.length) % environments.length;
    const env = environments[next];
    if (!env) return;
    onSelect(env.id);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div data-caps className="text-xs font-bold tracking-(--qp-tracking-caps) text-text-muted uppercase">Environment select</div>
      <h1 className="mt-sm mb-[2px]">Choose your workspace</h1>
      <p id="environment-select-lede" className="mb-lg text-text-secondary">Select the Business Central environment you want to access.</p>
      {environments.length === 0
        ? <p data-testid={tid.accountSetup.empty} className="mb-xl text-center text-text-muted">No environments available</p>
        : (
          <div role="radiogroup" aria-labelledby="environment-select-lede" className="mb-xl flex flex-col gap-sm">
            {environments.map((env, i) => {
              const on = env.id === selected;
              const company = env.companyName;
              return (
                <button key={env.id} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} disabled={busy}
                  tabIndex={on || (!chosen && i === 0) ? 0 : -1}
                  data-testid={tid.accountSetup.environment(env.id)} onClick={() => onSelect(env.id)} onKeyDown={e => onKey(e, i)}
                  className={cn('flex w-full items-start gap-md rounded-card border bg-surface-card p-md text-left transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none',
                    'focus-visible:shadow-focus enabled:hover:border-border-strong enabled:active:scale-[0.98] disabled:cursor-progress motion-reduce:active:scale-100 max-md:min-h-touch',
                    on ? 'border-brand bg-brand-subtle enabled:hover:border-brand dark:border-brand-accent' : 'enabled:hover:bg-surface-tint enabled:active:bg-surface-tint')}>
                  <IconTile off={!on}><Server /></IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-sm">
                      <b className="min-w-0 flex-1 truncate text-sm font-semibold">{env.name}</b>
                      {on && <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-brand dark:text-brand-accent" />}
                    </span>
                    <span className="mt-[3px] flex flex-wrap items-center gap-x-sm gap-y-xs text-xs text-text-muted">
                      <span>{env.type}{company ? ` · ${company}` : ''}</span>
                      {/* AUTH.R59: QniConnect's label, on an environment with no company yet */}
                      {!hasCompanyId(env) && <Pill tone="hi">Ready</Pill>}
                    </span>
                  </span>
                </button>);
            })}
          </div>)}
      <div className="flex gap-sm">
        <Button testId={tid.accountSetup.home} kind="ghost" disabled={busy} onClick={onHome}><ArrowLeft aria-hidden="true" />Home</Button>
        <Button testId={tid.accountSetup.continue} kind="primary" className="flex-1" disabled={!chosen && !busy} pending={busy}
          onClick={() => { if (chosen) onContinue(chosen); }}>
          {busy ? 'Processing…' : <>Continue to portal<ArrowRight aria-hidden="true" /></>}
        </Button>
      </div>
    </>);
}
