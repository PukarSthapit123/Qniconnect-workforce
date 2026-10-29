import { useState, type ReactNode } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Banner, Button, Card, CardHead, Empty, GuideButton, Page, PageHead, SelectBox, Small, Tip } from '@/ui';
import { PdfPreview } from '@/ui/PdfPreview';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { ApiError } from '@/api/client';
import { useMyDocuments, type MyDocuments } from '@/api/home';
import { useBcEnvironment, usePortal } from '@/shell/SessionProvider';
import { PayrollHidden, useOwnPayroll } from '@/shell/OwnPayroll';
import { fetchPayslipPdf } from '@/api/bc/payroll';
import { DEFAULT_ERROR, employeeGuid, fetchFiscalYears, fetchTaxDocument, useDocuments, type DocumentsData, type Outcome } from '@/api/bc/documents';
import type { FiscalYear } from '@/contract/bc/documents';
import type { Payslip } from '@/contract/bc/payroll';
import { formatPortalDate, payslipFileName, pdfBytes, pounds } from '@/domain/payroll';
import { payslipsIn, taxDocumentFileName, taxDocumentTitle, yearLabel, type TaxDocType, type TaxDocument } from '@/domain/documents';
import { formatDmy } from '@/domain/time';
import { downloadPdf } from '@/lib/download';
import { logger } from '@/lib/logger';
import { FiscalYearDialog } from './FiscalYearDialog';

/* Documents, merged (spec section 7): QniConnect's payslips, with their PDFs,
   and its tax documents by fiscal year (docs/superpowers/inventory/portal.md,
   DOCS, PDF and FYM) fill the payroll slot Workforce marked "Not yet
   connected"; Workforce's own documents sit under them, as they were.
   QniConnect's two tabs are two sections here, so both are in view at once:
   the year filter belongs to the payslips (DOCS.R8) and a tax document's
   year is chosen in its dialog (DOCS.R13). A document that cannot be had is
   said in one banner over the page, until it is dismissed or the next
   document is asked for (DOCS error state, DOCS.R11 to DOCS.R16). */
export function DocumentsPage() {
  const wf = useMyDocuments();
  const d = wf.data;
  const [banner, setBanner] = useState<string | null>(null);
  /* the payroll is the signed-in account's own, so not while viewing as someone else (final review I1) */
  const own = useOwnPayroll();
  return (
    <Page testId={tid.page('docs')}>
      <PageHead title="Documents" crumb={d ? `My work · Documents · ${d.employee.name}` : 'My work · Documents'}
        tip="Access and manage your employment documents." tipTestId={tid.docs.headTip} actions={<GuideButton view="docs" />} />
      {/* a refusal is brought into view: on a phone the page is long, and the banner is at its top */}
      {banner && <div key={banner} ref={el => { el?.scrollIntoView?.({ block: 'nearest' }); }}><Banner testId={tid.docs.banner} tone="warn" title="Document not available"
        actions={<Button testId={tid.docs.bannerDismiss} small kind="ghost" aria-label="Dismiss" onClick={() => setBanner(null)}>Dismiss</Button>}>
        <span role="alert">{banner}</span>
        <span data-testid={tid.docs.bannerNext} className="block">Try again in a moment. If it keeps happening, ask your payroll administrator.</span></Banner></div>}
      {own ? <Payroll say={setBanner} /> : <PayrollHidden />}
      <WorkforceDocuments q={wf} />
    </Page>);
}

type Action = 'view' | 'download';
type Say = (message: string | null) => void;

