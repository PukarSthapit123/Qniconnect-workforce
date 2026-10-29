# QniConnect Workforce: merged front end

2026-10-19 · Status: draft for review · Folder: `C:\dev\qniconnect-workforce`

## 1. What this is and why

Two apps are being combined into one new project:

- **QniConnect-FrontEnd** (`C:\dev\qniconnect front end\QniConnect-FrontEnd`, branch `Qnipay-workforce-pukar`, commit `0aa2699`) is the working product: Microsoft Entra sign-in, real Business Central data through the QniConnect API (`/bc/...`), environments, registration, admin, payslips, tax documents and the profile. It is 41 JavaScript files on Create React App and React 18, with no working tests.
- **qnipay-workforce-app** (`C:\dev\qnipay-workforce-app`, branch `main`, commit `d19648f`) is the larger prototype: about 58,500 lines of strict TypeScript, a design system, a layered code structure, 156 unit test files and about 50 Playwright specs. It runs only against an in-browser fake server.

The new project takes **the design from Workforce**, **the working code from QniConnect**, and **the Timesheet and Onboarding modules from Workforce** with everything they need. QniConnect's code is converted to TypeScript and may be upgraded into Workforce's structure, but nothing that works today may stop working or lose behaviour.

The next step after this one is the backend and the `/api/v1` APIs. This project only prepares the front end for them.

Earlier planning this builds on:
- The merge design of 14 Oct, `QniConnect-FrontEnd/docs/superpowers/specs/2026-10-14-qniconnect-workforce-merge-design.docx` (decisions D1 to D17, questions Q1 to Q8).
- The delivery plan of 18 Oct, `qnipay-workforce-app/docs/backend/06-delivery-plan.md` (decisions P1 to P10, phase 1 "front-end merge").
- The Workforce backend design `qnipay-workforce-app/docs/backend/00` to `05` and `contract/openapi.json`.
- The Workforce UI craft review `qnipay-workforce-app/docs/ui-review-2026-10-18.md`.

**This design changes D4 and P1.** D4 put the merge in the QniConnect repo and P1 put it in the Workforce repo. The user chose a third option: a completely new folder, with both existing repos left untouched as sources. Everything else in D1 to D17 and P9 holds unless this document says otherwise.

## 2. Goals, non-goals, anti-goals

**Goals**
1. One new project in `C:\dev\qniconnect-workforce` with Workforce's toolchain, design system and app frame.
2. Every QniConnect feature ported to strict TypeScript, working against the real `/bc` endpoints exactly as it does today.
3. Workforce Timesheet (with clocking) and Onboarding (with templates by job profile) ported with their employee, manager and admin screens, their shared services, their setup screens and their tests.
4. My Calendar (the Workforce Home calendar) with the timesheet layer only.
5. Areas both apps have merged into one screen each: Profile, Documents, People & access, the notification bell.
6. The UI follows the Workforce design system and Emil Kowalski's design engineering rules (section 9), so it reads as crafted, not generated.

**Non-goals (this step)**
- The backend, the `/api/v1` endpoints, Business Central `SIR_WF` tables, the Node layer. That is the next step.
- Deployment and hosting. The project does not need to be live. Nothing here has to be deployable while the work is in progress.
- Rota, Leave, Notices, Hours, Exceptions, Payroll readiness, the Business Central integration page and posting hours to payroll. They stay in the Workforce repo for later.
- The onboarding form builder (Workforce "project C"), which the user parked on 18 Oct.

**Anti-goals: these would make it a failure even if it builds**
- A QniConnect feature that worked before is missing, behaves differently, calls a different endpoint, or loses an edge case such as the inactivity sign-out.
- Fake data reaching a real `/bc` call, or a `/bc` call being intercepted by the fake server.
- Screens that look generic or AI-generated: hard-coded colours, one-off spacing, default easings, missing press feedback, components outside the design system.
- Workforce code downgraded (React 18, router 6, JavaScript) to suit QniConnect. Upgrades only.

## 3. Decisions

"User" marks what the user decided. "Carried" marks a decision from the 14 Oct design or the 18 Oct plan that still holds. "Builder's call" marks what was decided on the user's behalf. The user can change any of these.

