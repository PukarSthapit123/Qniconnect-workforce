/* Registration at /register (docs/superpowers/inventory/public.md, REG):
   QniConnect's EnhancedRegistration, four steps in one form, on the design
   system. Public, signed in or out (REG.R10).

   Steps 1 to 3 go on only when their required fields are filled (REG.R5);
   nothing is trimmed or checked for format (REG.R7), and only step 4's
   fields meet the browser's own checks on submit (REG.R6). Going back keeps
   everything (REG.R3). Submit sends REG.C1 once, with exactly QniConnect's
   payload (REG.R17): the plan and billing are shown, never sent (REG.R18).
   Any OK answer is success (REG.R22); a refusal or failure shows its own
   words above the form, on whatever step, until dismissed or sent again
   (REG.R9, R23 to R25).

   Tenant verification and the company lookup are account setup's, after
   sign-in (Ruling Q12). Upgrades: the step heading takes focus when the step
   changes, and a Continue that cannot go on says why. */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Check, CheckCircle2, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { submitRegistration } from '@/api/bc/registration';
import { INDUSTRIES, INITIAL_REGISTRATION, isStepValid, planLine, planName, stepTotal, type Billing, type Plan, type RegistrationForm } from '@/domain/registration';
import { cn } from '@/lib/utils';
import { tid } from '@/testids';
import { Banner, Button, Card, CheckRow, CheckboxField, Field, FieldGrid, Pill, Seg, SelectBox, TextInput, Wide } from '@/ui';
import { LEGAL_URL, PublicLayout, SUPPORT_MAIL, TopLink } from './PublicLayout';

/* REG.S1 stepMeta (EnhancedRegistration.js:330-335), in sentence case */
export const STEPS = [
  { label: 'Company info', title: 'Company information', subtitle: 'Tell us about your organisation' },
  { label: 'BC configuration', title: 'Business Central configuration', subtitle: 'Connect your Business Central environment' },
  { label: 'Plan selection', title: 'Select your plan', subtitle: 'Choose the right plan for your organisation' },
  { label: 'Contact & confirm', title: 'Contact and confirmation', subtitle: 'Review your details and complete registration' },
] as const;

/* REG step 3's cards (729-731): the base prices, whatever the billing (REG.R15) */
const PLANS: { key: Plan; price: string; popular?: boolean; features: string[] }[] = [
  { key: 'basic', price: '£0.5', features: ['Profile visibility', 'Payslip access', 'Secure auth'] },
  { key: 'essential', price: '£5', popular: true, features: ['All Basic', 'Document mgmt', 'Leave mgmt'] },
  { key: 'premium', price: '£7', features: ['All Essential', 'Starter checklist', 'Priority support'] },
];

const legal = (n: number, text: string) => (
  <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" data-testid={tid.reg.legal(n)}
    className="font-semibold text-brand underline underline-offset-2 dark:text-brand-accent">{text}</a>);

