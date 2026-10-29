import {
  DEFAULT_RULES, allocationProblem, projectOptions, taskOptions, taskReset, NOTHING_TO_SUBMIT, NO_TIME_FIELDS, RATE_TRIGGERS, TS_STATE, TS_STATES,
  WEEK_LAYOUTS, WEEK_LAYOUT_LABEL, addDays, advisoryFlags, allSubmittedMessage, alreadySubmittedMessage, clockFromIso, cutoffFor,
  dayMinutes, deriveWorkType, dowMon, entryMinutes, fieldActive, fieldProblem, fieldSettingFor, fieldVisible,
  formatDay, formatDmy, formatMinutes, historyEntry, isoWeek, lockNote, missingMandatory, payBasisOf, payCodeList, payElement,
  payLabel, periodLocked, periodStart, planWeekSubmit, queueChecksum, readBreaks,
  returnReasonProblem, toMin, transitionAuditText, tsCan, tsPending,
  tsStateInfo, tsTransitionProblem, validateTimes, weekBlockedMessage, weekDayOutcome, weekLabel, weekLayoutFor, weekModel,
  weekTotals, mgrokLabel, tsLabel,
  type AllowanceDef, type CheckContext, type RateContext, type FieldDef, type FieldEnv, type PayCode, type TimesInput, type TsState,
  type TypeCapture, type TypeRule,
} from './timesheet';
import { setActiveLocale } from './time';

/* The prototype's frozen clock: Thursday 13 August 2026, 09:12. */
const NOW = { date: '2026-08-13', time: '09:12' };
const ctx = (over: Partial<CheckContext> = {}): CheckContext =>
  ({ date: '2026-08-12', now: NOW, rules: { ...DEFAULT_RULES }, cutoff: 'Monday 12:00', timeFormat: 'h m', ...over });
const day = (start: string, finish: string, breaks: [string, string][] = []): TimesInput =>
  ({ start, finish, breaks: breaks.map(([s, e]) => ({ start: s, end: e })) });
const messages = (r: { errors: { message: string }[] }) => r.errors.map(e => e.message);

describe('state machine (D2)', () => {
  /* module 8: a day the line manager approves with payroll still to come moves to mgrok */
  const ALLOWED: Record<TsState, TsState[]> = { draft: ['pend'], pend: ['ok', 'back', 'mgrok'], back: ['resub'], resub: ['ok', 'back', 'mgrok'], ok: [], mgrok: ['ok', 'back'] };
  for (const from of TS_STATES) for (const to of TS_STATES) {
    const allowed = ALLOWED[from].includes(to);
    test(`${from} → ${to} is ${allowed ? 'allowed' : 'refused'}`, () => {
      expect(tsCan(from, to)).toBe(allowed);
      expect(tsTransitionProblem(from, to) === null).toBe(allowed);
    });
  }
  test('labels, tones and glyphs are the prototype\'s', () => {
    expect(TS_STATES.map(s => [TS_STATE[s].label, TS_STATE[s].tone, TS_STATE[s].glyph])).toEqual([
      ['Draft', 'neu', '—'], ['Awaiting approval', 'info', '◷'], ['Sent back', 'err', '✕'], ['Resubmitted', 'info', '↻'], ['Approved', 'ok', '✓'],
      ['Approved by manager, waiting on payroll', 'info', '◷']]);
  });
  test('a refused move uses the prototype\'s message as plain sentences', () => {
    expect(tsTransitionProblem('back', 'ok')).toEqual({
      message: 'Not allowed. A sent back timesheet cannot move to approved.', next: 'From sent back it can move to resubmitted.' });
    expect(tsTransitionProblem('pend', 'resub')?.message).toBe('Not allowed. An awaiting approval timesheet cannot move to resubmitted.');
    expect(tsTransitionProblem('ok', 'back')).toEqual({
      message: 'Not allowed. An approved timesheet cannot move to sent back.', next: 'An approved timesheet is final.' });
    expect(tsTransitionProblem('pend', 'draft')?.next).toBe('From awaiting approval it can move to approved, sent back or approved by manager, waiting on payroll.');
  });
  test('unknown states never move and read as draft', () => {
    expect(tsCan('posted', 'ok')).toBe(false);
    expect(tsCan('pend', 'posted')).toBe(false);
    expect(tsStateInfo('posted').label).toBe('Draft');
  });
  test('pending means a first submission or a resubmission', () => {
    expect(TS_STATES.filter(tsPending)).toEqual(['pend', 'resub']);
  });
  test('history and audit text record from, to, who and why', () => {
    const by = { employeeCode: 'EMP014', name: 'Manish Nepal' };
    expect(historyEntry('pend', 'back', by, '2026-08-13T08:12:00.000Z', 'Break times missing'))
      .toEqual({ from: 'pend', to: 'back', by, at: '2026-08-13T08:12:00.000Z', reason: 'Break times missing' });
    expect(historyEntry('draft', 'pend', by, 'x').reason).toBe('');
    expect(transitionAuditText('Bigyan Poudel', '2026-08-12', 'pend', 'back', 'Break times missing'))
      .toBe('Bigyan Poudel · 12/08/2026 · Awaiting approval → Sent back · "Break times missing"');
    expect(transitionAuditText('Bigyan Poudel', '2026-08-12', 'pend', 'ok')).toBe('Bigyan Poudel · 12/08/2026 · Awaiting approval → Approved');
  });
});

