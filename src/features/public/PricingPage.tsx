/* Pricing at /pricing (docs/superpowers/inventory/public.md, PRICE):
   QniConnect's licence page, on the design system. Static, public, no calls.
   The three tiers' copy and prices are the contract (PRICE.R5, R7); one tier
   shows at a time (PRICE.R1), and the comparison opens and closes (PRICE.R2).
   Not ported (Ruling Q13): the mock browser frame round a placeholder image
   that does not exist, and the footer's dead links and newsletter. */
import { useId, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, X } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { tid } from '@/testids';
import { Card, Pill, Seg } from '@/ui';
import { buttonVariants } from '@/ui/shadcn/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { PublicLayout, TopLink } from './PublicLayout';

export type Tier = 'basic' | 'essential' | 'premium';
interface Point { bold?: string; text: string }
interface TierCopy {
  title: string; lede: string; price: string; popular?: boolean;
  includes: Point[]; cta: string; forTitle: string; forPoints: Point[];
}

/* PRICE, SiriusConnect365Licenses.js:173-588, word for word */
export const TIERS: Record<Tier, TierCopy> = {
  basic: {
    title: 'Basic license', price: '£0.5',
    lede: 'Essential employee self-service for payslip access, ideal for small businesses looking for core functionality.',
    includes: [{ text: 'Employee profile visibility' }, { text: 'Payslip list and detailed preview' }, { text: 'Secure PDF payslip download' }, { text: 'Microsoft 365 authentication' }],
    cta: 'Get started with Basic', forTitle: 'Designed for employees who need:',
    forPoints: [
      { bold: 'Secure access', text: 'to personal payroll information' },
      { bold: 'Self-service access', text: 'to current and historical payslips' },
      { bold: 'Easy download', text: 'of payslips for tax filing and record-keeping' },
      { bold: 'Seamless login', text: 'with existing Microsoft 365 credentials' },
    ],
  },
  essential: {
    title: 'Essential license', price: '£5', popular: true,
    lede: 'Complete employee portal with expanded features for comprehensive HR self-service capabilities.',
    includes: [{ bold: 'All Basic features', text: 'included' }, { text: 'Personalized employee dashboard' }, { text: 'Document management system' },
      { text: 'Leave management and time tracking' }, { text: 'Reporting and analytics tools' }],
    cta: 'Get started with Essential', forTitle: 'Perfect for organizations that need:',
    forPoints: [
      { bold: 'Comprehensive dashboard', text: 'for employee self-service' },
      { bold: 'Centralized document repository', text: 'for important employee documents' },
      { bold: 'Leave and absence management', text: 'to streamline time-off requests' },
      { bold: 'Advanced reporting', text: 'for better workforce insights' },
      { bold: 'Time tracking capabilities', text: 'for accurate attendance records' },
    ],
  },
  premium: {
    title: 'Premium license', price: '£7',
    lede: 'Our most comprehensive solution with advanced features including the employee starter checklist.',
    includes: [{ bold: 'All Basic & Essential features', text: 'included' }, { text: 'Comprehensive starter checklist' }, { text: 'Advanced onboarding tools' },
      { text: 'Enhanced reporting capabilities' }, { text: 'Priority support' }],
    cta: 'Get started with Premium', forTitle: 'Ideal for organizations that want:',
    forPoints: [
      { bold: 'Complete employee lifecycle management', text: 'from onboarding to offboarding' },
      { bold: 'Comprehensive starter checklist', text: 'to streamline new employee setup' },
      { bold: 'Advanced document workflows', text: 'for approvals and digital signatures' },
      { bold: 'Enhanced analytics and reporting', text: 'with customizable dashboards' },
      { bold: 'Priority support', text: 'with dedicated account management' },
    ],
  },
};

/* PRICE's comparison table: [feature, basic, essential, premium] */
export const COMPARISON: [string, boolean, boolean, boolean][] = [
  ['Profile page visibility', true, true, true],
  ['Payslip list view', true, true, true],
  ['Payslip preview', true, true, true],
  ['Payslip download (PDF)', true, true, true],
  ['Microsoft 365 authentication', true, true, true],
  ['Business Central integration', true, true, true],
  ['Dashboard', false, true, true],
  ['Document management', false, true, true],
  ['Leave management', false, true, true],
  ['Time tracking', false, true, true],
  ['Reporting & analytics', false, true, true],
  ['Starter checklist', false, false, true],
];

const STEPS = [
  { title: 'User authentication', text: 'Employees sign in using their Microsoft 365 credentials, providing a seamless and secure authentication experience.' },
  { title: 'License detection', text: "The system automatically detects the organization's license tier (Basic, Essential, or Premium) from Business Central." },
  { title: 'Personalized experience', text: 'The portal dynamically adapts to show only the features and functions available in your license tier.' },
];

const point = (p: Point): ReactNode => p.bold ? <><b className="font-semibold text-text-primary">{p.bold}</b> {p.text}</> : p.text;

