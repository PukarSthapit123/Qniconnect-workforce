/* The admin pages' rules (docs/superpowers/inventory/admin.md), as pure
   functions: the overview's counts and warnings (ADM.DASH), the environment
   list's shape (ENV), what the authorization page says and when (AUTHZ), and
   the settings it keeps in this browser (SET). The screens are in
   src/features/connection.

   Fixed on the way (Ruling Q2; listed in the Task 19 report):
   - days remaining are counted one way on both pages (ceiling), so the
     overview and Authorization no longer disagree by a day (ADM.DASH.R10);
   - an expired or inactive status is recognised whatever its case
     (ADM.DASH.R5 compared exact text, while AUTHZ lower-cased it);
   - a date that cannot be read is "Unknown", never "Invalid Date" (R9);
   - stored settings are laid over the defaults, so a missing key is the
     default rather than blank (SET.R2), and Reset with nothing saved goes
     back to the defaults (SET.R7). */
import type { AuthStatus } from '@/contract/bc/admin';
import type { BcPortalUser } from '@/contract/bc/portal-users';
import type { BcEnvironmentItem } from '@/contract/bc/environments';

export const DAY_MS = 86_400_000;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/* ---------- dates ---------- */

const valid = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
/* ADM.DASH.R9: "14 Mar 2025"; nothing (or nothing readable) is Unknown. */
export function formatDay(iso: string | null | undefined): string {
  const d = valid(iso);
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';
}
/* ENV.R12 and AUTHZ.R19: "14 Mar 2025, 09:30"; `none` when there is no date
   (ENV: "Never", AUTHZ: "Unknown"). */
export function formatDateTime(iso: string | null | undefined, none: string): string {
  const d = valid(iso);
  return d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : none;
}
/* Whole days until the authorization expires, rounded up (AUTHZ.R9; the
   overview's floor is gone, ADM.DASH.R10); null without an expiry. */
export function daysRemaining(expiresAt: string | null | undefined, now = Date.now()): number | null {
  const d = valid(expiresAt);
  return d ? Math.ceil((d.getTime() - now) / DAY_MS) : null;
}

/* ---------- the overview (ADM.DASH) ---------- */

export interface UserCounts { total: number; active: number; pending: number; inactive: number }
/* ADM.DASH.R4: exact statuses; anything else counts only in the total. */
export function userCounts(users: readonly Pick<BcPortalUser, 'status'>[]): UserCounts {
  const n = (s: string) => users.filter(u => u.status === s).length;
  return { total: users.length, active: n('Active'), pending: n('PendingFirstLogin'), inactive: n('Inactive') };
}
export type Tone3 = 'bad' | 'warn' | 'good';
const lapsed = (status: string) => ['inactive', 'expired'].includes(status.toLowerCase());
/* ADM.DASH.R5: no expiry counts as no days left, as QniConnect counted it. */
export function authTone(status: string | null | undefined, days: number | null): Tone3 {
  const d = days ?? 0;
  if (lapsed(str(status)) || d <= 0) return 'bad';
  return d <= 14 ? 'warn' : 'good';
}
/* ADM.DASH.R6: the warning shows at 14 days or fewer (and with no expiry);
   at 7 or fewer it is an error. */
export function expiryAlert(days: number | null): 'err' | 'warn' | null {
  const d = days ?? 0;
  if (d > 14) return null;
  return d <= 7 ? 'err' : 'warn';
}
export function expiryAlertText(days: number | null): string {
  const d = days ?? 0;
  if (d <= 0) return 'The Business Central authorization has expired, or its expiry date is not known. Refresh it so the portal keeps its access to Business Central.';
  return `The Business Central authorization expires in ${d} day${d === 1 ? '' : 's'}. Refresh it so the portal keeps uninterrupted access to Business Central.`;
}

/* ---------- environments (ENV, ADM.C2) ---------- */

/* An environment as the admin pages list it: QniConnect's mapper (ADM.C2,
   ENV.R14) plus the version and last sync when the backend sends them
   (QniConnect's mapper dropped both, so they always read "Unknown version"
   and "Never"). isDefault is the page's own (ENV.R7), never the backend's. */
