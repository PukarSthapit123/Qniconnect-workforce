# Handoff: taste-review fixes

**Read this first if you are picking up this work in a new session or another Claude account.** It is self-contained. Nothing here relies on memory from an earlier session.

Last updated: 2026-10-26 by Claude (second account: Phase 1).

## Where things stand

| Step | State |
| --- | --- |
| taste-skill installed | Done. `.agents/skills/design-taste-frontend/`, symlinked from `.claude/skills/` (untracked; `skills-lock.json` updated) |
| Review of the app | Done. Findings: `docs/superpowers/reviews/2026-10-26-taste-review.md` |
| Plan | Agreed. `docs/superpowers/plans/2026-10-26-taste-review-fixes.md` |
| Phase 1 (fixes inside the design system) | **Done except item 6's price and copy (held by the user pending a ruling: see "Phase 1 notes").** Not committed; baselines not refreshed |
| Phase 1b (top bar, light touch) | **Done** (see "Phase 1b notes"). Not committed; visual baselines not refreshed |
| Phase 2 (Home + Today strip, Overview, Setup index, Audit) | **Done** (see "Phase 2 notes"). Not committed; visual baselines not refreshed |
| Phase 2b (wayfinding, page hierarchy, colour, pay masking; asked for by the user 2026-10-26) | **Done for review** (see "Phase 2b notes"). Waiting on the user's view of the colour mock-up before rolling the lead block to Overview |
| Phase 3 (verification, baselines, after-screenshots) | **Not started.** Full `npm run e2e`, then refresh baselines for the changed screens after a side-by-side check |

**Update the table above and the log at the bottom whenever you finish a step or stop mid-way.** That is how the next account knows where to pick up.

Repo note: `main` has no commits yet; everything is staged in the working tree. Do not commit, branch or push unless the user asks.

## Decisions already made (do not reopen)

1. **Tables are a design choice and stay.** The uppercase 12px headers, striped rows and records cards on a phone come from the v15 prototype (`src/ui/shadcn/table.tsx`). Do not restyle them, even though the taste skill flags them.
2. **The design system stays** (`src/ui`, `tokens.css`), except for the top-bar change in 1b.
3. **Top bar: light touch (D1).** Keep the dark green bar and the logo. The current area loses its filled lime pill (use a faint white pill with white text instead). The role badge becomes sentence case with no outline. The dashed "viewing as" state stays distinct. Record it as a deliberate deviation from v15:287-306.
4. **Today strip on Home: yes (D2).** Show clock state and hours this week against contracted, linking to `/work/ts`. Only when the Timesheet module is on.
5. **Icon tiles (`IconTile`) stay (D3).**
6. **Audit log:** only add a total and a no-matches sentence. Its empty space comes from the seed having one entry, so don't design around the seed.

## Rules for this work

- **Parity rows need a ruling.** Home (`HOME.R12`–`R22`) and Overview (`ADM.DASH`) are row-by-row ports of QniConnect (`docs/superpowers/inventory/portal.md`, `admin.md`). Any layout change gets a ruling ("upgrade, don't downgrade", as Ruling Q2), and the inventory row is updated in the same change.
- **Keep every `tid.*` test id and its meaning**, so the e2e specs keep working.
- **Visual baselines** (`e2e/*-snapshots`, 200 files) are refreshed only on purpose, for the screens changed, after a side-by-side check (`e2e/visual.spec.ts` header).
- **Match the code style.** Comments explain the why, and cite the prototype line or inventory row.
- The taste skill's page and app house rules are guidance. Where they conflict with decisions 1–5 above, the decisions win.

## How to run and check

- **Dev server with fake data and no Microsoft sign-in** (PowerShell):
  `$env:VITE_AUTH='stub'; $env:VITE_FAKE_BC='on'; npm run dev -- --port 3107`
- **App-screen screenshots, signed in as employee, manager and admin**, at 1440/768/390 with the clock frozen at 2026-08-13 14:30:
  `node docs/superpowers/handoff/taste-review/shots.mjs "$PWD" http://localhost:3107 .taste-skill/after/app`
  Edit `PLAN` in that file to change the screens.
