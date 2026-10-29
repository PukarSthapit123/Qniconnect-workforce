import { useState, type ReactNode } from 'react';
import { Download, Eye } from 'lucide-react';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Banner, Button, Card, Page, PageHead, Pill, toastRefusal } from '@/ui';
import { PdfPreview } from '@/ui/PdfPreview';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { useBcEnvironment, usePortal } from '@/shell/SessionProvider';
import { PayrollHidden, useOwnPayroll } from '@/shell/OwnPayroll';
import { fetchPayslipPdf, useDashboard, type DashboardPerson } from '@/api/bc/payroll';
import type { Payslip } from '@/contract/bc/payroll';
import { firstWord, formatPortalDate, payslipFileName, pdfBytes, portalInitials, pounds } from '@/domain/payroll';
import { downloadPdf } from '@/lib/download';
import { logger } from '@/lib/logger';

/* Home: QniConnect's payslip dashboard (docs/superpowers/inventory/portal.md,
   HOME), on the design system. The welcome (HOME.R12), who you are (R13),
   the latest payslip, tax and contact cards (R14 to R16), and the six most
   recent payslips, each one to view or save as a PDF (R18 to R22).
   The data is loaded in QniConnect's order (src/api/bc/payroll.ts). A
   profile that cannot be read leaves the page in its blanks, as QniConnect
   did (HOME.R9), and now says so, as a PDF that cannot be had does (R20):
   QniConnect stayed silent (Ruling Q2's "upgrade, don't downgrade"). */
/* While looking at the app as someone else, the payroll here would be the
   signed-in account's own, so it is not asked for (final review I1). */
export function HomePage() {
  if (!useOwnPayroll()) return (
    <Page testId={tid.page('home')}>
      <PageHead title="Welcome back" tip="Here's what's happening with your payroll." tipTestId={tid.home.tip} />
      <PayrollHidden />
    </Page>);
  return <OwnHome />;
}

function OwnHome() {
  const portal = usePortal(), environment = useBcEnvironment();
  const user = portal.user ? { name: portal.user.name, email: portal.user.email } : null;
  /* without a user and an environment nothing is asked, and it stays loading (HOME.R3) */
  const q = useDashboard(user, environment);
  const person = q.data?.person ?? null;
  const failed = q.isError || (q.isSuccess && !person);
  return (
    <Page testId={tid.page('home')}>
      <PageHead title={`Welcome back${person?.name ? `, ${firstWord(person.name)}` : ''}`}
        tip="Here's what's happening with your payroll." tipTestId={tid.home.tip} />
      {q.isPending
        ? <p data-testid={tid.home.loading} role="status" className="text-text-secondary">Loading your payroll&hellip;</p>
        : <>
          {failed && <Banner testId={tid.home.failed} tone="err" title="Your payroll details could not be loaded.">
            Reload the page to try again. If it keeps happening, ask your payroll administrator.</Banner>}
          <Dashboard person={person} payslips={q.data?.payslips ?? []} />
        </>}
    </Page>);
}

