/* QniConnect's first-login welcome (FirstLoginHandler.js; inventory AUTH.R65
   to AUTH.R69, states S16 and S17). The shell mounts it, so it only ever
   shows once an environment is chosen (AUTH.R66), over the app, with no way
   to close it but Continue. Continue sets the portal user Active (AUTH.C6);
   only a success clears it and goes to the first page. A failure says so and
   stays, and the backend status is unchanged, so it returns next sign-in.
   QniConnect's development-only "Force Proceed" is not kept: the fake /bc
   completes the step the real way (AUTH.R69). */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { activatePortalUser } from '@/api/bc/account-setup';
import { logger } from '@/lib/logger';
import { tid } from '@/testids';
import { Button, Modal } from '@/ui';
import { usePortal, useSession } from '@/shell/SessionProvider';

const FAILED = 'There was an error updating your account status. Please try again or contact support.';

export function FirstLoginOverlay() {
  const { pendingFirstLogin, user } = usePortal();
  const { completeFirstLogin } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pendingFirstLogin) return null;

  const onContinue = async () => {
    setBusy(true);
    setError(null);
    try {
      if (user?.id) await activatePortalUser(user.id);
      else logger.warn('No user ID available, cannot update status');
      completeFirstLogin();
      void navigate('/');
    } catch (e) {
      logger.error('Error updating first login status:', e);
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open dismissible={false} onOpenChange={() => undefined} testId={tid.accountSetup.firstLogin} title="Welcome!"
      footer={<Button testId={tid.accountSetup.firstLoginContinue} kind="primary" pending={busy} onClick={() => void onContinue()}>
        {busy ? 'Processing…' : 'Continue to portal'}</Button>}>
      <p className="mb-md text-text-primary">This is your first login to the QniConnect Employee Portal. We need to set up a few things before you can access your information.</p>
      <p className="text-sm text-text-secondary">By continuing, you agree to our terms of use and privacy policy.</p>
      {error && <p data-testid={tid.accountSetup.firstLoginError} role="alert" className="mt-md rounded-control border border-err bg-err-surface px-md py-sm text-sm text-err">{error}</p>}
    </Modal>);
}
