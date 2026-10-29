// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

/* Rules from the prototype suite that are about the source as a whole, not
   one screen: each test names the suite rows it ports. */
const SRC = resolve(__dirname, '../src');
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const product = files(SRC).filter(f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes(`${join('src', 'test')}`));
const rel = (f: string) => relative(resolve(__dirname, '..'), f).replace(/\\/g, '/');

/* REVIEW RUN: "Native title only on disabled controls". A native tooltip
   cannot be reached by touch or keyboard, so the only place it is used is the
   prototype's: saying why a control is disabled (v15's title="" attributes all
   sit on disabled buttons). Explanations go in a Tip or the accessible name.
   The one exception is the role pill, which carries who you are looking at
   the app as on hover, as the prototype sets it (v15:10606), beside the
   banner that says it in words. */
const TITLED = new Set(['Button', 'NavLink']);
const EXEMPT = [{ file: 'src/shell/Shell.tsx', testId: 'tid.shell.rolePill' }];
test('a native title is only ever on a control that can be disabled, saying why it is', () => {
  const bad: string[] = [];
  for (const f of product.filter(x => x.endsWith('.tsx'))) {
    const text = readFileSync(f, 'utf8');
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName.getText(sf);
        const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
        const named = (a: string) => attrs.find(x => x.name.getText(sf) === a);
        if ((/^[a-z]/.test(tag) || TITLED.has(tag)) && named('title') && !named('disabled')) {
          const testId = named('data-testid')?.initializer?.getText(sf) ?? named('testId')?.initializer?.getText(sf) ?? '';
          if (!EXEMPT.some(e => e.file === rel(f) && testId.includes(e.testId)))
            bad.push(`${rel(f)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} <${tag}>`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  expect(bad).toEqual([]);
});

/* MOBILE FOUNDATION: "One helper decides what counts as a phone". Only
   useNarrow asks the browser about the phone breakpoint; anything that only
   restyles uses max-md:. */
test('one helper decides what counts as a phone', () => {
  const asking = product.filter(f => /matchMedia\s*\(/.test(readFileSync(f, 'utf8'))).map(rel);
  expect(asking).toEqual(['src/ui/useNarrow.ts']);
  expect(readFileSync(resolve(SRC, 'ui/useNarrow.ts'), 'utf8')).toContain("'(max-width: 767px)'");
});

/* HEADER PILLS REMOVED: "The \"applies immediately\" pill is gone from page
   headers" and "It is gone from every admin page, not just this one". */
test('no page carries an "Applies immediately" pill', () => {
  expect(product.filter(f => /Applies immediately/i.test(readFileSync(f, 'utf8'))).map(rel)).toEqual([]);
});

/* ------------------------------------------------------------------ motion
   Motion and feel (Task 7; emil-design-eng, review-animations). Each rule
   below is a design-system invariant from constraints.md "Motion", checked
   over the source so a later screen cannot quietly undo it. */
const UI = product.concat(files(SRC).filter(f => f.endsWith('.css')));
const read = (f: string) => readFileSync(f, 'utf8');
const at = (f: string) => resolve(SRC, f);
/* Every class-bearing string in a source file: string literals and the
   static parts of template literals, from the TypeScript AST. */
function classStrings(f: string): string[] {
  const sf = ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const chromeAndUi = product.filter(f => /^src\/(ui|shell)\//.test(rel(f)) && f.endsWith('.tsx'));

/* The patterns two of the rules below look for, kept apart so a test can
   show what each one catches (Task 7 review; Task 24). */
const TRANSITION_ALL = /transition-all\b|transition(-property)?:\s*['"]?all(?![a-zA-Z0-9-])/;
const SCALE_FROM_NOTHING = /(?<![\w-])scale-(0|[1-8]\d?|\[(0|0?\.[0-8]\d*)\])(?![\w.\]])/g;

test('ui: the motion rules catch what they are for, and pass what they allow', () => {
  /* an arbitrary property `[transition:all_200ms]` is `all` too: its underscore is Tailwind's space */
  for (const bad of ['transition-all', 'transition: all 200ms', "transition-property: 'all'", '[transition:all_200ms]', 'transition:all'])
    expect(TRANSITION_ALL.test(bad), bad).toBe(true);
  for (const ok of ['transition-[scale]', 'transition: allow', 'transition: all-the-things', 'transition-colors'])
    expect(TRANSITION_ALL.test(ok), ok).toBe(false);
  const scales = (s: string) => [...s.matchAll(SCALE_FROM_NOTHING)].map(m => m[0]);
  for (const bad of ['scale-0', 'scale-50', 'scale-[0]', 'scale-[0.5]', 'scale-[.5]', 'starting:scale-[.85]'])
    expect(scales(bad), bad).toHaveLength(1);
  for (const ok of ['scale-95', 'scale-100', 'scale-[0.97]', 'scale-[.97]', 'active:scale-[0.94]', 'scale-[1.02]'])
    expect(scales(ok), ok).toEqual([]);
});

test('ui: no transition-all', () => {
  /* `all` animates whatever property happens to change, layout included */
  expect(UI.filter(f => TRANSITION_ALL.test(read(f))).map(rel)).toEqual([]);
});

test('ui: no ease-in', () => {
  /* ease-in starts slow, the moment the user is watching; ease-in-out is
     fine. Caught by name (a class, a token, a CSS value) and by curve: a
     cubic-bezier(x, 0, 1, 1) is an ease-in whatever it is called. */
  const bad = UI.flatMap(f => [...read(f).matchAll(/ease-in(?=[\s"'`;,)\]}]|$)|cubic-bezier\(\s*[\d.]+\s*,\s*0\s*,\s*1\s*,\s*1\s*\)/gm)].map(m => `${rel(f)} ${m[0]}`));
  expect(bad).toEqual([]);
});

/* The class strings of one component, found by classes only it carries. */
const stringsWith = (f: string, marker: string) => classStrings(at(f)).filter(s => s.includes(marker));
const tokensOf = (s: string) => s.split(/\s+/).filter(Boolean);
/* a class without its variants: `max-md:active:scale-[0.97]` -> `scale-[0.97]` */
const baseOf = (tok: string) => tok.slice(tok.lastIndexOf(':') + 1);

test('ui: pressables give feedback', () => {
  /* scale on :active confirms the press before anything else has happened.
     Each component is checked on its own class string. Button's press is in
     the shadcn base it renders, which buttonVariants also gives every link
     drawn as a button. A large surface scales less, a small round one more. */
  expect(read(at('ui/Button.tsx'))).toContain("from '@/ui/shadcn/button'");
  const PRESS: [file: string, marker: string, press: string][] = [
    ['ui/shadcn/button.tsx', 'inline-flex shrink-0 items-center justify-center gap-[7px]', 'active:scale-[0.97]'],
    ['ui/Seg.tsx', 'rounded-pill px-[13px] py-[5px]', 'active:scale-[0.97]'],
    ['ui/Record.tsx', 'inline-flex min-h-[34px] items-center gap-[6px]', 'active:scale-[0.97]'],   // Chip
    ['ui/Record.tsx', 'rounded-card border bg-surface-card p-lg text-left', 'active:scale-[0.99]'], // SetupCardButton
    ['ui/Filters.tsx', 'px-md text-xs font-medium', 'active:scale-[0.97]'],                         // ChipButton
    ['ui/Ess.tsx', 'mb-[10px] h-11 w-full', 'active:scale-[0.98]'],                                 // EssButton
    ['shell/Shell.tsx', 'flex min-h-[52px] min-w-0 flex-1', 'active:scale-[0.97]'],                 // bottom bar item
    ['shell/Shell.tsx', 'relative grid size-[34px]', 'active:scale-[0.94]'],                        // theme button
    ['shell/Inbox.tsx', 'relative grid size-[34px]', 'active:scale-[0.94]'],                        // bell
    ['shell/Shell.tsx', 'rounded-pill px-[14px] py-[7px]', 'group-active:scale-[0.97]'],            // area pill
    ['shell/AccountMenu.tsx', 'rounded-pill py-[3px]', 'group-active:scale-[0.97]'],                // avatar pill
  ];
  for (const [f, marker, press] of PRESS) {
    const found = stringsWith(f, marker);
    expect(found.length, `${f}: no class string carries "${marker}"`).toBeGreaterThan(0);
    for (const s of found) expect(tokensOf(s), `${f} ${marker}`).toContain(press);
  }
});

test('ui: popovers scale from their trigger', () => {
  /* origin-aware, a scale and a fade with no slide; never from scale(0) or
     anything under 0.9. Combobox is the app's only Radix Popover. Modals are
     exempt: they stay centred. */
  for (const [f, name] of [['ui/shadcn/popover.tsx', 'popover'], ['ui/shadcn/dropdown-menu.tsx', 'dropdown-menu'], ['ui/shadcn/select.tsx', 'select'], ['ui/shadcn/tooltip.tsx', 'tooltip'], ['ui/Combobox.tsx', 'popover']] as const) {
    let text: string;
    try { text = read(at(f)); } catch { continue; } // popover.tsx: not every shadcn part is installed
    expect(text, f).toContain(`origin-(--radix-${name}-content-transform-origin)`);
    expect(text, f).not.toMatch(/slide-(in-from|out-to)-/);
  }
  const fromNothing = UI.flatMap(f => {
    const text = read(f);
    return [
      ...[...text.matchAll(/\b(zoom-(?:in|out))(?:-(\d+))?\b/g)].filter(m => m[2] === undefined || Number(m[2]) < 90),
      ...text.matchAll(SCALE_FROM_NOTHING),
      ...text.matchAll(/scale\(\s*0(\.[0-8]\d*)?\s*\)/g),
    ].map(m => `${rel(f)} ${m[0]}`);
  });
  expect(fromNothing).toEqual([]);
});

test('ui: hover gated', () => {
  /* a hover movement only where there is a real pointer: a tap fires hover too */
  const classes = UI.flatMap(f => (read(f).match(/[^\s"'`]*hover:-?(scale|translate|rotate|\[(transform|translate|scale|rotate))[^\s"'`]*/g) ?? [])
    .filter(c => !c.includes('[@media(hover:hover)_and_(pointer:fine)]:')).map(c => `${rel(f)} ${c}`));
  const css = UI.filter(f => f.endsWith('.css')).flatMap(f => (read(f).match(/:hover[^{}]*\{[^}]*\b(transform|translate|scale)\s*:/g) ?? []).map(m => `${rel(f)} ${m.slice(0, 60)}`));
  expect([...classes, ...css]).toEqual([]);
});

test('ui: overlays animate, with the motion tokens, and reduced motion keeps only the fades', () => {
  const index = read(at('index.css')), tokens = read(at('ui/tokens.css'));
  /* without the plugin every animate-in / zoom-in-* / slide-in-* class compiles to nothing */
  expect(index).toMatch(/@import\s+["']tw-animate-css["'];/);
  for (const [name, value] of [['--ease-out', 'cubic-bezier(.23,1,.32,1)'], ['--ease-in-out', 'cubic-bezier(.77,0,.175,1)'],
    ['--ease-drawer', 'cubic-bezier(.32,.72,0,1)'], ['--dur-press', '140ms'], ['--dur-tooltip', '150ms'], ['--dur-dropdown', '180ms'],
    ['--dur-modal-in', '240ms'], ['--dur-modal-out', '160ms']])
    expect(tokens.replace(/\s+/g, ''), name).toContain(`${name}:${value};`);
  const reduced = tokens.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
  expect(reduced, 'a reduced-motion block in tokens.css').not.toBe('');
  expect(reduced).toMatch(/--tw-enter-scale:\s*1/);
  expect(reduced).toMatch(/--tw-enter-translate-y:\s*0/);
  /* a press scales the pressed element or a part of it (group-active) */
  expect(reduced.replace(/\s+/g, '')).toContain(':active,:active*{scale:none!important;}');
  /* it removes movement and nothing else: no blanket transition list, which
     would give a crossfade to every element that had none, and no change to
     how long anything takes. (The block's comment is left out of the check.) */
  expect(reduced.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/transition|animation-duration|--tw-enter-opacity/);
  expect(index).not.toMatch(/prefers-reduced-motion/);
});

test('ui: transitions and animations take their timing from the motion tokens', () => {
  /* a transition or an enter/exit animation names its duration token in the
     same class string; a bare `transition` (Tailwind's 150ms on a list of
     properties) counts too. No literal durations, and no keyframe animation
     that is not built on a token (animate-spin is, through --dur-spin). */
  const timed = (b: string) => b === 'transition' || (b.startsWith('transition-') && b !== 'transition-none') || b === 'animate-in' || b === 'animate-out';
  const bad = chromeAndUi.flatMap(f => classStrings(f)
    .filter(s => tokensOf(s).map(baseOf).some(timed) && !/duration-\(--/.test(s))
    .map(s => `${rel(f)}: ${s.slice(0, 80)}`));
  expect(bad).toEqual([]);
  const literal = chromeAndUi.flatMap(f => classStrings(f).flatMap(s => tokensOf(s).map(baseOf)
    .filter(b => /^duration-(\d+|\[[^\]]+\])$/.test(b) || b === 'animate-pulse' || b === 'animate-bounce' || b === 'animate-ping' || (b.startsWith('animate-[') && !b.includes('var(--')))
    .map(b => `${rel(f)} ${b}`)));
  expect(literal).toEqual([]);
});

test('ui: keyboard focus is never animated, and the ring is a 2px gap and a 2px solid ring', () => {
  /* the focus ring is a box-shadow, so a transition on box-shadow fades it in on every Tab */
  const fading = chromeAndUi.flatMap(f => classStrings(f).filter(s => /transition-shadow|transition-\[[^\]]*box-shadow/.test(s)).map(s => `${rel(f)}: ${s.slice(0, 80)}`));
  expect(fading).toEqual([]);
  expect(read(at('index.css'))).toMatch(/:focus-visible\s*\{[^}]*transition-property:\s*none/);
  const tokens = read(at('ui/tokens.css')).replace(/\s+/g, ' ');
  expect(tokens).toMatch(/--qp-ring-focus:\s?0 0 0 2px var\(--qp-color-surface-card\),\s?0 0 0 4px var\(--qp-color-focus\);/);
  expect(tokens).toMatch(/--qp-ring-focus-inverse:\s?0 0 0 2px var\(--qp-color-surface-inverse\),\s?0 0 0 4px var\(--qp-color-focus-inverse\);/);
  expect(tokens).toMatch(/--qp-ring-focus-inset:\s?inset 0 0 0 2px var\(--qp-color-focus\);/);
});

test('ui: choosing a tab, an area, a Seg option, a chip or a period never crossfades', () => {
  /* High-frequency, often keyboard-driven selection lands at once. In the
     files that draw a selected state (the Seg option, ChipButton, Chip, the
     area pill, the tab strip, the period arrows) nothing transitions a
     colour, a background, a border, a fill or a shadow, and there is no bare
     `transition` (which includes all of them). A press may scale. */
  const colourFade = (b: string) => b === 'transition' || b === 'transition-colors' || b === 'transition-all'
    || /^transition-\[[^\]]*(color|background|border|fill|stroke|outline|shadow)/.test(b);
  const bad = ['ui/Seg.tsx', 'ui/Filters.tsx', 'ui/Record.tsx', 'ui/CalNav.tsx', 'shell/Shell.tsx'].flatMap(f => classStrings(at(f))
    .filter(s => tokensOf(s).map(baseOf).some(colourFade)).map(s => `${f}: ${s.slice(0, 80)}`));
  expect(bad).toEqual([]);
});