- **Public pages through the taste inspector:**
  `node .agents/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:3107/ --out .taste-skill/after/landing`
  (same for `/pricing`). The inspector can't sign in, which is why app screens use `shots.mjs`.
- **Source lint:** `node .agents/skills/design-taste-frontend/scripts/lint.mjs --app src`.
  Known noise: test-file "Acme", ✓ ◷ ↻ ✕ ✎ status glyphs, and the scroll-shade gradients in `index.css:278` and `Shell.tsx:154`.
- **Repo checks:** `npm run typecheck && npm run lint && npm test`. Run the e2e spec for each touched screen (`npx playwright test e2e/<spec>.ts`), and the full `npm run e2e` (about 1 hour) once per phase.
- `.taste-skill/` is git-ignored and local to this machine. Its `before/` folder holds the original screenshots. If it is missing, check out the state before Phase 1 and re-run the commands above into `before/`.

## Starting Phase 1

Phase 1 items are in the plan. The files to read first:
- `src/features/employees/EmployeesList.tsx`: tablet overflow, and the second "Active" pill.
- `src/shell/Shell.tsx` (around line 154): the phone area switcher's mask cuts the active area.
- `src/features/home/HomePage.tsx` and `src/features/connection/OverviewPage.tsx`: stretched card rows (`items-start`).
- `src/features/calendar/`: name the week and states in "Hours this week".
- `src/features/public/PricingPage.tsx` and `LandingPage.tsx`: £0.50, centring, phone gutter, stock copy.

## Phase 1 notes (2026-10-26)

What changed, by plan item (all uncommitted; every `tid.*` kept):
1. `EmployeesList.tsx`: on admin from 768 to 1099px, Employee type, Department, Location and Manager fold into a muted line under the name (`md:max-[1099px]`), and come back as columns from 1100px. Folding only the three the plan named still cut off Open at 768, so Employee type folds too. The name no longer wraps (`md:whitespace-nowrap`). Team variant and the phone records card unchanged.
2. `PortalLogin` (same file): an Active login is plain secondary text; Pending first login, Inactive and Admin keep their pills. It also applies on the employee record (`EmployeeRecord.tsx`, "QniConnect sign-in"), which uses the same component.
3. `Shell.tsx`: new `AreaSwitcher`. It centres the current area on load and on route change, and each edge fades only while there is more past it (`EDGE_MASK`). Verified at 390 manager: "My Team" reads in full.
4. `HomePage.tsx`, `OverviewPage.tsx`: `items-start` on the card rows (no parity row changes; HOME.R14-R16, ADM.DASH content unchanged).
5. `MyCalendarPage.tsx`: the week figure counts every recorded day, drafts included (`src/mocks/home.ts`), the same measure as the month's "45.0h recorded". Its foot is now "recorded in the week from Mon 10 Aug, of 37.5h contracted". The plan's example said "submitted", which would have been wrong.
6. `LandingPage.tsx`: gutter below lg is 16px (`max-lg:px-lg`). **Held by the user (2026-10-26):** £0.5 → £0.50 and the stock-copy rewrite. Both are contract content (PRICE.R5, REG.R13 shows £0.5 too) pinned by `public.test.tsx`, so they need a ruling and sign-off on new wording first. Pricing "off-centre" is an inspector false positive: it measures text edges (2nd/98th percentile), so the cards' 24px padding and the top bar's Register link skew it; the cards sit 184px from each side at 1440. No change. Still open: the shared public footer (`PublicLayout.tsx`) keeps `max-lg:px-md`, so "Terms" is 12px from the edge on every public page.
7. Resting shadows: no change needed. Every remaining shadow is on something that floats (menus, dialogs, select, combobox, tooltip, toast, inbox), a hover (`SetupIndex`, `ModulesPage`), the focus ring (`index.css:235`), the switch knob, or WeekGrid's inset today rule.

