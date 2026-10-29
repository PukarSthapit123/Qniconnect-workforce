/* VITE_FAKE_MODULES (spec N9 and R4, Ruling F1): which /api/v1 modules the
   fake server answers while it runs. Unset or empty, all of them, as before.
   Otherwise a comma-separated list of modules, by name or short code (core;
   timesheet or ts; onboarding or on), or none: the fake answers only those,
   and a module left off passes through to the real backend (same origin,
   /api/v1). Read when called, so a test can switch it.
   Like VITE_FAKE_BC, it means nothing without the fake server: every use is
   behind FAKE_SERVER_ON, so a plain production build drops it
   (npm run build:check). */
import { FAKE_SERVER_ON } from '@/lib/fake-server';
import { MODULES, moduleOf, type Module } from '@/contract/modules';

const ALIASES: Record<string, Module> = { core: 'core', timesheet: 'timesheet', ts: 'timesheet', onboarding: 'onboarding', on: 'onboarding' };

export function fakeModules(): Set<Module> {
  const raw = (import.meta.env.VITE_FAKE_MODULES ?? '').trim();
  if (!raw) return new Set(MODULES);
  const names = raw.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
  if (names.length === 1 && names[0] === 'none') return new Set();
  const chosen = new Set<Module>();
  for (const n of names) {
    const m = ALIASES[n];
    if (!m) throw new Error(`VITE_FAKE_MODULES names "${n}", which is not a module. Use core, timesheet (ts) or onboarding (on), separated by commas, or none.`);
    chosen.add(m);
  }
  return new Set(MODULES.filter(m => chosen.has(m)));
}

/* True when the fake server answers this /api/v1 path. */
export const fakeModuleOn = (path: string): boolean => FAKE_SERVER_ON && fakeModules().has(moduleOf(path));
