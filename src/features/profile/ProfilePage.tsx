import { useState, type ReactNode } from 'react';
import { Briefcase, Clock, CreditCard, Eye, EyeOff, FileText, Mail, PiggyBank, User } from 'lucide-react';
import { tid } from '@/testids';
import { Avatar, Banner, Button, Card, CardHead, Fact, GuideButton, NavLink, Page, PageHead, Pill, SectionHead, Small, Tip } from '@/ui';
import { useProfile } from '@/api/profile';
import { useTenant } from '@/api/tenant';
import { useBcProfile } from '@/api/bc/profile';
import { useBcEnvironment, usePortal } from '@/shell/SessionProvider';
import { PayrollHidden, useOwnPayroll } from '@/shell/OwnPayroll';
import { flagOn } from '@/domain/modules';
import { formatProfileDate, maskValue, profileAddress, toProfileView, type ProfileView } from '@/domain/profile';
import { buttonVariants } from '@/ui/shadcn/button';
import { useNames } from '@/api/reference';
import { formatDate } from '@/lib/format';
import { StatePill } from '@/features/employees/StatePill';
import { perWeek } from '@/features/employees/EmployeeRecord';
import { ProposeChange } from './ProposeChange';
import { NotConnected } from './NotConnected';

/* My profile, merged (spec §4). On top, Workforce's own details and its
   "propose a change" flow (the prototype's essProfile,
   qnipay-workforce-v15.html:5587-5645); then QniConnect's Business Central
   record in its six sections, real data (docs/superpowers/inventory/
   portal.md, PROF); then Workforce's record of who you are and your
   contract. The Workforce parts say "Not yet connected" while /api/v1 is the
   fake server. The rota and leave cards are not part of this build. */
export function ProfilePage() {
  const profile = useProfile(), names = useNames(), tenant = useTenant();
  const docs = tenant.data ? flagOn(tenant.data.modules, tenant.data.flags, 'DOCS') : false;
  const [proposing, setProposing] = useState(false);
  /* the payroll record is the signed-in account's own, so not while viewing as someone else (final review I1) */
  const own = useOwnPayroll();
  const data = profile.data, p = data?.employee;
  return (
    <Page testId={tid.page('profile')}>
      <PageHead title="My profile" crumb="My work · Profile" actions={<GuideButton view="profile" />} />
      {profile.isPending && <p role="status" className="text-text-secondary">Loading your profile&hellip;</p>}
      {profile.isError && <p data-testid={tid.profile.error} role="alert" className="text-err">Your profile could not be loaded. Reload the page to try again.</p>}
      {data && p && <Card>
        <CardHead title={<>Your own details<Tip testId={tid.profile.detailsTip} text="Your line manager approves every change. Bank details are also verified by payroll before they take effect." /></>}
          actions={<>
            <NotConnected testId={tid.profile.notConnected('details')} />
            {data.pending.length > 0 && <Pill testId={tid.profile.pendingCount} tone="warn" glyph={<Clock />}>{data.pending.length} awaiting approval</Pill>}
            {data.selfEdit && <Button testId={tid.profile.propose} kind="secondary" small onClick={() => setProposing(true)}>Propose a change</Button>}</>} />
        {!data.selfEdit && <p data-testid={tid.profile.off} className="mb-sm text-sm text-text-secondary">
          Self-service changes are switched off for your organisation. Ask HR to change these details.</p>}
        {data.fields.map(f => {
          const c = data.pending.find(x => x.field === f.key);
          return (
            <Fact key={f.key} label={f.label} testId={tid.profile.value(f.key)}>
              <span className="block">{p[f.key] || '—'}</span>
              {c && <span data-testid={tid.profile.pending(f.key)} className="block text-xs font-normal text-warn">{c.to} awaiting approval</span>}
            </Fact>);
        })}
      </Card>}
      {own ? <PayrollRecord /> : <>
        <SectionHead title="Payroll record" />
        <PayrollHidden />
      </>}
      {data && p && <>
        <SectionHead title="Workforce record" />
        <div className="grid grid-cols-2 gap-x-md max-md:grid-cols-1">
          <Card>
            <CardHead title={<span className="flex items-center gap-md"><Avatar name={p.name} large />
              <span><span className="block">{p.name}</span><Small className="font-normal">{names.job(p.jobProfile)} · {names.location(p.location)}</Small></span></span>}
              actions={<><NotConnected testId={tid.profile.notConnected('record')} /><StatePill testId={tid.profile.state} state={p.state} /></>} />
            <Fact label="Employee ID" testId={tid.profile.fact('code')}><span className="tabular-nums">{p.code}</span></Fact>
            <Fact label="Email" testId={tid.profile.fact('email')}><span className="text-xs font-normal text-text-secondary">{p.email || '—'}</span></Fact>
            <Fact label="Employee type" testId={tid.profile.fact('employeeType')}>{names.type(p.employeeType)}</Fact>
            <Fact label="Job profile" testId={tid.profile.fact('jobProfile')}>{names.job(p.jobProfile)}</Fact>
            <Fact label="Department" testId={tid.profile.fact('department')}>{names.department(p.department)}</Fact>
            <Fact label="Location" testId={tid.profile.fact('location')}>{names.location(p.location)}</Fact>
            <Fact label="Reporting manager" testId={tid.profile.fact('manager')}>{p.manager || '—'}</Fact>
          </Card>
          <Card>
            <CardHead title={<>Employment and contract<Tip testId={tid.profile.managedTip} text="Set by HR. You cannot change these here. Ask your administrator." /></>} />
            <Fact label="Worker category" testId={tid.profile.fact('category')}>{p.category}</Fact>
            <Fact label="Contracted hours" testId={tid.profile.fact('contractedHours')}>{perWeek(p.contractedHours, `${p.category} · no contracted hours`)}</Fact>
            <Fact label="Maximum hours" testId={tid.profile.fact('maxHours')}>{perWeek(p.maxHours, 'No maximum set')}</Fact>
            <Fact label="Employment start" testId={tid.profile.fact('start')}>{formatDate(p.start)}</Fact>
            {p.end && <Fact label="Employment end" testId={tid.profile.fact('end')}>{formatDate(p.end)}</Fact>}
          </Card>
        </div>
        {/* the way to the documents, while the Document centre is on (v15:5647) */}
        {docs && <div className="mt-md"><NavLink testId={tid.profile.docs} to="/work/docs" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Open documents</NavLink></div>}
        {proposing && <ProposeChange profile={data} onClose={() => setProposing(false)} />}
      </>}
    </Page>);
}

