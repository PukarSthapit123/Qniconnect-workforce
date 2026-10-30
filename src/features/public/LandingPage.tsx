/* The landing page at / for someone signed out (docs/superpowers/inventory/
   public.md, LAND): QniConnect's RegistrationAndLanding, on the design
   system. A signed-in person at / is in the app instead: it is where
   Microsoft sends them back after signing in (the gate, src/App.tsx).

   Signing in first clears the six employee keys QniConnect cleared (LAND.R3),
   then signs in as the sign-in page does, in the landing page's own words
   (LAND.R11). The sign-out the auth error page starts (manual_redirect,
   LAND.R9) is finished by the session on any page load, this one included
   (src/shell/SessionProvider.tsx, AUTH.R63). Its dead three-step form is not
   ported (LAND.R12, Ruling Q13). */
import { ArrowRight, FileText, Lock, Shield } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { tid } from '@/testids';
import { Card } from '@/ui';
import { buttonVariants } from '@/ui/shadcn/button';
import { MicrosoftSignIn } from './MicrosoftSignIn';
import { PublicLayout, SUPPORT_MAIL, TopLink } from './PublicLayout';

/* LAND.R3: localStorage, despite QniConnect's name for it (clearSessionStorage) */
export const LANDING_CLEARS = ['clientCompanies', 'clientCompanyId', 'clientCompanyName', 'employeeData', 'employeeId', 'employeeNo'] as const;
const clearEmployeeKeys = () => {
  try { for (const k of LANDING_CLEARS) localStorage.removeItem(k); } catch { /* no storage: nothing to clear */ }
};

const BADGES = [
  { icon: <Shield />, label: 'Microsoft Azure secured' },
  { icon: <Lock />, label: 'HMRC compliant' },
  { icon: <FileText />, label: 'Real-time BC data' },
];

export function LandingPage() {
  return (
    <PublicLayout testId={tid.page('landing')} nav={<TopLink href={SUPPORT_MAIL} testId={tid.pub.help}>Need help?</TopLink>}>
      <section className="flex flex-1 items-center bg-surface-inverse text-text-on-inverse">
        {/* a 16px gutter below lg: at 12px the pitch's text sat on the screen
            edge (taste review 2026-10-26, Phase 1 item 6) */}
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-2xl px-xl py-2xl max-lg:px-lg max-md:gap-xl max-md:py-xl lg:grid-cols-[1fr_400px]">
          <div>
            <p className="mb-lg inline-flex items-center gap-sm rounded-pill border border-glass-line bg-glass px-md py-xs text-xs font-semibold">
              <span aria-hidden="true" className="size-[6px] rounded-pill bg-brand-accent" />Employee self-service portal
            </p>
            <h1 className="text-(length:--qp-text-36) leading-(--qp-lh-36) font-bold lg:text-(length:--qp-text-48) lg:leading-(--qp-lh-48)">Your payroll.<br />On your time.</h1>
            <p className="mt-lg max-w-[46ch] text-base text-shell-ink">
              Secure self-service access to your payslips, documents and employment records directly connected to your organisation&rsquo;s Microsoft Business Central.
            </p>
            <ul className="mt-xl flex flex-wrap gap-sm" aria-label="Why QniConnect">
              {BADGES.map(b => (
                <li key={b.label} className="inline-flex items-center gap-xs rounded-pill border border-glass-line bg-glass px-md py-xs text-xs font-semibold [&_svg]:size-[14px] [&_svg]:text-brand-accent">
                  <span aria-hidden="true" className="inline-flex">{b.icon}</span>{b.label}
                </li>))}
            </ul>
          </div>
          <Card className="mb-0 p-xl text-text-primary max-md:p-lg">
            <p className="text-xs font-semibold text-text-muted">Already have an account?</p>
            <h2 className="mt-xs mb-lg">Sign in to QniConnect</h2>
            <MicrosoftSignIn label="Sign in with Microsoft" failed="Sign in failed. Please try again." before={clearEmployeeKeys}
              testId={tid.land.signIn} errorTestId={tid.land.error} />
            <div className="my-lg flex items-center gap-md text-xs text-text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
            </div>
            <p className="text-xs font-semibold text-text-muted">New to QniConnect?</p>
            <p className="mt-xs mb-md text-sm text-text-secondary">Connect your Business Central environment and get your team set up.</p>
            <Link to="/register" data-testid={tid.land.register}
              className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full motion-reduce:active:scale-100')}>
              Register your organisation<ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Card>
        </div>
      </section>
    </PublicLayout>);
}
