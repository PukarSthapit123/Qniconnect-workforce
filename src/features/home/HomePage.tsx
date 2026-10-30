import { useState, type ReactNode } from 'react';
import { Download, FileText } from 'lucide-react';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Banner, Button, Fact, Lead, LEAD_PRIMARY, LEAD_SECONDARY, Masked, Page, PageHead, PayMaskEye, toastRefusal, usePayMask, type PayMask } from '@/ui';
import { PdfPreview } from '@/ui/PdfPreview';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { useBcEnvironment, usePortal } from '@/shell/SessionProvider';
import { PayrollHidden, useOwnPayroll } from '@/shell/OwnPayroll';
import { fetchPayslipPdf, useDashboard, type DashboardPerson } from '@/api/bc/payroll';
import type { Payslip } from '@/contract/bc/payroll';
import { firstWord, formatPortalDate, payslipFileName, pdfBytes, portalInitials, pounds } from '@/domain/payroll';
import { downloadPdf } from '@/lib/download';
import { logger } from '@/lib/logger';
import { TodayStrip } from './TodayStrip';

/* Home: QniConnect's payslip dashboard (docs/superpowers/inventory/portal.md,
   HOME), on the design system. The welcome (HOME.R12), the latest payslip
   leading (R14), who you are with the tax and contact details (R13, R15,
   R16), and the six most recent payslips, each one to view or save as a PDF
   (R18 to R22); laid out per Ruling Q19, with the Today strip (D2).
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

/* Ruling Q19 (taste review 2026-10-26): Home answers "was I paid, and is
   there anything I need to do?", so the latest payslip leads, with its own
   View and Download, and the Today strip (D2) sits over it. Who you are, the
   tax and the contact details (HOME.R13, R15, R16) fold into one card of
   label and value rows beside it. From xl the page is two columns, the
   payslips on the left; below xl it is one, and the payslip list comes
   before the profile card, so a phone reaches it first. Every HOME row's
   content is kept; only the layout and the labels' form changed. */
function Dashboard({ person, payslips }: { person: DashboardPerson | null; payslips: Payslip[] }) {
  const pdf = usePayslipPdf();
  /* every amount on the page starts hidden; the lead's eye shows them all (ui/PayMask) */
  const mask = usePayMask();
  return (
    <>
      <div className="grid items-start gap-md xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <TodayStrip />
          <Latest latest={payslips[0]} pdf={pdf} mask={mask} />
          <Payslips payslips={payslips} pdf={pdf} mask={mask} />
        </div>
        <AboutYou person={person} />
      </div>
      <PdfPreview open={pdf.preview.open} onClose={pdf.closePreview} pdfData={pdf.preview.data} title={pdf.preview.title} />
    </>);
}

/* HOME.R14 as the lead block, on the dark lead surface (ui/Lead): net pay at
   the page's largest figure size in the accent, named once, then the period
   and pay date in QniConnect's words, then what it came from: gross and tax.
   Net is not repeated on that line, and the three are not written as a sum:
   National Insurance and other deductions sit between them and are not on
   the payslip summary. */