export interface AdminEnvironment {
  id: string; name: string; type: string; url: string; status: string; companyName: string; companyId: string;
  version: string; lastSync: string;
}
export function toAdminEnvironment(e: BcEnvironmentItem): AdminEnvironment {
  const raw = e as Record<string, unknown>;
  return {
    id: e.id || e.environmentId || '',
    name: e.name || e.environmentName || '',
    type: e.type || e.environmentType || 'Production',
    url: e.url || e.environmentUrl || '',
    status: e.status || 'Active',
    companyName: e.companyName || e.company_name || '',
    companyId: e.company_Id || e.companyId || '',
    version: str(raw.version),
    lastSync: str(raw.lastSync),
  };
}
/* ENV.R2: QniConnect's check, on the text as typed. */
export interface EnvironmentForm { name: string; type: string; url: string; companyId: string; companyName: string }
export const EMPTY_ENVIRONMENT_FORM: EnvironmentForm = { name: '', type: 'Production', url: '', companyId: '', companyName: '' };
export const ENVIRONMENT_TYPES = ['Production', 'Sandbox', 'Test', 'Development'] as const;
export const environmentFormError = (f: EnvironmentForm): string | null =>
  !f.name || !f.url || !f.companyName ? 'Name, URL and company name are required. Fill them in to add the environment.' : null;

/* ---------- authorization (AUTHZ) ---------- */

export type MessageKind = 'success' | 'warning' | 'error';
export interface AuthMessage { kind: MessageKind; text: string }
const ok = (text: string): AuthMessage => ({ kind: 'success', text });
const warn = (text: string): AuthMessage => ({ kind: 'warning', text });
const fail = (text: string): AuthMessage => ({ kind: 'error', text });

/* The inventory's exact strings (AUTHZ "Exact message strings"). */
export const AUTHZ_MESSAGES = {
  urlOk: ok('Authorization completed and tokens stored successfully in Business Central!'),
  urlWarn: warn('Authorization completed and tokens stored in memory, but failed to store in Business Central. Some features may not work correctly.'),
  urlFail: fail('Authorization started but token exchange or storage failed. Please check server logs and try again.'),
  noTokens: warn('Authorization completed but tokens may not have been stored correctly. Please try again.'),
  loadFail: fail('Failed to load authorization data. Please try again.'),
  refreshOk: ok('Token refreshed successfully!'),
  opened: ok('Authorization window opened. Please complete the login process in the new window.'),
  noUrl: fail('Failed to get authorization URL from the server.'),
  pkce: fail('PKCE setup failed. Authorization URL is missing required parameters.'),
  blocked: fail('The authorization window was blocked by your browser. Please allow popups for this site.'),
  popupDone: ok('Authorization completed successfully! Refreshing data...'),
  popupNoStore: fail('Authorization started but token storage failed. Please check server logs and try again.'),
  popupUnclear: warn('Authorization status is unclear. Please check logs for errors and refresh the page.'),
  popupRefreshFail: fail('Authorization may have failed. Unable to verify token status. Please refresh and try again.'),
} as const;
export const refreshFailed = (message?: string) => fail(message || 'Failed to refresh token. Please try again.');
export const startFailed = (message?: string) => fail(message || 'Failed to start authorization flow. Please try again.');

/* AUTHZ.R1: what the callback's redirect put in the address. */
export interface UrlOutcome { handled: boolean; registrationId: string | null; success: boolean; message: AuthMessage | null }
export function urlOutcome(search: string): UrlOutcome {
  const q = new URLSearchParams(search);
  const status = q.get('status'), received = q.get('tokenReceived'), stored = q.get('tokenStoredInBC');
  const handled = q.has('status') || q.has('tokenReceived') || q.has('registrationId');
  let message: AuthMessage | null = null;
  if (status === 'success' && received === 'true' && stored === 'true') message = AUTHZ_MESSAGES.urlOk;
  else if (status === 'success' && received === 'true' && stored === 'false') message = AUTHZ_MESSAGES.urlWarn;
  else if (status === 'success' && received === 'false') message = AUTHZ_MESSAGES.urlFail;
  else if (status === 'error') message = fail(q.get('message') || 'Authorization failed. Please try again.');
  return { handled, registrationId: handled ? q.get('registrationId') : null, success: status === 'success', message: handled ? message : null };
}
/* AUTHZ.R2: a status read after a success that has no access token says so. */
export const missingTokens = (response: AuthStatus | null, success: boolean) =>
  !!response && !response.diagnostics?.hasAccessToken && success;

