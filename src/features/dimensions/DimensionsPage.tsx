import { Fragment, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Banknote, Building, Check, Folder, Minus, ShieldCheck, Users } from 'lucide-react';
import { tid } from '@/testids';
import { DIMENSIONS, DIMENSION_KINDS, type DimensionKind } from '@/contract/dimensions';
import { Button, Card, Empty, GuideButton, Page, PageHead, Pill, Row, SetupCardButton, Small, Tip } from '@/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { useDimension, type InUseRow } from '@/api/reference';
import { latest, versionKey } from '@/lib/latest';
import { DIM_GROUPS, DIM_SPECS } from './spec';
import { DimensionForm } from './DimensionForm';

const ICON: Record<string, ReactNode> = { building: <Building />, shield: <ShieldCheck />, money: <Banknote />, users: <Users />, folder: <Folder /> };
const isKind = (k: string | null): k is DimensionKind => !!k && (DIMENSION_KINDS as readonly string[]).includes(k);

/* Ported from the prototype's admDimensions and dimPage (qnipay-workforce-v15.
   html:9228-9270, IMP-019): an index of cards grouped by kind, and one page
   per list. The page is ?d=<kind>, so a list can be linked to (Work patterns
   links to positions). Since 2026-10-27 this is Master data: dimensions,
   positions and projects (DIM_GROUPS). */
export function DimensionsPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('d');
  return (
    <Page testId={tid.page('aloc')}>
      {isKind(kind) ? <DimensionTable kind={kind} onBack={() => setParams({})} /> : <DimensionIndex onOpen={k => setParams({ d: k })} />}
    </Page>);
}

function DimensionCard({ kind, onOpen }: { kind: DimensionKind; onOpen(k: DimensionKind): void }) {
  const n = useDimension(kind).data?.length ?? 0, spec = DIM_SPECS[kind], entries = `${n} entr${n === 1 ? 'y' : 'ies'}`;
  const descId = tid.dims.cardDescription(kind);
  return (
    <div className="contents">
      <SetupCardButton testId={tid.dims.card(kind)} icon={ICON[spec.icon]} title={DIMENSIONS[kind].label} sub={entries} count={n} countLabel={entries}
        describedBy={descId} onClick={() => onOpen(kind)} />
      <span id={descId} data-testid={descId} className="sr-only">{spec.desc}</span>
    </div>);
}
function DimensionIndex({ onOpen }: { onOpen(k: DimensionKind): void }) {
  return (<>
    <PageHead title="Master data" tipTestId={tid.head.tip('aloc')}
      tip="The lists every record and timesheet line draws on: the dimensions Business Central analyses by, the positions people hold, and the projects time is charged to." actions={<GuideButton view="aloc" />} />
    {DIM_GROUPS.map(g => (
      <section key={g.key} className="mt-lg mb-sm border-t pt-sm first-of-type:mt-0">
        <h2 className="mt-lg mb-md text-base">{g.label}<Tip testId={tid.dims.groupTip(g.key)} text={g.note} /></h2>
        <div className="mb-md grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-md">
          {g.kinds.map(k => <DimensionCard key={k} kind={k} onOpen={onOpen} />)}
        </div>
      </section>))}
  </>);
}

function DimensionTable({ kind, onBack }: { kind: DimensionKind; onBack(): void }) {
  const spec = DIM_SPECS[kind], list = useDimension(kind);
  const [form, setForm] = useState<{ row?: InUseRow } | null>(null);
  /* a project's tasks open under it; they are read from its job in Business Central, not edited here */
  const [opened, setOpened] = useState<string | null>(null);
  const tasksOf = (r: InUseRow) => (Array.isArray(r.tasks) ? r.tasks.filter((t): t is string => typeof t === 'string') : null);
  const withTasks = kind === 'projects';
  /* the form works on the entry as last read, and starts again when it changes */
  const editing = form?.row && latest(form.row, list.data);
  const cols = spec.fields.filter(f => !f.wide).slice(0, 6);
  const cell = (r: InUseRow, key: string, kindOf: string) => {
    const v = r[key];
    if (kindOf === 'bool') return <Pill testId={tid.dims.cell(r.code, key)} tone={v ? 'ok' : 'neu'} glyph={v ? <Check /> : <Minus />}>{v ? 'Yes' : 'No'}</Pill>;
    return v === '' || v === undefined || v === null ? '—' : String(v);
  };
  return (<>
    <PageHead title={spec.label} tip={spec.desc} tipTestId={tid.head.tip(`aloc-${kind}`)}
      actions={<>
        <Button testId={tid.dims.back} kind="ghost" small onClick={onBack}>‹ All master data</Button>
        <Button testId={tid.dims.add} kind="primary" small onClick={() => setForm({})}>New {DIMENSIONS[kind].singular}</Button><GuideButton view="aloc" /></>} />
    {list.isPending && <p className="text-text-secondary">Loading&hellip;</p>}
    {list.isError && <p data-testid={tid.dims.error} role="alert" className="text-err">This list could not be loaded, so nothing here is current. Reload the page.</p>}
    {list.data && list.data.length > 0 && (
      <Table data-testid={tid.dims.table} variant="records" dense>
        <TableHeader><TableRow>
          {cols.map(c => <TableHead key={c.key} className={c.kind === 'number' ? 'text-right' : undefined}>{c.label}</TableHead>)}
          {withTasks && <TableHead className="text-right">Tasks</TableHead>}
          <TableHead className="text-right">In use</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{list.data.map(r => {
          const tasks = tasksOf(r), isOpen = opened === r.code;
          return (<Fragment key={r.id}>
          <Row testId={tid.dims.row(r.code)}>
            {cols.map((c, i) => <TableCell key={c.key} kind={i === 0 ? 'title' : undefined} label={c.label}
              className={c.kind === 'number' ? 'text-right tabular-nums' : c.code ? 'tabular-nums' : undefined}>{cell(r, c.key, c.kind)}</TableCell>)}
            {withTasks && <TableCell label="Tasks" className="text-right max-md:text-left">{tasks?.length
              ? <Button testId={tid.dims.tasks(r.code)} kind="link" aria-expanded={isOpen} onClick={() => setOpened(isOpen ? null : r.code)}>
                {tasks.length} task{tasks.length === 1 ? '' : 's'}</Button>
              : <span className="text-text-muted">None</span>}</TableCell>}
            <TableCell label="In use" className="text-right tabular-nums max-md:text-left">{r.inUse}</TableCell>
            <TableCell kind="foot" className="text-right"><Button testId={tid.dims.edit(r.code)} kind="ghost" small onClick={() => setForm({ row: r })}>Edit</Button></TableCell>
          </Row>
          {isOpen && tasks && <TableRow data-testid={tid.dims.taskList(r.code)} className="bg-surface-tint hover:bg-surface-tint">
            <TableCell colSpan={cols.length + 3}>
              <ul aria-label={`Tasks on ${r.name}`} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-x-lg gap-y-xs py-xs text-sm">
                {tasks.map(t => <li key={t} className="break-words">{t}</li>)}</ul>
              <Small>Tasks are kept on the project's job in Business Central, and a timesheet line names one.</Small>
            </TableCell></TableRow>}
          </Fragment>);
        })}</TableBody>
      </Table>)}
    {list.data?.length === 0 && <Card><Empty testId={tid.dims.empty}>Nothing here yet.</Empty></Card>}
    <Small>In use counts {spec.usedAs}. An entry that is in use cannot be removed.</Small>
    {form && <DimensionForm key={editing ? versionKey(editing) : 'new'} kind={kind} row={editing} onClose={() => setForm(null)} />}
  </>);
}