| # | Decision | Source |
|---|---|---|
| N1 | A new folder, `C:\dev\qniconnect-workforce`, with a fresh `git init` on `main`. No remote until the user names one. Both source repos stay untouched. | User (folder), builder's call (path, git) |
| N2 | Design from Workforce: tokens, Inter font, shadcn/Radix components, `Page`/`Card`/`Pill` patterns, the dark green top bar with area pills, tab strip and phone bottom bar, light by default with a dark toggle. | User, carried D5 |
| N3 | Code from QniConnect: sign-in, portal check, environments, account setup, registration, pricing, admin, payslip dashboard, documents, profile. | User |
| N4 | QniConnect code is converted to strict TypeScript and rebuilt into Workforce's layers (`contract` → `api` → `domain` → `features` → `ui` → `shell`). Upgrading is allowed. Losing behaviour is not (section 5). | User |
| N5 | Timesheet and Onboarding come across with every table, screen and service they depend on, per Workforce. | User |
| N6 | Workforce's toolchain as it is: Vite 8, React 19, react-router 8, TypeScript 6 strict, Tailwind 4, React Query, zod, MSW, Vitest, Playwright, axe. | Carried D2, D3 |
| N7 | Build approach: copy Workforce's toolchain and shared layers in first, then the in-scope modules, then port QniConnect onto them. Out-of-scope modules are left out, not copied and switched off. | Builder's call |
| N8 | Sign-in is MSAL and Entra only. The Workforce email and password sign-in and its session-token storage are removed. | Carried D7 |
| N9 | QniConnect features call the same `/bc` and `/session` endpoints as today, unchanged on the wire. Workforce modules call `/api/v1`. **No backend exists yet** (user, 19 Oct), so both run on the fake server for now under two separate switches: `VITE_FAKE_BC` for `/bc` and `/session`, and the per-module `VITE_FAKE_MODULES` for `/api/v1` (D9). Pointing `REACT_APP_API_BASE_URL` at a real QniConnect API with `VITE_FAKE_BC` off must work with no code change. | User (no backend), changes D9 |
| N20 | The fake `/bc` and `/session` responses are built from the behaviour inventories (section 5): every field the QniConnect code reads, with the shapes it expects. The fake `/bc` employees use the same employee numbers as the Workforce seed, so People & access, Profile and Documents line up in development. | Builder's call |
| N10 | Product name and logo: **QniConnect**, using QniConnect's logo files. The "Workforce core" module label becomes "QniConnect". | Carried P9 |
| N11 | Navigation per D6: My work / My team / Setup, built from capabilities. Home stays the payslip dashboard. Old QniConnect URLs redirect. | Carried D6 |
| N12 | Roles per D8: Workforce user types and capabilities. QniConnect's `isAdmin` still gates QniConnect's admin pages, and if the two disagree, `isAdmin` wins for admin access. | Carried D8 |
| N13 | The Workforce UI review's design-system fixes go in with the foundation. Its bug findings for in-scope modules are fixed when that module is ported (section 9). | Builder's call |
| N14 | Dimensions (job profiles, locations, departments, categories) comes across, because the employee form and onboarding templates by job profile need it. | Builder's call |
| N15 | Vite keeps the `REACT_APP_` prefix through `envPrefix`, so QniConnect's `.env.development` and `.env.production` values carry over unchanged. | Builder's call, carried D3 |
| N16 | The Vite dev server runs on port 3000 (`strictPort`), not Workforce's 5173. QniConnect's registered Entra redirect URI and the backend's CORS list already accept `http://localhost:3000`, and MSAL uses `window.location.origin`. | Builder's call |
| N17 | Automated tests sign in through a **test-only MSAL stub** that hands back a fixed account and token, and Playwright route interception answers `/bc` and `/session` calls with recorded responses. The stub exists only in test and dev builds, under the same flag as the fake server, and `build:check` fails if it reaches production. Workforce's `signInAs` helper is rewritten on top of it, so the e2e specs keep their shape. | Builder's call |
| N18 | Admin access has two independent gates. QniConnect's pages (Environments, Authorization, Settings, the admin overview, the portal-login half of People & access) are gated by `isAdmin` from `/session/init`. Workforce setup pages are gated by capabilities from the Workforce session. In development, when `isAdmin` is true and the dev mapping finds no seed account, the picker defaults to a seed admin. Neither gate raises or lowers the other. | Builder's call, narrows D8 |
| N19 | Real data never meets fake data on the wire. People & access joins the two sides by employee number in the browser only and shows unmatched rows on both sides with a "not yet connected" label. The portal invite offered when an onboarding starter starts is a fake-server call while Onboarding runs on the fake server, and becomes the real `/bc/portalUsers` call only when the onboarding backend exists. | Builder's call |

