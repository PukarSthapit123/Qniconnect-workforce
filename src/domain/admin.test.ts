/* The admin pages' rules as pure functions (docs/superpowers/inventory/admin.md). */
import {
  AUTHZ_MESSAGES, authTone, daysRemaining, DAY_MS, DEFAULT_SETTINGS, EMPTY_ENVIRONMENT_FORM, environmentFormError, expiryAlert, expiryAlertText, expiryPill,
  formatDateTime, formatDay, intervalError, missingTokens, popupOutcome, popupUrl, readSettings, statusBadge, toAdminEnvironment, urlOutcome, userCounts,
} from './admin';

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const inDays = (d: number) => new Date(NOW + d * DAY_MS).toISOString();

describe('ADM.DASH', () => {
  test('ADM.DASH.R4: users are counted by their exact status; any other status counts only in the total', () => {
    expect(userCounts([{ status: 'Active' }, { status: 'Active' }, { status: 'PendingFirstLogin' }, { status: 'Inactive' }, { status: 'active' }, { status: null }, {}]))
      .toEqual({ total: 7, active: 2, pending: 1, inactive: 1 });
    expect(userCounts([])).toEqual({ total: 0, active: 0, pending: 0, inactive: 0 });
  });
  test('ADM.DASH.R5: the authorization is bad when inactive or expired (any case) or out of days, a warning at 14 days or fewer', () => {
    expect(authTone('Active', 30)).toBe('good');
    expect(authTone('Active', 15)).toBe('good');
    expect(authTone('Active', 14)).toBe('warn');
    expect(authTone('Active', 1)).toBe('warn');
    expect(authTone('Active', 0)).toBe('bad');
    expect(authTone('Active', -3)).toBe('bad');
    expect(authTone('Inactive', 60)).toBe('bad');
    expect(authTone('expired', 60)).toBe('bad');
    /* no expiry counts as no days left, as QniConnect counted it */
    expect(authTone('active', null)).toBe('bad');
    expect(authTone(null, 60)).toBe('good');
  });
  test('ADM.DASH.R6: the expiry warning shows at 14 days or fewer (an error at 7 or fewer) and with no expiry; it says what to do', () => {
    expect(expiryAlert(15)).toBeNull();
    expect(expiryAlert(14)).toBe('warn');
    expect(expiryAlert(8)).toBe('warn');
    expect(expiryAlert(7)).toBe('err');
    expect(expiryAlert(0)).toBe('err');
    expect(expiryAlert(null)).toBe('err');
    expect(expiryAlertText(9)).toBe('The Business Central authorization expires in 9 days. Refresh it so the portal keeps uninterrupted access to Business Central.');
    expect(expiryAlertText(1)).toMatch(/expires in 1 day\./);
    expect(expiryAlertText(0)).toMatch(/^The Business Central authorization has expired, or its expiry date is not known\. Refresh it/);
    expect(expiryAlertText(null)).toBe(expiryAlertText(0));
  });
  test('ADM.DASH.R9: a day is "14 Mar 2025"; nothing, or nothing readable, is Unknown (never "Invalid Date")', () => {
    expect(formatDay('2025-03-14')).toBe('14 Mar 2025');
    expect(formatDay(null)).toBe('Unknown');
    expect(formatDay('')).toBe('Unknown');
    expect(formatDay('not a date')).toBe('Unknown');
  });
  test('ADM.DASH.R10: days remaining are rounded up on both pages; no expiry is null', () => {
    expect(daysRemaining(inDays(2.5), NOW)).toBe(3);
    expect(daysRemaining(inDays(3), NOW)).toBe(3);
    expect(daysRemaining(inDays(0.1), NOW)).toBe(1);
    expect(daysRemaining(inDays(-0.5), NOW)).toBe(-0);
    expect(daysRemaining(inDays(-2), NOW)).toBe(-2);
    expect(daysRemaining(undefined, NOW)).toBeNull();
    expect(daysRemaining('soon', NOW)).toBeNull();
  });
});