describe('the mgrok label names the layer the day waits on (module 8 review M3)', () => {
  test('payroll keeps the usual words; another role is named; other states keep their label', () => {
    expect([mgrokLabel(), mgrokLabel('Payroll')]).toEqual(['Approved by manager, waiting on payroll', 'Approved by manager, waiting on payroll']);
    expect(mgrokLabel('Line manager')).toBe('Approved by manager, waiting on the line manager');
    expect([tsLabel('mgrok', 'Payroll'), tsLabel('pend', 'Payroll')]).toEqual(['Approved by manager, waiting on payroll', 'Awaiting approval']);
  });
});

describe('time and date helpers', () => {
  test('toMin reads 24-hour times and refuses anything else', () => {
    expect(toMin('07:00')).toBe(420);
    expect(toMin(' 7:05 ')).toBe(425);
    expect(toMin('23:59')).toBe(1439);
    for (const bad of ['', '7', '07:0', '24:00', '12:60', 'ab:cd', null, undefined]) expect(toMin(bad)).toBeNull();
  });
  test('formatMinutes follows the tenant\'s time format', () => {
    expect(formatMinutes(450, 'h m')).toBe('7h 30m');
    expect(formatMinutes(450, 'HH:MM')).toBe('07:30');
    expect(formatMinutes(-5, 'h m')).toBe('0h 00m');
  });
  test('dates', () => {
    expect(dowMon('2026-08-13')).toBe(3);
    expect(formatDay('2026-08-13')).toBe('Thu 13 Aug');
    expect(formatDmy('2026-08-03')).toBe('03/08/2026');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(isoWeek('2026-08-03')).toBe(32);
    expect(weekLabel('2026-08-03')).toBe('Week 32 · 03–09 Aug 2026');
    expect(weekLabel('2026-07-27')).toBe('Week 31 · 27 Jul – 02 Aug 2026');
  });
  test('clockFromIso reads the instant in London time', () => {
    expect(clockFromIso('2026-08-13T08:12:00.000Z')).toEqual(NOW);
    expect(clockFromIso('2026-01-13T08:12:00.000Z')).toEqual({ date: '2026-01-13', time: '08:12' });
  });
});

describe('pay period lock', () => {
  const lockOn = { enforceLock: true, cutoff: 'Monday 12:00' };
  test('periodStart is the Monday of the week', () => {
    expect(periodStart('2026-08-13')).toBe('2026-08-10');
    expect(periodStart('2026-08-10')).toBe('2026-08-10');
    expect(periodStart('2026-08-16')).toBe('2026-08-10');
  });
  test('cutoffFor offsets from the week start by the cut-off day', () => {
    expect(cutoffFor('2026-08-03', 'Monday 12:00')).toEqual({ date: '2026-08-10', time: '12:00' });
    expect(cutoffFor('2026-08-03', 'Sunday 18:00')).toEqual({ date: '2026-08-09', time: '18:00' });
    expect(cutoffFor('2026-08-03', 'Thursday 10:00')).toEqual({ date: '2026-08-13', time: '10:00' });
    expect(cutoffFor('2026-08-03', 'Friday')).toEqual({ date: '2026-08-10', time: '12:00' });
  });
  test('the configured cut-off stays after a Sunday-start pay period', () => {
    setActiveLocale({ timezone: 'Europe/London', dateFormat: 'dd/mm/yyyy', clock: '24h', weekStart: 'Sunday' });
    expect(cutoffFor('2026-08-09', 'Monday 12:00')).toEqual({ date: '2026-08-17', time: '12:00' });
    expect(lockNote('2026-08-09', 'Monday 12:00')).toBe('Pay period 09/08/2026 – 15/08/2026 closed at Monday 12:00 (17/08/2026 12:00)');
    setActiveLocale({ timezone: 'Europe/London', dateFormat: 'dd/mm/yyyy', clock: '24h', weekStart: 'Monday' });
  });
  test('a past period whose cut-off has passed is locked', () => {
    expect(periodLocked('2026-08-05', lockOn, NOW)).toBe(true);
  });
  test('the current and future periods are always open', () => {
    expect(periodLocked('2026-08-10', lockOn, NOW)).toBe(false);
    expect(periodLocked('2026-08-20', lockOn, NOW)).toBe(false);
  });
  test('a past period stays open until its cut-off time, and closes at it', () => {
    expect(periodLocked('2026-08-05', { enforceLock: true, cutoff: 'Thursday 10:00' }, NOW)).toBe(false);
    expect(periodLocked('2026-08-05', { enforceLock: true, cutoff: 'Thursday 09:12' }, NOW)).toBe(true);
  });
  test('turning enforcement off opens every period', () => {
    expect(periodLocked('2026-08-05', { enforceLock: false, cutoff: 'Monday 12:00' }, NOW)).toBe(false);
  });
  test('lockNote names the period and when it closed', () => {
    expect(lockNote('2026-08-05', 'Monday 12:00')).toBe('Pay period 03/08/2026 – 09/08/2026 closed at Monday 12:00 (10/08/2026 12:00)');
  });
});

