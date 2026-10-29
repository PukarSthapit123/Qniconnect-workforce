import {
  GLYPH_ORDER, dayGlyph, greeting, inBounds, keyIsEmpty, leadingBlanks, monthBounds, monthDates, monthKey, monthLabel, monthSummary, monthTotals,
  outOfBoundsProblem, shiftMonth, whoLine, type KeyDay,
} from './home';

const day = (o: Partial<KeyDay>): KeyDay => ({ glyph: null, minutes: 0, ...o });

describe('the month window', () => {
  test('runs from the month before today to twelve months ahead (July 2026 to August 2027)', () => {
    expect(monthBounds('2026-08-13')).toEqual({ min: '2026-07', max: '2027-08' });
    expect(monthBounds('2026-01-05')).toEqual({ min: '2025-12', max: '2027-01' });
  });
  test('a month inside it is allowed, one outside or malformed is not, and the refusal names the range', () => {
    const b = monthBounds('2026-08-13');
    expect(['2026-07', '2026-08', '2027-08'].map(m => inBounds(m, b))).toEqual([true, true, true]);
    expect(['2026-06', '2027-09', '2026-13', '2026-8', ''].map(m => inBounds(m, b))).toEqual([false, false, false, false, false]);
    expect(outOfBoundsProblem(b)).toEqual({ field: 'month', message: 'The calendar runs from July 2026 to August 2027.' });
  });
  test('months step across years, and a month knows its days and where its first falls', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2026-08')).toBe('August 2026');
    expect(monthDates('2026-08')).toHaveLength(31);
    expect(monthDates('2027-02')).toHaveLength(28);
    expect(leadingBlanks('2026-08')).toBe(5);
  });
});

describe('who is greeted, and how', () => {
  test('morning before noon, afternoon before six, evening after', () => {
    expect(['00:00', '11:59', '12:00', '17:59', '18:00', '23:30'].map(greeting))
      .toEqual(['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
  });
  test('the who-line names the job, the type only when it differs, and the location', () => {
    expect(whoLine({ job: 'Support Worker', type: 'Shift worker', location: 'Willow House' })).toBe('Support Worker · Shift worker · Willow House');
    expect(whoLine({ job: 'Shift worker', type: 'shift worker', location: 'Willow House' })).toBe('Shift worker · Willow House');
    expect(whoLine({ job: '', type: 'Salaried', location: '' })).toBe('Salaried');
  });
});

describe('a day carries one status glyph', () => {
  test('a recorded day carries its timesheet state; a day with nothing recorded carries none', () => {
    expect(dayGlyph({ ts: 'ok' })).toBe('ok');
    expect(dayGlyph({ ts: 'pend' })).toBe('pend');
    expect(dayGlyph({ ts: 'mgrok' })).toBe('pend');
    expect(dayGlyph({ ts: 'draft' })).toBe('draft');
    expect(dayGlyph({ ts: null })).toBeNull();
  });
  test('the glyphs keep the prototype order: approved, awaiting, resubmitted, sent back, draft', () => {
    expect(GLYPH_ORDER).toEqual(['ok', 'pend', 'resub', 'back', 'draft']);
  });
});

describe('the live key', () => {
  test('counts only what the month holds, in the key order, each glyph with the calendar state colour', () => {
    const k = monthKey([
      day({ glyph: 'draft', minutes: 450 }),
      day({}), day({}), day({ glyph: 'pend', minutes: 480 }),
    ]);
    expect(k.states).toEqual([
      { key: 'pend', glyph: '◷', tone: 'pend', label: 'Submitted', count: 1 },
      { key: 'draft', glyph: '✎', tone: 'draft', label: 'Draft', count: 1 },
    ]);
    expect(keyIsEmpty(k)).toBe(false);
  });
  test('an empty month has an empty key and no month line', () => {
    expect(keyIsEmpty(monthKey([day({}), day({})]))).toBe(true);
    expect(monthSummary(monthTotals([day({})]))).toBe('');
  });
  test('the month line counts recorded hours', () => {
    const t = monthTotals([day({ minutes: 450 }), day({}), day({ minutes: 30 })]);
    expect(t).toEqual({ minutes: 480 });
    expect(monthSummary(t)).toBe('8.0h recorded');
  });
});