function Latest({ latest, pdf, mask }: { latest: Payslip | undefined; pdf: PayslipPdf; mask: PayMask }) {
  const label = latest?.period ? `latest payslip, for ${latest.period}` : 'latest payslip';
  return (
    <Lead testId={tid.home.latest} labelledBy="home-latest-head">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0">
          <h2 id="home-latest-head" className="text-sm font-semibold text-shell-ink-muted">Latest payslip</h2>
          {latest ? <>
            {/* the eye sits beside the figure it hides; it shows or hides every amount on the page */}
            <div className="mt-xs flex flex-wrap items-baseline gap-x-sm">
              <span data-testid={tid.home.latestNet} className="text-(length:--qp-text-30) leading-(--qp-lh-30) font-semibold text-brand-accent tabular-nums"><Masked shown={mask.shown}>{pounds(latest.netPay)}</Masked></span>
              <span className="text-sm text-shell-ink">net pay</span>
              <PayMaskEye testId={tid.home.mask} mask={mask} /></div>
            <p className="mt-xs text-sm text-shell-ink">
              <span data-testid={tid.home.latestPeriod}>Period: {latest.period ?? ''}</span><span aria-hidden="true"> · </span>
              <span data-testid={tid.home.latestPaid}>Paid on: {formatPortalDate(latest.payDate)}</span></p>
            <p data-testid={tid.home.latestLine} className="mt-sm text-sm text-shell-ink tabular-nums">
              Gross <b className="font-semibold text-text-on-inverse"><Masked shown={mask.shown}>{pounds(latest.grossPay)}</Masked></b><span aria-hidden="true"> · </span>
              Tax <b className="font-semibold text-text-on-inverse"><Masked shown={mask.shown}>{pounds(latest.taxPaid)}</Masked></b></p>
          </> : <p data-testid={tid.home.latestEmpty} className="mt-xs text-sm text-shell-ink">No payslips found</p>}
        </div>
        {latest && <PdfButtons pdf={pdf} slip={latest} at="latest" label={label} view={tid.home.latestView} download={tid.home.latestDownload} onLead />}
      </div>
    </Lead>);
}

/* HOME.R13, R15 and R16 in one card: the initials, the name and
   "{position} • {department}" (the bullet only with a department:
   QniConnect printed it after an empty one, Ruling Q2), then three groups
   of rows. Below xl, where the card spans the page, the groups sit side by
   side. */
function AboutYou({ person }: { person: DashboardPerson | null }) {
  const name = person?.name ?? '';
  const letters = portalInitials(name);
  return (
    <section data-testid={tid.home.summary} aria-labelledby="home-name" className="mb-md min-w-0 rounded-card border bg-surface-card px-xl py-lg max-md:p-lg">
      <div className="flex items-center gap-md">
        <span data-testid={tid.home.avatar} aria-hidden="true"
          className={cn('grid size-12 shrink-0 place-items-center overflow-hidden rounded-pill bg-brand-subtle font-bold whitespace-nowrap text-brand dark:text-brand-accent',
            letters.length > 3 ? 'text-xs' : 'text-base')}>
          {letters}</span>
        <div className="min-w-0">
          <h2 id="home-name" data-testid={tid.home.name} className="text-base">{name}</h2>
          <p data-testid={tid.home.role} className="text-sm text-text-secondary">
            {person?.position}{person?.department ? ` • ${person.department}` : ''}</p>
        </div>
      </div>
      {/* side by side, the contact group is the widest: an email address needs the room */}
      <div className="mt-md grid gap-x-xl gap-y-md md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] xl:grid-cols-1">
        <Group title="Employment">
          <Fact label="Employee ID" testId={tid.home.employeeId}>{person?.employeeId}</Fact>
          <Fact label="Joined" testId={tid.home.joined}>{formatPortalDate(person?.joinDate)}</Fact>
          <Fact label="Pay frequency" testId={tid.home.frequency}>{person?.payFrequency}</Fact>
        </Group>
        <Group title="Tax information" testId={tid.home.tax}>
          <Fact label="Tax code" testId={tid.home.taxCode}>{person?.taxCode}</Fact>
          <Fact label="NI number" testId={tid.home.niNumber}>{person?.niNumber}</Fact>
          <Fact label="NI category" testId={tid.home.niCategory}>{person?.niCategory}</Fact>
        </Group>
        <Group title="Contact information" testId={tid.home.contact}>
          {/* a long address or email wraps where it must rather than being
              cut off: there is no native title to show the rest */}
          <Fact label="Email"><span data-testid={tid.home.email} className="[overflow-wrap:anywhere]"><Email address={person?.email ?? ''} /></span></Fact>
          <Fact label="Phone" testId={tid.home.phone}>{person?.phone}</Fact>
          <Fact label="Address"><span data-testid={tid.home.address} className="[overflow-wrap:anywhere]">{person && <Address p={person} />}</span></Fact>
        </Group>
      </div>
    </section>);
}