function Dashboard({ person, payslips }: { person: DashboardPerson | null; payslips: Payslip[] }) {
  const latest = payslips[0];
  return (
    <>
      <Summary person={person} />
      <div className="mb-md grid gap-md md:grid-cols-3">
        <Panel label="Latest payslip" testId={tid.home.latest}>
          {latest ? <>
            <p data-testid={tid.home.latestNet} className="text-2xl font-semibold tabular-nums">{pounds(latest.netPay)}</p>
            <p data-testid={tid.home.latestPeriod} className="mt-sm text-sm text-text-secondary">Period: {latest.period ?? ''}</p>
            <p data-testid={tid.home.latestPaid} className="text-sm text-text-secondary">Paid on: {formatPortalDate(latest.payDate)}</p>
          </> : <p data-testid={tid.home.latestEmpty} className="text-sm text-text-secondary">No payslips found</p>}
        </Panel>
        <Panel label="Tax information" testId={tid.home.tax}>
          <p data-testid={tid.home.taxCode} className="text-lg font-semibold tabular-nums">Tax code: {person?.taxCode}</p>
          <p data-testid={tid.home.niNumber} className="mt-sm text-sm text-text-secondary">NI number: {person?.niNumber}</p>
          <p data-testid={tid.home.niCategory} className="text-sm text-text-secondary">NI category: {person?.niCategory}</p>
        </Panel>
        <Panel label="Contact information" testId={tid.home.contact}>
          <dl className="grid gap-sm">
            <Line label="Email" testId={tid.home.email}>{person?.email}</Line>
            <Line label="Phone" testId={tid.home.phone}>{person?.phone}</Line>
            <Line label="Address" testId={tid.home.address}>{person && <Address p={person} />}</Line>
          </dl>
        </Panel>
      </div>
      <Payslips payslips={payslips} />
    </>);
}

/* HOME.R13: the initials, the name, "{position} • {department}" (the bullet
   only with a department: QniConnect printed it after an empty one, Ruling
   Q2), and three tags. */
function Summary({ person }: { person: DashboardPerson | null }) {
  const name = person?.name ?? '';
  const letters = portalInitials(name);
  return (
    <Card testId={tid.home.summary} className="flex items-center gap-lg max-md:items-start">
      <span data-testid={tid.home.avatar} aria-hidden="true"
        className={cn('grid size-16 shrink-0 place-items-center overflow-hidden rounded-pill bg-brand-subtle font-bold whitespace-nowrap text-brand dark:text-brand-accent max-md:size-12',
          letters.length > 3 ? 'text-sm max-md:text-xs' : 'text-xl max-md:text-base')}>
        {letters}</span>
      <div className="min-w-0">
        <h2 data-testid={tid.home.name} className="text-lg">{name}</h2>
        <p data-testid={tid.home.role} className="text-sm text-text-secondary">
          {person?.position}{person?.department ? ` • ${person.department}` : ''}</p>
        <div className="mt-md flex flex-wrap gap-sm">
          <Pill testId={tid.home.employeeId} tone="neu">Employee ID: {person?.employeeId}</Pill>
          <Pill testId={tid.home.joined} tone="neu">Joined: {formatPortalDate(person?.joinDate)}</Pill>
          <Pill testId={tid.home.frequency} tone="neu">{person?.payFrequency} pay</Pill>
        </div>
      </div>
    </Card>);
}

/* One of the three cards: its name in sentence weight, not capitals (headings are never shouted), over its content. */
function Panel({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="min-w-0 rounded-card border bg-surface-card p-lg">
      <h2 className="mb-sm text-sm font-semibold text-text-secondary">{label}</h2>
      {children}
    </section>);
}
/* a long address wraps where it must rather than being cut off: there is no
   native title to show the rest */
