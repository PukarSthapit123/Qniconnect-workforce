import type { ComponentProps, ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Button, Combobox, Empty, Pill, Row, ScopeBadge, Small, Tip } from '@/ui';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import type { TimesheetWeek } from '@/contract/timesheets';
import { dowMon, weekdayShort } from '@/domain/time';
import { NO_TIME_FIELDS, chooseProjectTask, formatMinutes, projectTaskOptions, projectTaskValue, taskReset, type WeekLayout, type WeekModel } from '@/domain/timesheet';
import { selectValues } from './capture';
import { MAX_ALLOCS, MAX_LINES, blankAlloc, blankCell, cellMinutes, defaultCtx, gridTotals, type Alloc, type Cell, type GridState, type Line } from './week';

/* The weekly grid in the tenant's layout (renderWeekGrid, renderWeekClassic,
   renderWeekDays; qnipay-workforce-v15.html:6441-6588 and the rules at
   976-1083). Controlled: the parent holds the state and submits it. Shared by
   My timesheet and proxy entry, which passes `who` so the grid says whose it is.
   - classic: each row's allocation pickers in its first cell; days across.
   - grid: days across, one section per allocation, a totals row under them.
   - days: one row per day, allocation chosen before the times.
   Timesheet week review (2026-10-27): today is the brand-green rule and word
   the day list already used, the pickers are the Day form's, and a day or row
   with nothing recorded is a dash, not 00:00. */