describe('readBreaks', () => {
  test('wraps a night shift\'s breaks past midnight onto the shift\'s line', () => {
    const [b] = readBreaks([{ start: '02:00', end: '02:30' }], toMin('22:00') ?? 0);
    expect(b).toMatchObject({ n: 1, s: 120, e: 150, from: 1560, to: 1590 });
  });
  test('a break that starts before midnight and ends after it wraps only its end', () => {
    expect(readBreaks([{ start: '23:45', end: '00:15' }], 1320)[0]).toMatchObject({ from: 1425, to: 1455 });
  });
  test('skips empty rows and numbers the rest in order', () => {
    const out = readBreaks([{ start: '', end: '' }, { start: '10:00', end: '' }], 420);
    expect(out).toEqual([{ n: 1, index: 1, raw: ['10:00', ''], s: 600, e: null, from: 600, to: null }]);
  });
});

describe('validateTimes errors', () => {
  test('a future date', () => {
    expect(validateTimes(day('07:00', '15:00'), ctx({ date: '2026-08-14' })).errors)
      .toEqual([{ field: 'date', message: 'You cannot record time for Fri 14 Aug. It is in the future.' }]);
  });
  test('future dates are allowed when the rule is off', () => {
    expect(validateTimes(day('07:00', '15:00'), ctx({ date: '2026-08-14', rules: { ...DEFAULT_RULES, blockFuture: false } })).errors).toEqual([]);
  });
  test('a locked period', () => {
    expect(validateTimes(day('07:00', '15:00'), ctx({ date: '2026-08-05' })).errors).toEqual([{ field: 'date',
      message: 'Pay period 03/08/2026 – 09/08/2026 closed at Monday 12:00 (10/08/2026 12:00). This day can no longer be submitted.' }]);
  });
  test('malformed start and finish', () => {
    expect(messages(validateTimes(day('7am', '15:00'), ctx()))).toEqual(['Start time must be a 24-hour time such as 07:00.']);
    expect(messages(validateTimes(day('07:00', '3pm'), ctx()))).toEqual(['Finish time must be a 24-hour time such as 15:00.']);
  });
  test('a missing finish or start', () => {
    expect(validateTimes(day('07:00', ''), ctx()).errors).toEqual([{ field: 'finish', message: 'Add a finish time.' }]);
    expect(validateTimes(day('', '15:00'), ctx()).errors).toEqual([{ field: 'start', message: 'Add a start time.' }]);
  });
  test('nothing entered is neither an error nor a net', () => {
    expect(validateTimes(day('', ''), ctx())).toEqual({ errors: [], warnings: [], net: null });
  });
  test('a half-entered break', () => {
    expect(validateTimes(day('07:00', '15:00', [['09:00', '']]), ctx()).errors)
      .toEqual([{ field: 'breaks.0', message: 'Break 1 needs both a start and an end.' }]);
  });
  test('a break that starts and ends together', () => {
    expect(messages(validateTimes(day('07:00', '15:00', [['09:00', '09:00']]), ctx()))).toEqual(['Break 1 starts and ends at the same time.']);
  });
  test('a break outside the shift', () => {
    expect(messages(validateTimes(day('07:00', '15:00', [['06:00', '06:30']]), ctx())))
      .toContain('Break 1 (06:00–06:30) falls outside the shift.');
  });
  test('overlapping breaks', () => {
    const r = validateTimes(day('07:00', '15:00', [['09:00', '09:30'], ['09:15', '10:00']]), ctx());
    expect(r.errors).toEqual([{ field: 'breaks.1', message: 'Breaks 1 and 2 overlap.' }]);
  });
  test('breaks longer than the shift', () => {
    expect(messages(validateTimes(day('07:00', '08:00', [['07:00', '07:30'], ['07:30', '08:00']]), ctx())))
      .toEqual(['Breaks (1h 00m) are longer than the shift (1h 00m).']);
  });
  test('net time below the minimum', () => {
    expect(validateTimes(day('07:00', '07:10'), ctx()).errors).toEqual([{ field: 'finish', message: 'Net time is 0h 10m. Record at least 0.25 h.' }]);
  });
  test('net time above the daily maximum, which finish-before-start reaches as 23 hours', () => {
    expect(messages(validateTimes(day('00:00', '23:00'), ctx()))).toEqual(['Net time is 23h 00m, above the 16-hour daily maximum.']);
    expect(messages(validateTimes(day('09:00', '08:00'), ctx()))).toEqual(['Net time is 23h 00m, above the 16-hour daily maximum.']);
  });
  test('messages use the tenant\'s time format', () => {
    expect(messages(validateTimes(day('07:00', '07:10'), ctx({ timeFormat: 'HH:MM' })))).toEqual(['Net time is 00:10. Record at least 0.25 h.']);
  });
});

