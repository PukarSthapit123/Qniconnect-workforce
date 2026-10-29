/* QniConnect's auth error page at /auth-error (AuthErrorPage.js; inventory
   AUTH.S5, AUTH.R62): the sign-in error, or that you have no access. While
   there is an error no other page opens (AUTH.S2: the gate sends every route
   here). "Return to home" clears the session from this browser (its keys,
   the sweep, sessionStorage's tokens and the auth cookies), leaves
   manual_redirect so the next page load finishes signing out of Microsoft
   (AUTH.R63), and reloads at /. */
import { AlertCircle } from 'lucide-react';
import { markManualRedirect, returnHomeCleanup } from '@/api/bc/cleanup';
import { hardNavigation } from '@/lib/hard-navigation';
import { tid } from '@/testids';
import { Button } from '@/ui';
import { usePortal } from '@/shell/SessionProvider';
import { AuthCard } from './AuthCard';

export function AuthErrorPage() {
  const { error } = usePortal();
  const onReturnHome = () => {
    returnHomeCleanup();
    markManualRedirect();
    hardNavigation.go('/');
  };
  return (
    <AuthCard testId={tid.auth.error} tone="err" icon={<AlertCircle />} title="Authentication error">
      <p data-testid={tid.auth.errorMessage} role="alert" className="mb-lg max-w-[44ch] break-words text-text-secondary">
        {error || 'You do not have access to this application.'}</p>
      <Button testId={tid.auth.errorHome} kind="primary" className="w-full" onClick={onReturnHome}>Return to home</Button>
    </AuthCard>);
}