## 4. What the new project contains

### 4.1 From Workforce

| Layer | What comes across |
|---|---|
| Tooling | `vite.config.ts`, `tsconfig*.json`, `eslint.config.js` (no hex colours, features may not import the fake server), `vitest.config.ts`, `playwright.config.ts`, `components.json`, `scripts/` (`lift-tokens`, `openapi`, `build-check`, `fake-server-flag`, `extract-seed`, `postbuild`), `.claude/skills` and `.agents/skills` (the design and animation skills). |
| `src/lib`, `src/ui`, `src/ui/shadcn`, `src/test` | All of it. |
| `src/shell` | All of it except `SignIn.tsx`. `SessionProvider` is rebuilt on MSAL (section 6). |
| `src/contract`, `src/api`, `src/domain`, `src/mocks` | Core (`common`, `endpoints`, `session`, `tenant`, `client`, `query`, `mutation`, `session-events`, `nav`, `capabilities`, `time`, `codes`, `modules`, the fake-server engine) and the in-scope services and modules below. `api/session-token.ts` is removed. |
| Shared services | employees and lifecycle, access and permissions, approvals and delegations, notifications, audit, organisation and organisation templates, reference data, bank holidays, pay codes (read only, as in 06 phase 2), employee types, dimensions, modules, history, self-service, profile change requests, setup index. |
| Timesheet | `features/timesheet` in full: day and week views, clock card, multi-week, team matrix, queue and approvals, proxy entry, timesheet setup. Plus `domain/timesheet`, `domain/clock`, `api`/`contract`/`mocks` for timesheets and clock. |
| Onboarding | `features/onboarding` in full: starter portal, manager tracker, setup with templates by job profile. Plus `domain/onboarding`, `domain/onboarding-templates`, and their `api`/`contract`/`mocks`. |
| My Calendar | `features/home` `HomePage` and `DayDialog`, renamed My Calendar, with the shift, leave, sickness, notices and "Book time off" parts removed (D16). |
| Contract | `contract/openapi.json` regenerated from the ported contracts only, so the backend step starts from exactly what this app calls. |
| Tests | Every unit and e2e test for the in-scope code, with its visual baselines regenerated after the rename to QniConnect. |

**Left out:** rota, leave, sickness, notices, hours, exceptions, payroll readiness, integration (Business Central page), posting. Where an in-scope file imports one of these, the builder cuts it at the narrowest point (removes the layer, the card or the menu entry) and adapts the tests that covered it. The builder records each cut in the plan.

### 4.2 From QniConnect

| QniConnect today | New home |
|---|---|
| `auth/authConfig.js`, `auth/AuthContext.js`, `components/auth/*` | `shell` and `api`: MSAL set-up, `SessionProvider`, sign-in and sign-out, auth callback and error pages |
| `components/auth/EnvironmentSelector.js`, `FirstLoginHandler.js` | `features/account-setup` (renamed from "onboarding", D6) |
| `components/RegistrationAndLanding.js`, `EnhancedRegistration.js`, `SiriusConnect365Licenses.js`, `AuthPages.js` | `features/landing`, `features/registration`, `features/pricing`. Public pages, outside the app frame. |
| `components/EmployeePortal.js` dashboard | `features/home` (Home) |
| `components/portal/EmployeeDocuments.js`, `common/PdfPreviewModal.js`, `common/FiscalYearSelectionModal.js` | merged Documents (section 7) |
| `components/portal/EmployeeProfile.js` | merged Profile (section 7) |
| `components/admin/*` | Setup: Environments, Authorization, Settings, an admin overview, and portal users merged into People & access (section 7) |
| `services/businessCentralService.js`, `apiService.js`, `tenantVerificationService.js` | typed `contract/bc-*.ts` and `api/bc-*.ts` modules (payroll, documents, employee, portal users, environments, notifications, registration, authorization, session) on Workforce's `api()` client |
| `components/common/CorsDebugger.js`, `CorsErrorHandler.js`, `DebugPanel.js`, `utils/logger.js` | Development-only diagnostics, kept behind `REACT_APP_DEBUG` as today. The builder decides their exact form. |
| `PortalSwitcher.js`, `UserPortalLayout.js`, `admin/AdminLayout.js` | Replaced by the Workforce shell. Their behaviour (environment badge, theme toggle, bell, user menu, admin/employee switching) moves into it. |
| `assets/QniConnect_Logo*.png` | `ui/Logo.tsx` |
| `.env.development`, `.env.production` | Copied unchanged (N15) |