describe('validateTimes warnings never block', () => {
  test('a midnight crossing is read as one shift and flagged', () => {
    const r = validateTimes(day('22:00', '04:00'), ctx());
    expect(r).toEqual({ errors: [], net: 360,
      warnings: ['Finish is at or before start, so this is being read as crossing midnight (6.00 h).'] });
  });
  test('a night shift\'s break after midnight counts against it', () => {
    const r = validateTimes(day('22:00', '07:00', [['02:00', '02:30']]), ctx());
    expect(r.errors).toEqual([]);
    expect(r.net).toBe(510);
  });
  test('above the review threshold', () => {
    const r = validateTimes(day('07:00', '20:00'), ctx());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(['That is 13h 00m in one day. It is above the 12-hour review threshold.']);
  });
  test('warnings are not raised while there are errors', () => {
    const r = validateTimes(day('07:00', '20:00', [['09:00', '']]), ctx());
    expect(r.warnings).toEqual([]);
  });
});

describe('deriveWorkType', () => {
  const codes: PayCode[] = [
    { code: 'STD', basis: 'multiplier', value: '1', element: 'PE-STD', label: 'Standard time', workType: true },
    { code: 'OT-SAT', basis: 'multiplier', value: '1.5', element: 'PE-OTSAT', label: 'Overtime: Saturday', workType: true },
    { code: 'NIGHT', basis: 'multiplier', value: '1.5', element: 'PE-NIGHT', label: 'Night work', workType: true },
  ];
  const rule = (when: string, code: string, trigger = when): TypeRule => ({ trigger, when, code, value: '1×', how: 'Auto (BC)' });
  const S = { nightFrom: '20:00', nightTo: '06:00', otDaily: 8 };
  const base: RateContext = { date: '2026-08-12', start: 420, net: 450, travel: false };
  test('first matching rule wins, and returns the rule it matched', () => {
    const rules = [rule('night', 'NIGHT', 'Night window'), rule('sat', 'OT-SAT', 'Saturday work'), rule('else', 'STD', 'Everything else')];
    expect(deriveWorkType(rules, { ...base, date: '2026-08-15', start: 1320 }, S, codes)).toEqual({
      code: 'NIGHT', label: 'Night work', rule: 'Night window', when: 'night', why: 'Night window. Night work applied automatically.' });
    expect(deriveWorkType(rules, { ...base, date: '2026-08-15' }, S, codes)?.rule).toBe('Saturday work');
  });
  test('else is the fallback wherever it sits', () => {
    const rules = [rule('else', 'STD', 'Everything else'), rule('sat', 'OT-SAT')];
    expect(deriveWorkType(rules, base, S, codes)).toEqual({
      code: 'STD', label: 'Standard time', rule: 'Everything else', when: 'else', why: 'No premium trigger matched. Standard time applied.' });
    expect(deriveWorkType(rules, { ...base, date: '2026-08-15' }, S, codes)?.code).toBe('OT-SAT');
  });
  test('null with no usable rules, or nothing matching and no fallback', () => {
    expect(deriveWorkType([], base, S, codes)).toBeNull();
    expect(deriveWorkType([{ trigger: 'Hours inside the unsocial window', when: '', code: 'UNSOC', value: '', how: 'Auto (BC)' }], base, S, codes)).toBeNull();
    expect(deriveWorkType([rule('sat', 'OT-SAT')], base, S, codes)).toBeNull();
  });
  test('each trigger', () => {
    const t = (k: string, c: Partial<typeof base>, s = S) => RATE_TRIGGERS[k]?.test({ ...base, ...c }, s);
    expect([t('sat', { date: '2026-08-15' }), t('sat', {})]).toEqual([true, false]);
    expect([t('sun', { date: '2026-08-16' }), t('sun', {})]).toEqual([true, false]);
    expect([t('night', { start: 1200 }), t('night', { start: 359 }), t('night', { start: 360 }), t('night', { start: null })])
      .toEqual([true, true, false, false]);
    expect(t('night', { start: 1290 }, { ...S, nightFrom: '22:00' })).toBe(false);
    expect([t('travel', { travel: true }), t('travel', {})]).toEqual([true, false]);
    expect([t('over_daily', { net: 481 }), t('over_daily', { net: 480 }), t('over_daily', { net: null })]).toEqual([true, false, false]);
    expect(t('over_daily', { net: 400 }, { ...S, otDaily: 6 })).toBe(true);
    expect(t('bh', {})).toBe(false);
    expect(t('else', {})).toBe(true);
  });
  test('an unknown code labels as itself', () => {
    expect(deriveWorkType([rule('else', 'MYSTERY')], base, S, codes)?.label).toBe('MYSTERY');
  });
});

