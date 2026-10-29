/* A small, valid one-page PDF with a few lines of text, as base64 (no data:
   prefix), for the fake /bc server's payslip and tax-document answers. The
   text is kept to printable ASCII, which the standard Helvetica font and
   btoa both take. */
const ascii = (s: string) => s.replace(/£/g, 'GBP ').replace(/[^\x20-\x7e]/g, '?');
const escape = (s: string) => s.replace(/[\\()]/g, m => `\\${m}`);

export function minimalPdf(lines: string[]): string {
  const text = lines.map((l, i) => `${i ? 'T* ' : ''}(${escape(ascii(l))}) Tj`).join('\n');
  const content = `BT\n/F1 12 Tf\n16 TL\n72 770 Td\n${text}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return btoa(out);
}