Checks at the end of Phase 1:
- `npm run typecheck` passes. `npx eslint src` passes.
- `npm run lint` fails with 110 errors, **all in `.agents/skills/design-taste-frontend/`** (the installed skill's own JS, picked up by `eslint .`). Adding `.agents/` to the ESLint ignores would fix it; not done, as it is a config decision.
- `npm test` passes, 2460/2460, on a clean run. Two earlier runs, which overlapped with edits and an e2e run, failed 1 and 3 tests (one was `src/ui/motion.test.ts` input modality, which passed 3/3 alone).
- e2e: `nav`, `mobile-1c`, `permissions-conn`, `public`, `setup-8`, `ui-rules`, `a11y`, `people-access` pass 83/84. The one failure is the expected visual diff `public-landing-390-light.png` (the 16px gutter).
- Not run: the full `npm run e2e` and the other visual specs. Expect baseline diffs for People & access, Home, Overview, Calendar, the phone shell (every screen at 390, from the area switcher) and Landing.
- After-screenshots: `.taste-skill/after/app` (all of `shots.mjs`'s PLAN), `.taste-skill/after/landing`, `.taste-skill/after/pricing`.

## Phase 1b notes (2026-10-26)

- Current area (`AreaLink`, `Shell.tsx`): white text at 600 on `bg-shell-current` (14% white) with a 1px inset edge, `--qp-color-shell-current-line` (40% white). The fill alone is 1.5:1 against the bar; the edge is 4.8:1, which carries the state. The other areas stay `text-shell-ink-muted`. The focus ring is unchanged (the inverse lime ring) and replaces the edge while focused.
- Role badge: sentence case (the labels were already sentence case; only the CSS `uppercase` and `data-caps` went), `text-shell-ink-muted`, semibold, a transparent border. Viewing as: dashed `border-accent-line`, `text-shell-ink`, `opacity-85` (the prototype's `.rolepill.viewing`, kept because `shell.test.tsx` pins it).
- Tokens: `--qp-color-shell-current` and `--qp-color-shell-current-line` sit in `src/index.css` beside the other shell literals (where the prototype's shell values live), mapped to `--color-shell-current*`. The bar is `--qp-color-surface-inverse` in both themes, so dark needs no override.
- The deviation from v15:287-306 is recorded as decision N21 in `docs/superpowers/specs/2026-10-19-qniconnect-workforce-merge-design.md`.
- Lime now: the avatar, the bell count, the focus ring, and in-page accents (unchanged).
- Screens: `.taste-skill/after-1b/app` (light, every `shots.mjs` screen) and `dark-*` (employee home, manager approvals, admin overview).
- Checks: typecheck and `eslint src` pass; `src/shell` unit tests 117/117 (twice). e2e `auth`, `account-menu`, `admin-1c`, `nav`, `theme`, `ui-rules`, `mobile-1c`, `a11y`: 69/70. The one failure, `a11y.spec.ts:114` (phone overflow, plan 1b pages), was a 30s timeout while screenshots ran alongside. It passes alone in 27.5s, close to its budget, so watch it in the full run.
- Every screen's visual baseline changes from this. Refresh them in Phase 3 in one pass, after a side-by-side check (plan, Phase 1b item 5).

## Phase 2 notes (2026-10-26)

### Home (Ruling Q19)
- Ruling Q19 is written into `docs/superpowers/inventory/portal.md` as a "Port" note on HOME.R13–R16, and logged in `.superpowers/sdd/2026-10-19-qniconnect-workforce-merge/progress.md` (git-ignored, local).
- `HomePage.tsx`:
  - Layout: from xl, two columns: Today strip, then the lead payslip, then Recent payslips on the left, and the profile card on the right. Below xl it is one column, and the payslip list comes before the profile card.
  - Lead block: net pay at `--qp-text-30`, "Period: … · Paid on: …" (QniConnect's words), then `Gross · Tax · Net` listed, not subtracted: NI is not on the summary, so the three never add up.
  - The lead's own View/Download (`tid.home.latestView`, `latestDownload`) share one-PDF-at-a-time with the table (`usePayslipPdf`, HOME.R20).
  - Profile card (`tid.home.summary`): avatar, name and role, then Employment, Tax information (`tid.home.tax`) and Contact information (`tid.home.contact`) as `Fact` rows. The groups sit side by side from md to xl, the contact one widest; an email breaks after its @.
- `TodayStrip.tsx` (D2): shows exactly when `buildNav` offers the Timesheet tab, and once `GET /api/v1/home` has answered with `can.recordHours`.
  - For a clock-mode employee (`MyClock.gates.live && mode === 'clock'`) it shows the clock state: "Not clocked in" / "Clocked in since 08:00" / "On break" / "Clocked out".
  - Otherwise it shows today's timesheet state from My Calendar's data.
  - It also shows "Xh of Yh contracted this week" ("Xh this week" for bank), and links to `/work/ts`.
- New test ids: `tid.home.latestLine`, `latestView`, `latestDownload`, `today`, `todayState`, `todayWeek`, `todayLink`. All old ids kept with their meaning.
- `home.test.tsx`:
  - The tag and tax tests now read label and value rows (`fact()`), still exact.
  - New tests: the lead line, the lead's View/Download, reading order, and the Today strip with the module on (Amara: "Not clocked in", "7.5h of 37.5h contracted this week") and off.
  - Not covered by a unit test: the strip's non-clock branch (today's timesheet state).
- Checks: typecheck and `eslint src` pass; `src/features/home` 25/25; `own-payroll` and calendar 20/20; e2e `mobile-1c` and `ui-rules` 10/10; `a11y` Home and 1c groups (light, dark, 390) 7/7.
- Screens: `.taste-skill/after-2/app/employee_work_home-*`.

### Admin Overview (Ruling Q20)
- Ruling Q20 is a "Port layout" note under ADM.DASH "States" in `docs/superpowers/inventory/admin.md`, plus a note on R7; it is also logged in `progress.md`.
- `OverviewPage.tsx`:
  - The `Business Central connection` block leads (`tid.aoverview.connection`). It holds:
    - Authorization: the R5 colour, "Remaining: n days", and a `Meter` (`tid.aoverview.meter`) of the days left against the term (`issuedAt` to `expiresAt`). No meter when either is unknown.
    - The active environment and its type, and the environment count.
    - The expiry banner, inside the block.
    - `Refresh authorization` as its primary button. It is QniConnect's third quick action moved here, keeping `tid.aoverview.action('authorization')`.
  - Portal users: one strip, Total (`stat('users')`), Active, Pending and Inactive (`tile(...)`), with "View all users". The four stat tiles and the separate card are gone.
  - Quick actions (Add user, Add environment) and the resources are rows in two cards side by side. `IconTile` is kept (D3).
- `src/api/bc/admin.ts`: `OverviewData.auth.issuedAt`, read from the same AUTHZ.C1 answer; no wire change. `src/domain/admin.ts`: `authTermDays()`.
- `connection.test.tsx`:
  - The Total line, and R7's "Active: 0" (now the strip's named Active count), assert the new structure exactly.
  - New checks: the connection block's contents, the meter's tone and width (74.4% for 67 of 90 days), no meter without a term, and the banner inside the block.
- Checks: typecheck and `eslint src` pass; `src/features/connection` 60/60; e2e `permissions-conn` 7/7; `a11y` Business Central pages (light, dark) and QniConnect pages at 390, 3/3.
- Screens: `.taste-skill/after-2/app/admin_-*`.
- Side note: one run of `vitest run <path> | grep` printed "no tests" twice this session; an immediate re-run ran the files normally.

### Setup index and Audit log
- `SetupIndex.tsx`: **Recent changes** under the six section cards (`tid.setup.recent`). It shows:
  - The five newest audit entries, each as action, detail, then who · when (`recentRow(id)`).
  - "View audit log" (`recentAll`, to `/setup/iaudit`), plus loading, error (`recentError`) and empty (`recentEmpty`) lines.
  - It shows only when the nav offers the Audit log (the `framework` capability), and reads `useAudit({})`, the log's own unfiltered query, so opening the log afterwards is instant.
- `features/audit/entry.ts`: `ENTITY_LABEL`, `whoLabel` and `detail` moved out of `AuditPage.tsx` (unchanged), so both pages word an entry alike; new `auditCount()`.
- `AuditPage.tsx`: the count beside the filters (`tid.audit.count`): "1 entry", "12 entries", or "1–200 of 1,284". The no-match sentence already existed ("No entries match these filters." with Clear filters), so it is unchanged. The truncation note under the table (`tid.audit.total`) is kept.
- Tests:
  - `setup-index.test.tsx`: the five newest, newest first, in the log's words, and the link.
  - `conn-gates.test.tsx`: an employee portal admin, who has no audit log, sees no Recent changes.
  - `audit-page.test.tsx`: `auditCount` cases, and the count against a 205-entry log.
- Checks:
  - Typecheck and `eslint src` pass.
  - `src/features/setup`, `audit` and `conn-gates`: 25/25.
  - e2e `audit`, `nav` and the `a11y` sign-in/permissions/audit and built-pages-at-390 tests: 15/16. The failure, `nav.spec.ts:168` (390px bottom-bar walk), timed out once waiting for a bottom-bar link; it passes alone in 16s. Watch it in the full run.
- Screens: `.taste-skill/after-2/app/admin_setup_asetup-*`, `admin_setup_iaudit-*`.

## Phase 2b notes (2026-10-26, asked for by the user)

The user's feedback: "Setup" said three times, data repeated everywhere, breadcrumbs confusing, notifications (banners) all over, the app dull since the top bar lost its lime, and fix the page hierarchy. They also asked that pay amounts be masked by default, with an eye toggle.

- **No breadcrumbs.** `PageHead`'s `crumb` is gone (`src/ui/Page.tsx`; a deliberate deviation from v15:364): the shell's area pill and tab strip say where you are.
  - The four crumbs that carried facts became `context`, one line under the title: My Calendar (role · location), Documents (whose), Team Home (location), Team timesheets ("Week commencing …").
  - Module pages already had "‹ All modules" in their strip.
  - The tests that pinned crumbs now assert there is none, or read the context line.
- **No one-tab strip at the Setup index** (`stripTabsFor` returns `[]` there; `shell.test.tsx` updated).
- **Page hierarchy.** Every page reachable by the three personas now has one h1 and no skipped levels (checked by a script that walks every tab).
  - `CardHead` titles are now `h2` (an optional `level={3}` for a card inside a titled section, used on Profile).
  - `AdminCard` titles are `h2` drawn at 16px.
- **Colour: the lead block** (`src/ui/Lead.tsx`, the prototype's `.mc.dark` look as a labelled section, `LEAD_PRIMARY` and `LEAD_SECONDARY` buttons).
  - Used on Home (latest payslip, net pay in lime) and Team timesheets (the waiting count, which was a yellow warning banner, now the page's answer in the lead). Same words, so the tests pass unchanged.
  - Home's lead no longer repeats net pay on its gross/tax line.
  - On Overview too since round 2 (the connection block; see below). Round 2 applied the default without the user's view; their call is still open.
- **Pay masking** (`src/ui/PayMask.tsx`: `usePayMask`, `PayMaskToggle`, `PayMaskEye`, `Masked`).
  - Every amount loads hidden, as "£••••" whatever the figure, and is not rendered until shown; nothing is remembered between visits.
  - Home: an eye beside the net pay figure (`tid.home.mask`) shows or hides the lead and the table.
  - Documents: a "Show amounts" button beside the fiscal year (`tid.docs.mask`).
  - Tests: Home's `open()` presses the eye before reading amounts. A new test checks the page loads hidden with no figure in the markup, that the eye shows and hides, and that a fresh visit is hidden again. The Documents R9 test checks the hidden state first.
- **Banners:** only the Team timesheets one is converted so far. The rule agreed in chat: keep banners for things that went wrong or need action, the page's answer goes in the lead, explanations become a note or the `?` tip, good news a quiet line. About half of the 36 banners are status or explanation.
- **Round 2 (user said "continue"; my recommended defaults applied):**
  - **Overview's connection block is on the lead surface.**
    - `[data-surface="inverse"]` in `tokens.css` now takes the dark theme's 300 status inks, and its status tints are mixed over the inverse surface. So `text-ok`, `text-warn`, `text-err`, banners and pills read on any dark-green surface, and the class names the tests check are unchanged.
    - `Meter` has an `inverse` option (pale figure, the clock ring's translucent track).
  - **Approvals button:** "Review and approve all" when every waiting timesheet is approvable here; otherwise it keeps the count, which is then informative (`team.test.tsx` updated).
  - **View buttons:** they use a document icon on Home and Documents, so the eye means only "show amounts" (Home's eye is `PayMaskEye`, beside the figure, with no native `title`, per `scripts/ui-source.test.ts`).
  - **New `src/ui/Note.tsx`:** a plain line with a small glyph, for explanations (`info`) and good news (`done`). It replaces the banners "Administrator privileges required" (Authorization dialog), "Only in-app notifications are delivered", "Saved in this browser", "In use by …" (pay codes), "Who sees this", "Nothing waiting on you" and "Everything is complete". Test ids and texts are unchanged. The banners left are errors, warnings and things needing action.
  - **Fixed a regression I introduced:** Documents at 390px scrolled sideways (the eye next to the fiscal year); the header actions now wrap.
  - **Checks:**
    - typecheck and `eslint src` pass; full unit suite 2468, all passing after two fixes (a native `title` on the eye, removed; `motion.test.ts`'s known flake, passing alone).
    - e2e before round 2: 75/76, the one failure being the Documents overflow, since fixed and passing. Round 2 has not had an e2e run yet: Claude Code stopped the dev server for low memory. Run the `a11y` Business Central and 1c groups first, as axe checks the new dark-surface contrast.
  - Screens: `.taste-skill/after-4/app`.
- **Open with the user:**
  1. Tab-and-title name mismatches: done 2026-10-27 (Ruling Q21, titles follow tabs: "Approvals", "Approvals", "Timesheet", "Profile").
  2. Pages whose first card repeats the title ("Employee types" and "Bank holidays").
  3. Approvals' count: done (button reads "Review and approve all" when it is all).
  4. View's eye icon: done (a document icon now).
- Screens: `.taste-skill/after-3/app`.

## Log

Add a line per session: date, account or session, what was done, where it stopped.

- 2026-10-26: installed taste-skill; ran the review; agreed the plan and decisions D1–D3; wrote this handoff. Stopped before Phase 1.
- 2026-10-26 (second account): Phase 1 items 1–5 and 7 done, item 6 done except £0.50 and the copy (held by the user). Checks and after-screenshots are in "Phase 1 notes". Stopped before Phase 1b; nothing committed, no baselines refreshed.
- 2026-10-26 (second account, same session): Phase 1b done (see "Phase 1b notes"). Stopped before Phase 2 (Home, starting with the lead payslip block and the Today strip); nothing committed, no baselines refreshed.
- 2026-10-26 (second account, same session): Phase 2 done: Home (Ruling Q19) with the Today strip, Overview (Ruling Q20), Setup index Recent changes, Audit count. Stopped before Phase 3; nothing committed, no baselines refreshed. Still open with the user: £0.50 and the Pricing copy, `.agents/` in the ESLint ignores, the public footer's 12px gutter.
- 2026-10-26 (second account, same session): Phase 2b, rounds 1 and 2 (see "Phase 2b notes"): no breadcrumbs, page hierarchy, the lead block on Home, Approvals and Overview, pay masking, banners to notes. Stopped with round 2 unit-tested but not e2e-tested (the dev server was stopped for low memory). Next: the e2e groups named there, the tab and title names (user's choice), then Phase 3.
- 2026-10-27: `e2e/a11y.spec.ts` on round 2: 39/40 passed. "phone: plan 1b pages have no horizontal overflow at 390px" timed out at 30s, and failed again when run alone. The trace shows no hang: three sign-ins and eight page loads take about 31s. It now has a 60s budget, as its axe siblings do, and passes (31.5s). Started the full `npm run e2e` (Phase 3, step 1). The visual specs are expected to differ until the baselines are refreshed.
- 2026-10-27 (same session): full `npm run e2e`: 146 passed, 41 failed in 45.9m. 37 failures are visual baselines (expected, not yet refreshed). Of the 4 functional failures, 3 were load flakes that pass alone (`links-1c:46`, `nav:86`, `public:38`). `faults-1b:12` timed out with every assertion passing (a long journey across three personas); it now has a 90s budget and passes (26s). Then Ruling Q21 (titles follow tabs, logged in `progress.md`): four `PageHead` titles changed; typecheck passes and the approvals, timesheet, profile and shell unit tests pass (264). Next: refresh the visual baselines after a side-by-side check (they now include the renamed titles), then the after-screenshots. Still open with the user: £0.50 and the Pricing copy, `.agents/` in the ESLint ignores, the public footer's 12px gutter, cards that repeat the page title, and the colour mock-up.
- 2026-10-27 (same session): the user agreed £0.50 (Ruling Q22: Pricing, the Registration plan card and the step 4 line; `planLine` formats the pence, `pricing()` is unchanged; inventory PRICE.R5 and REG.R13 updated) and `.agents` in the ESLint ignores (`npm run lint` now passes). Typecheck passes; the public and registration unit tests pass (79). The Pricing stock-copy rewrite still needs wording sign-off. Explained to the user: the footer gutter and the lead block (already on Overview since round 2). Suggested: the cards that repeat the page title. Their answers are pending.
- 2026-10-27 (same session), the user's answers:
  - **Pricing (Ruling Q23):** one base price, £0.50 per employee a month (£0.40 annual), plus Timesheet and Onboarding as add-ons, "Price to be confirmed". Prices are in `src/domain/pricing.ts`. Pricing rewritten: no tiers, no comparison, plain copy, the price at 48px. Registration step 3 shows the base, the add-ons and a base-only total. Inventory PRICE and REG rows noted. The new copy needs the user's sign-off.
  - **Employee types:** the card's repeated title is gone; its line is now the page's context line and its tip is merged into the page tip. Types are a dropdown (`SelectBox`, `tid.types.list`); `tid.types.chip(code)` now names the dropdown's option, and the tests open the dropdown first.
  - **Bank holidays → Calendar** (tab and title); the "Bank holidays" card keeps its name.
  - **Public gutters (Ruling Q24):** 16px below lg on every public page and the footer.
  - **Lead block on Overview:** the user is happy; it stays.
  - **ESLint** was explained to the user.
  - Checks: typecheck and `npm run lint` pass; unit: public and registration 74, Employee types, Calendar, nav, shell and setup 179, all passing. Then: Pricing's h1 became the price ("£0.50 per employee a month", 48px, 30px on a phone) with the card titled "What QniConnect includes" and How access works across two columns, and the type dropdown is 320px wide (full width on a phone). e2e: public, `admin-1b`, `faults-1b` and the a11y QniConnect and 1b groups pass (`fillRegistration`'s total is now £192.00). The taste inspector on /pricing: the FAILs left are no pictures, no motion, the 48px ceiling and off-centre (the shared top bar's Sign in, not the content), kept by decision 2. Screens: `.taste-skill/after-5/`. Next: the visual baselines (side by side), then the after-screenshots.
- 2026-10-27 (same session): **visual baselines refreshed**, as the user asked. All 200 were regenerated: 41 unchanged, 159 changed. Every changed one was checked side by side (old | new | changed pixels) against a brief of the intended changes, by three reviewers in parallel, with each flag checked against the code.
  - Unexplained-looking changes that turned out to be earlier deliberate work: "Send back" on table rows (`review-fixes.test.tsx:130`), My Calendar on the Timesheet screens (`nav.test.ts:48`), the Lucide bottom-bar icons, "Home" on Registration (REG.R10), Willow House in use 15 (14 employees and 1 project in the seed; the seed's build hash changed too), and the "Not yet connected" pill at 1440.
  - One real fault in the new work, fixed: Setup index's Recent changes at 390 squeezed the entry into a column and broke the email mid-word. The entry now has a 16rem base, so who and when wrap under it (`SetupIndex.tsx`).
  - Existing issues noticed, not fixed (out of scope): the week grid's time inputs at 390 clip "07:00" to "07:C"; Notifications at 390 clips its selects; bottom-bar labels truncate ("Employee").
