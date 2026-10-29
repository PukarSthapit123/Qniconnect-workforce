/* QniConnect's authorization callback at /auth/callback (AuthCallbackPage.js;
   inventory AUTH.R64, states S18 to S20). The backend sends the admin's
   Business Central authorization back here, often into a popup the
   Authorization page opened. It needs no sign-in and makes no call of its
   own: it reads the query, keeps the registration id, and either tells the
   opener and closes, or goes to Setup › Authorization (QniConnect's
   /admin/authorization). A code arriving here means the app registration
   sends it to the front end instead of the backend, which is reported as
   such. QniConnect's "Processing authorization response..." (S18) lasted no
   longer than reading the query, so the outcome is worked out before the
   first paint and shown at once. A timer does nothing if the page has gone
   first. */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { bcContext } from '@/api/bc/context';
import { logger } from '@/lib/logger';
import { tid } from '@/testids';
import { Button } from '@/ui';
import { AuthCard } from './AuthCard';

export const AUTHORIZATION_PATH = '/setup/aauth';
const CONFIG_ERROR = 'Authentication flow configuration error';
const CONFIG_DETAIL = 'The authorization code was sent to the frontend instead of the backend';

type Outcome = { kind: 'success' | 'error'; message: string };
/* What the query says, worked out once and without side effects: the
   outcome on screen, what to tell the opener, and when to move on. */
interface Plan { outcome: Outcome; tell?: Record<string, unknown>; afterMs?: number; navState?: Record<string, string> }

function planFor(search: string): Plan {
  try {
    const q = new URLSearchParams(search);
    const code = q.get('code'), error = q.get('error');
    if (q.get('status') === 'success') {
      return {
        outcome: { kind: 'success', message: 'Authorization successful! Redirecting...' }, afterMs: 2000,
        tell: { type: 'AUTH_SUCCESS', registrationId: q.get('registrationId'), tokenReceived: q.get('tokenReceived') === 'true', tokenStoredInBC: q.get('tokenStoredInBC') === 'true' },
      };
    }
    if (error) return { outcome: { kind: 'error', message: `Authorization failed: ${q.get('error_description') || error}` } };
    if (!code) return { outcome: { kind: 'error', message: 'No authorization code was provided in the callback.' } };
    return {
      outcome: { kind: 'error', message: 'Authentication flow configuration error. The authorization code was sent to the frontend instead of the backend. Please check your Azure AD app registration.' },
      afterMs: 5000, tell: { type: 'AUTH_ERROR', error: CONFIG_ERROR, message: CONFIG_DETAIL }, navState: { error: CONFIG_ERROR, message: CONFIG_DETAIL },
    };
  } catch (e) {
    logger.error('Error processing authorization:', e);
    return { outcome: { kind: 'error', message: `Error processing authorization: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

/* The registration id: the stored one, else the state's (kept), else
   registration_id (kept). */
function keepRegistrationId(search: string) {
  const q = new URLSearchParams(search);
  let registrationId = bcContext.registrationId();
  const state = q.get('state');
  if (state) {
    try {
      const parsed = JSON.parse(state) as unknown;
      const fromState = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).registrationId : undefined;
      if (typeof fromState === 'string' && fromState) { registrationId = fromState; bcContext.setRegistrationId(fromState); }
    } catch { /* not JSON: no registration id in it */ }
  }
  const fromQuery = q.get('registration_id');
  if (!registrationId && fromQuery) bcContext.setRegistrationId(fromQuery);
}

export function AuthCallbackPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [plan] = useState(() => planFor(search));
  const { outcome } = plan;
  /* once per visit, StrictMode's second effect run included; the timer acts
     only while the page is still mounted */
  const started = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    keepRegistrationId(search);
    if (plan.afterMs === undefined) return;
    const opener = window.opener as Window | null;
    if (opener && plan.tell) opener.postMessage({ ...plan.tell, timestamp: Date.now() }, '*');
    setTimeout(() => {
      if (!mounted.current) return;
      if (opener) window.close();
      else void navigate(AUTHORIZATION_PATH, { replace: true, ...(plan.navState ? { state: plan.navState } : {}) });
    }, plan.afterMs);
  }, [search, navigate, plan]);

  const ok = outcome.kind === 'success';
  return (
    <AuthCard testId={tid.page('auth-callback')} tone={ok ? 'ok' : 'err'} icon={ok ? <CheckCircle2 /> : <AlertTriangle />}
      title={ok ? 'Authorization successful' : 'Authorization failed'} titleTestId={tid.auth.callbackTitle}>
      <p data-testid={tid.auth.callbackMessage} role={ok ? 'status' : 'alert'} className="max-w-[44ch] break-words text-text-secondary">{outcome.message}</p>
      {!ok && (
        <Button testId={tid.auth.callbackReturn} kind="primary" className="mt-lg" onClick={() => { void navigate(AUTHORIZATION_PATH); }}>
          Return to the authorization page</Button>)}
    </AuthCard>);
}