describe('pay code helpers', () => {
  const codes: PayCode[] = [{ code: 'STD', basis: 'multiplier', value: '1', element: 'PE-STD', label: 'Standard time', workType: true }];
  const lib: Record<string, AllowanceDef> = { WAKING_NIGHT: { code: 'WAKING_NIGHT', label: 'Waking night', payCode: 'WAKING_NIGHT', tier: 'shift' } };
  test('element, basis, label and the code list', () => {
    expect([payElement(codes, lib, 'STD'), payElement(codes, lib, 'WAKING_NIGHT'), payElement(codes, lib, 'X')]).toEqual(['PE-STD', 'PE-WAKING', '—']);
    expect([payBasisOf(codes, lib, 'STD'), payBasisOf(codes, lib, 'WAKING_NIGHT'), payBasisOf(codes, lib, 'X')]).toEqual(['multiplier', 'flat', 'units']);
    expect([payLabel(codes, 'STD'), payLabel(codes, 'WAKING_NIGHT')]).toEqual(['Standard time', 'WAKING_NIGHT']);
    expect(payCodeList(codes, lib)).toEqual(['STD', 'WAKING_NIGHT']);
  });
});

describe('capture fields per type', () => {
  const F = (o: Partial<FieldDef> & { c: string }): FieldDef => ({ tier: 'core', label: o.c, cat: 'Time', input: 'text', grp: 'core', ...o });
  const start = F({ c: 'start', label: 'Start date & time' }), project = F({ c: 'project', label: 'Project', flag: 'PROJECT', req: 'project' });
  const site = F({ c: 'site', mod: 'C', req: 'site' }), vehicle = F({ c: 'vehicle', driverOnly: true });
  const overtime = F({ c: 'overtime', cat: 'Allowance', pay: 'OT15' }), notes = F({ c: 'notes' });
  const type: TypeCapture = { fields: { start: { vis: true, mand: true }, project: { vis: true, mand: false }, notes: { vis: false, mand: false } },
    allowances: ['OT15'], rules: [] };
  const env: FieldEnv = { modules: { C: true }, flagOn: f => f === 'PROJECT', capabilities: ['project'],
    defaults: { start: { vis: true, mand: false, label: 'Start' }, site: { vis: false, mand: false, label: 'Location' } } };
  test('a field needs its module, flag and capability, and a place in the type\'s map', () => {
    expect(fieldActive(start, type, env)).toBe(true);
    expect(fieldActive(project, type, env)).toBe(true);
    expect(fieldActive(project, type, { ...env, flagOn: () => false })).toBe(false);
    expect(fieldActive(project, type, { ...env, capabilities: [] })).toBe(false);
    expect(fieldActive(site, type, { ...env, modules: {} })).toBe(false);
    expect(fieldActive(vehicle, type, env)).toBe(false);
    expect(fieldActive(F({ c: 'travel' }), type, env)).toBe(false);
    expect(fieldActive(F({ c: 'travel' }), undefined, env)).toBe(true);
  });
  test('an allowance is offered when the type claims its pay code', () => {
    expect(fieldActive(overtime, type, env)).toBe(true);
    expect(fieldActive(overtime, { ...type, allowances: [] }, env)).toBe(false);
  });
  test('visibility and the setting come from the type, then the tenant\'s defaults', () => {
    expect(fieldVisible(notes, type, env)).toBe(false);
    expect(fieldVisible(start, type, env)).toBe(true);
    expect(fieldSettingFor(start, type, env)).toEqual({ vis: true, mand: true, label: 'Start' });
    expect(fieldSettingFor(site, undefined, env)).toEqual({ vis: false, mand: false, label: 'Location' });
    expect(fieldSettingFor(notes, undefined, env)).toEqual({ vis: true, mand: false, label: 'notes' });
  });
  test('a visible mandatory field left empty blocks the submission', () => {
    expect(missingMandatory([start, project, notes], type, env, { start: ' ' }))
      .toEqual({ field: 'start', message: 'Submission blocked. Fill in: Start.' });
    expect(missingMandatory([start, project], type, env, { start: '07:00' })).toBeNull();
    expect(missingMandatory([start], { ...type, fields: { start: { vis: false, mand: true } } }, env, {})).toBeNull();
  });
});

describe('week totals', () => {
  const e = (start: string, finish: string, extra: object = {}) => ({ start, finish, breaks: [], ...extra });
  test('entry minutes take complete breaks off and wrap past midnight', () => {
    expect(entryMinutes({ start: '07:00', finish: '15:00', breaks: [{ start: '11:00', end: '11:30' }, { start: '12:00', end: '' }] })).toBe(450);
    expect(entryMinutes(e('22:00', '07:00'))).toBe(540);
    expect(entryMinutes(e('', '', { hours: 7.5 }))).toBe(450);
    expect(entryMinutes(e('', ''))).toBe(0);
  });
  test('per day, per allocation and for the week', () => {
    const t = weekTotals('2026-08-10', [
      { date: '2026-08-10', entries: [e('09:00', '13:00', { fields: { project: 'J00020' } }), e('14:00', '17:00', { fields: { project: 'J00021' } })] },
      { date: '2026-08-12', entries: [e('09:00', '17:00', { fields: { project: 'J00020' } })] },
      { date: '2026-08-20', entries: [e('09:00', '17:00')] },
    ], ['project', 'site']);
    expect(t.dayMinutes).toEqual([420, 0, 480, 0, 0, 0, 0]);
    expect(t.byAllocation).toEqual({ J00020: 720, J00021: 180 });
    expect(t.weekMinutes).toBe(900);
    expect(t.dates[6]).toBe('2026-08-16');
    expect(dayMinutes([e('09:00', '13:00'), e('14:00', '17:00')])).toBe(420);
  });
});

