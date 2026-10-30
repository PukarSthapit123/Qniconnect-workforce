/* Pricing at /pricing (docs/superpowers/inventory/public.md, PRICE):
   QniConnect's licence page, on the design system. Static, public, no calls.
   Ruling Q23 (2026-10-27): QniConnect's Basic, Essential and Premium tiers
   become one base price per employee and add-on modules priced separately,
   so the tier control and the comparison table went with them. The prices
   are domain/pricing's, shared with Registration. The copy is rewritten in
   plain words (taste review 2026-10-26: no stock phrases, no numbered step
   cards, the price as the page's largest thing).
   Not ported (Ruling Q13): the mock browser frame round a placeholder image
   that does not exist, and the footer's dead links and newsletter. */
import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { tid } from '@/testids';
import { Card } from '@/ui';
import { buttonVariants } from '@/ui/shadcn/button';
import { ADD_ONS, ANNUAL_DISCOUNT, BASE_INCLUDES, addOnPrice, gbp, monthlyPrice } from '@/domain/pricing';
import { PublicLayout, SUPPORT_MAIL, TopLink } from './PublicLayout';

/* How access works, in the order it happens */
export const HOW = [
  'Employees sign in with the Microsoft 365 account they already have.',
  'QniConnect reads their payslips and details from your Business Central.',
  'An add-on appears for your employees once you switch it on.',
] as const;

export function PricingPage() {
  return (
    <PublicLayout testId={tid.page('pricing')} nav={<>
      <TopLink to="/register" testId={tid.pub.register}>Register</TopLink>
      <TopLink to="/login" testId={tid.pub.signIn} primary>Sign in</TopLink>
    </>}>
      <div className="mx-auto w-full max-w-[1120px] px-xl py-2xl max-lg:px-lg max-md:py-xl">
        {/* the price is the title, at the landing page's display size: the visitor's first question, answered first */}
        <header className="mb-xl">
          <h1 className="text-(length:--qp-text-48) leading-tight tabular-nums max-md:text-(length:--qp-text-30)">
            {gbp(monthlyPrice('monthly'))} per employee a month</h1>
          <p className="mt-sm max-w-[60ch] text-(length:--qp-text-16)">
            QniConnect gives your employees their payslips and their profile, signed in with Microsoft 365 and read from your Business Central payroll.
            Billed monthly, or {gbp(monthlyPrice('annual'))} a month billed annually ({ANNUAL_DISCOUNT * 100}% off).
          </p>
        </header>

        <div className="grid gap-lg lg:grid-cols-[1fr_1fr]">
          <Card testId={tid.price.base} className="mb-0 p-xl max-md:p-lg">
            <h2>What QniConnect includes</h2>
            <ul className="mt-lg flex flex-col gap-sm">
              {BASE_INCLUDES.map(p => (
                <li key={p} className="flex items-start gap-sm text-(length:--qp-text-16)">
                  <Check aria-hidden="true" className="mt-[3px] size-4 shrink-0 text-ok" />
                  <span>{p}</span>
                </li>))}
            </ul>
            <Link to="/register" data-testid={tid.price.cta}
              className={cn(buttonVariants({ size: 'lg' }), 'mt-xl w-full motion-reduce:active:scale-100')}>
              Register your organisation<ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Card>

          <Card className="mb-0 bg-surface-tint p-xl max-md:p-lg">
            <h2>Add-on modules</h2>
            <p className="mt-xs text-(length:--qp-text-16)">Switch these on when you need them. Each one is priced on its own.</p>
            <ul className="mt-lg flex flex-col gap-lg">
              {ADD_ONS.map(o => (
                <li key={o.code} data-testid={tid.price.addOn(o.code)}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-sm">
                    <h3>{o.name}</h3>
                    <span className="text-sm font-semibold text-text-secondary">{addOnPrice(o)}</span>
                  </div>
                  <p className="mt-xs text-(length:--qp-text-16)">{o.summary}</p>
                </li>))}
            </ul>
            <p className="mt-lg text-sm text-text-secondary">
              To ask about add-on prices, email <a href={SUPPORT_MAIL} data-testid={tid.price.ask}
                className="font-semibold text-brand underline underline-offset-2 dark:text-brand-accent">{SUPPORT_MAIL.replace(/^mailto:/, "")}</a>.</p>
          </Card>
        </div>

        {/* the heading and its list share the cards' two columns, so neither half of the row stands empty */}
        <section className="mt-2xl grid gap-lg lg:grid-cols-[1fr_1fr]" aria-labelledby="price-how">
          <h2 id="price-how">How access works</h2>
          <ul data-testid={tid.price.how} className="flex flex-col gap-sm">
            {HOW.map(s => (
              <li key={s} className="flex items-start gap-sm text-(length:--qp-text-16)">
                <span aria-hidden="true" className="mt-[9px] size-[6px] shrink-0 rounded-pill bg-brand dark:bg-brand-accent" />
                <span>{s}</span>
              </li>))}
          </ul>
        </section>
      </div>
    </PublicLayout>);
}
