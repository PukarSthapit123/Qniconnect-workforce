import meta from '@/mocks/seed/meta.json';
import {
  CORE_LOCKED, FLAGS, MODULES, MOD_IMPACT, ROLE_NAME_REQUIRED, ROLE_NAME_TAKEN, ROLE_NAME_TOO_LONG, BREAKS_RANGE, VEHICLES_RANGE,
  enableNote, flagChangeText, flagOn, flagsFor, moduleBy, moduleLive, moduleSwitchText, offConfirm, parentOf,
  roleNameProblem, subName, switchFlag, switchModule, type ModuleDef, type ModuleState,
} from './modules';

const must = <T,>(v: T | undefined, what = 'value'): T => { if (v === undefined) throw new Error(`missing ${what}`); return v; };
const mod = (code: string): ModuleDef => must(moduleBy(code), code);
const ALL = { CORE: true, TS: true, A: true, B: true, C: true, ON: true };
const state = (modules: Record<string, boolean> = ALL, restore: Record<string, string[]> = {}): ModuleState => ({ modules: { ...modules }, restore });

describe('the catalogue', () => {
  test('matches the prototype\'s MODULES and FLAGS (codes, owners, capabilities, setup pages)', () => {
    expect(MODULES.map(m => [m.code, m.subs ?? [], m.liveBy ?? [], m.setup ?? '', !!m.locked, !!m.master]))
      .toEqual(meta.modules.map(m => [m.code, m.subs ?? [], m.liveBy ?? [], m.setup ?? '', !!m.locked, !!m.master]));
    expect(FLAGS.map(f => [f.code, f.mod, f.label])).toEqual(meta.flags.map(f => [f.code, f.mod, f.label]));
  });
  test('copy carries no em-dash aside', () => {
    for (const s of [...MODULES.map(m => m.description), ...FLAGS.map(f => f.description), ...Object.values(MOD_IMPACT)]) expect(s).not.toContain('—');
  });
  test('a flag sits on its own module\'s drill-in, or under the capability it belongs to', () => {
    expect(flagsFor(mod('TS')).map(f => f.code)).toEqual(expect.arrayContaining(['AUTO_OT', 'DAILY', 'WEEKLY', 'GPS', 'GEOFENCE']));
    expect(flagsFor(mod('ON')).every(f => f.mod === 'ON')).toBe(true);
    expect(parentOf('A')?.code).toBe('TS');
    expect(parentOf('CORE')?.code).toBe('CORE');
    expect([subName('C'), subName('ON'), subName('X')]).toEqual(['Sites', 'Onboarding', 'X']);
  });
});

describe('liveness', () => {
  test('CORE is always live; a plain module is live while it is on', () => {
    expect(moduleLive({}, mod('CORE'))).toBe(true);
    expect([moduleLive({ ON: true }, mod('ON')), moduleLive({ ON: false }, mod('ON'))]).toEqual([true, false]);
  });
  test('Timesheet is live only while it is on and manual entry or the clock is on; Sites alone does not count', () => {
    expect(moduleLive({ TS: true, A: true }, mod('TS'))).toBe(true);
    expect(moduleLive({ TS: true, B: true }, mod('TS'))).toBe(true);
    expect(moduleLive({ TS: true, C: true }, mod('TS'))).toBe(false);
    expect(moduleLive({ TS: false, A: true }, mod('TS'))).toBe(false);
  });
  test('a flag is live only while its module is on, and CORE flags whenever they are on', () => {
    expect(flagOn({ ON: true }, { ONB_SIGN: true }, 'ONB_SIGN')).toBe(true);
    expect(flagOn({ ON: false }, { ONB_SIGN: true }, 'ONB_SIGN')).toBe(false);
    expect(flagOn({ A: false, TS: true }, { WEEKLY: true }, 'WEEKLY')).toBe(false);
    expect(flagOn({}, { DOCS: true }, 'DOCS')).toBe(true);
    expect(flagOn(ALL, { DOCS: false }, 'DOCS')).toBe(false);
    expect(flagOn(ALL, { NOPE: true }, 'NOPE')).toBe(false);
  });
  test('the enable note says what the switch does, in sentences', () => {
    expect(enableNote(ALL, mod('CORE'))).toBe('QniConnect cannot be switched off. Everything else depends on it.');
    expect(enableNote({ TS: false }, mod('TS'))).toBe('Not licensed for this tenant. Switching it on restores the capture methods it had.');
    expect(enableNote({ TS: true, C: true }, mod('TS'))).toBe('Licensed, but no capture method is on. Timesheet is not doing anything yet.');
    expect(enableNote(ALL, mod('TS'))).toBe('Switch it off and every capture method below goes with it.');
    expect(enableNote({ ON: false }, mod('ON'))).toBe('Its features below are inert until it is switched on.');
    expect(enableNote(ALL, mod('ON'))).toBe('Its features below are available to configure.');
  });
  test('the off confirm carries the impact text and says it applies to everyone at once', () => {
    expect(offConfirm('A')).toEqual({ title: 'Turn off Manual time entry?', body: `${MOD_IMPACT.A} This applies to everyone immediately.`, confirm: 'Turn it off', cancel: 'Keep it as it is' });
    expect(offConfirm('ON').body).toBe('This applies to everyone immediately.');
  });
});