describe('week submission day check', () => {
  const c = { now: NOW, rules: { ...DEFAULT_RULES }, cutoff: 'Monday 12:00', timeFormat: 'h m' as const };
  test('empty, held, blocked and ready', () => {
    expect(weekDayOutcome('2026-08-12', 0, c)).toEqual({ kind: 'empty' });
    expect(weekDayOutcome('2026-08-14', 450, c)).toEqual({ kind: 'held', reason: 'Fri 14 Aug is in the future, so it is held back until it happens.' });
    expect(weekDayOutcome('2026-08-05', 450, c)).toEqual({ kind: 'blocked',
      reason: 'Wed 5 Aug: Pay period 03/08/2026 – 09/08/2026 closed at Monday 12:00 (10/08/2026 12:00).' });
    expect(weekDayOutcome('2026-08-12', 1000, c)).toEqual({ kind: 'blocked', reason: 'Wed 12 Aug records 16h 40m, above the 16-hour daily maximum.' });
    expect(weekDayOutcome('2026-08-12', 10, c)).toEqual({ kind: 'blocked', reason: 'Wed 12 Aug records only 0h 10m.' });
    expect(weekDayOutcome('2026-08-12', 450, c)).toEqual({ kind: 'ready' });
    expect(NOTHING_TO_SUBMIT).toBe('Nothing to submit. No hours are entered on this week.');
  });
});

describe('advisory flags', () => {
  const c = { now: NOW, rules: DEFAULT_RULES, cutoff: 'Monday 12:00', timeFormat: 'h m' as const };
  const d = { date: '2026-08-12', minutes: 450, state: 'pend', captureSource: 'self' as const };
  test('a plain day carries no flags', () => {
    expect(advisoryFlags(d, c)).toEqual([]);
  });
  test('long day, resubmission, proxy and closed period', () => {
    expect(advisoryFlags({ date: '2026-08-05', minutes: 780, state: 'resub', captureSource: 'proxy' }, c)).toEqual([
      { code: 'long', text: '13h 00m in one day' }, { code: 'resub', text: 'resubmitted after correction' },
      { code: 'proxy', text: 'entered by a manager as proxy' }, { code: 'locked', text: 'pay period closed' }]);
  });
});

describe('inline field checks', () => {
  const mand = { vis: true, mand: true, label: 'Project' };
  test('a mandatory field left empty', () => {
    expect(fieldProblem('project', ' ', mand, {})).toBe('Project is required.');
    expect(fieldProblem('project', '', { ...mand, label: '' }, {})).toBe('This field is required.');
    expect(fieldProblem('project', '', { ...mand, mand: false }, {})).toBeNull();
  });
  test('finish equal to start, and a break that ends before it starts', () => {
    expect(fieldProblem('finish', '07:00', undefined, { start: '07:00' })).toBe('Finish cannot equal start.');
    expect(fieldProblem('finish', '15:00', undefined, { start: '07:00' })).toBeNull();
    expect(fieldProblem('break_e2', '09:00', undefined, { break_s2: '09:30' })).toBe('Break end is before its start.');
    expect(fieldProblem('break_e', '10:00', undefined, { break_s: '09:30' })).toBeNull();
  });
});

describe('weekly layout', () => {
  const F = (o: Partial<FieldDef> & { c: string }): FieldDef => ({ tier: 'core', label: o.c, cat: 'Time', input: 'text', grp: 'core', ...o });
  const fields = [F({ c: 'start' }), F({ c: 'project', cat: 'Project', input: 'select', opts: ['J00020'] }), F({ c: 'billable', cat: 'Project', input: 'check' }),
    F({ c: 'site', cat: 'Location', input: 'select', opts: ['MCR'] }), F({ c: 'drive', cat: 'Compliance', input: 'calc' })];
  const env: FieldEnv = { modules: {}, flagOn: () => true, capabilities: [], defaults: { project: { vis: true, mand: false, label: 'Job' } } };
  const type: TypeCapture = { fields: { start: { vis: true, mand: true }, project: { vis: true, mand: false }, billable: { vis: true, mand: false } },
    allowances: [], rules: [] };
  test('the week model carries the visible project and location selects as allocations', () => {
    expect(weekModel(fields, type, env, 'times')).toEqual({ ctx: [{ c: 'project', label: 'Job', opts: ['J00020'] }], hasTime: true, multi: true, times: true });
    expect(weekModel(fields, { ...type, fields: {} }, env, 'hours')).toEqual({ ctx: [], hasTime: false, multi: false, times: false });
  });
  test('a narrow screen always gets the day list', () => {
    expect([weekLayoutFor('classic', false), weekLayoutFor('grid', false), weekLayoutFor('grid', true)]).toEqual(['classic', 'grid', 'days']);
    expect(WEEK_LAYOUTS.map(l => WEEK_LAYOUT_LABEL[l])).toEqual([
      'Classic · allocation in the first column', 'Grid · allocation as a section header', 'List · one row per day']);
    expect(NO_TIME_FIELDS).toBe('No time fields are enabled for this employee type. Turn Start or Finish back on under Timesheet setup.');
  });
});

