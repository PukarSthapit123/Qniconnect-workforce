import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Copy, ExternalLink, Eye, EyeOff, Plus, RefreshCw, ShieldOff, TriangleAlert } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { Banner, Button, Card, CardHead, Modal, Note, Page, PageHead, Pill } from '@/ui';
import { fieldControl } from '@/ui/shadcn/input';
import { bcContext } from '@/api/bc/context';
import { isInteractionRequired } from '@/api/bc/account-setup';
import { fetchAuthStatus, fetchAuthUrl, refreshAuthorization } from '@/api/bc/admin';
import type { AuthStatus } from '@/contract/bc/admin';
import {
  AUTHZ_MESSAGES, expiryPill, formatDateTime, missingTokens, popupOutcome, popupUrl, refreshFailed, startFailed, statusBadge, urlOutcome,
  type AuthMessage,
} from '@/domain/admin';

const S2S_GUIDE = 'https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication';
const COPY_CLEAR_MS = 2000;
const errorText = (e: unknown) => (e instanceof Error ? e.message : '');

/* Setup › Business Central › Authorization: QniConnect's authorization page
   (docs/superpowers/inventory/admin.md, AUTHZ) on the design system.
   On opening: what the callback's redirect put in the address (AUTHZ.R1),
   which is then taken out of it, and the authorization's status (R2, R3).
   Refresh token replaces what is shown with the answer (R4, R5). A new
   authorization opens Microsoft's sign-in in a popup (R6 to R11); the
   popup's /auth/callback tells this page when it is done (R12), and the
   status read then says how it went (R14).

   Fixed on the way (Ruling Q2; listed in the Task 19 report):
   - the popup's message is taken only from this app's own origin (the
     callback page), and one listener at a time, removed when the page closes
     (QniConnect listened to any origin and stacked a listener per attempt);
   - a sign-in address that is missing or not absolute says "Failed to get
     authorization URL from the server." rather than a raw TypeError (R11);
   - starting a new authorization keeps the page on screen, with the button
     working, rather than swapping it for a spinner (R6's loading state);
   - a failed copy says so (R15's "Failed to copy!" was never shown);
   - the how-to says a sign-in window opens, as it does, not "redirected";
     its dead "QniConnect Authentication Guide" link is gone (Ruling Q13). */