describe('switching a module', () => {
  test('QniConnect cannot be switched off (LOCKED); switching it on changes nothing', () => {
    expect(switchModule(state(), 'CORE', false)).toEqual({ ok: false, refusal: CORE_LOCKED });
    expect(CORE_LOCKED).toMatchObject({ status: 409, code: 'LOCKED' });
    expect(switchModule(state(), 'CORE', true)).toEqual({ ok: true, changed: false });
  });
  test('an unknown code is refused', () => {
    const r = switchModule(state(), 'XX', true);
    expect(r.ok ? null : r.refusal).toMatchObject({ status: 404, message: 'There is no module "XX".' });
  });
  test('switching to the state it is already in changes nothing', () => {
    expect(switchModule(state(), 'ON', true)).toEqual({ ok: true, changed: false });
  });
  test('Timesheet off remembers which of A, B and C were on and switches them all off', () => {
    const r = switchModule(state({ ...ALL, B: false }), 'TS', false);
    if (!r.ok || !r.changed) throw new Error('expected a change');
    expect(r.remembered).toEqual(['A', 'C']);
    expect(r.restore).toEqual({ TS: ['A', 'C'] });
    expect([r.modules.TS, r.modules.A, r.modules.B, r.modules.C]).toEqual([false, false, false, false]);
  });
  test('Timesheet on restores exactly what it remembered, and forgets it', () => {
    const r = switchModule(state({ ...ALL, TS: false, A: false, B: false, C: false }, { TS: ['B', 'C'] }), 'TS', true);
    if (!r.ok || !r.changed) throw new Error('expected a change');
    expect(r.brought).toEqual(['B', 'C']);
    expect([r.modules.TS, r.modules.A, r.modules.B, r.modules.C]).toEqual([true, false, true, true]);
    expect(r.restore).toEqual({});
  });
  test('Timesheet on with nothing remembered defaults to manual entry', () => {
    for (const restore of [{}, { TS: [] }] as Record<string, string[]>[]) {
      const r = switchModule(state({ TS: false, A: false, B: false, C: false }, restore), 'TS', true);
      if (!r.ok || !r.changed) throw new Error('expected a change');
      expect(r.brought).toEqual(['A']);
      expect([r.modules.A, r.modules.B]).toEqual([true, false]);
    }
  });
  test('a capture method can only be switched while Timesheet is licensed (MODULE_OFF)', () => {
    const r = switchModule(state({ TS: false, A: false }), 'A', true);
    expect(r.ok ? null : r.refusal).toMatchObject({ status: 409, code: 'MODULE_OFF', message: 'Timesheet is not licensed for this tenant, so its capture methods cannot be switched.' });
    const ok = switchModule(state({ TS: true, A: true, B: true }), 'A', false);
    expect(ok.ok && ok.changed ? [ok.modules.A, ok.modules.TS] : null).toEqual([false, true]);
  });
  test('a plain module switches on its own and leaves the others alone', () => {
    const r = switchModule(state(), 'ON', false);
    expect(r.ok && r.changed ? r.modules : null).toEqual({ ...ALL, ON: false });
  });
});