describe('projects and tasks (fieldOpts)', () => {
  const projects = [{ code: 'PRJ-204', name: 'Camden Supported Living', tasks: ['One-to-one support', 'Group activity'] },
    { code: 'PRJ-114', name: 'Northgate Fit-out', tasks: ['Site survey'] }, { code: 'PRJ-009', name: 'Internal', tasks: [] }];
  test('Project lists the open projects; Job task lists the chosen project’s tasks, or the first project’s while none is chosen', () => {
    expect(projectOptions(projects)).toEqual(['Camden Supported Living', 'Northgate Fit-out', 'Internal']);
    expect(taskOptions(projects, 'Northgate Fit-out')).toEqual(['Site survey']);
    expect(taskOptions(projects, '')).toEqual(['One-to-one support', 'Group activity']);
    expect(taskOptions(projects, 'Internal')).toEqual([]);
    expect(taskOptions([], '')).toEqual([]);
  });
  test('changing the project empties the task; any other choice leaves it', () => {
    expect(taskReset('project', 'Internal', 'Northgate Fit-out')).toEqual({ job_task: '' });
    expect(taskReset('project', 'Internal', 'Internal')).toEqual({});
    expect(taskReset('job_task', 'a', 'b')).toEqual({});
  });
  test('the server refuses a project that is not open here, and a task that is not on the chosen project', () => {
    expect(allocationProblem({}, projects)).toBeNull();
    expect(allocationProblem({ project: 'Northgate Fit-out', job_task: 'Site survey' }, projects)).toBeNull();
    expect(allocationProblem({ job_task: 'Group activity' }, projects)).toBeNull();
    expect(allocationProblem({ project: 'GoFibre Rollout' }, projects))
      .toEqual({ field: 'project', message: 'GoFibre Rollout is not an open project in this organisation.' });
    expect(allocationProblem({ project: 'Northgate Fit-out', job_task: 'Group activity' }, projects))
      .toEqual({ field: 'job_task', message: 'Group activity is not a task on Northgate Fit-out.' });
    expect(allocationProblem({ job_task: 'Cable pull' }, projects))
      .toEqual({ field: 'job_task', message: 'Cable pull is not a task on any open project.' });
  });
});

describe('week submission plan', () => {
  const c = { now: NOW, rules: { ...DEFAULT_RULES }, cutoff: 'Monday 12:00', timeFormat: 'h m' as const };
  test('drafts submit, a sent-back day resubmits, future and decided days are held with reasons', () => {
    const plan = planWeekSubmit([
      { date: '2026-08-10', minutes: 450 }, { date: '2026-08-11', minutes: 450, state: 'draft' },
      { date: '2026-08-12', minutes: 780, state: 'back' }, { date: '2026-08-13', minutes: 450, state: 'pend' },
      { date: '2026-08-14', minutes: 450 }, { date: '2026-08-15', minutes: 0 }], c);
    expect(plan).toEqual({ blocked: [], submit: ['2026-08-10', '2026-08-11'], resubmit: ['2026-08-12'], flagged: ['Wed 12 Aug 13h 00m'], held: [
      { date: '2026-08-13', reason: 'Thu 13 Aug is already awaiting approval, so it was left alone.' },
      { date: '2026-08-14', reason: 'Fri 14 Aug is in the future, so it is held back until it happens.' }] });
  });
  test('a sent-back day the request left unchanged is held, not resubmitted as it was', () => {
    const plan = planWeekSubmit([{ date: '2026-08-10', minutes: 450, state: 'back', unchanged: true }, { date: '2026-08-11', minutes: 450, state: 'back' }], c);
    expect(plan).toMatchObject({ submit: [], resubmit: ['2026-08-11'],
      held: [{ date: '2026-08-10', reason: 'Mon 10 Aug was sent back and has not been corrected, so it was left alone.' }] });
  });
  test('a closed period, an impossible total or a capture error blocks the whole week', () => {
    const plan = planWeekSubmit([{ date: '2026-08-10', minutes: 450 }, { date: '2026-08-11', minutes: 1000 },
      { date: '2026-08-12', minutes: 450, errors: [{ field: 'breaks.1', message: 'Breaks 1 and 2 overlap.' }] }], c);
    expect(plan.blocked).toEqual(['Tue 11 Aug records 16h 40m, above the 16-hour daily maximum.', 'Wed 12 Aug: Breaks 1 and 2 overlap.']);
    expect(weekBlockedMessage(plan.blocked))
      .toBe('Submission blocked. Tue 11 Aug records 16h 40m, above the 16-hour daily maximum. Wed 12 Aug: Breaks 1 and 2 overlap.');
    expect(planWeekSubmit([{ date: '2026-08-05', minutes: 450 }], c).blocked)
      .toEqual(['Wed 5 Aug: Pay period 03/08/2026 – 09/08/2026 closed at Monday 12:00 (10/08/2026 12:00).']);
  });
  test('the refusal and confirmation messages', () => {
    expect(allSubmittedMessage('Manish Nepal')).toBe('Already submitted. Every day on this week is with Manish Nepal or decided.');
    expect(alreadySubmittedMessage('2026-08-12', 'pend')).toBe('You already have an entry for 12/08/2026. It is awaiting approval.');
    expect(alreadySubmittedMessage('2026-08-12', 'ok')).toBe('You already have an entry for 12/08/2026. It is approved.');
    expect(returnReasonProblem('  ', true)).toEqual({ field: 'reason', message: 'A reason is required.' });
    expect(returnReasonProblem('', false)).toBeNull();
    expect(returnReasonProblem('Break times missing', true)).toBeNull();
  });
});

