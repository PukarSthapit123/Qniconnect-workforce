/* The last kind of input, kept on <html data-input="keyboard|pointer">, so CSS
   can tell an overlay the keyboard opened from one a pointer opened. A menu,
   picker, select, tooltip or dialog opened or closed from the keyboard
   appears and goes at once; a pointer gets the animation (src/index.css,
   [data-input="keyboard"]). emil-design-eng: never animate what the keyboard
   did. Listening in the capture phase sees the event before any handler can
   stop it, and before the overlay it opens has mounted. A pointer that moves
   after typing is pointer input again (a tip hovered once the typing is done
   animates as a pointer's does); the attribute is written only on a change,
   so a moving mouse costs one comparison. */
export function trackInputModality(doc: Document = document): () => void {
  const root = doc.documentElement;
  const set = (kind: 'keyboard' | 'pointer') => () => { if (root.dataset.input !== kind) root.dataset.input = kind; };
  const onKey = set('keyboard'), onPointer = set('pointer');
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('pointermove', onPointer, { capture: true, passive: true });
  return () => {
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('pointerdown', onPointer, true);
    doc.removeEventListener('pointermove', onPointer, true);
  };
}