describe('switching a feature and its extras', () => {
  test('a feature of a module that is not live is refused (MODULE_OFF), even a Timesheet one while only Sites is on', () => {
    const r = switchFlag({ ON: false }, {}, 'ONB_SIGN', { on: true });
    expect(r.ok ? null : r.refusal).toMatchObject({ status: 409, code: 'MODULE_OFF', message: 'Onboarding is off, so its features cannot be changed.' });
    const ts = switchFlag({ TS: true, C: true }, {}, 'GEOFENCE', { on: true });
    expect(ts.ok ? null : ts.refusal).toMatchObject({ code: 'MODULE_OFF' });
  });
  test('a CORE feature switches whenever, and an unknown one is refused', () => {
    expect(switchFlag({}, { DOCS: true }, 'DOCS', { on: false })).toEqual({ ok: true, on: false, extras: {} });
    const r = switchFlag(ALL, {}, 'NOPE', { on: true });
    expect(r.ok ? null : r.refusal).toMatchObject({ status: 404 });
  });
  test('the weekly grid\'s capture and layout belong to Weekly grid only, and only while it is on', () => {
    expect(switchFlag(ALL, { WEEKLY: true }, 'WEEKLY', { weekGrid: 'times', weekLayout: 'days' })).toEqual({ ok: true, on: true, extras: { weekGrid: 'times', weekLayout: 'days' } });
    const off = switchFlag(ALL, { WEEKLY: false }, 'WEEKLY', { weekLayout: 'grid' });
    expect(off.ok ? null : off.refusal).toMatchObject({ status: 409, code: 'FLAG_OFF', message: 'Weekly grid is off, so its settings cannot be changed.' });
    expect(switchFlag(ALL, { WEEKLY: false }, 'WEEKLY', { on: true, weekLayout: 'grid' }).ok).toBe(true);
    const stray = switchFlag(ALL, { DAILY: true }, 'DAILY', { weekGrid: 'hours' });
    expect(stray.ok ? null : stray.refusal).toMatchObject({ status: 422, field: 'weekGrid' });
  });
  test('the breaks stepper runs 1 to 5 and the vehicle maximum 1 to 4, refused outside rather than clamped', () => {
    expect(switchFlag(ALL, { BREAKS: true }, 'BREAKS', { breaksMax: 1 }).ok).toBe(true);
    expect(switchFlag(ALL, { BREAKS: true }, 'BREAKS', { breaksMax: 5 }).ok).toBe(true);
    for (const n of [0, 6, 2.5]) {
      const r = switchFlag(ALL, { BREAKS: true }, 'BREAKS', { breaksMax: n });
      expect(r.ok ? null : r.refusal).toMatchObject({ status: 422, field: 'breaksMax', message: BREAKS_RANGE });
    }
    const v = switchFlag(ALL, { VEHICLE: true }, 'VEHICLE', { vehiclesMax: 5 });
    expect(v.ok ? null : v.refusal).toMatchObject({ field: 'vehiclesMax', message: VEHICLES_RANGE });
    expect(BREAKS_RANGE).toBe('Breaks per entry must be between 1 and 5.');
  });
  test('the toast says what changed, as the prototype words it', () => {
    const weekly = must(FLAGS.find(f => f.code === 'WEEKLY'));
    expect(flagChangeText(weekly, false, true, {})).toBe('Weekly grid on. It is live for everyone now.');
    expect(flagChangeText(weekly, true, true, { weekGrid: 'times' })).toBe('Weekly grid now captures start and finish. It is live for everyone now.');
    expect(flagChangeText(weekly, true, true, { weekLayout: 'days' })).toBe('Weekly view: list. One row per day, allocation chosen before the times. It is live for everyone now.');
  });
});

describe('module switch text', () => {
  test('the toast names the capture methods brought back and the types a capability was taken off', () => {
    expect(moduleSwitchText('TS', true, { brought: ['A', 'C'] })).toBe('Timesheet turned on with Manual time entry, Sites. It is live for everyone now.');
    expect(moduleSwitchText('C', false, { sitesRemovedFrom: 2 })).toBe('Sites turned off. It is live for everyone now. The site field group was taken off 2 work patterns.');
  });
});

describe('role names', () => {
  test('a name is required, at most 24 characters, and unique ignoring case', () => {
    expect(roleNameProblem('  ', ['Manager'])).toEqual({ field: 'name', message: ROLE_NAME_REQUIRED });
    expect(roleNameProblem('x'.repeat(25), [])).toEqual({ field: 'name', message: ROLE_NAME_TOO_LONG });
    expect(roleNameProblem('x'.repeat(24), [])).toBeNull();
    expect(roleNameProblem(' manager ', ['Manager', 'Admin'])).toEqual({ field: 'name', message: ROLE_NAME_TAKEN, taken: true });
    expect(roleNameProblem('Support Worker', ['Manager', 'Admin'])).toBeNull();
    expect([ROLE_NAME_REQUIRED, ROLE_NAME_TAKEN]).toEqual(['Every role needs a name.', 'Two roles cannot share a name.']);
  });
});