/* AUTHZ.R14: after the popup, what the status read says. */
export function popupOutcome(response: AuthStatus): AuthMessage {
  const d = response.diagnostics;
  const hasAccessToken = !!d?.hasAccessToken, storedInBC = d?.tokenStoredInBC === true, authorized = response.isAuthorized === true;
  if (authorized && hasAccessToken && storedInBC) return AUTHZ_MESSAGES.urlOk;
  if (authorized && hasAccessToken) return AUTHZ_MESSAGES.urlWarn;
  if (d && !hasAccessToken) return AUTHZ_MESSAGES.popupNoStore;
  return AUTHZ_MESSAGES.popupUnclear;
}

/* AUTHZ.R6 to R8 and R11: the address the popup opens, or why there is none.
   An address that is missing, or not an absolute one, is "no address"
   (QniConnect showed the TypeError it threw on the way, R11). */
export function popupUrl(authUrl: string | null | undefined): { url: string } | { error: AuthMessage } {
  if (!authUrl) return { error: AUTHZ_MESSAGES.noUrl };
  try { new URL(authUrl); } catch { return { error: AUTHZ_MESSAGES.noUrl }; }
  if (!authUrl.includes('code_challenge=')) return { error: AUTHZ_MESSAGES.pkce };
  if (authUrl.includes('prompt=consent')) return { url: authUrl };
  return { url: `${authUrl}${authUrl.includes('?') ? '&' : '?'}prompt=consent` };
}

/* AUTHZ.C1's status pill: falsy is none; known words have their tone. */
export function statusBadge(status: string | null | undefined): { tone: 'ok' | 'err' | 'warn' | 'neu'; label: string } | null {
  if (!status) return null;
  switch (status.toLowerCase()) {
    case 'active': return { tone: 'ok', label: 'Active' };
    case 'expired': return { tone: 'err', label: 'Expired' };
    case 'warning': return { tone: 'warn', label: 'Warning' };
    default: return { tone: 'neu', label: status };
  }
}
/* AUTHZ.R9: the days-remaining pill. */
export function expiryPill(expiresAt: string | null | undefined, now = Date.now()): { tone: 'ok' | 'warn' | 'err'; label: string } {
  const days = daysRemaining(expiresAt, now);
  if (days === null) return { tone: 'ok', label: 'Unknown' };
  const tone = days <= 7 ? 'err' : days <= 30 ? 'warn' : 'ok';
  if (days <= 0) return { tone, label: 'Expired' };
  return { tone, label: days === 1 ? '1 day remaining' : `${days} days remaining` };
}

/* ---------- settings (SET) ---------- */

export interface AdminSettings {
  defaultEnvironment: string; enableNotifications: boolean; autoRefreshData: boolean; refreshInterval: number; debugMode: boolean;
}
export const SETTINGS_KEY = 'adminSettings';
/* SET.R1 */
export const DEFAULT_SETTINGS: AdminSettings = { defaultEnvironment: '', enableNotifications: true, autoRefreshData: true, refreshInterval: 15, debugMode: false };
export const DEFAULT_ENVIRONMENT_OPTIONS = ['Production', 'Sandbox', 'Development'] as const;
/* SET.R2, over the defaults: a key of the wrong type is the default too. */
export function readSettings(raw: string | null): AdminSettings | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    const pick = <K extends keyof AdminSettings>(k: K, ok: (x: unknown) => boolean): AdminSettings[K] =>
      (ok(o[k]) ? o[k] : DEFAULT_SETTINGS[k]) as AdminSettings[K];
    return {
      defaultEnvironment: pick('defaultEnvironment', x => typeof x === 'string'),
      enableNotifications: pick('enableNotifications', x => typeof x === 'boolean'),
      autoRefreshData: pick('autoRefreshData', x => typeof x === 'boolean'),
      refreshInterval: pick('refreshInterval', x => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 60),
      debugMode: pick('debugMode', x => typeof x === 'boolean'),
    };
  } catch { return null; }
}
/* SET.R3: the interval is a whole number of minutes, 1 to 60. */
export const intervalError = (text: string): string | null =>
  /^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 60 ? null : 'Enter a whole number of minutes from 1 to 60.';