function Line({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd data-testid={testId} className="text-sm font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>);
}
/* HOME.R16: the address, ", {address2}" unless it is N/A, then lines 3 and
   4 and the town and postcode, each on its own line when there is one. */
function Address({ p }: { p: DashboardPerson }) {
  const town = [p.city, p.postCode].filter(Boolean).join(', ');
  return <>
    {p.address}{p.address2 && p.address2 !== 'N/A' && <>, {p.address2}</>}
    {p.addressLine3 && <><br />{p.addressLine3}</>}
    {p.addressLine4 && <><br />{p.addressLine4}</>}
    {town && <><br />{town}</>}
  </>;
}

const ROWS = 6;
type Action = 'view' | 'download';
const MONEY = 'text-right max-md:text-left';
/* HOME.R18 to HOME.R22: always six rows, the first six payslips in the
   order the server sent them and a dash row for each one missing (on a phone
   the dash rows are left out, as each payslip is its own card there). One
   PDF at a time: while it is fetched every row's buttons wait (HOME.R20). */
function Payslips({ payslips }: { payslips: Payslip[] }) {
  const [busy, setBusy] = useState<{ row: number; action: Action } | null>(null);
  const on = (row: number, action: Action) => busy?.row === row && busy.action === action;
  const [preview, setPreview] = useState<{ open: boolean; data: string; title: string }>({ open: false, data: '', title: '' });
  const act = async (slip: Payslip, row: number, action: Action) => {
    if (!slip.systemId) { logger.warn('This payslip has no systemId, so its PDF cannot be asked for.'); return; }
    setBusy({ row, action });
    try {
      const data = await fetchPayslipPdf(slip.systemId);
      const period = slip.period ?? '';
      if (action === 'view') setPreview({ open: true, data, title: `Payslip - ${period}` });
      else if (!downloadPdf(payslipFileName(period), () => pdfBytes(data))) throw new Error('The PDF could not be saved.');
    } catch (e) {
      logger.error(`Error ${action === 'view' ? 'viewing' : 'downloading'} payslip PDF:`, e);
      toastRefusal({ message: `The payslip for ${slip.period ?? 'this period'} could not be ${action === 'view' ? 'opened' : 'saved'}.`,
        next: 'Try again in a moment. If it keeps happening, ask your payroll administrator.' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="home-payslips-head">
      <h2 id="home-payslips-head" className="mb-sm text-sm font-semibold">Recent payslips</h2>
      <Table data-testid={tid.home.payslips} variant="records">
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead><TableHead>Pay date</TableHead>
            <TableHead className="text-right">Gross pay</TableHead><TableHead className="text-right">Tax</TableHead>
            <TableHead className="text-right">Net pay</TableHead><TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: ROWS }, (_, row) => {
            const slip = payslips[row];
            if (!slip) return (
              <TableRow key={`none-${row}`} data-testid={tid.home.placeholder(row)} className="text-text-muted max-md:hidden">
                {[0, 1, 2, 3, 4, 5].map(c => <TableCell key={c} className={cn(c >= 2 && c <= 4 && 'text-right', c === 5 && 'text-center')}>—</TableCell>)}
              </TableRow>);
            const label = slip.period ? `payslip for ${slip.period}` : 'payslip';
            return (
              <TableRow key={slip.id ?? `row-${row}`} data-testid={tid.home.payslip(row)}>
                <TableCell kind="title" className="font-medium">{slip.period}</TableCell>
                <TableCell label="Pay date">{formatPortalDate(slip.payDate)}</TableCell>
                <TableCell label="Gross pay" className={MONEY}>{pounds(slip.grossPay)}</TableCell>
                <TableCell label="Tax" className={MONEY}>{pounds(slip.taxPaid)}</TableCell>
                <TableCell label="Net pay" className={cn(MONEY, 'font-semibold')}>{pounds(slip.netPay)}</TableCell>
                <TableCell kind="foot">
                  <div className="flex items-center justify-center gap-sm max-md:justify-start">
                    <Button testId={tid.home.view(row)} small kind="ghost" aria-label={`View ${label}`}
                      disabled={!!busy && !on(row, 'view')} pending={on(row, 'view')} onClick={() => void act(slip, row, 'view')}>
                      {!on(row, 'view') && <Eye aria-hidden="true" />}View</Button>
                    <Button testId={tid.home.download(row)} small kind="ghost" aria-label={`Download ${label}`}
                      disabled={!!busy && !on(row, 'download')} pending={on(row, 'download')} onClick={() => void act(slip, row, 'download')}>
                      {!on(row, 'download') && <Download aria-hidden="true" />}Download</Button>
                  </div>
                </TableCell>
              </TableRow>);
          })}
        </TableBody>
      </Table>
      <PdfPreview open={preview.open} onClose={() => setPreview(p => ({ ...p, open: false }))} pdfData={preview.data} title={preview.title} />
    </section>);
}