function Payroll({ say }: { say: Say }) {
  const portal = usePortal(), environment = useBcEnvironment();
  const user = portal.user ? { name: portal.user.name, email: portal.user.email } : null;
  /* without a user and an environment nothing is asked, and the page shows its empty sections (DOCS states) */
  const q = useDocuments(user, environment);
  const data = q.data;
  /* DOCS.R4: each load starts on its first pick; then the year is the one chosen */
  const [pick, setPick] = useState<{ of: DocumentsData | undefined; year: string | null } | null>(null);
  const year = pick && pick.of === data ? pick.year : (data?.firstYear ?? null);

  /* one document at a time: while one is fetched, every row's buttons wait (DOCS.R21) */
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ open: boolean; data: string; title: string }>({ open: false, data: '', title: '' });
  const [dialog, setDialog] = useState<{ open: boolean; doc: TaxDocument | null; action: Action; guid: string; years: FiscalYear[]; loading: boolean }>(
    { open: false, doc: null, action: 'view', guid: '', years: [], loading: false });

  const show = (pdf: string, title: string) => setPreview({ open: true, data: pdf, title });
  const save = (name: string, pdf: string) => { if (!downloadPdf(name, () => pdfBytes(pdf))) throw new Error('The PDF could not be saved.'); };

  /* DOCS.R12, DOCS.R19, DOCS.R20: a payslip's PDF */
  const payslip = async (slip: Payslip, key: string, action: Action) => {
    say(null);
    setBusy(key);
    try {
      if (!slip.systemId) { say('Payslip ID is missing'); return; }
      let pdf: string;
      try { pdf = await fetchPayslipPdf(slip.systemId); } catch (e) {
        logger.error('Error retrieving payslip PDF:', e);
        say((e instanceof Error && e.message) || 'Failed to retrieve payslip');
        return;
      }
      const period = slip.period ?? '';
      if (action === 'view') show(pdf, `Payslip - ${period}`);
      else save(payslipFileName(period), pdf);
    } catch (e) {
      logger.error('Error in document handling:', e);
      say(DEFAULT_ERROR);
    } finally {
      setBusy(null);
    }
  };

  /* DOCS.R16: a tax document as it came back: shown, saved, or said */
  const deliver = (r: Outcome<string, null>, type: TaxDocType, action: Action, year?: string) => {
    if (!r.success || !r.data) { say(r.error || `Failed to retrieve ${type} document`); return; }
    if (action === 'view') show(r.data, taxDocumentTitle(type, year));
    else save(taxDocumentFileName(type, year), r.data);
  };

  /* DOCS.R13, DOCS.R14: P60 and P11D ask for their year first, from the
     fiscal years read again each time; P45 has none (Ruling Q4). */
  const taxDocument = async (doc: TaxDocument, action: Action) => {
    say(null);
    const guid = employeeGuid();
    if (!guid) { say('Employee GUID is required but not available'); return; }
    if (doc.byYear) {
      setDialog({ open: true, doc, action, guid, years: [], loading: true });
      const r = await fetchFiscalYears();
      if (!r.success) say(`Failed to load fiscal years: ${r.error}`);
      setDialog(s => ({ ...s, years: r.data, loading: false }));
      return;
    }
    setBusy(`tax-${doc.type}-${action}`);
    try { deliver(await fetchTaxDocument(doc.type, guid), doc.type, action); } catch (e) {
      logger.error('Error in document handling:', e);
      say(`Failed to process ${doc.type} document`);
    } finally {
      setBusy(null);
    }
  };

  /* DOCS.R16, DOCS.R17: the year chosen, the dialog closes at once and the document is fetched */
  const chosen = async (fy: FiscalYear) => {
    const { doc, action, guid } = dialog;
    if (!doc) return;
    const taxYear = fy.fiscalYear ?? '';
    setBusy(`tax-${doc.type}-${action}`);
    try { deliver(await fetchTaxDocument(doc.type, guid, taxYear), doc.type, action, taxYear); } catch (e) {
      logger.error('Error processing fiscal year selection:', e);
      say(`Failed to process ${doc.type} document`);
    } finally {
      setBusy(null);
    }
  };

  const loading = q.isPending && q.fetchStatus !== 'idle';
  const payslips = payslipsIn(data?.payslips ?? [], year);
  return (
    <>
      {loading
        ? <p data-testid={tid.docs.payLoading} role="status" className="mb-md text-text-secondary">Loading your payslips and tax documents&hellip;</p>
        : <>
          <Section id="docs-payslips-head" title="Payslips" actions={<YearFilter data={data} year={year} onPick={y => setPick({ of: data, year: y })} />}>
            {payslips.length
              ? <PayslipTable payslips={payslips} busy={busy} onAct={(slip, row, action) => void payslip(slip, `payslip-${row}-${action}`, action)} />
              : <Card testId={tid.docs.payslipsEmpty}><Nothing title="No payslips found">
                No payslips are available for the selected fiscal year. Try selecting a different year or contact your administrator.</Nothing></Card>}
          </Section>
          <Section id="docs-tax-head" title="Tax documents">
            {data?.profileFailed && <Banner testId={tid.docs.taxFailed} tone="err" title="Your tax documents could not be loaded.">
              Reload the page to try again. If it keeps happening, ask your payroll administrator.</Banner>}
            {data?.taxDocuments.length
              ? <TaxTable docs={data.taxDocuments} busy={busy} onAct={(doc, action) => void taxDocument(doc, action)} />
              : <Card testId={tid.docs.taxEmpty}><Nothing title="No tax documents found">
                No tax documents are available for the selected year. Tax documents like P60s are typically issued annually at the end of the tax year, and P45s when you leave employment.</Nothing></Card>}
          </Section>
        </>}
      <Card testId={tid.docs.secure}>
        <h2 className="mb-xs text-sm font-semibold">Secure access to payroll documents</h2>
        <Small className="max-w-[75ch]">This portal provides controlled and secure access to your payslips, tax forms, and other payroll-related documents. Files are not stored within the portal itself but are securely retrieved in real time from Dynamics 365 Business Central. Access is restricted to authorized users, and all data transmission adheres to GDPR and data protection standards, including encryption in transit.</Small>
      </Card>
      <PdfPreview open={preview.open} onClose={() => setPreview(p => ({ ...p, open: false }))} pdfData={preview.data} title={preview.title} />
      <FiscalYearDialog open={dialog.open} loading={dialog.loading} years={dialog.years} type={dialog.doc?.type ?? null}
        onClose={() => setDialog(s => ({ ...s, open: false }))} onSelect={fy => void chosen(fy)} />
    </>);
}