## 5. Keeping QniConnect working (the no-downgrade rule)

Before a QniConnect feature is ported, the builder writes a **behaviour inventory** for it under `docs/superpowers/inventory/<feature>.md`. It records what the feature does today, read from the code:
- every endpoint it calls, with method, path, query parameters, headers and body
- every screen state: loading, empty, error, success, partial
- every rule and edge case

The ported feature gets unit tests that check each line of its inventory, using the fake `/bc` responses (N20). A reviewer compares the inventory against the old code before the port starts.

**There is no backend to test against yet.** "Works" in this project means: the feature passes its inventory tests and e2e specs, and it works in the running app against the fake `/bc`. The check against a real QniConnect API happens in the backend step, before anything goes live. To make that check fast, each inventory also lists every response field the code reads, so the real responses can be compared field by field.

**Endpoints that must keep working, unchanged on the wire:**
`/session/init`, `/session/verify`, `/bc/portalUsers`, `/bc/portalUsers/verify`, `/bc/portalUsers/:id`, `/bc/portalRegistrations`, `/bc/environments`, `/bc/environments/activate`, `/bc/client-tenant/companies`, `/bc/authorization/storeTokens`, `/bc/employees/current`, `/bc/employees/:id/p45`, `/bc/employees/:id/p60`, `/bc/employees/:id/p11d`, `/bc/payslips`, `/bc/payslips/:id/pdf`, `/bc/fiscalyears`, `/bc/notifications`, `/bc/notifications/:id`, and the CORS test call. The builder confirms this list against the code in the inventory step. Anything else found there is added.

**Behaviours known to matter (not exhaustive):**
- The MSAL scopes, authority and redirect handling as configured today, including the auth callback page.
- The portal check after sign-in, then session init, then environment selection, then the first-login overlay.
- `isAdmin` is never trusted from localStorage.
- The 5-minute inactivity sign-out and the cross-tab sign-out.
- The `X-BC-Environment` and `X-Registration-ID` headers.
- Payslip PDF preview and download, and the tax documents by fiscal year.
- Notifications marked as seen.
- Registration and tenant verification, including the company lookup.
- The CORS error handling the user sees today.

An upgrade is welcome where it keeps the behaviour: typed responses, zod validation, React Query caching, shared components, accessibility. An upgrade that changes what the user sees or what the server receives needs the user's approval first.

## 6. Identity and session (carried D7)

1. MSAL sign-in, as QniConnect does it today.
2. The portal check: `/bc/portalUsers/verify`, then `/session/init` (on the fake `/bc` until a backend exists, N9). This returns `isAdmin`, first-login status, `registrationId` and `employeeNo`. Environment selection follows as today.
3. The Workforce session: `GET /api/v1/session` on the fake server returns user type, capabilities, the new-starter flag and view-as.

The `api()` client gets the access token from MSAL through one injected provider. It adds `X-BC-Environment` and `X-Registration-ID` to every call, `/bc` and `/api/v1` alike. Any 401 signs the user out (Workforce), refusals show as toasts (Workforce), and the inactivity and cross-tab sign-outs are kept (QniConnect).

While the fake server is on, it maps the email in the MSAL token to a seed account without verifying the token (development only). When there is no match, a development-only picker chooses a demo person, so the employee, manager and admin screens can be tried with any Entra account. The picker and the fake server are compiled out of production builds.

## 7. Merged areas