/* an address that must wrap breaks after the @ first, not mid-word */
function Email({ address }: { address: string }) {
  const at = address.indexOf('@');
  return at < 0 ? <>{address}</> : <>{address.slice(0, at + 1)}<wbr />{address.slice(at + 1)}</>;
}

/* a group's name in sentence weight, not capitals (headings are never shouted) */
function Group({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  return (
    <div data-testid={testId} className="min-w-0">
      <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
      {children}
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
/* a table row, or the lead block's own buttons */
type At = number | 'latest';
const MONEY = 'text-right max-md:text-left';

/* HOME.R20 to HOME.R22, shared by the lead block and the table: one PDF at a
   time, so while it is fetched every View and Download on the page waits. */
function usePayslipPdf() {
  const [busy, setBusy] = useState<{ at: At; action: Action } | null>(null);
  const [preview, setPreview] = useState<{ open: boolean; data: string; title: string }>({ open: false, data: '', title: '' });
  const act = async (slip: Payslip, at: At, action: Action) => {
    if (!slip.systemId) { logger.warn('This payslip has no systemId, so its PDF cannot be asked for.'); return; }
    setBusy({ at, action });
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
  return {
    busy: busy !== null, on: (at: At, action: Action) => busy?.at === at && busy.action === action,
    act: (slip: Payslip, at: At, action: Action) => void act(slip, at, action),
    preview, closePreview: () => setPreview(p => ({ ...p, open: false })),
  };
}
type PayslipPdf = ReturnType<typeof usePayslipPdf>;

/* `onLead`: on the dark lead block, View is its one primary, in the accent,
   and Download is translucent white (ui/Lead) */
function PdfButtons({ pdf, slip, at, label, view, download, className, onLead }: {
  pdf: PayslipPdf; slip: Payslip; at: At; label: string; view: string; download: string; className?: string; onLead?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-sm', className)}>
      <Button testId={view} small kind={onLead ? 'primary' : 'ghost'} className={onLead ? LEAD_PRIMARY : undefined} aria-label={`View ${label}`}
        disabled={pdf.busy && !pdf.on(at, 'view')} pending={pdf.on(at, 'view')} onClick={() => pdf.act(slip, at, 'view')}>
        {!pdf.on(at, 'view') && <FileText aria-hidden="true" />}View</Button>
      <Button testId={download} small kind="ghost" className={onLead ? LEAD_SECONDARY : undefined} aria-label={`Download ${label}`}
        disabled={pdf.busy && !pdf.on(at, 'download')} pending={pdf.on(at, 'download')} onClick={() => pdf.act(slip, at, 'download')}>
        {!pdf.on(at, 'download') && <Download aria-hidden="true" />}Download</Button>
    </div>);
}

/* HOME.R18 to HOME.R22: always six rows, the first six payslips in the
   order the server sent them and a dash row for each one missing (on a phone
   the dash rows are left out, as each payslip is its own card there). */
function Payslips({ payslips, pdf, mask }: { payslips: Payslip[]; pdf: PayslipPdf; mask: PayMask }) {
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
                <TableCell label="Gross pay" className={MONEY}><Masked shown={mask.shown}>{pounds(slip.grossPay)}</Masked></TableCell>
                <TableCell label="Tax" className={MONEY}><Masked shown={mask.shown}>{pounds(slip.taxPaid)}</Masked></TableCell>
                <TableCell label="Net pay" className={cn(MONEY, 'font-semibold')}><Masked shown={mask.shown}>{pounds(slip.netPay)}</Masked></TableCell>
                <TableCell kind="foot">
                  <PdfButtons pdf={pdf} slip={slip} at={row} label={label} view={tid.home.view(row)} download={tid.home.download(row)}
                    className="justify-center max-md:justify-start" />
                </TableCell>
              </TableRow>);
          })}
        </TableBody>
      </Table>
    </section>);
}