describe('ENV', () => {
  test('ENV.R14 and ADM.C2: the admin mapper, with its fallbacks; isDefault from the backend is ignored', () => {
    expect(toAdminEnvironment({ id: 'e1', name: 'Production', type: 'Sandbox', url: 'https://x', status: 'Inactive', companyName: 'C', company_Id: 'g' }))
      .toEqual({ id: 'e1', name: 'Production', type: 'Sandbox', url: 'https://x', status: 'Inactive', companyName: 'C', companyId: 'g', version: '', lastSync: '' });
    const fallback = toAdminEnvironment({ environmentId: 'e2', environmentName: 'Dev', company_name: 'Lower' } as never);
    expect(fallback).toEqual({ id: 'e2', name: 'Dev', type: 'Production', url: '', status: 'Active', companyName: 'Lower', companyId: '', version: '', lastSync: '' });
    expect(toAdminEnvironment({ environmentType: 'Test', environmentUrl: 'https://t', companyId: 'c2' })).toMatchObject({ type: 'Test', url: 'https://t', companyId: 'c2' });
    /* the version and last sync are shown when the backend sends them */
    const extra = toAdminEnvironment({ id: 'e3', version: '23.0.1', lastSync: '2026-10-01T08:00:00Z', isDefault: true } as never);
    expect(extra).toMatchObject({ version: '23.0.1', lastSync: '2026-10-01T08:00:00Z' });
    expect(extra).not.toHaveProperty('isDefault');
  });
  test('ENV.R2: name, URL and company name are needed, as typed (whitespace passes); the company id is optional', () => {
    const msg = 'Name, URL and company name are required. Fill them in to add the environment.';
    expect(environmentFormError(EMPTY_ENVIRONMENT_FORM)).toBe(msg);
    expect(environmentFormError({ ...EMPTY_ENVIRONMENT_FORM, name: 'P', url: 'u' })).toBe(msg);
    expect(environmentFormError({ ...EMPTY_ENVIRONMENT_FORM, name: 'P', companyName: 'C' })).toBe(msg);
    expect(environmentFormError({ ...EMPTY_ENVIRONMENT_FORM, name: ' ', url: ' ', companyName: ' ' })).toBeNull();
    expect(environmentFormError({ ...EMPTY_ENVIRONMENT_FORM, name: 'P', url: 'not a url', companyName: 'C' })).toBeNull();
    expect(EMPTY_ENVIRONMENT_FORM.type).toBe('Production');
  });
  test('ENV.R12 and AUTHZ.R19: a date and time is "01 Oct 2026, 09:30"; nothing is the page\'s own word', () => {
    expect(formatDateTime('2026-10-01T09:30:00', 'Never')).toBe('01 Oct 2026, 09:30');
    expect(formatDateTime(null, 'Never')).toBe('Never');
    expect(formatDateTime('', 'Unknown')).toBe('Unknown');
    expect(formatDateTime('garbage', 'Unknown')).toBe('Unknown');
  });
});