| Area | Result |
|---|---|
| Profile | One page: QniConnect's Business Central sections (personal, contact, employment, tax and NI, masked banking, pension) are real data. Workforce's "propose a change" flow and the approval queue sit on top and run on the fake server, labelled as not yet connected. |
| Documents | One page: QniConnect's payslips (with PDF preview) and P45/P60/P11D by fiscal year fill the payroll slot that Workforce marked "Not yet connected". Workforce documents sit beside them. |
| People & access | One admin page. Each person is keyed by employee number, with their portal login (real `/bc/portalUsers`: invite, activate, deactivate, admin flag, first-login status) and their Workforce profile (fake server: user type, capabilities, lifecycle, location, line manager). Fake-server parts are labelled. (D12) |
| Notification bell | One bell fetches `/bc/notifications` and `/api/v1/notifications/me`, maps both to one shape with `source`, sorts them by time, and marks an item read on the backend that sent it. (D13) |
| Setup | One Setup area: QniConnect's Environments, Authorization and Settings beside the Workforce setup pages. |
| Account setup | QniConnect's first-login and environment flow, renamed so that "Onboarding" means employee onboarding only. |

## 8. Navigation (carried D6)

- **My work:** Home (payslip dashboard), My Calendar, Timesheet, Profile, Documents. New starters see only Onboarding.
- **My team** (managers): team timesheets and approvals, the onboarding tracker, employees.
- **Setup** (admins): People & access, Approvals, Notifications, Organisation, Bank holidays, Dimensions, Pay codes, Employee types, Modules, Audit, Timesheet setup, Onboarding setup, Environments, Authorization, Settings.
- **Public, outside the frame:** landing, registration, pricing, auth callback, auth error.
- **Redirects:** `/portal/dashboard`, `/portal/documents`, `/portal/profile`, `/admin/dashboard`, `/admin/users`, `/admin/environments`, `/admin/authorization`, `/admin/settings` and `/environment-select` go to their new routes.
- The top bar gains QniConnect's environment badge.
- Admins can now see their own employee pages too. Their landing page stays the admin overview unless the user says otherwise.

## 9. UI quality: the design system and Emil Kowalski's rules

Every screen, including each ported QniConnect page, is built from the Workforce design system and checked with the `emil-design-eng` skill before review. The skills folder comes across with the project, so the skill is available there.

**Design system, always**
- Colours, radii, shadows and type only through the tokens in `ui/tokens.css`. The no-hex lint rule stays on, and QniConnect's inline styles and hex values go.
- Components from `src/ui` and `src/ui/shadcn` first. A new component goes into `src/ui`, follows the same patterns and is used in more than one place, or it is not added.
- Page layout through `Page`, `Card`, `Row`, `Field`, `Pill` and the existing patterns. No one-off layouts.

