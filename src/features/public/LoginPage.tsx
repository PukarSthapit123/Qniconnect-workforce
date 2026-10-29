/* The sign-in page at /login (docs/superpowers/inventory/public.md, LOGIN):
   QniConnect's AuthPages and SignInButton, on the design system. The gate
   (src/App.tsx) shows it only while no Microsoft account is signed in; with
   one, it says it is redirecting and opens the app (LOGIN.R1, R2, S2).
   Signing in clears nothing (LOGIN.R7): another tab reads the removal of
   isAuthenticated as a sign-out. */
import { tid } from '@/testids';
import { Card } from '@/ui';
import { MicrosoftSignIn } from './MicrosoftSignIn';
import { LOGIN_CONTACT, PublicLayout } from './PublicLayout';

export function LoginPage() {
  return (
    <PublicLayout testId={tid.page('login')}>
      <div className="flex flex-1 items-start justify-center px-xl py-2xl max-lg:px-md max-md:py-xl md:items-center">
        <div className="w-[min(420px,100%)]">
          <h1 className="text-center">Sign in to QniConnect</h1>
          <p className="mt-xs mb-xl text-center text-text-secondary">Access your payslips, profile, and employee documents</p>
          <Card className="mb-0 p-xl max-md:p-lg">
            <MicrosoftSignIn label="Sign in with Microsoft 365" failed="Login failed. Please try again."
              testId={tid.login.signIn} errorTestId={tid.login.error} />
          </Card>
          <p className="mt-lg text-center text-xs text-text-muted">
            Need help? Contact <a href={LOGIN_CONTACT.href} data-testid={tid.login.help} className="font-semibold text-brand underline-offset-2 hover:underline dark:text-brand-accent">{LOGIN_CONTACT.text}</a>
          </p>
        </div>
      </div>
    </PublicLayout>);
}
