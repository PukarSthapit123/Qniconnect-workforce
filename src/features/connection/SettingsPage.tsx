import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { tid } from '@/testids';
import { logger } from '@/lib/logger';
import { ActionBar, Banner, Button, Card, CardHead, Field, NativeSelect, Page, PageHead, SettingRow, Small, SwitchField, UnitInput } from '@/ui';
import { DEFAULT_ENVIRONMENT_OPTIONS, DEFAULT_SETTINGS, intervalError, readSettings, SETTINGS_KEY, type AdminSettings } from '@/domain/admin';

const MESSAGE_CLEAR_MS = 3000;
/* The interval is typed as text and checked on Save (SET.R3). */
type Draft = Omit<AdminSettings, 'refreshInterval'> & { refreshInterval: string };
const draftOf = (s: AdminSettings): Draft => ({ ...s, refreshInterval: String(s.refreshInterval) });
const readStored = (): AdminSettings | null => {
  try { return readSettings(localStorage.getItem(SETTINGS_KEY)); } catch (e) { logger.error('Failed to load settings:', e); return null; }
};

/* Setup › Business Central › Settings: QniConnect's admin settings
   (docs/superpowers/inventory/admin.md, SET). They are kept in this browser
   (localStorage adminSettings) and, as in QniConnect, nothing else reads them
   yet (SET.R9), which the page now says.

   Fixed on the way (Ruling Q2; listed in the Task 19 report): stored
   settings are laid over the defaults (SET.R2), Reset with nothing saved
   restores the defaults rather than blanking every field (R7), the interval
   must be 1 to 60 whole minutes (R3), and "Settings saved" clears after
   three seconds every time (R6's timer read the previous message). */
export function SettingsPage() {
  const [saved, setSaved] = useState<AdminSettings>(() => readStored() ?? DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));

  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(null);
    const invalid = draft.autoRefreshData ? intervalError(draft.refreshInterval) : null;
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    const next: AdminSettings = { ...draft, refreshInterval: draft.autoRefreshData ? Number(draft.refreshInterval) : saved.refreshInterval };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      setSaved(next); setDraft(draftOf(next));
      setMessage({ ok: true, text: 'Settings saved successfully' });
      timer.current = setTimeout(() => setMessage(null), MESSAGE_CLEAR_MS);
    } catch (e) {
      logger.error('Failed to save settings:', e);
      setMessage({ ok: false, text: `Failed to save settings: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  const reset = () => { if (timer.current) clearTimeout(timer.current); setDraft(draftOf(saved)); setMessage(null); setError(null); };

  return (
    <Page testId={tid.page('asettings')}>
      <PageHead title="Settings" tip="Configure the admin portal settings and preferences." tipTestId={tid.head.tip('asettings')} />
      {message && (
        <Banner testId={tid.asettings.message} tone={message.ok ? 'ok' : 'err'} icon={message.ok ? <CheckCircle2 /> : <TriangleAlert />}
          title={<span role={message.ok ? 'status' : 'alert'}>{message.text}</span>} />)}
      <Card>
        <CardHead title="General settings" />
        <Field label="Default environment" hint="The default environment to select when users log in">
          <NativeSelect testId={tid.asettings.defaultEnvironment} value={draft.defaultEnvironment} onChange={e => set('defaultEnvironment', e.target.value)} className="max-w-[320px]">
            <option value="">Select a default environment</option>
            {DEFAULT_ENVIRONMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </NativeSelect>
        </Field>
        <SettingRow title="Enable admin notifications" desc="Receive notifications about user activities and system events">
          <SwitchField testId={tid.asettings.notifications} aria-label="Enable admin notifications" checked={draft.enableNotifications} onCheckedChange={v => set('enableNotifications', v)} />
        </SettingRow>
        <SettingRow title="Auto-refresh dashboard data" desc="Automatically refresh dashboard data at the specified interval">
          <SwitchField testId={tid.asettings.autoRefresh} aria-label="Auto-refresh dashboard data" checked={draft.autoRefreshData} onCheckedChange={v => set('autoRefreshData', v)} />
        </SettingRow>
        {/* SET.R8: only while auto-refresh is on */}
        {draft.autoRefreshData && (
          <SettingRow title="Refresh interval"
            desc={<span id="asettings-interval-desc" role={error ? 'alert' : undefined} className={error ? 'text-err' : undefined}>{error ?? 'How often, in minutes, from 1 to 60'}</span>}>
            <UnitInput testId={tid.asettings.interval} unit="min" inputMode="numeric" aria-label="Refresh interval in minutes" aria-describedby="asettings-interval-desc" aria-invalid={error ? 'true' : undefined}
              value={draft.refreshInterval} onChange={e => set('refreshInterval', e.target.value)} />
          </SettingRow>)}
        {/* SET.R8: development builds only */}
        {import.meta.env.DEV && (
          <SettingRow title="Enable debug mode" desc="Show additional debugging information (development only)">
            <SwitchField testId={tid.asettings.debug} aria-label="Enable debug mode" checked={draft.debugMode} onCheckedChange={v => set('debugMode', v)} />
          </SettingRow>)}
        <Small testId={tid.asettings.note} className="mt-[10px]">These settings are kept in this browser only, and nothing in the portal uses them yet.</Small>
      </Card>
      <ActionBar>
        <Button testId={tid.asettings.reset} kind="ghost" onClick={reset}>Reset</Button>
        <Button testId={tid.asettings.save} kind="primary" pending={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</Button>
      </ActionBar>
    </Page>);
}
