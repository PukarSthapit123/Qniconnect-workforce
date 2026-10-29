/* A real file for the employee to save, built in the browser: the prototype's
   csv() and download() (qnipay-workforce-v15.html). Nothing is sent anywhere. */

/* Saves `text` as `name`. False when the browser cannot produce a file, so
   the screen can say that nothing was saved. */
export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8'): boolean {
  return downloadBlob(name, new Blob([text], { type }));
}

/* QniConnect's PDF save (portal HOME.R22, PDF.R6): the decoded bytes as an
   application/pdf file, the object URL kept for 30 s, as QniConnect kept it,
   so a slow browser still has it when the save starts. False when the base64
   is not base64 or the browser cannot produce a file. */
export function downloadPdf(name: string, bytes: () => Uint8Array): boolean {
  let data: Uint8Array;
  try { data = bytes(); } catch { return false; }
  return downloadBlob(name, new Blob([data as BlobPart], { type: 'application/pdf' }), 30_000);
}

function downloadBlob(name: string, blob: Blob, keepMs = 0): boolean {
  if (typeof URL.createObjectURL !== 'function') return false;
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), keepMs);
    return true;
  } catch {
    return false;
  }
}
