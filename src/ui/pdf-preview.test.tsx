import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from '@/ui/shadcn/sonner';
import { tid } from '@/testids';
import { PdfPreview } from './PdfPreview';

/* QniConnect's PdfPreviewModal (docs/superpowers/inventory/portal.md, PDF.R1
   to PDF.R7) as the design system's Modal. */
const PDF = btoa('%PDF-1.4 a payslip');

function Harness({ data = PDF, title = 'Payslip - 6 Apr 2024', startOpen = true }: { data?: string; title?: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return <>
    <button type="button" data-testid="harness-open" onClick={() => setOpen(true)}>open</button>
    <PdfPreview open={open} onClose={() => setOpen(false)} pdfData={data} title={title} />
    <Toaster />
  </>;
}

test('PDF.R1: closed, it renders nothing', () => {
  render(<Harness startOpen={false} />);
  expect(screen.queryByTestId(tid.modal.root)).toBeNull();
});

test('PDF.R2: Escape closes it, and the page does not scroll behind it while it is open', async () => {
  render(<Harness />);
  const box = await screen.findByTestId(tid.modal.root);
  expect(box).toBeInTheDocument();
  /* Radix locks the body's scroll while the dialog is open */
  expect(document.body).toHaveAttribute('data-scroll-locked');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
  expect(document.body).not.toHaveAttribute('data-scroll-locked');
});

test('PDF.R3: a click outside the panel closes it; a click inside does not', async () => {
  render(<Harness />);
  const box = await screen.findByTestId(tid.modal.root);
  await userEvent.click(within(box).getByTestId(tid.pdf.frame));
  expect(screen.getByTestId(tid.modal.root)).toBeInTheDocument();
  const overlay = document.querySelector('[data-slot="dialog-overlay"]');
  if (!overlay) throw new Error('no overlay');
  await userEvent.pointer({ keys: '[MouseLeft]', target: overlay });
  await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
});

test('PDF.R4: the title, or Document preview (QniConnect\'s Document Preview, in sentence case); a named close button, Close and Download', async () => {
  const { unmount } = render(<Harness />);
  let box = await screen.findByTestId(tid.modal.root);
  expect(within(box).getByTestId(tid.modal.title)).toHaveTextContent('Payslip - 6 Apr 2024');
  expect(within(box).getByTestId(tid.modal.close)).toHaveAccessibleName('Close');
  expect(within(box).getByTestId(tid.pdf.close)).toHaveTextContent('Close');
  expect(within(box).getByTestId(tid.pdf.download)).toHaveTextContent('Download');
  await userEvent.click(within(box).getByTestId(tid.pdf.close));
  await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
  unmount();
  render(<Harness title="" />);
  box = await screen.findByTestId(tid.modal.root);
  expect(within(box).getByTestId(tid.modal.title)).toHaveTextContent(/^Document preview$/);
});

test('PDF.R5: the PDF in a frame from its base64, or "No PDF data available"', async () => {
  const { unmount } = render(<Harness />);
  const frame = await screen.findByTestId(tid.pdf.frame);
  expect(frame.tagName).toBe('IFRAME');
  expect(frame).toHaveAttribute('src', `data:application/pdf;base64,${PDF}`);
  /* named for assistive technology, without a native title tooltip */
  expect(frame).toHaveAccessibleName('PDF Viewer');
  unmount();
  render(<Harness data="" />);
  expect(await screen.findByTestId(tid.pdf.empty)).toHaveTextContent('No PDF data available');
});

test('PDF.R6: Download is unavailable without data, and saves under a name made from the title', async () => {
  const names: string[] = [];
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
  const { unmount } = render(<Harness />);
  await userEvent.click(await screen.findByTestId(tid.pdf.download));
  unmount();
  render(<Harness title="P60 - 2024/2025" />);
  await userEvent.click(await screen.findByTestId(tid.pdf.download));
  expect(names).toEqual(['Payslip---6-Apr-2024.pdf', 'P60---20242025.pdf']);
  for (const s of [create, revoke, click]) s.mockRestore();
});

test('PDF.R6: with no data Download is disabled; base64 that is not is said, not thrown', async () => {
  const { unmount } = render(<Harness data="" />);
  expect(await screen.findByTestId(tid.pdf.download)).toBeDisabled();
  unmount();
  render(<Harness data="%%%" />);
  await userEvent.click(await screen.findByTestId(tid.pdf.download));
  expect(await screen.findByTestId(tid.toast.error)).toHaveTextContent('This PDF could not be saved.');
});

test('PDF.R7: reopened, it shows the data it was last given', async () => {
  render(<Harness />);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
  await userEvent.click(screen.getByTestId('harness-open'));
  expect(await screen.findByTestId(tid.pdf.frame)).toHaveAttribute('src', `data:application/pdf;base64,${PDF}`);
});