export function PricingPage() {
  const [tier, setTier] = useState<Tier>('basic');
  const [comparing, setComparing] = useState(false);
  const tableId = useId();
  const t = TIERS[tier];
  return (
    <PublicLayout testId={tid.page('pricing')} nav={<>
      <TopLink to="/register" testId={tid.pub.register}>Register</TopLink>
      <TopLink to="/login" testId={tid.pub.signIn} primary>Sign in</TopLink>
    </>}>
      <div className="mx-auto w-full max-w-[1120px] px-xl py-2xl max-lg:px-md max-md:py-xl">
        <header className="mb-xl text-center">
          <h1>Choose the right plan for your organization</h1>
          <p className="mx-auto mt-xs max-w-[60ch] text-text-secondary">QniConnect offers flexible license options to meet the specific needs of your business</p>
          <div className="mt-lg flex justify-center">
            <Seg label="License tier" value={tier} onChange={setTier} testId={v => tid.price.tier(v)}
              options={[{ value: 'basic', label: 'Basic' }, { value: 'essential', label: 'Essential' }, { value: 'premium', label: 'Premium' }]} />
          </div>
        </header>

        <section data-testid={tid.price.panel(tier)} aria-label={t.title} className="grid gap-lg lg:grid-cols-[1fr_1fr]">
          <Card className="mb-0 p-xl max-md:p-lg">
            <div className="flex flex-wrap items-center gap-sm">
              <h2>{t.title}</h2>
              {t.popular && <Pill tone="hi">Most popular</Pill>}
            </div>
            <p className="mt-xs text-text-secondary">{t.lede}</p>
            <p className="mt-lg flex items-baseline gap-sm">
              <span className="text-(length:--qp-text-36) leading-(--qp-lh-36) font-bold tabular-nums">{t.price}</span>
              <span className="text-sm text-text-secondary">per employee/month</span>
            </p>
            <p className="mt-xs text-xs text-text-muted">billed monthly</p>
            <ul className="mt-lg flex flex-col gap-sm">
              {t.includes.map(p => (
                <li key={p.bold ?? p.text} className="flex items-start gap-sm text-sm text-text-secondary">
                  <Check aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-ok" />
                  <span>{point(p)}</span>
                </li>))}
            </ul>
            <Link to="/register" data-testid={tid.price.cta(tier)}
              className={cn(buttonVariants({ size: 'lg' }), 'mt-xl w-full motion-reduce:active:scale-100')}>
              {t.cta}<ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Card>
          <Card className="mb-0 bg-surface-tint p-xl max-md:p-lg">
            <h3>{t.forTitle}</h3>
            <ul className="mt-md flex flex-col gap-md">
              {t.forPoints.map(p => (
                <li key={p.bold} className="flex items-start gap-sm text-sm text-text-secondary">
                  <span aria-hidden="true" className="mt-[7px] size-[6px] shrink-0 rounded-pill bg-brand dark:bg-brand-accent" />
                  <span>{point(p)}</span>
                </li>))}
            </ul>
          </Card>
        </section>

        <div className="mt-xl flex justify-center">
          <button type="button" data-testid={tid.price.compare} aria-expanded={comparing} aria-controls={tableId} onClick={() => setComparing(c => !c)}
            className="group inline-flex items-center gap-xs rounded-control px-md py-sm text-sm font-semibold text-brand transition-[background-color,scale] duration-(--dur-press) ease-(--ease-out) select-none hover:bg-surface-tint active:scale-[0.97] motion-reduce:active:scale-100 dark:text-brand-accent max-md:min-h-touch">
            {comparing ? 'Hide detailed comparison' : 'View detailed comparison'}
            <ChevronDown aria-hidden="true" className={cn('size-4 transition-[rotate] duration-(--dur-dropdown) ease-(--ease-out) group-focus-visible:transition-none motion-reduce:transition-none', comparing && 'rotate-180')} />
          </button>
        </div>
        <div id={tableId} hidden={!comparing} className="mt-md">
          {comparing && (
            <Table variant="matrix" data-testid={tid.price.table}>
              <TableHeader><TableRow><TableHead>Feature</TableHead><TableHead>Basic</TableHead><TableHead>Essential</TableHead><TableHead>Premium</TableHead></TableRow></TableHeader>
              <TableBody>
                {COMPARISON.map(([feature, ...has], i) => (
                  <TableRow key={feature} data-testid={tid.price.row(i)}>
                    <TableCell>{feature}</TableCell>
                    {has.map((on, j) => (
                      <TableCell key={j}>
                        {on ? <Check role="img" aria-label="Included" className="size-4 text-ok" /> : <X role="img" aria-label="Not included" className="size-4 text-text-disabled" />}
                      </TableCell>))}
                  </TableRow>))}
              </TableBody>
            </Table>)}
        </div>

        <section className="mt-2xl" aria-labelledby="price-how">
          <h2 id="price-how" className="text-center">How license-based access works</h2>
          <p className="mx-auto mt-xs max-w-[60ch] text-center text-text-secondary">
            QniConnect intelligently adapts to your organization&rsquo;s license tier, showing only the features your employees have access to.
          </p>
          <ol className="mt-xl grid gap-lg md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-card border bg-surface-card p-lg">
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-pill bg-brand-subtle text-sm font-semibold text-brand tabular-nums dark:text-brand-accent">{i + 1}</span>
                <h3 className="mt-md">{s.title}</h3>
                <p className="mt-xs text-sm text-text-secondary">{s.text}</p>
              </li>))}
          </ol>
        </section>
      </div>
    </PublicLayout>);
}