function Section({ id, title, actions, children }: { id: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-lg">
      <div className="mb-sm flex flex-wrap items-center gap-sm">
        <h2 id={id} className="text-sm font-semibold">{title}</h2>
        {actions && <div className="ml-auto flex items-center gap-sm">{actions}</div>}
      </div>
      {children}
    </section>);
}
function Nothing({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Empty>
      <FileText aria-hidden="true" className="mx-auto mb-sm size-8 text-text-muted" />
      <span className="block font-semibold text-text-secondary">{title}</span>
      <span className="mx-auto mt-xs block max-w-[52ch]">{children}</span>
    </Empty>);
}

/* DOCS.R8: the payslips' year, "(Active)" after the open one. With no years
   yet it says so rather than "Loading..." for good (Ruling Q2). There is no
   "All": with no years every payslip is shown (DOCS.R5). */
function YearFilter({ data, year, onPick }: { data: DocumentsData | undefined; year: string | null; onPick: (y: string | null) => void }) {
  const options = (data?.years ?? []).map(o => ({ value: o.fiscalYear, label: yearLabel(o) }));
  return (
    <>
      <label htmlFor="docs-year" className="text-xs text-text-muted">Fiscal year</label>
      <SelectBox testId={tid.docs.year} id="docs-year" look="filter" options={options} value={year ?? ''} disabled={options.length === 0}
        placeholder={data ? 'No fiscal years' : 'Loading…'} onValueChange={v => onPick(v || null)} />
    </>);
}

const MONEY = 'text-right max-md:text-left';
/* DOCS.R9: the payslips of the year, in the order the server sent them. Pay
   date is the expected payment date, else the pay date; tax is taxAmount,
   else taxPaid. */
function PayslipTable({ payslips, busy, onAct }: { payslips: Payslip[]; busy: string | null; onAct: (slip: Payslip, row: number, action: Action) => void }) {
  return (
    <Table data-testid={tid.docs.payslips} variant="records">
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead><TableHead>Pay date</TableHead>
          <TableHead className="text-right">Gross pay</TableHead><TableHead className="text-right">Tax</TableHead>
          <TableHead className="text-right">Net pay</TableHead><TableHead className="text-center">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payslips.map((slip, row) => {
          const label = slip.period ? `payslip for ${slip.period}` : 'payslip';
          return (
            <TableRow key={`${String(slip.id ?? '')}-${row}`} data-testid={tid.docs.payslip(row)}>
              <TableCell kind="title" className="font-medium">{slip.period}</TableCell>
              <TableCell label="Pay date">{formatPortalDate(slip.expectedPaymentDate || slip.payDate)}</TableCell>
              <TableCell label="Gross pay" className={MONEY}>{pounds(slip.grossPay)}</TableCell>
              <TableCell label="Tax" className={MONEY}>{pounds(slip.taxAmount ?? slip.taxPaid ?? 0)}</TableCell>
              <TableCell label="Net pay" className={cn(MONEY, 'font-semibold')}>{pounds(slip.netPay)}</TableCell>
              <TableCell kind="foot">
                <Actions busy={busy} keyOf={a => `payslip-${row}-${a}`} label={label}
                  viewId={tid.docs.payslipView(row)} downloadId={tid.docs.payslipDownload(row)} onAct={a => onAct(slip, row, a)} />
              </TableCell>
            </TableRow>);
        })}
      </TableBody>
    </Table>);
}