describe('AUTHZ', () => {
  test('AUTHZ.R1: the callback\'s redirect: success with tokens stored, stored only in memory, not received, an error, or nothing to say', () => {
    expect(urlOutcome('?status=success&tokenReceived=true&tokenStoredInBC=true&registrationId=R1')).toEqual({ handled: true, registrationId: 'R1', success: true, message: AUTHZ_MESSAGES.urlOk });
    expect(urlOutcome('?status=success&tokenReceived=true&tokenStoredInBC=false').message).toEqual(AUTHZ_MESSAGES.urlWarn);
    expect(urlOutcome('?status=success&tokenReceived=false').message).toEqual(AUTHZ_MESSAGES.urlFail);
    expect(urlOutcome('?status=error&message=Consent%20was%20declined').message).toEqual({ kind: 'error', text: 'Consent was declined' });
    expect(urlOutcome('?status=error').message).toEqual({ kind: 'error', text: 'Authorization failed. Please try again.' });
    /* received but tokenStoredInBC missing: handled, nothing said */
    expect(urlOutcome('?status=success&tokenReceived=true')).toEqual({ handled: true, registrationId: null, success: true, message: null });
    expect(urlOutcome('?registrationId=R2')).toEqual({ handled: true, registrationId: 'R2', success: false, message: null });
    /* none of status, tokenReceived and registrationId: not the callback's */
    expect(urlOutcome('?message=hi&timestamp=1')).toEqual({ handled: false, registrationId: null, success: false, message: null });
    expect(AUTHZ_MESSAGES.urlOk.text).toBe('Authorization completed and tokens stored successfully in Business Central!');
  });
  test('AUTHZ.R2: after a success, a status without an access token says the tokens may not be stored', () => {
    expect(missingTokens({ diagnostics: { hasAccessToken: false } }, true)).toBe(true);
    expect(missingTokens({}, true)).toBe(true);
    expect(missingTokens({ diagnostics: { hasAccessToken: true } }, true)).toBe(false);
    expect(missingTokens({}, false)).toBe(false);
    expect(missingTokens(null, true)).toBe(false);
    expect(AUTHZ_MESSAGES.noTokens.text).toBe('Authorization completed but tokens may not have been stored correctly. Please try again.');
  });
  test('AUTHZ.R7, AUTHZ.R8 and AUTHZ.R11: the popup address needs a PKCE challenge, gains prompt=consent once, and a missing or relative one is "no address"', () => {
    expect(popupUrl('https://login/authorize?code_challenge=x')).toEqual({ url: 'https://login/authorize?code_challenge=x&prompt=consent' });
    expect(popupUrl('https://login/authorize?code_challenge=x&prompt=consent')).toEqual({ url: 'https://login/authorize?code_challenge=x&prompt=consent' });
    expect(popupUrl('https://login/authorize?scope=a')).toEqual({ error: AUTHZ_MESSAGES.pkce });
    expect(AUTHZ_MESSAGES.pkce.text).toBe('PKCE setup failed. Authorization URL is missing required parameters.');
    expect(popupUrl(undefined)).toEqual({ error: AUTHZ_MESSAGES.noUrl });
    expect(popupUrl('')).toEqual({ error: AUTHZ_MESSAGES.noUrl });
    expect(popupUrl('/authorize?code_challenge=x')).toEqual({ error: AUTHZ_MESSAGES.noUrl });
    expect(AUTHZ_MESSAGES.noUrl.text).toBe('Failed to get authorization URL from the server.');
    /* "no ?" gives "?prompt=consent": only reachable for an address with a challenge in its fragment */
    expect(popupUrl('https://login/authorize#code_challenge=x')).toEqual({ url: 'https://login/authorize#code_challenge=x?prompt=consent' });
  });
  test('AUTHZ.R9: the days-remaining pill: ceiling, Expired at 0 or below, one day, red at 7, yellow at 30, Unknown without a date', () => {
    expect(expiryPill(inDays(60), NOW)).toEqual({ tone: 'ok', label: '60 days remaining' });
    expect(expiryPill(inDays(30), NOW)).toEqual({ tone: 'warn', label: '30 days remaining' });
    expect(expiryPill(inDays(7.2), NOW)).toEqual({ tone: 'warn', label: '8 days remaining' });
    expect(expiryPill(inDays(7), NOW)).toEqual({ tone: 'err', label: '7 days remaining' });
    expect(expiryPill(inDays(0.4), NOW)).toEqual({ tone: 'err', label: '1 day remaining' });
    expect(expiryPill(inDays(-1), NOW)).toEqual({ tone: 'err', label: 'Expired' });
    expect(expiryPill(null, NOW)).toEqual({ tone: 'ok', label: 'Unknown' });
  });
  test('AUTHZ.R14: after the popup: stored, in memory only, not stored, or unclear', () => {
    const d = (hasAccessToken: unknown, tokenStoredInBC: unknown) => ({ hasAccessToken, tokenStoredInBC });
    expect(popupOutcome({ isAuthorized: true, diagnostics: d(true, true) })).toEqual(AUTHZ_MESSAGES.urlOk);
    expect(popupOutcome({ isAuthorized: true, diagnostics: d(true, false) })).toEqual(AUTHZ_MESSAGES.urlWarn);
    /* tokenStoredInBC must be exactly true */
    expect(popupOutcome({ isAuthorized: true, diagnostics: d(true, 'true') })).toEqual(AUTHZ_MESSAGES.urlWarn);
    expect(popupOutcome({ isAuthorized: true, diagnostics: d(false, true) })).toEqual(AUTHZ_MESSAGES.popupNoStore);
    expect(popupOutcome({ isAuthorized: false, diagnostics: d(false, false) })).toEqual(AUTHZ_MESSAGES.popupNoStore);
    /* isAuthorized must be exactly true */
    expect(popupOutcome({ isAuthorized: 'true', diagnostics: d(true, true) })).toEqual(AUTHZ_MESSAGES.popupUnclear);
    expect(popupOutcome({ isAuthorized: true })).toEqual(AUTHZ_MESSAGES.popupUnclear);
    expect(AUTHZ_MESSAGES.popupNoStore.text).toBe('Authorization started but token storage failed. Please check server logs and try again.');
    expect(AUTHZ_MESSAGES.popupUnclear.text).toBe('Authorization status is unclear. Please check logs for errors and refresh the page.');
  });
  test('AUTHZ.C1 status: active, expired and warning by name in any case; another word as it is; none, no pill', () => {
    expect(statusBadge('active')).toEqual({ tone: 'ok', label: 'Active' });
    expect(statusBadge('EXPIRED')).toEqual({ tone: 'err', label: 'Expired' });
    expect(statusBadge('Warning')).toEqual({ tone: 'warn', label: 'Warning' });
    expect(statusBadge('Pending')).toEqual({ tone: 'neu', label: 'Pending' });
    expect(statusBadge('')).toBeNull();
    expect(statusBadge(null)).toBeNull();
  });
});

