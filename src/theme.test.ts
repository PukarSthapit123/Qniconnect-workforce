import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8');
const darkBlockMatch = css.match(/\[data-theme="dark"\]\s*\{[^}]*\}/);
const darkBlock = darkBlockMatch ? darkBlockMatch[0] : '';

test('a [data-theme="dark"] block exists in the theme file', () => {
  expect(darkBlockMatch).not.toBeNull();
});

test('dark theme re-points --primary to the brand accent, not a fixed value (prototype line 406: dark CTAs swap to the lime accent, never lost)', () => {
  expect(darkBlock).toMatch(/--primary:\s*var\(--qp-color-brand-accent\)/);
  expect(darkBlock).toMatch(/--primary-foreground:\s*var\(--qp-color-text-on-accent\)/);
  expect(darkBlock).toMatch(/--ring:\s*var\(--qp-color-brand-accent\)/);
});

test('the dark theme block is declared after :root, so it wins the tie in specificity on <html data-theme="dark">', () => {
  const rootIndex = css.indexOf(':root {');
  const darkIndex = css.indexOf('[data-theme="dark"] {');
  expect(rootIndex).toBeGreaterThanOrEqual(0);
  expect(darkIndex).toBeGreaterThan(rootIndex);
});

test('the @theme block aliases --max-width-{xs..3xl} to the container scale, so max-w-* is not hijacked by the named --spacing-* scale', () => {
  /* Tailwind resolves a named max-w-<key> utility against --max-width-<key>,
     then --spacing-<key>, then --container-<key>. This file also defines
     --spacing-xs/sm/md/lg/xl/2xl/3xl (for p-md, gap-lg, etc.), which share
     their names with Tailwind's built-in container scale; without an explicit
     --max-width-<key> alias, max-w-md (and Modal/Dialog's sm:max-w-lg) would
     silently resolve to the small spacing value instead of a container width.
     See src/index.css's @theme inline block for the fix and full explanation. */
  for (const key of ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']) {
    const re = new RegExp(`--max-width-${key}:\\s*var\\(--container-${key}\\)`);
    expect(css).toMatch(re);
  }
});

/* ------------------------------------------------------------------ brand */
/* No UI string says "Qnipay". Every string literal, template part and JSX text
   in src/ (tests, the seed and the prototype comments excepted) is checked.
   The allow-list is explicit and exact: a stored key, a wire-format tag or a
   demo credential is not copy a person reads as the product's name, and
   none is renamed in this task. Download file names are copy and say qniconnect. */
const BRAND_ALLOWED = new Set([
  'qnipay.theme', 'qnipay.app.store',                   // storage keys
  'qnipay.state', 'qnipay.template', 'qnipay.setup-preset',                    // wire-format kind tags in saved files
  './seed/qnipay.json', 'qnipay',                       // the seed's file name and tenant id
  'https://qnipay.com/legal/',                          // QniConnect's Privacy and Terms page: a link target, never shown (Task 21)
  'support@qnipay.com',                                 // the sign-in page's contact address (Ruling Q18): a contact, not product naming
]);
/* Final review M8: the storage keys and file kinds above stay listed, not renamed, wherever they are spelled
   (src/, index.html): renaming one would lose a saved theme, the fake server's saved data, or the ability to
   open a saved file. */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'seed' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/* Final review M8: the demo seeds' text is what the dev and demo builds show (project and client names, people,
   places), so it says no Qnipay either; only the tenant id is allowed. index.html runs before the app and may name
   only the theme's storage key. */
test('brand: no Qnipay in the demo seeds or index.html', () => {
  const found: string[] = [];
  const seedDir = join(__dirname, 'mocks', 'seed');
  for (const f of readdirSync(seedDir).filter(n => n.endsWith('.json'))) {
    const walk = (v: unknown, at: string) => {
      if (typeof v === 'string') { if (/qnipay/i.test(v) && !BRAND_ALLOWED.has(v)) found.push(`${f}:${at}: ${v}`); return; }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k);
    };
    walk(JSON.parse(readFileSync(join(seedDir, f), 'utf8')), '');
  }
  const html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
  for (const [word] of html.matchAll(/[\w.@/:-]*qnipay[\w.@/:-]*/gi)) if (!BRAND_ALLOWED.has(word)) found.push(`index.html: ${word}`);
  expect(found).toEqual([]);
});

test('brand: no Qnipay in UI copy', () => {
  const found: string[] = [];
  for (const file of sourceFiles(__dirname)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const check = (text: string, node: ts.Node) => {
      if (!/qnipay/i.test(text) || BRAND_ALLOWED.has(text)) return;
      found.push(`${file.slice(__dirname.length + 1)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${text.slice(0, 80)}`);
    };
    const visit = (n: ts.Node) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) check(n.text ?? '', n);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  expect(found).toEqual([]);
});