export function RegistrationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RegistrationForm>(INITIAL_REGISTRATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  /* the new step's heading takes focus, so a screen reader hears where it is */
  useEffect(() => { if (moved.current) heading.current?.focus(); }, [step]);

  /* REG.R2 */
  const set = <K extends keyof RegistrationForm>(key: K) => (value: RegistrationForm[K]) => { setForm(f => ({ ...f, [key]: value })); };
  const text = (key: keyof RegistrationForm) => ({
    name: key, value: String(form[key]), testId: tid.reg.field(key),
    onChange: (e: { target: { value: string } }) => { set(key)(e.target.value as never); },
  });
  /* REG.R3 */
  const go = (next: number) => {
    if (next < 1 || next > 4) return;
    moved.current = true;
    setStep(next);
    window.scrollTo(0, 0);
  };
  /* REG.R16 to R25. One at a time: the busy button keeps focus, so Enter
     could otherwise send it twice (REG.R26). */
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const r = await submitRegistration(form);
    if (r.ok) setDone(true);
    else setError(r.message);
    setLoading(false);
  };

  const meta = STEPS[step - 1] ?? STEPS[0];
  const valid = isStepValid(step, form);
  return (
    <PublicLayout testId={tid.page('register')} nav={<TopLink href={SUPPORT_MAIL} testId={tid.pub.help}>Need help?</TopLink>}>
      <div className="mx-auto grid w-full max-w-[1120px] items-start gap-2xl px-xl py-2xl max-lg:gap-lg max-lg:px-md max-md:py-lg lg:grid-cols-[300px_1fr]">
        <aside>
          <Button testId={tid.reg.back} kind="ghost" small onClick={() => { void navigate('/'); }}><ArrowLeft aria-hidden="true" />Home</Button>
          <div className="max-lg:hidden">
            <h1 className="mt-lg">Get your team<br />up and running.</h1>
            <p className="mt-sm text-text-secondary">
              Register your Business Central environment and give employees secure, instant access to their payroll data — all in minutes.
            </p>
            <ol className="mt-xl flex flex-col gap-md" aria-label="Registration steps">
              {STEPS.map((s, i) => {
                const n = i + 1, past = n < step, here = n === step;
                return (
                  <li key={s.label} data-testid={tid.reg.tracker(n)} aria-current={here ? 'step' : undefined}
                    className={cn('flex items-center gap-sm text-sm', here ? 'font-semibold text-text-primary' : 'text-text-muted')}>
                    <span aria-hidden="true" className={cn('grid size-7 shrink-0 place-items-center rounded-pill border text-xs font-semibold tabular-nums',
                      past && 'border-brand bg-brand text-text-on-brand', here && 'border-brand text-brand dark:border-brand-accent dark:text-brand-accent')}>
                      {past ? <Check className="size-[14px]" /> : n}
                    </span>
                    {s.label}{past && <span className="sr-only"> (done)</span>}
                  </li>);
              })}
            </ol>
          </div>
        </aside>

        <div className="min-w-0">
          {done
            ? <Done email={form.contactEmail || form.companyEmail} onHome={() => { void navigate('/'); }} />
            : (
              <form onSubmit={e => { void onSubmit(e); }}>
                {error && (
                  <div role="alert">
                    <Banner tone="err" testId={tid.reg.error} title="Registration error"
                      actions={<Button testId={tid.reg.errorDismiss} kind="ghost" small aria-label="Dismiss" onClick={() => { setError(null); }}><X aria-hidden="true" /></Button>}>
                      <span className="break-words">{error}</span>
                    </Banner>
                  </div>)}
                <Card className="mb-0 p-xl max-md:p-lg">
                  <p data-testid={tid.reg.step} className="text-xs font-semibold text-text-muted">Step {step} of 4</p>
                  <h2 ref={heading} tabIndex={-1} className="mt-xs outline-none">{meta.title}</h2>
                  <p className="mt-[2px] mb-lg text-sm text-text-secondary">{meta.subtitle}</p>

                  {step === 1 && (
                    <FieldGrid>
                      <Field label="Company name" required><TextInput {...text('companyName')} placeholder="Acme Corporation Ltd" required /></Field>
                      <Field label="Company email" required hint="We'll send important account notifications to this email">
                        <TextInput {...text('companyEmail')} type="email" placeholder="info@company.com" required /></Field>
                      <Field label="Company website"><TextInput {...text('companyWebsite')} type="url" placeholder="https://company.com" /></Field>
                      <Field label="Company phone"><TextInput {...text('companyPhone')} type="tel" placeholder="+44 20 1234 5678" /></Field>
                      <Field label="Industry">
                        <SelectBox testId={tid.reg.field('industry')} name="industry" placeholder="Select an industry" value={form.industry || undefined}
                          onValueChange={set('industry')} options={INDUSTRIES.map(v => ({ value: v, label: v }))} />
                      </Field>
                    </FieldGrid>)}

                  {step === 2 && (
                    <FieldGrid>
                      <Field label="Tenant ID" required><TextInput {...text('tenantId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required /></Field>
                      <Field label="Domain name" required><TextInput {...text('domainName')} placeholder="company.onmicrosoft.com" required /></Field>
                      <Field label="BC environment" required><TextInput {...text('bcEnvironment')} placeholder="Production" required /></Field>
                      <Field label="BC company name" required><TextInput {...text('bcCompanyName')} placeholder="CRONUS UK Ltd." required /></Field>
                      <Wide>
                        <Field label="Number of employees" required hint="For approximate calculation only. Actual billing is based on employees with salaries posted per month.">
                          <TextInput {...text('numberOfEmployees')} type="number" min="1" inputMode="numeric" placeholder="25" required />
                        </Field>
                      </Wide>
                    </FieldGrid>)}

                  {step === 3 && <PlanStep form={form} onPlan={set('selectedPlan')} onBilling={set('paymentFrequency')} />}

                  {step === 4 && (
                    <>
                      <FieldGrid>
                        <Field label="Contact name" required><TextInput {...text('contactName')} placeholder="John Smith" required /></Field>
                        <Field label="Contact email" required><TextInput {...text('contactEmail')} type="email" placeholder="john@company.com" required /></Field>
                        <Field label="Contact phone"><TextInput {...text('contactPhone')} type="tel" placeholder="+44 20 1234 5678" /></Field>
                      </FieldGrid>
                      <Summary form={form} />
                      <div className="mt-lg flex flex-col">
                        <CheckRow className="items-start" control={<CheckboxField testId={tid.reg.field('agreeTerms')} name="agreeTerms" required className="mt-[2px]"
                          checked={form.agreeTerms} onCheckedChange={v => { set('agreeTerms')(v === true); }} />}>
                          I agree to the {legal(1, 'Terms of Service')} and {legal(2, 'Privacy Policy')}
                        </CheckRow>
                        <CheckRow className="items-start" control={<CheckboxField testId={tid.reg.field('agreeDataProcessing')} name="agreeDataProcessing" required className="mt-[2px]"
                          checked={form.agreeDataProcessing} onCheckedChange={v => { set('agreeDataProcessing')(v === true); }} />}>
                          I consent to the processing of my company and personal data as described in the {legal(3, 'Privacy Policy')}
                        </CheckRow>
                      </div>
                    </>)}

                  <div className="mt-xl flex flex-wrap items-center gap-sm border-t pt-lg">
                    {step > 1 && <Button testId={tid.reg.prev} kind="ghost" type="button" onClick={() => { go(step - 1); }}>Back</Button>}
                    {!valid && <p data-testid={tid.reg.blocked} className="text-xs text-text-muted max-md:order-last max-md:w-full">
                      {step === 4 ? 'Fill in your contact details and tick both boxes to finish.' : 'Fill in every required field to continue.'}</p>}
                    {step < 4
                      ? <Button testId={tid.reg.next} kind="primary" type="button" className="ml-auto" disabled={!valid} onClick={() => { go(step + 1); }}>Continue</Button>
                      : <Button testId={tid.reg.submit} kind="primary" type="submit" className="ml-auto min-w-[188px]" disabled={!valid && !loading} pending={loading}>
                        {loading ? 'Processing…' : 'Complete registration'}</Button>}
                  </div>
                </Card>
              </form>)}
        </div>
      </div>
    </PublicLayout>);
}

/* REG step 3: billing, the three plans as one choice, and the total. */
function PlanStep({ form, onPlan, onBilling }: { form: RegistrationForm; onPlan(p: Plan): void; onBilling(b: Billing): void }) {
  const labelId = useId();
  const annual = form.paymentFrequency === 'annual';
  return (
    <>
      <p className="mb-xs text-xs font-semibold text-text-secondary">Billing frequency</p>
      <Seg label="Billing frequency" value={form.paymentFrequency} onChange={onBilling} testId={v => tid.reg.billing(v)}
        options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual (save 20%)' }]} />
      <p id={labelId} className="mt-lg mb-sm text-xs font-semibold text-text-secondary">Plan</p>
      <RadioCards labelledBy={labelId} value={form.selectedPlan} onChange={onPlan} options={PLANS.map(p => ({
        value: p.key, testId: tid.reg.plan(p.key),
        body: <>
          <span className="flex items-center gap-sm">
            <b className="text-sm font-semibold">{planName(p.key)}</b>
            {p.popular && <Pill tone="hi">Popular</Pill>}
          </span>
          <span className="mt-xs block text-lg font-semibold tabular-nums">{p.price}<span className="text-xs font-normal text-text-muted">/user/mo</span></span>
          <ul className="mt-sm flex flex-col gap-[2px] text-xs text-text-secondary">
            {p.features.map(f => <li key={f} className="flex items-center gap-xs"><Check aria-hidden="true" className="size-3 shrink-0 text-ok" />{f}</li>)}
          </ul>
        </>,
      }))} />
      <div className="mt-lg flex flex-wrap items-center justify-between gap-md rounded-card bg-surface-tint px-lg py-md">
        <p data-testid={tid.reg.totalNote} className="text-sm text-text-secondary">
          {planName(form.selectedPlan)} plan · {form.numberOfEmployees || '—'} users · billed {annual ? 'annually' : 'monthly'}
          {annual && <Pill tone="ok" className="ml-sm">20% off</Pill>}
        </p>
        <p className="text-right">
          <span data-testid={tid.reg.total} className="block text-xl font-semibold tabular-nums">£{stepTotal(form)}</span>
          <span className="text-xs text-text-muted">{annual ? 'per year' : 'per month'}</span>
        </p>
      </div>
    </>);
}

/* A choice of cards that is one radio group: arrow keys move the choice; only
   the press scales, and the chosen fill lands at once. */
function RadioCards<T extends string>({ labelledBy, value, onChange, options }: {
  labelledBy: string; value: T; onChange(v: T): void; options: { value: T; testId: string; body: ReactNode }[];
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number, step: number) => {
    const next = (i + step + options.length) % options.length;
    const o = options[next];
    if (!o) return;
    onChange(o.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-sm md:grid-cols-3">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            data-testid={o.testId} onClick={() => { onChange(o.value); }}
            onKeyDown={e => {
              const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
              if (step) { e.preventDefault(); move(i, step); }
            }}
            className={cn('relative rounded-card border bg-surface-card p-md text-left transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none',
              'focus-visible:shadow-focus active:scale-[0.98] motion-reduce:active:scale-100',
              on ? 'border-brand bg-brand-subtle dark:border-brand-accent' : 'hover:border-border-strong hover:bg-surface-tint')}>
            {on && <CheckCircle2 aria-hidden="true" className="absolute top-md right-md size-4 text-brand dark:text-brand-accent" />}
            {o.body}
          </button>);
      })}
    </div>);
}