describe('queue checksum (D7)', () => {
  const a = { id: 'a', state: 'resub', version: 3 }, b = { id: 'b', state: 'pend', version: 1 };
  test('the same rows in any order give the same checksum', () => {
    expect(queueChecksum([a, b])).toBe(queueChecksum([b, a]));
    expect(queueChecksum([a, b])).toMatch(/^[0-9a-f]{16}$/);
  });
  test('a changed state, version or row set changes it', () => {
    const base = queueChecksum([a, b]);
    expect(queueChecksum([a, { ...b, state: 'ok' }])).not.toBe(base);
    expect(queueChecksum([a, { ...b, version: 2 }])).not.toBe(base);
    expect(queueChecksum([a])).not.toBe(base);
  });
});

describe('allowance pay element and basis', () => {
  test('an allowance carries its own element and basis when it has them', () => {
    const lib: Record<string, AllowanceDef> = { SLEEP_IN: { code: 'SLEEP_IN', label: 'Sleep-in', payCode: 'SLEEP_IN', tier: 'shift', element: 'PE-SLEEPIN', basis: 'units' } };
    expect(payElement([], lib, 'SLEEP_IN')).toBe('PE-SLEEPIN');
    expect(payBasisOf([], lib, 'SLEEP_IN')).toBe('units');
  });
});

/* Review P0 #3 (D2): a shift is paid for the time that really passes. The UK clocks go back at 02:00 on
   Sun 25 Oct 2026 and forward at 01:00 on Sun 28 Mar 2027, so a night that starts the evening before is 9h or 7h. */
describe('hours on a clock-change night count real elapsed time', () => {
  const free = { ...DEFAULT_RULES, blockFuture: false, enforceLock: false, maxDaily: 24, warnDaily: 24 };
  const net = (date: string, start: string, finish: string) => validateTimes(day(start, finish), ctx({ date, rules: free })).net;
  beforeEach(() => setActiveLocale({ timezone: 'Europe/London' }));
  afterEach(() => setActiveLocale(null));
  test('an 8h shift across the 25 Oct 2026 clock change counts 9h', () => {
    expect(net('2026-10-24', '22:00', '06:00')).toBe(540);
    expect(entryMinutes({ start: '22:00', finish: '06:00', breaks: [] }, '2026-10-24')).toBe(540);
  });
  test('across 28 Mar 2027 counts 7h', () => {
    expect(net('2027-03-27', '22:00', '06:00')).toBe(420);
    expect(entryMinutes({ start: '22:00', finish: '06:00', breaks: [] }, '2027-03-27')).toBe(420);
  });
  test('the week total and the day total carry it', () => {
    const e = { start: '22:00', finish: '06:00', breaks: [] };
    expect(dayMinutes([e], '2026-10-24')).toBe(540);
    expect(weekTotals('2026-10-19', [{ date: '2026-10-24', entries: [e] }]).weekMinutes).toBe(540);
  });
  test('a night either side of the change, and a day shift on the change day, are unchanged', () => {
    expect(net('2026-10-23', '22:00', '06:00')).toBe(480);
    expect(net('2026-10-25', '09:00', '17:00')).toBe(480);
    expect(net('2027-03-28', '09:00', '17:00')).toBe(480);
  });
  test('a tenant zone with no clock change never differs', () => {
    setActiveLocale({ timezone: 'Asia/Kathmandu' });
    expect(net('2026-10-24', '22:00', '06:00')).toBe(480);
  });
  test('without a date the wall-clock span stands', () => {
    expect(entryMinutes({ start: '22:00', finish: '06:00', breaks: [] })).toBe(480);
  });
});