export interface WeekGridProps {
  week: TimesheetWeek; model: WeekModel; layout: WeekLayout; state: GridState; onChange: (s: GridState) => void;
  today: string; who?: string;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/* The weekday comes from the date, so a week that starts on Sunday or Saturday is named right (review P0 #2). */
const dateParts = (iso: string) => ({ dow: weekdayShort(iso), dm: `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1] ?? ''}` });
/* table.wk input.inl: a 34px in-table input on the card surface, a light border that strengthens on hover */
const INL = 'h-[34px] w-full min-w-[62px] rounded-control border border-border bg-surface-card px-xs text-center text-sm tabular-nums outline-none hover:enabled:border-border-strong hover:enabled:bg-surface-tint focus:border-brand focus:bg-surface-card focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-60 max-md:min-w-[64px] max-md:text-base';
/* no browser clock icon: the field is typed into, and the icon cost "07:00" its last digits on a phone */
const TIME = '[&::-webkit-calendar-picker-indicator]:hidden';
export const weekend = (iso: string) => dowMon(iso) >= 5;
const TODAY_RULE = 'shadow-[inset_0_3px_0_var(--qp-color-brand-primary)] dark:shadow-[inset_0_3px_0_var(--qp-color-brand-accent)]';
const dayBg = (iso: string) => cn(weekend(iso) && 'bg-surface-sunken');
const zero = (min: number) => (min ? '' : 'font-normal text-text-muted');

/* An empty time field shows the dash every other blank on the screen shows, not the browser's "--:--"; focus brings the field back. */
function TimeInput({ value, className, ...rest }: Omit<ComponentProps<'input'>, 'type' | 'value'> & { value: string }) {
  return (
    <span className="relative block">
      <input type="time" step={300} className={cn('peer', INL, TIME, !value && 'text-transparent focus:text-text-primary', className)} value={value} {...rest} />
      {!value && <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-text-muted peer-focus:hidden">–</span>}
    </span>);
}

function CellInputs({ cell, times, label, disabled, testId, onCell }: {
  cell: Cell; times: boolean; label: string; disabled: boolean; testId: (part: string) => string;
  onCell: (part: keyof Cell, v: string) => void;
}) {
  if (!times) return <input data-testid={testId('hours')} type="text" inputMode="decimal" placeholder="–" aria-label={`${label} hours`} disabled={disabled}
    className={INL} value={cell.hours} onChange={e => onCell('hours', e.target.value)} />;
  return (
    <div className="flex flex-col gap-xs">
      <TimeInput data-testid={testId('start')} aria-label={`${label} start`} disabled={disabled} value={cell.start} onChange={e => onCell('start', e.target.value)} />
      <TimeInput data-testid={testId('finish')} aria-label={`${label} finish`} disabled={disabled} value={cell.finish} onChange={e => onCell('finish', e.target.value)} />
    </div>);
}

/* An allocation's pickers, the Day form's Combobox, in every layout: in the classic row's first cell, inline in the grid's
   section header, on the line in the day list. Project and task are one picker, as a BC time sheet line is Job No. and
   Job Task No.; choosing a project fills the cost centre with its default, which stays a picker of its own because it
   can differ by person (chooseProjectTask). An organisation that does not capture projects gets its fields one by one.
   `labels`: the field names above boxed pickers. The classic cell has no room for either, so there the pickers are its
   text (Combobox `plain`): the project in ink, its task under it, the cost centre small under that; each opens its
   list where it is. */
function AllocPickers({ week, model, ctx, testId, labelFor, onCtx, className, labels = true }: {
  week: TimesheetWeek; model: WeekModel; ctx: Record<string, string>; testId: (field: string) => string; labelFor: (label: string) => string;
  onCtx: (next: Record<string, string>) => void; className: string; labels?: boolean;
}) {
  const projects = week.capture.projects, fields = model.ctx;
  const project = fields.find(f => f.c === 'project'), task = fields.find(f => f.c === 'job_task');
  const rest = project ? fields.filter(f => f !== project && f !== task) : fields;
  const ptLabel = task && project ? `${project.label} and task` : project?.label ?? '';
  const plain = !labels;
  const wrap = (key: string, label: string, control: ReactNode) => (labels
    ? <label key={key} className={className}><span className="text-xs font-semibold text-text-secondary">{label}</span>{control}</label>
    : <div key={key} className={className}>{control}</div>);
  /* the classic cell's text: what is chosen in ink, what is not as a quiet prompt */
  const projectText = ctx.project
    ? <><b className="block text-sm font-semibold break-words text-text-primary">{ctx.project}</b>
      {ctx.job_task && <span className="block text-xs break-words text-text-secondary">{ctx.job_task}</span>}</>
    : <span className="block text-sm text-text-muted">Choose {ptLabel.toLowerCase()}</span>;
  const fieldText = (f: { c: string; label: string }) => (ctx[f.c]
    ? <span className="block text-xs break-words text-text-secondary">{ctx[f.c]}</span>
    : <span className="block text-xs text-text-muted">{f.label}</span>);
  return <>
    {project && wrap('project', ptLabel,
      <Combobox testId={testId('project')} aria-label={labelFor(ptLabel)} searchLabel={`Search ${ptLabel.toLowerCase()}`} placeholder="Choose"
        plain={plain} display={plain ? projectText : undefined}
        options={projectTaskOptions(projects, Boolean(task))} value={projectTaskValue(ctx) || undefined} onValueChange={v => onCtx(chooseProjectTask(ctx, v, projects))} />)}
    {rest.map(f => wrap(f.c, f.label,
      <Combobox testId={testId(f.c)} aria-label={labelFor(f.label)} searchLabel={`Search ${f.label.toLowerCase()}`} placeholder="Choose"
        plain={plain} display={plain ? fieldText(f) : undefined}
        options={selectValues(f.c, f.opts, week.capture, ctx).map(o => ({ value: o, label: o }))} value={ctx[f.c] || undefined}
        onValueChange={v => onCtx({ ...ctx, [f.c]: v, ...taskReset(f.c, ctx[f.c], v) })} />))}
  </>;
}

export function WeekGrid(p: WeekGridProps) {
  const { model: m, week } = p, tf = week.capture.timeFormat;
  /* §11: a missing value is a dash; nothing recorded on a day or a row is missing, not a measured zero */
  const hm = (min: number) => (min ? formatMinutes(min, tf) : '–');
  if (!m.hasTime && !m.multi) return <Empty testId={tid.week.empty}>{NO_TIME_FIELDS}</Empty>;
  const totals = gridTotals(p.state, m, week.days.map(d => d.date));
  /* My timesheet answers the week above the grid (WeekView); a proxy grid has no such header, so it keeps the line */
  const contracted = p.who ? `contracted ${formatMinutes(week.employee.contractedHours * 60, tf)}` : '';
  const whose = p.who ? `${p.who}’s` : 'your';
  const breakdown = Object.keys(totals.byCtx).length > 0 && (
    <div data-testid={tid.week.alloc} className="mt-sm flex flex-wrap gap-md text-xs text-text-muted">
      {Object.entries(totals.byCtx).map(([k, v]) => <span key={k}>{k} <b className="font-[650] text-text-primary">{hm(v)}</b></span>)}
    </div>);
  /* IMP-005c: a proxy grid says whose it is: their timesheet, not the manager's */
  const seeded = p.who && <Small testId={tid.ts.seeded}>Showing {whose} timesheet, not yours.</Small>;
  return (
    <div data-testid={tid.week.grid}>
      {p.state.kind === 'lines'
        ? <DayList {...p} lines={p.state.lines} totals={totals} hm={hm} contracted={contracted} />
        : p.layout === 'grid'
          ? <SectionGrid {...p} allocs={p.state.allocs} totals={totals} hm={hm} />
          : <Classic {...p} allocs={p.state.allocs} totals={totals} hm={hm} />}
      {breakdown}
      <div className="mt-sm flex flex-wrap items-baseline gap-md">
        {p.layout === 'grid' && p.state.kind === 'allocs'
          ? <><Small className="flex-[1_1_260px]">{m.times ? 'Start and finish per day.' : 'One total per day.'}{m.ctx.length
            ? ` Split the week across more than one ${m.ctx.map(c => c.label.toLowerCase()).join(' or ')} by adding an allocation.` : ''}</Small>
            {contracted && <span className="text-xs text-text-muted">{contracted}</span>}{seeded}</>
          : seeded}
      </div>
    </div>);
}

type Totals = ReturnType<typeof gridTotals>;
interface AllocProps extends WeekGridProps { allocs: Alloc[]; totals: Totals; hm: (m: number) => string }

/* After the row is drawn: its first control, the first picker (the Edit button in classic, where the pickers are in a popover), or the first cell when there is nothing to choose. */
function focusAlloc(m: WeekModel, a: number) {
  /* the project picker carries the task too, so it is the first control whenever there is one */
  const first = m.ctx.find(f => f.c === 'project') ?? m.ctx[0];
  const id = first ? tid.week.ctx(a, first.c) : tid.week.cell(a, 0, m.times ? 'start' : 'hours');
  setTimeout(() => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.focus(), 0);
}
function allocEdits(p: AllocProps) {
  const set = (allocs: Alloc[]) => p.onChange({ kind: 'allocs', allocs });
  return {
    cell: (a: number, i: number, part: keyof Cell, v: string) =>
      set(p.allocs.map((x, k) => (k === a ? { ...x, cells: x.cells.map((c, j) => (j === i ? { ...c, [part]: v } : c)) } : x))),
    ctx: (a: number, ctx: Record<string, string>) => set(p.allocs.map((x, k) => (k === a ? { ...x, ctx } : x))),
    /* review row 21: the row appearing or going is its own news; what is missing is where the keyboard goes next */
    add: () => { set([...p.allocs, blankAlloc(p.model)]); focusAlloc(p.model, p.allocs.length); },
    remove: (a: number) => { set(p.allocs.filter((_x, k) => k !== a)); focusAlloc(p.model, Math.max(0, a - 1)); },
  };
}
const AddAlloc = ({ p, label, onClick }: { p: AllocProps; label: string; onClick: () => void }) => (p.model.ctx.length > 0
  ? <Button testId={tid.week.addAlloc} kind="ghost" small className="mt-[10px]" disabled={p.allocs.length >= MAX_ALLOCS}
    title={p.allocs.length >= MAX_ALLOCS ? 'Six allocations is the practical limit on one week' : undefined} onClick={onClick}>{label}</Button>
  : null);
const RemoveAlloc = ({ a, withText, onClick }: { a: number; withText?: boolean; onClick: () => void }) => (
  <Button testId={tid.week.delAlloc(a)} kind="ghost" small aria-label={`Remove allocation ${a + 1}`} onClick={onClick}>
    <Trash2 aria-hidden="true" />{withText && ' Remove'}</Button>);

function DayHead({ p }: { p: WeekGridProps }) {
  return <>{p.week.days.map(d => {
    const { dow, dm } = dateParts(d.date), isToday = d.date === p.today;
    return (
      <TableHead key={d.date} aria-current={isToday ? 'date' : undefined} className={cn('text-center', dayBg(d.date), isToday && TODAY_RULE)}>
        {dow}<span className="mt-px block text-sm font-bold tracking-normal text-text-primary normal-case">{dm}</span>
        {isToday && <span className="block text-xs tracking-[.05em] text-brand dark:text-brand-accent">today</span>}
      </TableHead>);
  })}</>;
}
function DayCells({ p, alloc, a }: { p: AllocProps; alloc: Alloc; a: number }) {
  const edit = allocEdits(p);
  return <>{p.week.days.map((d, i) => {
    const { dow, dm } = dateParts(d.date);
    return (
      <TableCell key={d.date} className={cn('text-center', dayBg(d.date))}>
        <CellInputs cell={alloc.cells[i] ?? blankCell()} times={p.model.times} label={`${dow} ${dm}`} disabled={d.locked}
          testId={part => tid.week.cell(a, i, part)} onCell={(part, v) => edit.cell(a, i, part, v)} />
      </TableCell>);
  })}</>;
}
const rowMinutes = (alloc: Alloc, m: WeekModel, week: TimesheetWeek) => alloc.cells.reduce((n, c, i) => n + cellMinutes(c, m.times, week.days[i]?.date), 0);
function TotalsRow({ p, lead, trailing }: { p: AllocProps; lead: ReactNode; trailing?: boolean }) {
  return (
    <TableRow>
      <TableCell className="text-xs text-text-muted">{lead}</TableCell>
      {p.totals.dayMin.map((min, i) => <TableCell key={i} data-testid={tid.week.dayTotal(i)}
        className={cn('text-center font-[650] whitespace-nowrap tabular-nums', zero(min))}>{p.hm(min)}</TableCell>)}
      <TableCell data-testid={tid.week.total} className={cn('text-right text-sm font-[650] whitespace-nowrap tabular-nums', zero(p.totals.weekMin))}>{p.hm(p.totals.weekMin)}</TableCell>
      {trailing && <TableCell />}
    </TableRow>);
}
const NO_ZEBRA = '[&>tr:nth-child(even)]:bg-transparent';

/* The classic row chooses its allocation where it is: the project-and-task picker over the cost centre, the height of the
   start and finish pair beside them (three stacked pickers made the row ~200px; a popover hid the choice). */
function Classic(p: AllocProps) {
  const m = p.model, edit = allocEdits(p);
  return (
    <>
      <Table variant="matrix" dense className="max-md:min-w-[760px]">
        <TableHeader><TableRow>
          <TableHead className="w-[240px] min-w-[240px] max-md:w-[200px] max-md:min-w-[200px]">{m.ctx.length
            ? <>Allocation<Tip testId={tid.week.allocTip} text="Everything on this row is charged to this combination. Add a row to split the week across more than one." /></>
            : 'Hours'}</TableHead>
          <DayHead p={p} />
          <TableHead className="text-right">Total</TableHead><TableHead />
        </TableRow></TableHeader>
        <TableBody className={NO_ZEBRA}>
          {p.allocs.map((alloc, a) => {
            const min = rowMinutes(alloc, m, p.week);
            return (
              <Row key={a} testId={tid.week.row(a)}>
                <TableCell className="w-[240px] min-w-[240px] align-top max-md:w-[200px] max-md:min-w-[200px]">
                  {m.ctx.length
                    ? <div className="flex flex-col gap-[2px]">
                      <AllocPickers week={p.week} model={m} ctx={alloc.ctx} testId={fc => tid.week.ctx(a, fc)} labelFor={l => `${l} for allocation ${a + 1}`}
                        onCtx={ctx => edit.ctx(a, ctx)} className="min-w-0" labels={false} />
                    </div>
                    : <span className="text-xs text-text-muted">Hours</span>}
                </TableCell>
                <DayCells p={p} alloc={alloc} a={a} />
                <TableCell data-testid={tid.week.rowTotal(a)} className={cn('text-right whitespace-nowrap tabular-nums', zero(min))}>{p.hm(min)}</TableCell>
                <TableCell className="text-right">{a > 0 && <RemoveAlloc a={a} onClick={() => edit.remove(a)} />}</TableCell>
              </Row>);
          })}
        </TableBody>
        <TableFooter><TotalsRow p={p} lead="Totals" trailing /></TableFooter>
      </Table>
      <AddAlloc p={p} label="+ Add allocation row" onClick={edit.add} />
    </>);
}

function SectionGrid(p: AllocProps) {
  const m = p.model, edit = allocEdits(p);
  return (
    <>
      <Table variant="matrix" dense className="max-md:min-w-[660px]">
        <TableHeader><TableRow>
          <TableHead className="w-[76px] min-w-[76px]" /><DayHead p={p} /><TableHead className="text-right">Total</TableHead>
        </TableRow></TableHeader>
        <TableBody className={NO_ZEBRA}>
          {p.allocs.flatMap((alloc, a) => {
            const min = rowMinutes(alloc, m, p.week);
            const rows = [];
            if (m.ctx.length) rows.push(
              <Row key={`h${a}`} testId={tid.week.allocRow(a)}>
                <TableCell colSpan={9} className="bg-surface-tint p-0">
                  <div className="flex flex-wrap items-end gap-md px-md py-sm">
                    <span className="mb-[6px]"><ScopeBadge>Allocation {a + 1}</ScopeBadge></span>
                    <AllocPickers week={p.week} model={m} ctx={alloc.ctx} testId={f => tid.week.ctx(a, f)} labelFor={l => `${l} for allocation ${a + 1}`}
                      onCtx={ctx => edit.ctx(a, ctx)} className="flex min-w-0 flex-[1_1_150px] flex-col gap-xs text-left max-md:flex-[1_1_120px]" />
                    {a > 0 && <RemoveAlloc a={a} withText onClick={() => edit.remove(a)} />}
                  </div>
                </TableCell>
              </Row>);
            rows.push(
              <Row key={`r${a}`} testId={tid.week.row(a)}>
                <TableCell className="w-[76px] min-w-[76px] text-xs text-text-muted">{m.times ? <>Start<br />Finish</> : 'Hours'}</TableCell>
                <DayCells p={p} alloc={alloc} a={a} />
                <TableCell data-testid={tid.week.rowTotal(a)} className={cn('text-right whitespace-nowrap tabular-nums', zero(min))}>{p.hm(min)}</TableCell>
              </Row>);
            return rows;
          })}
        </TableBody>
        <TableFooter><TotalsRow p={p} lead="Totals" /></TableFooter>
      </Table>
      <AddAlloc p={p} label="+ Add an allocation" onClick={edit.add} />
    </>);
}

interface LinesProps extends WeekGridProps { lines: Line[][]; totals: Totals; hm: (m: number) => string; contracted: string }
function DayList(p: LinesProps) {
  const m = p.model;
  const set = (lines: Line[][]) => p.onChange({ kind: 'lines', lines });
  const edit = (i: number, j: number, f: (l: Line) => Line) => set(p.lines.map((ls, k) => (k === i ? ls.map((l, n) => (n === j ? f(l) : l)) : ls)));
  const add = (i: number) => set(p.lines.map((ls, k) => (k === i ? [...ls, { ctx: ls[0]?.ctx ? { ...ls[0].ctx } : defaultCtx(m), cell: blankCell() }] : ls)));
  const remove = (i: number, j: number) => set(p.lines.map((ls, k) => (k === i ? ls.filter((_l, n) => n !== j) : ls)));
  const LINE_TIME = 'w-[82px] min-w-[82px] max-md:w-[76px] max-md:min-w-[76px]';
  return (
    <div className="overflow-hidden rounded-card border bg-surface-card">
      {p.week.days.map((d, i) => {
        const { dow, dm } = dateParts(d.date), isToday = d.date === p.today, lines = p.lines[i] ?? [];
        const min = p.totals.dayMin[i] ?? 0;
        return (
          <div key={d.date} data-testid={tid.week.day(i)}
            className={cn('border-b px-md py-sm', weekend(d.date) && 'bg-surface-sunken', isToday && 'shadow-[inset_3px_0_0_var(--qp-color-brand-primary)] dark:shadow-[inset_3px_0_0_var(--qp-color-brand-accent)]')}>
            <div className="mb-xs flex items-center gap-sm">
              <span className="text-sm text-text-secondary"><b className="mr-xs text-sm text-text-primary">{dow}</b>{dm}</span>
              {isToday && <Pill tone="ok">Today</Pill>}
              {d.locked ? <Pill testId={tid.week.closed(i)} tone="warn" note={d.lockNote}>Closed</Pill>
                : d.future && <span className="text-xs text-text-muted">Not yet</span>}
              <span data-testid={tid.week.dayTotal(i)} className={cn('ml-auto text-sm font-[650] tabular-nums', zero(min))}>{p.hm(min)}</span>
            </div>
            <div className="flex flex-col gap-sm">
              {lines.map((l, j) => {
                const net = cellMinutes(l.cell, m.times, d.date);
                return (
                  <div key={j} className="flex flex-wrap items-end gap-md">
                    {m.ctx.length > 0 && <div className="flex min-w-0 flex-[1_1_240px] flex-wrap gap-sm max-md:order-first max-md:basis-full">
                      <AllocPickers week={p.week} model={m} ctx={l.ctx} testId={f => tid.week.lineCtx(i, j, f)} labelFor={lb => `${lb} for ${dow}`}
                        onCtx={ctx => edit(i, j, x => ({ ...x, ctx }))} className="flex min-w-0 flex-[1_1_130px] flex-col gap-xs" />
                    </div>}
                    <span className="inline-flex flex-none items-center gap-sm">
                      {m.times ? <>
                        <span className={LINE_TIME}><TimeInput data-testid={tid.week.lineCell(i, j, 'start')} aria-label={`${dow} start`} disabled={d.locked}
                          value={l.cell.start} onChange={e => edit(i, j, x => ({ ...x, cell: { ...x.cell, start: e.target.value } }))} /></span>
                        <span aria-hidden="true" className="text-sm text-text-muted">→</span>
                        <span className={LINE_TIME}><TimeInput data-testid={tid.week.lineCell(i, j, 'finish')} aria-label={`${dow} finish`} disabled={d.locked}
                          value={l.cell.finish} onChange={e => edit(i, j, x => ({ ...x, cell: { ...x.cell, finish: e.target.value } }))} /></span></>
                        : <input data-testid={tid.week.lineCell(i, j, 'hours')} type="text" inputMode="decimal" placeholder="–" aria-label={`${dow} hours`}
                          disabled={d.locked} className={cn(INL, 'w-[82px] min-w-[82px]')} value={l.cell.hours}
                          onChange={e => edit(i, j, x => ({ ...x, cell: { ...x.cell, hours: e.target.value } }))} />}
                    </span>
                    <span className={cn('min-w-[58px] text-right text-sm font-semibold tabular-nums max-md:ml-auto', zero(net))}>{p.hm(net)}</span>
                    {j > 0 && <Button testId={tid.week.delLine(i, j)} kind="ghost" small aria-label="Remove this line" onClick={() => remove(i, j)}><Trash2 aria-hidden="true" /></Button>}
                  </div>);
              })}
            </div>
            {!d.locked && !d.future && lines.length < MAX_LINES && (
              <button type="button" data-testid={tid.week.addLine(i)} onClick={() => add(i)}
                className="mt-xs py-xs text-xs font-semibold text-brand hover:underline dark:text-brand-accent">
                + {lines.length ? 'Add a line to this day' : 'Add time for this day'}</button>)}
          </div>);
      })}
      <div className="flex items-center gap-sm border-t bg-surface-tint p-md text-sm">
        <span>Week total</span><b data-testid={tid.week.total} className="text-sm tabular-nums">{p.hm(p.totals.weekMin)}</b>
        {p.contracted && <span className="ml-auto text-xs text-text-muted">{p.contracted}</span>}
      </div>
    </div>);
}