/* REG step 4's Registration summary: empty shown as a dash */
function Summary({ form }: { form: RegistrationForm }) {
  const rows: [string, string, string][] = [
    ['company', 'Company', form.companyName], ['email', 'Email', form.companyEmail], ['environment', 'BC environment', form.bcEnvironment],
    ['bc-company', 'BC company', form.bcCompanyName], ['plan', 'Plan', planLine(form)], ['employees', 'Employees', form.numberOfEmployees],
  ];
  return (
    <section aria-labelledby="reg-summary" className="mt-lg rounded-card bg-surface-tint px-lg py-md">
      <h3 id="reg-summary" className="mb-sm text-sm">Registration summary</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-lg gap-y-xs text-sm">
        {rows.map(([key, label, value]) => (
          <div key={key} className="contents">
            <dt className="text-text-muted">{label}</dt>
            <dd data-testid={tid.reg.summary(key)} className="min-w-0 break-words text-right font-semibold">{value || '—'}</dd>
          </div>))}
      </dl>
    </section>);
}

/* REG.S4 and R27 */
function Done({ email, onHome }: { email: string; onHome(): void }) {
  return (
    <Card testId={tid.reg.done} className="mb-0 flex flex-col items-center px-xl py-2xl text-center max-md:px-md">
      <span aria-hidden="true" className="mb-md grid size-12 place-items-center rounded-pill bg-ok-surface text-ok [&_svg]:size-6"><CheckCircle2 /></span>
      {/* announced, and still a heading: a role on the h2 itself would replace its heading role */}
      <div role="status"><h2>Registration successful</h2></div>
      <p className="mt-sm mb-lg max-w-[48ch] text-text-secondary">
        Thank you for registering. We&rsquo;ve sent a confirmation email to <b className="break-all text-text-primary">{email}</b> with further instructions to complete your setup.
      </p>
      <Button testId={tid.reg.doneHome} kind="primary" onClick={onHome}>Return to home</Button>
    </Card>);
}