/* DOCS.R10: each tax document there is, and what it is */
function TaxTable({ docs, busy, onAct }: { docs: TaxDocument[]; busy: string | null; onAct: (doc: TaxDocument, action: Action) => void }) {
  return (
    <Table data-testid={tid.docs.tax} variant="records">
      <TableHeader>
        <TableRow><TableHead>Document type</TableHead><TableHead>Description</TableHead><TableHead className="text-center">Actions</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {docs.map(doc => (
          <TableRow key={doc.type} data-testid={tid.docs.taxRow(doc.type)}>
            <TableCell kind="title" className="font-medium">{doc.type}</TableCell>
            <TableCell label="Description">{doc.description}</TableCell>
            <TableCell kind="foot">
              <Actions busy={busy} keyOf={a => `tax-${doc.type}-${a}`} label={doc.type}
                viewId={tid.docs.taxView(doc.type)} downloadId={tid.docs.taxDownload(doc.type)} onAct={a => onAct(doc, a)} />
            </TableCell>
          </TableRow>))}
      </TableBody>
    </Table>);
}

/* View and Download, each with its word as well as its icon; the pressed one
   spins, the rest wait (DOCS.R21) */
function Actions({ busy, keyOf, label, viewId, downloadId, onAct }: {
  busy: string | null; keyOf: (a: Action) => string; label: string; viewId: string; downloadId: string; onAct: (a: Action) => void;
}) {
  const on = (a: Action) => busy === keyOf(a);
  return (
    <div className="flex items-center justify-center gap-sm max-md:justify-start">
      <Button testId={viewId} small kind="ghost" aria-label={`View ${label}`} disabled={!!busy && !on('view')} pending={on('view')} onClick={() => onAct('view')}>
        {!on('view') && <Eye aria-hidden="true" />}View</Button>
      <Button testId={downloadId} small kind="ghost" aria-label={`Download ${label}`} disabled={!!busy && !on('download')} pending={on('download')} onClick={() => onAct('download')}>
        {!on('download') && <Download aria-hidden="true" />}Download</Button>
    </div>);
}

/* Workforce's own documents, unchanged: what Workforce holds for this
   employee (qnipay-workforce-v15.html:5673-5696). There is no Open action:
   opening documents is not built yet. With the document centre switched off
   for the tenant the section is left out; the payroll documents above stay. */
function WorkforceDocuments({ q }: { q: ReturnType<typeof useMyDocuments> }) {
  const refused = q.error instanceof ApiError ? q.error.refusal : null;
  if (refused?.code === 'feature-off') return null;
  const d = q.data;
  return (
    <>
      {q.isError && <p data-testid={tid.docs.error} role="alert" className="text-err">
        {refused && refused.code !== 'network' ? `${refused.message} ${refused.next}` : 'Your documents could not be loaded. Reload the page to try again.'}</p>}
      {!d && !q.isError && <p data-testid={tid.docs.loading} role="status" className="text-text-secondary">Loading your documents&hellip;</p>}
      {d && <Docs d={d} />}
    </>);
}

/* .docrow (v15:1537-1541): a 32px icon tile, the name in 14px/600, a 12px muted line */
function DocRow({ testId, name, line }: { testId: string; name: string; line: string }) {
  return (
    <div data-testid={testId} className="flex items-center gap-md border-b py-[11px] last:border-b-0">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-sm bg-surface-tint [&_svg]:size-4"><FileText /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{name}</div>
        <Small>{line}</Small>
      </div>
    </div>);
}

function Docs({ d }: { d: MyDocuments }) {
  return (
    <Card testId={tid.docs.card}>
      <CardHead title={<>Workforce documents<Tip testId={tid.docs.tip} text="Held by Workforce. A document with an expiry is flagged to your manager before it lapses." /></>}
        actions={<span data-testid={tid.docs.source} className="text-xs text-text-muted">Sourced from the HRIS and the learning system</span>} />
      {d.items.length
        ? d.items.map(x => <DocRow key={x.id} testId={tid.docs.row(x.id)} name={x.name} line={`${x.category} · ${formatDmy(x.date)} · ${x.source}`} />)
        : <Empty testId={tid.docs.empty}>No documents are held for you yet.</Empty>}
      <Small testId={tid.docs.openNote} className="mt-[10px]">Opening documents is a future enhancement. Each row names the system that holds it.</Small>
    </Card>);
}