export function AuthorizationPage() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [authData, setAuthData] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  /* AUTHZ.R1: what the address says, read once, before the first paint */
  const [out] = useState(() => urlOutcome(search));
  const [message, setMessage] = useState<AuthMessage | null>(out.message);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const mounted = useRef(true);
  const listener = useRef<((e: MessageEvent) => void) | null>(null);
  const stopListening = () => { if (listener.current) window.removeEventListener('message', listener.current); listener.current = null; };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (listener.current) window.removeEventListener('message', listener.current);
      listener.current = null;
    };
  }, []);
  /* Once per visit, StrictMode's second effect run included; taking the
     query out of the address does not start it again. */
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (out.handled) {
      if (out.registrationId) bcContext.setRegistrationId(out.registrationId);
      void navigate(pathname, { replace: true });
    }
    fetchAuthStatus()
      .then(r => {
        if (!mounted.current) return;
        setAuthData(r);
        if (missingTokens(r, out.success)) setMessage(AUTHZ_MESSAGES.noTokens);
      })
      .catch((e: unknown) => {
        if (isInteractionRequired(e) || !mounted.current) return;
        logger.error('Error fetching authorization data:', e);
        setMessage(AUTHZ_MESSAGES.loadFail);
      })
      .finally(() => { if (mounted.current) setLoading(false); });
  }, [out, pathname, navigate]);

  const refresh = async () => {
    setRefreshing(true); setMessage(null);
    try {
      const r = await refreshAuthorization();
      if (!mounted.current) return;
      setAuthData(r); setMessage(AUTHZ_MESSAGES.refreshOk);
    } catch (e) {
      if (isInteractionRequired(e) || !mounted.current) return;
      logger.error('Error refreshing token:', e);
      setMessage(refreshFailed(errorText(e)));
    } finally { if (mounted.current) setRefreshing(false); }
  };

  /* AUTHZ.R12 and R14: the callback page says AUTH_SUCCESS; then the status
     is read again to see how it went. */
  const listen = () => {
    stopListening();
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; registrationId?: unknown } | null;
      if (data?.type !== 'AUTH_SUCCESS') { logger.log('Ignoring message:', data); return; }
      if (typeof data.registrationId === 'string' && data.registrationId) bcContext.setRegistrationId(data.registrationId);
      stopListening();
      setMessage(AUTHZ_MESSAGES.popupDone);
      fetchAuthStatus()
        .then(r => {
          if (!mounted.current) return;
          setAuthData(r);
          if (!r) throw new Error('No authorization status came back.');
          setMessage(popupOutcome(r));
        })
        .catch((e: unknown) => {
          if (isInteractionRequired(e) || !mounted.current) return;
          logger.error('Error refreshing auth data after popup:', e);
          setMessage(AUTHZ_MESSAGES.popupRefreshFail);
        });
    };
    listener.current = onMessage;
    window.addEventListener('message', onMessage);
  };

  /* AUTHZ.R6 to R13. A refusal keeps the dialog open (R13). */
  const start = async () => {
    if (starting) return;
    setStarting(true); setMessage(null);
    try {
      const r = await fetchAuthUrl();
      const target = popupUrl(r.authUrl);
      if ('error' in target) { setMessage(target.error); return; }
      const popup = window.open(target.url, '_blank', 'width=800,height=600');
      if (!popup) { setMessage(AUTHZ_MESSAGES.blocked); return; }
      listen();
      setModalOpen(false);
      setMessage(AUTHZ_MESSAGES.opened);
    } catch (e) {
      if (isInteractionRequired(e)) return;
      logger.error('Error starting authorization flow:', e);
      setMessage(startFailed(errorText(e)));
    } finally { if (mounted.current) setStarting(false); }
  };

  const authorized = !!authData?.isAuthorized;
  return (
    <Page testId={tid.page('aauth')}>
      <PageHead title="Authorization" tip="Manage OAuth authentication for Business Central." tipTestId={tid.head.tip('aauth')}
        actions={<>
          <Button testId={tid.aauth.refresh} pending={refreshing} onClick={() => void refresh()}>
            {!refreshing && <RefreshCw aria-hidden="true" />}{refreshing ? 'Refreshing…' : 'Refresh token'}</Button>
          <Button testId={tid.aauth.start} kind="primary" onClick={() => setModalOpen(true)}><Plus aria-hidden="true" />New authorization</Button>
        </>} />
      {message && (
        <Banner testId={tid.aauth.message} tone={message.kind === 'success' ? 'ok' : 'err'}
          icon={message.kind === 'success' ? <CheckCircle2 /> : <TriangleAlert />} title={<span role={message.kind === 'success' ? 'status' : 'alert'}>{message.text}</span>} />)}
      {loading && !authData
        ? <p data-testid={tid.aauth.loading} role="status" className="text-text-secondary">Loading the authorization&hellip;</p>
        : (
          <Card testId={tid.aauth.card}>
            <CardHead title={<>Authorization status<span className="block text-xs font-normal text-text-muted">Current OAuth authorization details</span></>}
              actions={authorized && (() => { const b = statusBadge(authData?.status); return b && <Pill testId={tid.aauth.status} tone={b.tone}>{b.label}</Pill>; })()} />
            {authorized && authData ? <Details auth={authData} /> : (
              <div data-testid={tid.aauth.notAuthorized} className="flex flex-col items-center px-lg py-2xl text-center">
                <span aria-hidden="true" className="mb-md grid size-12 place-items-center rounded-pill bg-surface-tint text-text-muted [&_svg]:size-6"><ShieldOff /></span>
                <h2 className="mb-xs text-base">Not authorized</h2>
                <p className="mb-lg max-w-[44ch] text-sm text-text-secondary">The application is not currently authorized to access Business Central.</p>
                <Button testId={tid.aauth.notAuthorizedStart} kind="primary" onClick={() => setModalOpen(true)}>Start authorization</Button>
              </div>)}
          </Card>)}
      <HowTo />
      <Modal open={modalOpen} onOpenChange={setModalOpen} title="New authorization"
        description="You are about to start a new authorization flow with Microsoft. This will allow the application to access Business Central on behalf of your users."
        footer={<>
          <Button testId={tid.aauth.cancel} kind="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button testId={tid.aauth.begin} kind="primary" pending={starting} onClick={() => void start()}>Start authorization</Button>
        </>}>
        <Note title="Administrator privileges required">
          You will need to log in with a Business Central admin account to authorize the application. Make sure you have the necessary permissions before proceeding.
        </Note>
        {/* a refusal while the dialog is open is said where the eye is */}
        {modalOpen && message && message.kind !== 'success' && <p role="alert" className="text-sm text-err">{message.text}</p>}
      </Modal>
    </Page>);
}

