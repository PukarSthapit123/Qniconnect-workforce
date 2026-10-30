# taste-skill review: qniconnect-workforce (2026-10-26)

Review only. No source changed. Dev server with `VITE_AUTH=stub VITE_FAKE_BC=on`, clock frozen at 2026-08-13 14:30.

- Public pages: `inspect.mjs` (page rules) → `landing/`, `pricing/`
- Signed-in screens: the inspector can't sign in, so I took screenshots with Playwright (`app/`) and judged them by eye against `references/app-screens.md`. **`inspect.mjs --app` did not run on these screens.**
- Source: `lint.mjs --app src` → `lint-app.txt`

## Public pages (page rules)

ROUND 1 — landing `/`
Seen in one second: the white sign-in card on a dark green field.
Idea: none beyond the category ("Your payroll. On your time." could be any payroll SaaS).
Live thing: none (sign-in is the action, not a live element).
Layout words: hero=split (pitch | sign-in card) / footer=bar.
Scores: design 6 · usability 8 · creativity 5 · content 6 → overall 6.4
Caps applied: inspector FAILs (≤6.0); eyebrow pill (≤6.5); <4 pictures (design ≤6.5).
Top three problems:
1. desktop-fold: an eyebrow pill ("Employee self-service portal") above the h1, and three trust-badge pills under it. Fold the pill's words into the supporting sentence; turn the badges into one plain line, or drop them.
2. desktop-fold: no dominant element. The 48px h1 (3.3vw) and the card compete, and about 250px of empty green sits above and below them. Make the headline the display size, or show a real product fragment (a payslip, the timesheet clock) as the picture.
3. tablet/mobile: text sits 12px from the edge (`edge-text`), the "or" divider is drawn with hairlines, and the footer has a top rule. Use a 16–20px gutter, separate with space, drop the rules.

ROUND 1 — pricing `/pricing`
Seen in one second: a grey page of small boxes; nothing leads.
Scores: design 5 · usability 6.5 · creativity 4 · content 5 → overall 5.3
Caps applied: inspector FAILs; eyebrow; numbered steps (1/2/3 in tinted circles); a row of three identical cards.
Top three problems:
1. desktop: the page sits off-centre (198px left margin, 100px right) and is pushed into the left two-thirds at 1440. Centre the column, or give it the full grid.
2. "£0.5" is the largest thing on the page and the h1 is only 24px. Show the price as £0.50 (money takes 2 decimals) and make the plan comparison the main block.
3. Stock copy ("Seamless", "streamline", "intelligently adapts"), 14px grey body, and "How it works" as numbered cards. Rewrite in plain, specific words at 16px in full ink, and replace the cards with one sentence or a short list.

## App screens (app rules, judged by eye)

Screen questions:
- employee Home: "Was I paid, and is there anything I need to do?"
- manager Approvals: "Who is waiting on me?"
- admin Overview: "Is the BC connection healthy?"

What works: the manager Approvals screen. It leads with its finding ("3 timesheets awaiting your decision", with SLA context) next to the action, and every row has Approve / Send back. Numbers are right-aligned on the payslip table. Real UK data throughout (NI, tax code, Willow House). The phone gets a proper bottom tab bar.

Answers to app-screens §2.7:
1. **Biggest thing ≠ the answer.**
   - Employee Home: the greeting and the profile card come first. Net pay £1,767.54 is 24px, the same as "Tax code: 1257L". There is no action (clock in, today's shift).
   - Admin Overview: four equal KPI tiles; nothing leads.
   - Setup, Audit log and Overview end at about 350–670px, leaving half the 900px screen empty.
2. **Edges and holes.**
   - Home: the Latest payslip and Tax cards are stretched to the Contact card's height, leaving about 90px of blank under each (`panel-void`).
   - Overview: Portal users has about 60px of blank inside it.
   - Timesheet: the right column ends at about 590px while the form runs past the fold.
3. **Colour on chrome.**
   - The shell is a near-black green bar with a lime filled pill on the active area, plus a lime avatar and an outlined uppercase role pill. That breaks "no dark or saturated chrome on a light screen" and "accent on data, not chrome".
   - Lime also tints the icon squares on Setup, Overview quick actions and resources (icons in tinted squares: banned).
   - The data itself (hours, pay) carries no hue.
4. **Numbers.**
   - Calendar: "Hours this week 7.5h of 37.5h" sits beside "45.0h recorded" for the month, with no baseline named. The week's Draft days are 3–7 Aug (5 × 7h30 = 37.5h), so the 7.5h is the 12th's Submitted day only. The card needs its window and states in words.
   - "£0.5" on Pricing.
   - Payroll figures look consistent (2,047.50 − 200.00 − NI ≈ 1,767.54; NI isn't shown).
5. **Repeated states.**
   - People & access shows a green "Active" pill twice on nearly every row (State and Portal login). One status mark per row is the rule; colour should go only on the exceptions (Pending first login, Candidate).
   - "Resubmitted · 0" is a zero shown as a filter.
6. **Tables.**
   - Uppercase tracked headers on every table, and zebra striping on Home payslips and People & access. Both are on the banned list.
   - "(1)" after each status has no clear noun.
7. **Phone and tablet.**
   - 390 manager: the area switcher's mask cuts "My Team" to "My", so the active area can't be read.
   - 768 People & access: the table overflows. "Candidate" is cut and Portal login, Edit and Open are off-screen; names wrap to two lines while the type column has room. The tablet band should drop to sublines (§12).
   - 390 Home: four stacked cards push the payslip list two screens down.

Scores (app): design 6 · usability 7 · creativity 5 · content 8 → overall 6.5. Reads as a well-built kit (Inter on #f8f9fc, white cards); the dark green and lime are the only face.

## Top three changes that would move the app most
1. **Quiet the shell.** Put the top bar on the page ground, or one tone off it. Mark the active area with a neutral pill or ink weight, not filled lime. Make the role pill sentence case and neutral. Keep the brand green for the primary button and the main data element (hours worked, net pay). Touches `src/shell/Shell.tsx`, `TopBar.tsx` and `tokens.css`.
2. **Tables to rules and alignment.** Use 12px grey sentence-case headers. Drop the zebra rows and the second "Active" pill (colour only the exceptions). Below about 1100px, switch to two-line rows. One table component change fixes Home, People & access, Approvals and Audit.
3. **Make each screen's answer the biggest block.**
   - Employee Home: lead with today (the clock or shift) and net pay at about 30–36px. Put the profile facts in a compact side column with no stretched cards.
   - Admin Overview: lead with connection health and the authorisation expiry, and remove the tinted icon squares.
   - Setup index and Audit: size the frame to the content, or use the width (for example, show recent audit events on the Setup index).

## Lint notes (source)
- 32 FAIL / 32 WARN, but most are noise:
  - "Acme" and the emoji hits are in test files.
  - ✓ ◷ ↻ ✕ ✎ are text status glyphs, not emoji.
  - The `index.css:278` and `Shell.tsx:154` gradients are functional scroll-edge shades and masks, which is defensible.
- Real ones: stock words in `PricingPage.tsx` (35, 47, 60, 85); 18 resting shadows (e.g. `ModulesPage.tsx:90`, `SetupIndex.tsx:56`); `font-mono` in `OnbSetupPolicies.tsx` (fine only if it shows IDs or code); 74 em dashes in the UI copy.
