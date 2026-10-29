# Task 7 review notes: motion and feel in the design system

Source: `docs/reference/workforce/ui-review-2026-10-18.md`, Part A (motion tokens and motion rows) and Part B (design system and chrome). Scope: `src/ui`, `src/ui/shadcn`, `src/shell`, `src/index.css`, plus the files the brief names (`package.json`, `tokens.css`, `ClockCard.tsx`) and the files an in-scope row points at (`App.tsx`, `main.tsx`, `index.html`, `testids.ts`, `features/timesheet/team.tsx`).

Status values: **applied**, **already fine**, **not applicable** (with the reason), **deferred** (a real item I did not do here, with the reason; listed again under Concerns in the report so the controller can rule on it).

## Motion tokens (Part A §3, as the brief sets them)

All in `src/ui/tokens.css`, used through `ease-(--ease-*)` and `duration-(--dur-*)`; tw-animate-css reads the same two utilities (`--tw-ease`, `--tw-duration`).

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.23,1,.32,1)` | every enter, exit and press |
| `--ease-in-out` | `cubic-bezier(.77,0,.175,1)` | on-screen movement (reserved) |
| `--ease-drawer` | `cubic-bezier(.32,.72,0,1)` | phone bottom sheet |
| `--dur-press` | 140ms | `:active` scale |
| `--dur-tooltip` | 150ms | tooltip enter |
| `--dur-dropdown` | 180ms | menu, select, combobox, inbox enter |
| `--dur-popover-out` | 120ms | menu exit (faster than its 180ms entrance) |
| `--dur-modal-in` / `--dur-modal-out` | 240ms / 160ms | dialog, scrim, phone sheet |
| `--dur-tick` | 1s | clock ring (moves once a second) |
| `--dur-spin` | 700ms | spinner turn |

Removed as replaced or unused: `--qp-ease-out`, `--qp-ease-sheet`, `--qp-duration-exit` (160ms, longer than the 150ms entrance), `--qp-duration-base`, and the `ease-qp-out` / `ease-qp-sheet` theme aliases. Kept: `--qp-ease` and `--qp-duration-fast` for hover and colour.

## Part A rows in scope

| # | Status | Note |
| --- | --- | --- |
| 1 tw-animate-css missing | applied | installed, `@import "tw-animate-css"` in index.css; compiled CSS now has `@keyframes enter/exit`, `animate-in/out`, `zoom-in-97`, `slide-in-from-bottom` |
| 2 reduced-motion rule added motion | applied (fix round 1) | old blanket rule deleted from index.css. The block in tokens.css removes movement only: it pins `--tw-enter/exit-scale` and `-translate-*` and sets `:active, :active * { scale: none }` (so `group-active` presses stop too). It sets no transition list, so an element that never fades does not start to, and the keyboard and `:focus-visible` "none" rules still win. The Switch thumb has `motion-reduce:transition-none`; the inbox has `motion-reduce:starting:scale-100`. Existing fades are kept |
| 3 scrim | applied | fade in 240 / out 160 |
| 4 desktop dialog | applied | fade + zoom-in-95, centred, faster exit |
| 5 phone sheet | applied | slide-in-from-bottom on `--ease-drawer`; fades instead under reduced motion |
| 6 dropdown | applied | slides and 0.95 removed; fade + 0.97 from Radix origin, 180 in / 120 out |
| 7 keyboard-opened menus | applied | `src/ui/inputModality.ts` sets `<html data-input>`; index.css drops animation and transition on overlays when `keyboard` (covers menus, select, combobox, tooltip, dialog, inbox) |
| 8 Combobox | applied | fade + 0.97 enter, no exit |
| 9 Select | applied | fade only, no zoom, no exit (item-aligned has no origin) |
| 10 Tooltip | applied | delayed-open: fade + 0.97; instant-open: none; exit: none (see emil row 4) |
| 11 per-tooltip providers | applied | one provider in App.tsx (delay 400, skip 300); `Tooltip` brings its own provider only when rendered outside one; providers removed from Affordances, Pill, team.tsx |
| 12 Inbox panel pops in | applied | `@starting-style` fade + 0.97 from top right |
| 13 no press on Button | applied | shadcn base: `active:scale-[0.97]`, `scale` in the transition list, none when disabled/pending, none on the link variant |
| 14 Clock in/out | applied | LIME keeps its colour; press comes from the base |
| 15 icon buttons, bell | applied | `active:scale-[0.94]` + tint |
| 16 bottom bar | applied | `active:scale-[0.97]` |
| 17 Stepper | applied (fix round 1) | instant fill on press and instant on release (no fade: it is tapped repeatedly); no scale; keyboard ring inset, since the group clips |
| 18 TAB crossfade | applied | no transition at all in the strip |
| 19 AreaLink crossfade | applied | removed; press scale only |
| 20 focus fade on fields | applied | transition removed from `fieldControl`; global unlayered `:focus-visible { transition-property: none }` |
| 21 focus fade on cards/badge | applied | global rule covers every focused control (features included); badge.tsx deleted |
| 22 Tip focus fill fade | applied | global rule |
| 23 Seg | applied | no crossfade (controller: no animation on Seg changes); press scale |
| 24 theme toggle two waves | applied | `data-theme-switching` turns transitions off for two frames |
| 25 tabs.tsx transition-all | applied | file deleted (unused) |
| 26 clock ring timing | applied | `duration-(--dur-tick) ease-linear` |
| 27 exit token | applied | replaced by `--dur-popover-out` / `--dur-modal-out` |
| 28 clickable cards press | applied in `src/ui` (SetupCardButton 0.99) | feature cards (TeamHomePage, ModulesPage, OrganisationPage, SetupIndex) are outside scope; their focus fade is fixed by the global rule |

## Part B review table

| # | Before | After | Why | Status |
| --- | --- | --- | --- | --- |
| 1 | `--qp-ring-focus: 0 0 0 3px rgba(21,70,24,.28)` (1.69:1 on white) | `0 0 0 2px var(--qp-color-surface-card), 0 0 0 4px var(--qp-color-focus)`; focus = brand green light, accent dark | 2px gap + 2px solid ring: 10.93:1 on card, 10.38:1 page, 9.85:1 sunken; dark 11.96:1 on card | applied |
| 2 | top-bar controls ring dark green on #042110 (1.11:1) | `--qp-ring-focus-inverse` (gap in inverse colour, accent ring) chosen by `[data-surface="inverse"]` on the area nav, theme button, bell, account trigger, clock card, dark ESS card | accent on the top bar is 12.36:1 | applied |
| 3 | `filterControl` had `focus:shadow-focus` (rang on click) | removed; buttons ring on keyboard only; the search box still rings through `fieldControl` | a click should not ring a button | applied |
| 4 | Button no press | `active:scale-[0.97]`, `select-none` | press feedback | applied |
| 5 | no tap highlight reset, no `color-scheme` | `-webkit-tap-highlight-color: transparent`, `color-scheme: light`, dark: `color-scheme: dark` | native pickers follow the theme | applied |
| 6 | no `theme-color` | `<meta name="theme-color" content="#042110">` in index.html | status bar matches the top bar | applied |
| 7 | labels selectable on long press | `user-select: none` on `button, [role=button]`; `select-none` on bar items, tabs, chips | phones | applied |
| 8 | headings orphan | `h1–h4 { text-wrap: balance }`, `p { text-wrap: pretty }` | free | applied |
| 9 | `font-[650]` renders 700 | `font-semibold` in FormParts, Guide, table | only 400–700 static weights load | applied (SignIn.tsx not applicable: deleted in Task 14) |
| 10 | table digits proportional | `tabular-nums` on `<table>` | columns align | applied |
| 11 | Fact value | `tabular-nums` | | applied |
| 12 | EssRow | `tabular-nums` | | applied |
| 13 | CalNav label width jumps | `tabular-nums` | next arrow stays put | applied |
| 14 | bell count uncapped | `99+`, `tabular-nums` (+ unit test) | | applied |
| 15 | pending looks disabled | spinner, full colour, `cursor-progress` (+ unit test) | working ≠ not allowed | applied |
| 16 | ConfirmModal `disabled={busy}` | `pending={busy}` | focus stays | applied |
| 17 | SignIn `disabled={busy}` | — | — | not applicable: SignIn.tsx is deleted in Task 14 (DevSignIn gets its own pass) |
| 18 | provider per tooltip | one root provider | skip-delay works | applied |
| 19 | provider default delay 0 | 400 from `TOOLTIP_DELAY_MS` (mirrors `--qp-delay-tooltip`, held equal by motion.test.ts), skip 300 | | applied |
| 20 | Tip/Caution/Pill note never open on tap | `Tooltip tap`: a click/tap toggles it (opt-in; links keep Radix's own click) (+ unit test) | ESS phones saw nothing | applied (as a tap toggle on Radix Tooltip, not a separate Popover: no `matchMedia` needed, the source rule allows only useNarrow) |
| 21 | DropdownMenu z-90 under scrim | `z-(--qp-z-popover)` (120) | | applied |
| 22 | SubContent z-50, radius, padding | z-popover, `rounded-card`, `p-sm` | | applied |
| 23 | Checkbox/Radio/SubTrigger rows | same padding and `focus:bg-surface-tint` as Item | | applied |
| 24 | `md:max-h-[88vh]` | `88dvh` | | applied |
| 25 | sheet without footer under home indicator | `DialogBody` `max-md:last:` safe-area pad | | applied |
| 26 | no `overscroll-contain` | added on dialog and inbox | | applied |
| 27 | Combobox height | — | — | already fine (already `min(300px, available-height-56px)` and `collisionPadding={8}`) |
| 28 | Combobox opens only on click/Enter/Space/arrows | a printable key opens it with that letter as the search (+ unit test) | | applied |
| 29 | "No matches" before typing | "Nothing to choose from yet" / "No matches for “q”" (+ unit test; old exact-copy test updated) | | applied |
| 30 | empty SelectBox opens an empty box | "Nothing to choose from yet" | | applied |
| 31 | option rows ~38px on phone | `max-md:min-h-touch max-md:text-base` (shared `pickerOption`) | | applied |
| 32 | chevron `opacity-50` (~2:1) | full muted ink | | applied |
| 33 | Seg under 44px on phone | `max-md:min-h-[38px]` (44 with padding), press | | applied |
| 34 | ChipButton `max-md:min-h-[40px]` | removed (44px floor) | | applied |
| 35 | link button ~17px tall | `before:` hit area, 44px on phone | | applied |
| 36 | unused `xs`, `icon-xs`, `icon-sm` | deleted; `icon` grows to 44px on phone | | applied |
| 37 | bottom bar no feedback | press scale + `select-none` | | applied (scale, not tint: a tint flash on a nav bar reads as selection) |
| 38 | theme toggle, bell no press | `active:scale-[0.94]` + tint | | applied |
| 39 | EssButton no press | `active:scale-[0.98]` + tint; redundant focus classes dropped | | applied |
| 40 | Chip, ChipButton, SetupCardButton hover only | 0.97 / 0.97 / 0.99 | | applied |
| 41 | static Sun icon | Moon in light, Sun in dark | icon previews the action | applied |
| 42 | Unicode bottom-bar glyphs | lucide House/Clock/User/FileText/ListChecks/Users, LayoutGrid default, Ellipsis for More, 20px at 1.75 stroke | per-OS fallback fonts | applied (shell.test updated to assert the icons) |
| 43 | Go to: only a 30px button tappable | the whole row is the link (44px), Current/Open is a tag; ring inset (`shadow-focus-inset`), since the list clips | | applied (shell.test updated) |
| 44 | phone area nav gives no hint of more | `mask-image` fade at the far edge | | applied |
| 45 | info toast nested `role="status"` | removed (Sonner's list is already live) | | applied |
| 46 | hard-coded toast durations, no dismiss | `TOAST_LIFE_MS`, refusal ×1.6, Dismiss button (`tid.toast.dismiss`) | | applied |
| 47 | inbox `70vh` | `70dvh` | | applied |
| 48 | account menu `78vh` lost Radix cap | `min(78dvh, available-height)` | | applied |
| 49 | top bar under the notch | safe-area insets on sides and top; `--qp-topbar-h`; strip and phone inbox offset follow | | applied |
| 50 | 10% scroll shade invisible in dark | `.45` in dark | | applied |
| 51 | `--qp-ring-invalid` fixed brick red | `color-mix` of the error token | | applied |
| 52 | shell loading pops the chrome in | `ShellLoading chrome` draws the top bar and strip place (pages that reuse ShellLoading inside the shell stay plain) | | applied |
| 53 | SettingSelect no focus ring | `focus:border-brand focus:shadow-focus` | | applied |
| 54 | iPad gets 14px inputs | `pointer-coarse:text-base` on field and setting controls | | applied |

### Consolidation and tokens (Part B, second half)

| Item | Status | Note |
| --- | --- | --- |
| Button `outline` = `ghost` | applied | `outline` deleted (unused) |
| three disabled looks | deferred | a visual decision (tint vs one opacity token) for the design owner; changes every disabled control |
| Select/Combobox duplicate classes | applied | `pickerTrigger(look)` and `pickerOption` exported from shadcn/select, used by both |
| one SelectBox/Combobox with `searchable` | deferred | API change across feature forms; better done as screens are ported (Tasks 15–21) |
| Switch/Checkbox wrappers | already fine | |
| TextArea → shadcn Textarea | deferred | changes behaviour (auto-grow) on every form |
| unused tabs/badge | applied | deleted |
| Chip vs ChipButton merge | deferred | API change across features |
| five text-entry control families | deferred | refactor only, no visual effect |
| Inbox → Radix Popover | deferred | behaviour change (focus moves into the panel) with its own tests; motion and layering were fixed in place |
| glyphs `▾ › ✓ + –` | applied | lucide ChevronDown, ChevronRight, Check, Plus, Minus (TabStrip, AccountMenu, Inbox, FormParts, Stepper) |
| one icon stroke (1.75) app-wide | deferred | redraws every icon in every baseline; a design decision |
| duplicate colour tokens (text-secondary/muted, sunken/tint) | deferred | a design decision: collapse or differentiate |
| `--radius-md` and `--radius-control` | already fine (kept on purpose) | `--radius-md` maps stock shadcn `rounded-md` onto the control radius; removing it would bring back Tailwind's 6px |
| unused tokens | not applicable | they are the Figma scale (radius-xxl, text-30/36/48, layout); tier 1/3 mirror the design file |
| z-index scale | applied | `--qp-z-sticky … --qp-z-tooltip` in tokens.css; used by ActionBar, strip, top bar, bottom bar, scrim, dialog, menus, select, combobox, inbox, tooltip (tooltip 400 → 130) |
| bottom-bar magic numbers | applied | `--qp-bottom-bar-h` (53) and `--qp-bottom-bar-clear`; Shell, Sonner and ActionBar derive from them |
| four caps tracking values | applied | `--qp-tracking-caps` (.05em) and `--qp-tracking-label` (.08em) in ui and shell |
| repeated px literals (11/9 control inset) | deferred | refactor only; features carry the same literals |
| dead Toaster config | applied | icons, `--normal-*`, `useAppTheme` removed |
| dead animation utilities | applied | see Part A row 1 |

## emil-design-eng pass (after implementing)

My own pass over `src/ui` and `src/shell` once the rows above were in. Every row is fixed.

| Before | After | Why |
| --- | --- | --- |
| Seg's chosen option: `shadow-sm` utility overrode the base `:focus-visible` ring | `focus-visible:shadow-focus` on the chosen option | a focused chosen option lost its ring |
| SetupCardButton: `hover:shadow-sm` overrode the ring while hovered | `focus-visible:shadow-focus` | focus must survive the pointer |
| SetupCardButton `transition-[border-color,box-shadow]` (border faded, nothing else) | `transition-[scale]` only; hover border and lift arrive together | coordinated properties move together; no box-shadow transition (it is the ring) |
| Tooltip exit fade (120ms) beside the next tooltip's instant open | no exit animation | two bubbles on screen at once while moving along a row of tips |
| Inbox "Mark all read": no hover, no press | `enabled:hover:underline enabled:active:scale-[0.97]` | every pressable answers |
| Inbox row `transition-colors` hover | instant hover and press tint | list highlights stay unanimated |
| Account trigger faded its open tint when opened from the keyboard | `transition-[scale]` only | no animation on keyboard actions |
| TabStrip hover tint faded on the tab just chosen | no transition in the strip | a page switch should leave nothing moving |
| CalNav arrows: no press feedback (no hover on touch) | instant `active:enabled:bg-brand-subtle` | repeated stepping: colour, not scale |
| HelpButton `?`: no press | `active:scale-[0.94]` | pressable |
| Dialog close ×: `transition-colors`, no press | `transition-[background-color,scale]`, `active:scale-[0.94]` | pressable, token timing |
| AddLine `+ Add` dashed button: no press, text glyph | press scale, lucide Plus | pressable; shared icon set |
| FormExpander `+`/`–` drawn with CSS `content` | lucide Plus/Minus toggled by `group-open` | shared icon set |
| Phone sheet under reduced motion: slide pinned to 0 left no transition at all | `motion-reduce:` fade in/out | reduced motion keeps fades |
| `animate-spin` at Tailwind's 1s | `--animate-spin` on `--dur-spin` (700ms) | a quicker spinner reads as a quicker wait |
| Tip `i` `transition-colors` at Tailwind's default timing | `transition-[background-color,border-color,color] duration-(--qp-duration-fast) ease-qp` | every timing from a token |
| SignIn sample-account rows: `transition-colors`, no press | token timing, `active:scale-[0.99]` | the token rule covers every file in src/shell |

### Fix round 1 (from the Task 7 review)

| Before | After | Why |
| --- | --- | --- |
| reduced motion: blanket `transition-property: opacity, color, background-color… !important` on `*` | no transition list; movement removed where it is made: `:active, :active * { scale: none }`, Switch thumb `motion-reduce:transition-none`, inbox `motion-reduce:starting:scale-100` | the blanket list made press-only elements (Seg, ChipButton, Chip, area pill, bottom bar, avatar pill) crossfade their selection, and beat the `:focus-visible` and keyboard "none" rules |
| `group-active:scale-[0.97]` inner spans still scaled under reduced motion | covered by `:active *` | a press scales a part of the pressed element too |
| Stepper buttons: outset ring clipped by the group's `overflow-hidden`; fill faded back over 150ms | `focus-visible:shadow-focus-inset`; no transition (instant on press and release) | ring visible; repeated taps |
| Go-to rows and inbox rows: ring clipped by the list's `overflow-hidden` / the panel's scroll box | `focus-visible:shadow-focus-inset` (new `--qp-ring-focus-inset`, 2px inside) | full-width rows in a clipping container |
| theme button and bell: `transition-[background-color,scale]` | `transition-[scale]`; tints land at once | no colour transitions in the shell chrome (the crossfade rule now covers Shell.tsx whole) |

## Source rules added (`scripts/ui-source.test.ts`)

Tightened in fix round 1:
- `ui: no transition-all`: `transition-all` or `transition(-property): all` in tsx/ts/css.
- `ui: no ease-in`: by name (now also before `]` or `}`) and by curve (`cubic-bezier(x,0,1,1)`).
- `ui: pressables give feedback`: each pressable's own class string must hold its press class (Button base, Seg option, Chip, SetupCardButton, ChipButton, EssButton, bottom-bar item, theme button, bell, area pill, avatar pill). This replaces `toContain` on the whole file.
- `ui: popovers scale from their trigger`: Radix origin, no slide. Nothing enters below 0.9: `zoom-*` under 90, `scale-0`/`scale-[1-8]x`/`scale-[0.x<0.9]`, `scale(0)`.
- `ui: hover gated`: `hover:` with scale, translate, rotate or an arbitrary transform, outside the `(hover:hover) and (pointer:fine)` variant; plus `:hover` CSS blocks that set transform, translate or scale.
- Overlays animate with the brief's tokens. The reduced-motion block pins the tw-animate movement variables and `:active, :active *` scale, and has no transition list and no duration change.
- Timing comes from tokens (ui/shell): a bare `transition`, any `transition-*` and `animate-in/out` need a `duration-(--…)` in the same string. Literal `duration-N` and `duration-[…]`, `animate-pulse`/`bounce`/`ping`, and `animate-[…]` without `var(--` are refused.
- Keyboard focus is never animated. The ring is 2px + 2px, with an inverse ring and an inset ring.
- Selection never crossfades. In Seg, Filters, Record, CalNav and Shell, no colour, background, border, fill, stroke, outline or shadow transition, and no bare `transition`.
