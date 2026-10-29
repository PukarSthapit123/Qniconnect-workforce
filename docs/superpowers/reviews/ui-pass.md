# Task 24: design pass over the ported pages

The `emil-design-eng` pass and the design-system rules (tokens only, sentence case, motion rules in `constraints.md`) over every file created in Phase 5 (Tasks 13 to 21) and in Tasks 15 and 21. One table per page. Every row is fixed. Rows marked *(carry-in)* come from the controller's carry-ins after the Task 15 to 23 reviews.

Checked on every page with no change needed:
- no `transition-all`, no `ease-in`, nothing enters from `scale(0)`;
- every press scales (the shared Button, or the element's own `active:scale-*`);
- hover movement is gated to fine pointers (Tailwind v4 `hover:` only applies on hover-capable devices);
- modals are the design-system `Modal`: centred, fade and 0.95 in, faster exit, none when opened from the keyboard;
- colours come only from tokens (the no-hex lint rule passes).

Verified by: unit tests per row where behaviour changed (named in the Task 24 report), `e2e/a11y.spec.ts` (axe, light and dark, plus overflow at 390px), and the new visual baselines in `e2e/visual-qc.spec.ts`.

## Home (`src/features/home/HomePage.tsx`)

| Before | After | Why |
| --- | --- | --- |
| Labels in title case: "Latest Payslip", "Tax Information", "Contact Information", "Tax Code:", "NI Number:", "NI Category:", "Monthly Pay", table heads "Pay Date", "Gross Pay", "Net Pay" *(carry-in)* | Sentence case: "Latest payslip", "Tax code:", "NI number:", "Monthly pay", "Pay date", "Gross pay", "Net pay" … | Copy is sentence case; matches Documents' own table heads |
| Latest net pay `leading-[1.15]` *(carry-in)* | No arbitrary value; `text-2xl` carries the headline line-height token (`--qp-lh-headline`) | Type only through tokens |
| "Loading your payroll…" with no role | `role="status"` | The wait is announced, as Documents' is |

## My Calendar (`src/features/calendar/MyCalendarPage.tsx`)

| Before | After | Why |
| --- | --- | --- |
| Day heads `tracking-[.04em]` | `tracking-(--qp-tracking-caps)` | Caps tracking is a token |
| Month key counts `font-[650]` | `font-semibold` | Weights come from the token scale (400/500/600/700) |
| "Bank holiday" `leading-[1.25]` | `leading-(--qp-lh-12)` | Line-height token for 12px text |
| A day cell: hover border only, no press feedback | Instant `active:bg-surface-tint` | A pressable answers the press; a day is opened tens of times a month, so colour at once, no scale or fade |
| Loading line with no role | `role="status"` | Announced |

## Documents (`src/features/documents/DocumentsPage.tsx`, `FiscalYearDialog.tsx`)

| Before | After | Why |
| --- | --- | --- |
| The refusal banner said only what failed (QniConnect's words) | QniConnect's words kept, then "Try again in a moment. If it keeps happening, ask your payroll administrator." | A refusal says what happened and what to do next |
| Fiscal year option, a full-width row, pressed to `scale-[0.97]` | `active:scale-[0.98]` | A large surface scales less (as the environment options) |
| Chosen fiscal year: `border-brand` in dark theme | `dark:border-brand-accent` | The brand green border is near invisible on the dark card; every other chosen card uses the accent |
| Dialog title "Select fiscal year for Document" with no type | "… for document" | Sentence case |
| Workforce documents' loading line with no role | `role="status"` | Announced |
| *(carry-in, test only)* | `DOCS.R7, DOCS.R14: an open banner survives a change of the Fiscal year select` | QniConnect's dropdown case was not asserted |

## Profile and the bell (`src/features/profile/ProfilePage.tsx`, `src/shell/Inbox.tsx`, `src/shell/Shell.tsx`)

| Before | After | Why |
| --- | --- | --- |
| A payroll notification with no `systemId` stayed unseen for good: the badge could not clear and Mark all read left it *(carry-in)* | It is marked seen locally (no `PATCH /undefined`), on opening and on Mark all read | A badge that cannot be cleared reads as a bug; QniConnect also marked it seen on screen (BELL.R8) |
| Non-ISO payroll dates sorted last silently *(carry-in)* | Commented in `src/domain/inbox.ts`, and tested | Documented behaviour |
| Reveal eye (a 32px round button) pressed to `0.97` | `active:scale-[0.94]` | Small round pressables scale more, as the bell and theme buttons do |
| "n new" pill `px-[7px] leading-[1.6]` | `px-sm py-px leading-(--qp-lh-12)` | Spacing and line-height tokens |
| Profile and inbox loading lines with no role | `role="status"` | Announced |

## Setup › Business Central: Overview (`src/features/connection/OverviewPage.tsx`)

| Before | After | Why |
| --- | --- | --- |
| Quick action card `transition-[border-color,scale]` on the press duration | `transition-[scale]`; the hover border lands at once | Coordinated hover changes arrive together; only the press is timed (as `SetupCardButton`) |
| "View all users" a 12px text link on a phone | `max-md:min-h-touch` | 44px touch target |

## Environments (`src/features/connection/EnvironmentsPage.tsx`)

| Before | After | Why |
| --- | --- | --- |
| Open-in-a-new-tab icon shown with no address (`href` undefined): a button that did nothing | Shown only when there is an address | Never offer a control that cannot act |
| At 390px the details shared the row with "Set as default", so the address broke a few letters per line | On a phone the details take the row and the actions wrap under it | Readable address; seen in the new baseline |
| Bottom bar: "Environments" and "Authorization" cut with an ellipsis *(carry-in)* | Short names "Envs" and "Auth" (`NavTab.short`); the accessible name stays whole; e2e checks no label is cut | A cut label is unreadable |

## Authorization and Settings (`AuthorizationPage.tsx`, `SettingsPage.tsx`)

| Before | After | Why |
| --- | --- | --- |
| *(no row needed)* | — | Presses, focus rings, the copy status and the dialog already follow the rules; verified by axe |

## People & access (`PortalLoginPanel.tsx`, `AdminEmployeesPage.tsx`, `EmployeesWorkspace.tsx`)

| Before | After | Why |
| --- | --- | --- |
| *(carry-in, test only)* An admin persona without isAdmin had no direct test through the app | `conn-gates.test.tsx`: no portal panel, no portal column, no `/bc/portalUsers` read | Review focus 4 on this page |
| *(carry-in)* `portalUserUpdateStatus` labelled `AUTH.C6` only | `AUTH.C6, USERS.C4` | One endpoint, two inventory rows |

## Account setup (`src/features/account-setup/*`)

| Before | After | Why |
| --- | --- | --- |
| QniConnect's title case: "Access Not Provisioned", "Sign In Required", "Sign In", "Sign Out", "Environment Select", "Continue to Portal" | "Access not provisioned", "Sign in required", "Sign in", "Sign out", "Environment select", "Continue to portal" | Sentence case; QniConnect's sentences are kept |
| The welcome's busy label "Processing..." beside the page's "Processing…" | "Processing…" in both | One ellipsis character |

## Auth pages (`src/features/auth-pages/*`)

| Before | After | Why |
| --- | --- | --- |
| "Authentication Error", "Return to Home", "Authorization Successful", "Authorization Failed", "Return to Authorization Page" | "Authentication error", "Return to home", "Authorization successful", "Authorization failed", "Return to the authorization page" | Sentence case |

## Landing, Registration, Pricing, Login (`src/features/public/*`)

| Before | After | Why |
| --- | --- | --- |
| Landing headline `leading-tight tracking-tight` (Tailwind's own values) | `leading-(--qp-lh-36)`, `lg:leading-(--qp-lh-48)`; the base heading letter-spacing | Type only through tokens |
| Price `leading-none` | `leading-(--qp-lh-36)` | Line-height token |
| Comparison ticks: `aria-label` on an `svg` with no role | `role="img"` | A label on an svg is read only with a role |
| Registration done: `<h2 role="status">` (the role replaced the heading) | `<div role="status"><h2>…</h2></div>` | Announced and still a heading |
| "Processing..." on Complete registration | "Processing…" | One ellipsis character |
| "Essential Plan · 10 users" | "Essential plan · …" | Sentence case |

## PDF preview (`src/ui/PdfPreview.tsx`)

| Before | After | Why |
| --- | --- | --- |
| Fallback title "Document Preview" | "Document preview" | Sentence case |

## Shared, from the Task 7 and Task 23 carry-ins

| Before | After | Why |
| --- | --- | --- |
| The transition-all rule missed `[transition:all_200ms]` (its lookahead allowed `_`) | Lookahead `(?![a-zA-Z0-9-])`; pattern tested on samples | Tailwind's `_` is a space |
| The scale-from-nothing rule missed `scale-[.5]` | Matches `scale-[0]`, `scale-[0.5]`, `scale-[.5]`; passes `scale-[0.97]`, `scale-[.97]` | Nothing enters from scale(0) or under 0.9 |
| `data-input` stayed `keyboard` after typing, so a tip hovered next opened with no animation | `pointermove` sets it back to `pointer` (written only on a change) | Pointer input again |
| Refusal toast life `TOAST_LIFE_MS * 1.6` | `REFUSAL_LIFE_MS` (8000ms) mirrored in `--qp-life-refusal`, tested | No magic multiplier; a token |
| Remove on a dimension, pay code or employee type in use: confirmed, then refused by the server | Remove is off, with the reason beside it (and as its accessible description and disabled-button title) | Never offer an action that will be refused (ui-review rows 64, 66) |
| Audit: Who and Search asked the server on every character | Asked once the typing pauses (250ms, `src/lib/useDebounced.ts`); rows stay dimmed meanwhile | ui-review row 92 |
| Audit: "Nothing recorded yet" with filters set | "No entries match these filters." with Clear filters | ui-review row 93: empty-state copy must be true |
| Audit: `<>` block indented out of line with its JSX | Re-indented | Task 23 review minor |

## Backlog: the Task 7 deferred consolidation items (Ruling D1)

None of the nine changes what a ported page looks like or does, so none is picked up here. Each stays a design or refactor decision for later:

| Item | Why it stays in the backlog |
| --- | --- |
| Three disabled looks (tint vs one opacity token) | A visual decision for the design owner; changes every disabled control in every baseline |
| One SelectBox/Combobox with `searchable` | API change across feature forms; the ported pages use each correctly today |
| TextArea → shadcn Textarea | Changes auto-grow on every form; no ported page uses TextArea |
| Chip vs ChipButton merge | API change only; People & access looks the same either way |
| Five text-entry control families | Refactor only, no visual effect |
| Inbox → Radix Popover | Behaviour change (focus moves into the panel) needing its own tests; motion and layering are already fixed in place |
| One icon stroke (1.75) app-wide | Redraws every icon in every baseline; a design decision |
| Duplicate colour tokens (text-secondary/muted, sunken/tint) | Same values today; collapsing or differentiating them is a design decision |
| Repeated px literals (11/9 control inset) | Refactor only, no visual effect |