**Motion and feel (from `emil-design-eng`)**
- Install and import `tw-animate-css`. Today no overlay animates because it is missing (review P1.7).
- Motion tokens in `tokens.css`: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`, plus durations. Never `ease-in`, never `transition: all`.
- UI motion stays under 300 ms: press 100–160 ms, tooltips 125–200 ms, dropdowns 150–250 ms, modals and drawers 200–300 ms. Exits are faster than entries.
- Press feedback (`scale(0.97)` on `:active`) on buttons, segmented controls, chips, the bottom bar and the clock buttons (review P1.9).
- Popovers and dropdowns scale from their trigger (`--radix-*-transform-origin`), and modals stay centred. Nothing enters from `scale(0)`.
- No animation on keyboard-initiated or very frequent actions: tab switches, week navigation, filters.
- Hover effects only under `@media (hover: hover) and (pointer: fine)`. `prefers-reduced-motion` keeps fades and drops movement.
- A visible focus ring that works on the dark top bar: a 2 px gap plus a 2 px solid ring (review P1.8).

**Review findings carried into this project**
- With the foundation: review Part B (design system and chrome) items that touch `src/ui`, `src/shell` and the CSS.
- With each module: that module's P0 and P1 findings from the review. For Timesheet that means the Monday-first week labels, DST hour counts and custom shift codes dropped in the queue. For employees, the line manager stored by name. For filtered lists, search losing focus.
- Findings for modules that are left out stay in the review for later.

## 10. Quality and checks

- `npm run verify` (types, lint, unit, e2e, build check) passes at the end of every step in section 11.
- Ported Workforce tests pass unchanged, except where they touch sign-in, navigation, renamed labels or a cut out-of-scope module. Each such change is listed in the step's review notes.
- Every QniConnect feature has tests built from its behaviour inventory (section 5).
- `package-lock.json` is committed.
- The production build is checked to contain no fake server, no seed data and no development picker (Workforce `build:check`).
- Each step is reviewed as a whole before the next starts. UI changes also get an `emil-design-eng` pass in the before/after table format.

## 11. Order of work

Each step leaves the app working. Each step gets its own plan section and review.

1. **Foundation.** Toolchain, `lib`, `ui` (with the section 9 design-system fixes), `shell`, the core `contract`/`api`/`domain`/`mocks`/`test`, the QniConnect name and logo. MSAL sign-in, the portal check, the Workforce session and the dev picker (section 6). The fake `/bc` engine with the session and portal-check responses. An empty app frame you can sign into with Entra, or with the dev stub.
2. **QniConnect features.** Behaviour inventories first. Then the typed `/bc` modules and their fake responses, account setup, Home dashboard, Documents, Profile (Business Central sections), Setup's Environments, Authorization and Settings, the admin overview, landing, registration, pricing, and the redirects. **Done when** every current QniConnect feature passes its inventory tests and works in the new look against the fake `/bc`.
3. **Shared services.** Employees and lifecycle, dimensions, People & access (merged), approvals, notifications (merged bell), organisation, bank holidays, pay codes, employee types, audit, modules, the Profile "propose a change" flow.
4. **Timesheet** with clocking, team screens and setup. **Done when** a day goes from draft to approved through the chain on the fake server.
5. **Onboarding** with templates by job profile. **Done when** a candidate completes onboarding on their template, a manager starts them, and the portal invite is offered (on the fake server, N19).
6. **My Calendar**, timesheet layer only.
7. **Hand-off to the backend step.** Regenerate `contract/openapi.json` from the ported contracts. Write a short note listing every `/api/v1` operation the app calls, module by module, as input to the backend work (06 phases 2, 3 and 5).

## 12. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | `@azure/msal-react` on React 19 | Confirm the supported version first in step 1, before anything else depends on it. |
| R2 | A QniConnect behaviour is lost in the rewrite | Behaviour inventories, tests from them, and review against the old code (section 5). |
| R3 | Cutting rota, leave and notices out of Timesheet, My Calendar and the shell breaks something subtle | Cut at the narrowest point, keep the tests that still apply, and list every cut. |
| R4 | The fake server reaches production, or stays on for `/bc` once a real backend exists | Separate `VITE_FAKE_BC` and `VITE_FAKE_MODULES` switches. A unit test proves `/bc` passes through when `VITE_FAKE_BC` is off, and `build:check` proves production has no fake server. |
| R8 | The fake `/bc` shapes, read from the QniConnect code, differ from what the real API returns | The inventories list every field read. The backend step compares real responses against them before go-live. |
| R5 | Real Entra users do not exist in the seed data | The dev mapping and picker (section 6). |
| R6 | The MSAL token's audience is Business Central's, which may not suit `/api/v1` later | Out of scope now. Recorded for the backend step (merge design Q3/R4). |
| R7 | The first step is large and hard to review | Step 1 is split into small reviewable tasks in the plan. |

## 13. Left to the builder

- The exact file and folder names inside each layer, following Workforce's conventions.
- How the cut-out modules are removed at each seam, within section 4.1's rule.
- The form of the development diagnostics (CORS debugger, debug panel).
- The order of the QniConnect features within step 2.
- How the visual baselines are regenerated after the rename.

## 14. Open questions carried from the 14 Oct design

These do not block this step. They are recorded so they are not lost.
- Q1: there is no `public/index.html` or lockfile in QniConnect-FrontEnd. Where the deployed build really comes from matters when this project goes live.
- Q2: whether a demo environment should run with the fake server on.
- Q4: who builds `/api/v1`, and in what order (06 proposes phases 2 to 5).
- For the backend step: which QniConnect API environment, Entra redirect URIs, CORS origins and test accounts (an admin, an employee with payslips and tax documents, a first-login user) the real-backend check uses, and whether writes may be tried against it.
- Q7: whether Home stays the payslip dashboard once Timesheet is live.
