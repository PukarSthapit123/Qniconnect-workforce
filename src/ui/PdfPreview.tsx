import { Download } from 'lucide-react';
import { tid } from '@/testids';
import { pdfBytes, pdfFileName } from '@/domain/payroll';
import { downloadPdf } from '@/lib/download';
import { Button } from './Button';
import { Modal } from './Modal';
import { toastRefusal } from './toast';

/* QniConnect's PdfPreviewModal (portal inventory PDF.R1 to PDF.R7), on the
   design system's Modal: Radix closes it on Escape, a click on the scrim and
   the close button, and locks the page's scroll while it is open, restoring
   what it was rather than forcing 'auto' (PDF.R2, PDF.R3). The title is
   QniConnect's, or "Document preview" (PDF.R4, in sentence case). The PDF is shown in a frame
   from its base64, named "PDF Viewer" by aria-label rather than a native
   title (PDF.R5); Download saves it under a name made from the
   title (PDF.R6) and is unavailable with nothing to save. Base64 that is not
   base64 is said, not thrown (QniConnect threw, uncaught). */
export function PdfPreview({ open, onClose, pdfData, title }: { open: boolean; onClose: () => void; pdfData: string; title?: string }) {
  const save = () => {
    if (!downloadPdf(pdfFileName(title), () => pdfBytes(pdfData)))
      toastRefusal({ message: 'This PDF could not be saved.', next: 'Close it and open it again, then try Download once more.' });
  };
  return (
    <Modal open={open} onOpenChange={o => { if (!o) onClose(); }} title={title || 'Document preview'} width="xwide"
      footer={<>
        <Button testId={tid.pdf.close} kind="ghost" onClick={onClose}>Close</Button>
        <Button testId={tid.pdf.download} kind="primary" disabled={!pdfData} onClick={save}><Download aria-hidden="true" />Download</Button>
      </>}>
      {pdfData
        ? <iframe data-testid={tid.pdf.frame} src={`data:application/pdf;base64,${pdfData}`} aria-label="PDF Viewer"
          className="block h-[min(70dvh,900px)] w-full rounded-control border bg-surface-sunken max-md:h-[58dvh]" />
        : <p data-testid={tid.pdf.empty} className="py-2xl text-center text-sm text-text-muted">No PDF data available</p>}
    </Modal>);
}
