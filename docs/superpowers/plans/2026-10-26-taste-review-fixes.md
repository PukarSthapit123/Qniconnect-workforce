# Plan: taste-review fixes (2026-10-26)

Source: `docs/superpowers/reviews/2026-10-26-taste-review.md` (a copy of `.taste-skill/before/critique.md`, which is local and git-ignored). Screenshots in `.taste-skill/before/`.

**Progress and how to pick this up: `docs/superpowers/handoff/taste-review.md`.**

## Ground rules

- **The design system stays.** The table look (uppercase 12px headers, striped rows, records cards on a phone) and the other v15 prototype styles (`src/ui`, `src/ui/shadcn`, `tokens.css`) are design choices. They are not changed here.
- **Parity rows need a ruling.** Home (`HOME.R12`–`R22`) and Overview (`ADM.DASH`) are ports of QniConnect, specified row by row in `docs/superpowers/inventory/`. Every layout change to them is recorded as a ruling ("upgrade, don't downgrade", as Ruling Q2), and the inventory row is updated.
- **Test ids stay.** Blocks may move, but every `tid.*` keeps its meaning, so the e2e specs keep working.
- **Baselines are refreshed on purpose**, one screen at a time, after a side-by-side check (as `e2e/visual.spec.ts` asks).

## Open decisions (defaults in bold)

| # | Question | Default |
| --- | --- | --- |
| D1 | Restyle the shell (dark green bar, lime area pill, uppercase role pill)? It comes from the v15 prototype. | **Agreed (2026-10-26): light touch.** Keep the dark green bar; see Phase 1b |
| D2 | Employee Home: add a "Today" strip (clock state and hours this week) when the Timesheet module is on? | **Agreed (2026-10-26): yes, behind the module check**. It is new scope beyond QniConnect's Home. |
| D3 | Keep the tinted icon tiles (`IconTile`) on Overview and Setup? They are a design-system part. | **Keep** |

## Phase 1: fixes inside the design system (about 1 day)

No change to the look, only to how screens use it.

1. **People & access at 768px** (`EmployeesList.tsx`): the table runs past the screen and Edit/Open are hidden. Below 1100px, move Department, Location and Manager into a subline of the Name cell, or use the `records` variant up to `lg`. Name never wraps while another column has room.
2. **One status mark per row** (`EmployeesList.tsx`): Portal login shows its pill only when it differs from the usual state (Pending first login, Disabled, Admin). The State pill stays.
3. **Phone area switcher** (`Shell.tsx:154`): the fade mask cuts the active area ("My Team" reads "My"). Scroll the active area into view on load, and keep the fade only on the far edge.
4. **Stretched cards** (Home, Overview): add `items-start` to the card rows, so Latest payslip, Tax and Portal users don't carry 60–90px of blank.
5. **Calendar "Hours this week"** (`features/calendar`): name the week and the states counted, e.g. "7.5h submitted, week of 10 Aug", so it reads apart from "45.0h recorded" for the month.
6. **Public pages**:
   - Pricing shows £0.50 (2 decimals), not £0.5.
   - Centre the Pricing column (it is 198px from the left, 100px from the right).
   - Landing phone gutter goes from 12px to 16px.
   - Rewrite the stock copy in `PricingPage.tsx` ("Seamless", "streamline", "intelligently adapts").
7. **Resting shadows**: check the lint's 18 `shadow` hits and keep only those on things that float (menus, dialogs, the inbox). `SetupIndex.tsx:56` and `ModulesPage.tsx:90` add a shadow on hover; that is allowed, so leave them unless they show at rest.

## Phase 1b: quieter top bar, light touch (about half a day)

The dark green bar and the logo stay as they are. Only the two loudest marks change, in `Shell.tsx` (`.modsw` area switcher, `.rolepill`) and the matching tokens in `tokens.css`:

1. **Current area** (My Work / My Team / Setup): no filled lime pill. Use a faint translucent white pill with white text, and keep the other areas in the muted shell ink. It must still pass 3:1 against the bar for the state, and the focus ring stays visible on the dark bar (see ui-review row 8).
2. **Role badge**: sentence case ("Manager"), no outline, in muted shell ink. The dashed "viewing as" state stays distinct (dashed outline kept for that state only).
3. Lime stays for the avatar initials and the notification count. It moves off navigation and onto things that need attention.
4. Dark theme: check the same marks against the dark tokens.
5. Every screen's baseline changes once. Refresh them in one pass, after a side-by-side check against the v15 prototype. Record the change as a deliberate deviation from v15:287-306.

## Phase 2: make each screen's answer the biggest block (about 2–3 days)

### Employee Home (`src/features/home/HomePage.tsx`)
Question: "Was I paid, and is there anything I need to do?"
- **Lead block: the latest payslip.**
  - Net pay at about 32px.
  - Period, pay date, and gross → tax → net as one line.
  - View and Download for that payslip, so the main job is one click.
  - Replaces the small "Latest payslip" card.
- **Side column: who you are.** The summary, tax and contact cards fold into one compact card of label and value rows (no stretched trio).
- **Greeting kept** (`HOME.R12`; a personal home may greet).
- **D2:** a Today strip above the lead block (clock state, hours this week against contracted), linking to `/work/ts`.
- Recent payslips table unchanged (design system; `HOME.R18`).
- Ruling: "Home leads with the latest payslip; profile facts move to a side card". Update `HOME.R13`–`R16`.

### Admin Overview (`src/features/connection/OverviewPage.tsx`)
Question: "Is the Business Central connection healthy?"
- **Lead block: the connection.**
  - Authorisation status and days left, as a meter against its term.
  - The active environment and its type.
  - Refresh authorisation as the one primary action.
  - The expiry banner folds into this block.
- **Users:** the four equal stat tiles become one divided strip (Total, Active, Pending, Inactive). The separate Portal users card goes, so the counts aren't shown twice.
- **Quick actions and resources:** one row below, sized to content.
- Ruling against `ADM.DASH`; update the inventory rows.

### Setup index (`src/features/setup/SetupIndex.tsx`)
Question: "Where do I change X, and what changed lately?"
- Keep the six section cards.
- Add **Recent changes** below them: the last 5 audit entries (`useAudit`), with "View audit log". This fills the empty half-screen with something an admin uses.

### Audit log (`src/features/audit/AuditPage.tsx`)
- The empty space comes from the seed having one entry, not from the layout. Only add the total above the table ("1 entry", or "1–50 of 1,284") and an empty-state sentence for a filter that matches nothing. If one exists already, check it.

## Phase 3: verification (about 0.5–1 day)

1. `npm run typecheck && npm run lint && npm test`.
2. The e2e specs for the touched screens, then the full suite once (about 1 hour).
3. Refresh the visual baselines only for the screens changed, after a side-by-side check.
4. Re-run the taste checks into `.taste-skill/after/`:
   - `inspect.mjs` on the public pages;
   - Playwright screenshots of the app screens;
   - compare them against `before/`.

## Order and estimate

Phase 1 → Phase 1b (top bar) → Home (with the Today strip) → Overview → Setup index → Audit → Phase 3. About 4–5.5 working days in total. Each step is reviewed before the next. Phases 1 and 1b can each merge on their own.
