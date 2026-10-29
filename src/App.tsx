import { lazy, Suspense, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, useLocation } from 'react-router';
import { Toaster } from '@/ui/shadcn/sonner';
import { TooltipProvider } from '@/ui/shadcn/tooltip';
import { queryClient } from '@/api/query';
import { SessionProvider, useSession } from '@/shell/SessionProvider';
import { Shell } from '@/shell/Shell';
import { ShellError, ShellLoading } from '@/shell/shellData';
import { AuthStatus } from '@/shell/GateViews';
import { EnvironmentPage } from '@/features/account-setup/EnvironmentPage';
import { AuthErrorPage } from '@/features/auth-pages/AuthErrorPage';
import { AuthCallbackPage } from '@/features/auth-pages/AuthCallbackPage';
import { LandingPage } from '@/features/public/LandingPage';
import { LoginPage } from '@/features/public/LoginPage';
import { PricingPage } from '@/features/public/PricingPage';
import { RegistrationPage } from '@/features/public/RegistrationPage';
import { REDIRECTS } from '@/app/redirects';
import { auth } from '@/auth';
import { logger } from '@/lib/logger';
import { tid } from '@/testids';

/* The dev picker exists only beside the fake server. The literal, not
   FAKE_SERVER_ON, for the reason main.tsx gives: in a plain production build
   the condition is false in this very module, so the bundler drops the
   import and never emits the picker's chunk. */
const DevSignIn = __FAKE_SERVER_ON__ ? lazy(() => import('@/shell/DevSignIn').then(m => ({ default: m.DevSignIn }))) : null;
const ENVIRONMENT_PATH = '/account-setup/environment';

/* Who gets what (spec sections 6 and 8, inventory AUTH S1-S2 and R38,
   public LAND, LOGIN, REG, PRICE):
   - an old QniConnect address goes to its new route first, query kept
     (src/app/redirects.ts);
   - public routes always render: /auth-error, /auth/callback (the Business
     Central authorization's return, often in a popup: AUTH.R64), /register
     and /pricing, and /dev/sign-in while the fake server runs;
   - / is the landing page while no Microsoft account is signed in, and the
     app once one is: Microsoft sends a sign-in back there;
   - /login is the sign-in page while no account is signed in; with one, it
     says it is redirecting until the sign-in sequence has answered, then
     opens the app (LOGIN.R1, R2, S2);
   - nothing else routes until the sign-in sequence has answered (a loading state);
   - signed out on a protected route: Microsoft sign-in (the stub: the dev picker);
   - an account that is no seed person (development): the dev picker;
   - a portal error: /auth-error;
   - no environment: environment selection;
   - otherwise the shell. */
function Gate() {
  const { pathname, search } = useLocation();
  const moved = REDIRECTS[pathname];
  if (moved) return <Navigate to={{ pathname: moved, search }} replace />;
  if (DevSignIn && pathname === '/dev/sign-in') return <Suspense fallback={<ShellLoading />}><DevSignIn /></Suspense>;
  if (pathname === '/auth-error') return <AuthErrorPage />;
  if (pathname === '/auth/callback') return <AuthCallbackPage />;
  if (pathname === '/register') return <RegistrationPage />;
  if (pathname === '/pricing') return <PricingPage />;
  if (pathname === '/login') return <Login />;
  /* / is decided inside Protected, so the shell is one element whatever the
     path, and is not remounted when its / moves on to the person's landing */
  return <Protected path={pathname} />;
}

/* LAND.R2 is not kept: a signed-in person at / is in the app, because / is
   where Microsoft returns them after signing in (redirectUri is the origin). */
const isLanding = (path: string, status: string) => path === '/' && !auth().account() && status !== 'signing-out';

/* LOGIN.R1 and R2: the Microsoft account decides, never a stored flag (a
   stale isAuthenticated from another tab must not redirect). */
function Login() {
  const { ready } = useSession();
  if (!auth().account()) return <LoginPage />;
  if (!ready) return <AuthStatus testId={tid.login.redirecting}>Redirecting to dashboard&hellip;</AuthStatus>;
  return <Navigate to="/" replace />;
}

function Protected({ path }: { path: string }) {
  const s = useSession();
  const { status, signIn } = s;
  const landing = isLanding(path, status);
  useEffect(() => {
    /* not a click, so the redirect alone: a browser blocks a popup here (final review M1) */
    if (status === 'signed-out' && !landing) signIn({ popup: false }).catch((e: unknown) => { logger.error('Sign-in failed to start:', e); });
  }, [status, signIn, landing]);
  if (landing) return <LandingPage />;
  if (!s.ready) return <ShellLoading />;
  if (status === 'signing-out') return <AuthStatus testId={tid.auth.signingOut}>Signing you out&hellip;</AuthStatus>;
  if (status === 'signed-out') return <AuthStatus testId={tid.auth.redirecting}>Taking you to sign in&hellip;</AuthStatus>;
  /* N18: a portal admin is offered a seed admin first */
  if (DevSignIn && s.unmatched) return <Navigate to={`/dev/sign-in?unmatched=1${s.unmatchedAdmin ? '&admin=1' : ''}`} replace />;
  if (s.portal.error) return <Navigate to="/auth-error" replace />;
  if (!s.environment) return path === ENVIRONMENT_PATH ? <EnvironmentPage /> : <Navigate to={ENVIRONMENT_PATH} replace />;
  if (path === ENVIRONMENT_PATH) return <Navigate to="/" replace />;
  if (s.sessionError) return <ShellError onRetry={s.retrySession} onSignOut={() => void s.signOut()} />;
  if (!s.session) return <ShellLoading />;
  return <Shell />;
}
/* One tooltip provider for the whole app: once a tooltip is open, the next one
   the pointer reaches opens at once, with no delay and no animation. */
export function App() {
  return (
    <div data-testid={tid.app}>
      <TooltipProvider>
        <QueryClientProvider client={queryClient}><BrowserRouter><SessionProvider><Gate /></SessionProvider></BrowserRouter></QueryClientProvider>
      </TooltipProvider>
      <Toaster />
    </div>);
}