type Reveal = 'taxCode' | 'niNumber' | 'bankAccount';

/* QniConnect's EmployeeProfile (PROF): one profile call (PROF.R1), read
   only (PROF.R14), the six sections in its order (PROF.R2). The tax code,
   NI number and bank details are masked until revealed, each with its own
   eye, the sort code with the account number's (PROF.R10). Before the
   record arrives it says it is loading; a record that cannot be read
   leaves the sections blank, as QniConnect did (PROF.R12), and now says so
   (Ruling Q15). */
function PayrollRecord() {
  const portal = usePortal(), environment = useBcEnvironment();
  const user = portal.user ? { name: portal.user.name, email: portal.user.email } : null;
  const q = useBcProfile(user, environment);
  const [shown, setShown] = useState<Record<Reveal, boolean>>({ taxCode: false, niNumber: false, bankAccount: false });
  const v: Partial<ProfileView> = q.data && user ? toProfileView(q.data, user) : {};
  const masked = (key: 'taxCode' | 'niNumber' | 'bankAccountNo' | 'bankBranchNo', by: Reveal, last: number) =>
    shown[by] ? v[key] ?? '' : maskValue(v[key], last);
  const eye = (by: Reveal, label: string) => (
    <button type="button" data-testid={tid.profile.bcReveal(by)} aria-pressed={shown[by]} aria-label={`${shown[by] ? 'Hide' : 'Show'} ${label}`}
      onClick={() => setShown(s => ({ ...s, [by]: !s[by] }))}
      className="-my-[6px] grid size-8 shrink-0 place-items-center rounded-pill text-brand max-md:-my-[12px] max-md:size-11 transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none hover:bg-surface-tint active:scale-[0.94] dark:text-brand-accent [&>svg]:size-4">
      {shown[by] ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>);
  const field = (key: keyof ProfileView, label: string, value: ReactNode = v[key] ?? '', reveal?: ReactNode) => (
    <Fact label={label} testId={tid.profile.bcValue(key)}>{reveal ? <Revealable reveal={reveal}>{value}</Revealable> : value}</Fact>);
  return (
    <>
      <SectionHead title="Payroll record" tip="Held by payroll in Business Central. To change any of it, ask your payroll administrator." tipTestId={tid.profile.bcTip} />
      {q.isPending && <p data-testid={tid.profile.bcLoading} role="status" className="mb-md text-text-secondary">Loading your payroll record&hellip;</p>}
      {q.isError && <Banner testId={tid.profile.bcFailed} tone="err" title="Your payroll record could not be loaded.">
        Reload the page to try again. If it keeps happening, ask your payroll administrator.</Banner>}
      {!q.isPending && <div className="grid grid-cols-2 gap-x-md max-md:grid-cols-1">
        <Section k="personal" icon={<User />} title="Personal information">
          {field('name', 'Full name')}
          {field('birthDate', 'Date of birth', formatProfileDate(v.birthDate))}
          {field('gender', 'Gender')}
        </Section>
        <Section k="contact" icon={<Mail />} title="Contact information">
          {field('email', 'Email address', <span className="break-all">{v.email ?? ''}</span>)}
          {field('phone', 'Phone number')}
          {field('address', 'Address', profileAddress({ ...EMPTY, ...v }).map((line, i) => <span key={i} className="block">{line}</span>))}
        </Section>
        <Section k="employment" icon={<Briefcase />} title="Employment details">
          {field('employeeId', 'Employee ID')}
          {field('position', 'Position')}
          {field('joinDate', 'Start date', formatProfileDate(v.joinDate))}
          {field('hoursWorked', 'Weekly hours')}
          {field('status', 'Status')}
        </Section>
        <Section k="tax" icon={<FileText />} title="Tax and National Insurance">
          {field('taxCode', 'Tax code', masked('taxCode', 'taxCode', 2), eye('taxCode', 'tax code'))}
          {field('niNumber', 'NI number', masked('niNumber', 'niNumber', 3), eye('niNumber', 'NI number'))}
          {field('niCategory', 'NI category')}
        </Section>
        <Section k="banking" icon={<CreditCard />} title="Banking details">
          {field('bankName', 'Bank name')}
          {field('bankAccountName', 'Account name')}
          {field('bankAccountNo', 'Account number', masked('bankAccountNo', 'bankAccount', 4), eye('bankAccount', 'account number and sort code'))}
          {field('bankBranchNo', 'Sort code', masked('bankBranchNo', 'bankAccount', 2))}
          {field('payFrequency', 'Payment frequency')}
        </Section>
        <Section k="pension" icon={<PiggyBank />} title="Pension information">
          {field('pensionSet', 'Pension set')}
          {field('pensionProvider', 'Pension provider')}
          {field('pensionContribution', 'Contribution')}
        </Section>
      </div>}
    </>);
}

const EMPTY: ProfileView = {
  name: '', birthDate: '', gender: '', email: '', phone: '', address: '', address2: '', addressLine3: '', addressLine4: '', city: '', county: '',
  postCode: '', country: '', employeeId: '', position: '', joinDate: '', hoursWorked: '', status: '', taxCode: '', niNumber: '', niCategory: '',
  bankName: '', bankAccountName: '', bankAccountNo: '', bankBranchNo: '', payFrequency: '', pensionSet: '', pensionProvider: '', pensionContribution: '',
};

function Section({ k, icon, title, children }: { k: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card testId={tid.profile.bcSection(k)}>
      <CardHead title={<h3 className="flex items-center gap-sm text-sm font-semibold"><span aria-hidden="true" className="text-brand dark:text-brand-accent [&>svg]:size-4">{icon}</span>{title}</h3>} />
      {children}
    </Card>);
}

/* A masked value with its eye beside it, in tabular digits, so revealing it does not shift the row. */
function Revealable({ reveal, children }: { reveal: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-xs"><span className="tabular-nums">{children}</span>{reveal}</span>;
}
