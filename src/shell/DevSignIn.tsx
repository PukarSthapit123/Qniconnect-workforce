/* The dev picker (/dev/sign-in, spec section 6): who to be, among the seed
   people, while the fake server runs. Only App reaches this module, behind
   __FAKE_SERVER_ON__, so a plain production build never carries it.

   Picking someone keeps them for this tab (qniconnect.devAccount: the fake
   servers answer as them whoever the Microsoft account is) and, under the
   auth stub, makes them the signed-in account too (qniconnect.stubAccount);
   then the app reloads and signs in from the start. With Microsoft sign-in,
   an account that is none of the seed people is sent here with ?unmatched=1. */
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, ApiError } from '@/api/client';
import { auth } from '@/auth';
import { listAccounts } from '@/contract/session';
import { setDevAccount, STUB_ACCOUNT_KEY } from '@/lib/dev-account';
import { tid } from '@/testids';
import { Banner, GroupLabel, Logo, Pill, Small, Tip } from '@/ui';
import { TopBar } from './TopBar';

type UserType = 'employee' | 'manager' | 'admin';
const GROUPS: { type: UserType; label: string; note: string }[] = [
  { type: 'employee', label: 'Employees', note: 'Their own work: timesheet, profile and documents' },
  { type: 'manager', label: 'Managers', note: 'Approvals and their team' },
  { type: 'admin', label: 'Admins', note: 'Configuration, modules and access' },
];

/* Remembers the choice for this tab; under the stub, it is the account too. */
export function pickDevAccount(person: { email: string; name: string }, underStub: boolean) {
  setDevAccount(person.email);
  if (underStub) sessionStorage.setItem(STUB_ACCOUNT_KEY, JSON.stringify({ oid: `dev-${person.email.toLowerCase()}`, email: person.email, name: person.name }));
}

export function DevSignIn() {
  const [params] = useSearchParams();
  const unmatched = params.get('unmatched') === '1';
  /* N18: the portal check says this Microsoft account is a portal admin, so
     the picker leads with the admins and suggests the first of them */
  const portalAdmin = unmatched && params.get('admin') === '1';
  const underStub = import.meta.env.VITE_AUTH === 'stub';
  const microsoft = unmatched ? auth().account()?.email : undefined;
  const accounts = useQuery({ queryKey: ['dev-accounts'], queryFn: () => api(listAccounts) });
  const choose = (person: { email: string; name: string }) => {
    pickDevAccount(person, underStub);
    window.location.assign('/');
  };
  const groups = portalAdmin ? [...GROUPS.filter(g => g.type === 'admin'), ...GROUPS.filter(g => g.type !== 'admin')] : GROUPS;
  const suggested = portalAdmin ? accounts.data?.find(a => a.userType === 'admin')?.email : undefined;
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main data-testid={tid.page('dev-sign-in')} className="mx-auto w-full max-w-[1360px] px-xl max-lg:px-md">
        <div className="mx-auto w-[min(560px,100%)] py-xl max-md:py-lg">
          <div className="mb-lg flex rounded-sm bg-surface-inverse px-[14px] py-md"><Logo /></div>
          <h1 className="mb-[2px]">Choose who to sign in as</h1>
          <p className="mb-lg text-text-secondary">This is a development sign-in. Pick a sample person to try QniConnect as them.</p>
          {unmatched && (
            <Banner tone="info" testId={tid.devSignIn.unmatched} title="Your Microsoft account is not a sample person">
              {microsoft ? <><b className="break-all">{microsoft}</b> is</> : 'Your account is'} not one of the sample people the development data knows, so pick someone to sign in as.
              {portalAdmin && <> Business Central says you are a portal administrator, so a sample admin is suggested.</>}
            </Banner>)}
          {accounts.isPending && <p data-testid={tid.devSignIn.loading} className="text-text-secondary">Loading the sample people&hellip;</p>}
          {accounts.isError && (
            <p data-testid={tid.devSignIn.error} role="alert" className="text-err">
              {accounts.error instanceof ApiError ? `${accounts.error.refusal.message} ${accounts.error.refusal.next}` : 'The sample people could not be loaded. Reload the page to try again.'}
            </p>)}
          {accounts.data && groups.map(g => {
            const people = accounts.data.filter(a => a.userType === g.type);
            if (!people.length) return null;
            return (
              <section key={g.type} data-testid={tid.devSignIn.group(g.type)} aria-labelledby={`dev-sign-in-${g.type}`} className="mb-lg">
                <GroupLabel><span id={`dev-sign-in-${g.type}`}>{g.label}</span> <span className="font-normal tracking-normal">· {g.note}</span></GroupLabel>
                <ul className="flex flex-col gap-xs">
                  {people.map(a => <li key={a.email}>
                    <button type="button" data-testid={tid.devSignIn.account(a.email)} onClick={() => choose(a)}
                      autoFocus={a.email === suggested}
                      className="block w-full rounded-control border bg-surface-card px-md py-sm text-left transition-[background-color,border-color,scale] duration-(--dur-press) ease-(--ease-out) select-none hover:border-border-strong hover:bg-surface-tint focus-visible:border-brand focus-visible:shadow-focus active:scale-[0.98] active:bg-surface-tint motion-reduce:active:scale-100 max-md:min-h-touch">
                      <span className="flex flex-wrap items-baseline gap-x-sm"><b className="text-sm font-[650]">{a.name}</b>
                        <span className="text-xs text-text-muted tabular-nums">{a.employeeCode}</span>
                        {a.email === suggested && <Pill testId={tid.devSignIn.suggested} tone="hi" className="ml-auto">Suggested</Pill>}</span>
                      <span className="mt-[2px] block truncate text-xs text-text-secondary">{a.email}</span>
                    </button></li>)}
                </ul>
              </section>);
          })}
          <Small testId={tid.devSignIn.storageNote} className="mt-lg">
            This app keeps your work in this browser, on this device, and sends it nowhere else.
            <Tip testId={tid.devSignIn.storageTip} text="Anything held in a browser can be read by whoever has the browser, so this is not a security boundary." />
          </Small>
        </div>
      </main>
    </div>);
}