/* The authorized view (AUTHZ "Authorized" state): the definition list. */
function Details({ auth }: { auth: AuthStatus }) {
  const [show, setShow] = useState(false);
  const pill = expiryPill(auth.expiresAt);
  return (
    <dl data-testid={tid.aauth.details} className="grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-lg gap-y-sm text-sm max-md:grid-cols-1 max-md:gap-y-[2px]">
      <Row label="Client ID" id="clientId">{auth.clientId}</Row>
      <Row label="Tenant ID" id="tenantId">{auth.tenantId}</Row>
      <Row label="Environment" id="environment">{auth.environment}</Row>
      <Row label="Scope" id="scope"><span className="break-all">{auth.scope}</span></Row>
      <Row label="Issued at" id="issuedAt">{formatDateTime(auth.issuedAt, 'Unknown')}</Row>
      <Row label="Expires at" id="expiresAt">
        <span className="inline-flex flex-wrap items-center gap-sm">{formatDateTime(auth.expiresAt, 'Unknown')}
          <Pill testId={tid.aauth.expiry} tone={pill.tone}>{pill.label}</Pill></span>
      </Row>
      <Row label="Access token" id="accessToken">
        <Token testId={tid.aauth.accessToken} which="access" value={auth.accessToken ?? ''} show={show} label="Access token"
          toggle={<button type="button" data-testid={tid.aauth.show} aria-pressed={show} aria-label={show ? 'Hide tokens' : 'Show tokens'} onClick={() => setShow(s => !s)}
            className={ICON_BUTTON}>{show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>} />
      </Row>
      <Row label="Refresh token" id="refreshToken">
        <Token testId={tid.aauth.refreshToken} which="refresh" value={auth.refreshToken ?? ''} show={show} label="Refresh token" />
      </Row>
    </dl>);
}
const ICON_BUTTON = 'grid size-[34px] shrink-0 place-items-center rounded-sm text-text-secondary transition-[scale] duration-(--dur-press) ease-(--ease-out) hover:bg-surface-tint hover:text-text-primary focus-visible:shadow-focus active:scale-[0.94] max-md:size-11 [&_svg]:size-4';

function Row({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <>
    <dt className="py-[5px] text-text-secondary max-md:pt-sm max-md:pb-0">{label}</dt>
    <dd data-testid={tid.aauth.field(id)} className="min-w-0 py-[5px] font-medium max-md:pt-0">{children}</dd>
  </>;
}

/* AUTHZ.R15 to R17: masked by default; Show reveals both tokens at once;
   Copy puts the token on the clipboard and says so for two seconds. */
function Token({ testId, which, value, show, label, toggle }: { testId: string; which: 'access' | 'refresh'; value: string; show: boolean; label: string; toggle?: ReactNode }) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    let result: 'ok' | 'failed' = 'ok';
    try { await navigator.clipboard.writeText(value); } catch (e) { logger.error('Failed to copy:', e); result = 'failed'; }
    setCopied(result);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPY_CLEAR_MS);
  };
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-xs">
      <input data-testid={testId} type={show ? 'text' : 'password'} readOnly value={value} aria-label={label} spellCheck={false}
        className={cn(fieldControl, 'h-[34px] min-w-0 flex-1 font-mono text-xs max-md:min-h-touch')} />
      {toggle}
      <button type="button" data-testid={tid.aauth.copy(which)} aria-label={`Copy ${label.toLowerCase()}`} onClick={() => void copy()} className={ICON_BUTTON}><Copy aria-hidden="true" /></button>
      <span data-testid={tid.aauth.copied(which)} role="status" className={cn('min-w-[7ch] text-xs font-semibold', copied === 'failed' ? 'text-err' : 'text-ok')}>
        {copied === 'ok' ? `${label} copied` : copied === 'failed' ? 'Could not copy' : ''}</span>
    </span>);
}

/* AUTHZ's how-to card, as QniConnect wrote it, in sentence case. */
function HowTo() {
  return (
    <Card testId={tid.aauth.guide}>
      <CardHead title={<>How to authorize Business Central<span className="block text-xs font-normal text-text-muted">Guide to setting up and refreshing OAuth authorization</span></>} />
      <div className="flex max-w-[72ch] flex-col gap-sm text-sm text-text-secondary [&_h3]:mt-sm [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary">
        <h3>Authorization process overview</h3>
        <p>To connect the portal to Business Central, you need to authorize the application using the OAuth 2.0 Authorization Code flow. This allows the portal to access Business Central API on behalf of your users.</p>
        <ol className="list-decimal pl-lg">
          <li>Click the &ldquo;New authorization&rdquo; button at the top of this page.</li>
          <li>A Microsoft sign-in window opens.</li>
          <li>Sign in with your Business Central admin account.</li>
          <li>Review and accept the permissions requested by the application.</li>
          <li>After authorization, the window closes and this page shows the result.</li>
        </ol>
        <h3>Token management</h3>
        <p>The application uses two types of tokens:</p>
        <ul className="list-disc pl-lg">
          <li><b className="text-text-primary">Access token:</b> Used to make API calls to Business Central. Valid for 1 hour.</li>
          <li><b className="text-text-primary">Refresh token:</b> Used to obtain new access tokens without requiring user interaction. Valid for 90 days.</li>
        </ul>
        <p>The application automatically refreshes access tokens as needed. However, you should manually refresh the tokens if:</p>
        <ul className="list-disc pl-lg">
          <li>You changed permissions or settings in Business Central.</li>
          <li>The refresh token is about to expire (less than 7 days remaining).</li>
          <li>You encounter authorization errors in the portal.</li>
        </ul>
        <Banner tone="warn" title="Important">
          If the refresh token expires, you will need to perform a full authorization again. We recommend refreshing tokens at least once a month to prevent expiration.
        </Banner>
        <h3>Additional resources</h3>
        <a data-testid={tid.aauth.docsLink} href={S2S_GUIDE} target="_blank" rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-xs font-semibold text-brand underline dark:text-brand-accent max-md:min-h-touch">
          Microsoft documentation on Business Central API authentication<ExternalLink aria-hidden="true" className="size-[13px]" />
          <span className="sr-only">(opens in a new tab)</span></a>
      </div>
    </Card>);
}