describe('SET', () => {
  test('SET.R1: the defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({ defaultEnvironment: '', enableNotifications: true, autoRefreshData: true, refreshInterval: 15, debugMode: false });
  });
  test('SET.R2: stored settings are laid over the defaults; a key missing or of the wrong type is its default; unreadable is none', () => {
    expect(readSettings(JSON.stringify({ defaultEnvironment: 'Sandbox', enableNotifications: false, autoRefreshData: false, refreshInterval: 30, debugMode: true })))
      .toEqual({ defaultEnvironment: 'Sandbox', enableNotifications: false, autoRefreshData: false, refreshInterval: 30, debugMode: true });
    expect(readSettings(JSON.stringify({ defaultEnvironment: 'Production' }))).toEqual({ ...DEFAULT_SETTINGS, defaultEnvironment: 'Production' });
    /* QniConnect stored an empty interval as null */
    expect(readSettings(JSON.stringify({ refreshInterval: null, enableNotifications: 'yes' }))).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(JSON.stringify({ refreshInterval: 90 }))).toEqual(DEFAULT_SETTINGS);
    expect(readSettings('{not json')).toBeNull();
    expect(readSettings('[1]')).toBeNull();
    expect(readSettings(null)).toBeNull();
  });
  test('SET.R3: the interval is a whole number of minutes from 1 to 60', () => {
    for (const ok of ['1', '15', '60', ' 30 ']) expect(intervalError(ok), ok).toBeNull();
    for (const bad of ['', '0', '61', '1.5', 'ten', '-5']) expect(intervalError(bad), bad).toBe('Enter a whole number of minutes from 1 to 60.');
  });
});
