/* QniConnect's two sign-in buttons, the landing page's and the sign-in
   page's (LAND.R4 to R7, LOGIN.R6): the session's signIn, which tries
   Microsoft's popup first on a window wider than 768 px and falls back to the
   redirect (Ruling A2, src/auth/msal.ts). While it works the button is busy;
   after a popup that worked it stays busy, because the app opens in its
   place. Only a redirect that could not start is said, in the page's own
   words. */
import { useState } from 'react';
import { logger } from '@/lib/logger';
import { Button } from '@/ui';
import { useSession } from '@/shell/SessionProvider';

/* Microsoft's four squares, in the button's own ink: the colours of the
   real mark are not in the palette, and a sign-in button drawn in one ink
   reads the same in both themes. */
function MicrosoftMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
      <rect x="0" y="0" width="7.5" height="7.5" /><rect x="8.5" y="0" width="7.5" height="7.5" />
      <rect x="0" y="8.5" width="7.5" height="7.5" /><rect x="8.5" y="8.5" width="7.5" height="7.5" />
    </svg>);
}

export function MicrosoftSignIn({ label, failed, testId, errorTestId, before }: {
  label: string; failed: string; testId: string; errorTestId: string; before?: () => void;
}) {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onClick = () => {
    before?.();
    setBusy(true);
    setError(null);
    signIn().catch((e: unknown) => {
      logger.error('Sign in failed:', e);
      setError(failed);
      setBusy(false);
    });
  };
  return (
    <>
      <Button testId={testId} kind="primary" className="h-11 w-full" pending={busy} onClick={onClick}>
        {busy ? 'Signing in…' : <><MicrosoftMark />{label}</>}
      </Button>
      {error && <p data-testid={errorTestId} role="alert" className="mt-sm text-center text-xs text-err">{error}</p>}
    </>);
}
