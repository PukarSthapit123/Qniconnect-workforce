# QniConnect Workforce merge: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One new front end in `C:\dev\qniconnect-workforce` that combines:
- Workforce's design, toolchain, Timesheet and Onboarding
- every QniConnect feature, ported to strict TypeScript with no lost behaviour
- fakes for both backends.

**Architecture:**
1. Copy the Workforce app as it stands, prove it is green, then prune the out-of-scope modules one at a time while keeping it green. The end state matches design N7.
2. Replace the simulated email/password sign-in with an auth adapter. It is MSAL in the app and a stub in tests and dev.
3. Write a behaviour inventory for each QniConnect area, then rebuild that area on Workforce's layers. Its `/bc` calls get a typed client and their own fake server.

**Tech stack:** Vite 8, React 19, react-router 8, TypeScript 6 (strict), Tailwind 4, shadcn/Radix, React Query 5, zod 4, MSW 2, Vitest 5, Playwright, axe, `@azure/msal-browser` 4.

**Spec:** `docs/superpowers/specs/2026-10-19-qniconnect-workforce-merge-design.md` (decisions N1 to N20). Read it before any task.

**Sources (read-only, never modify):**
- Workforce: `C:\dev\qnipay-workforce-app` (`main`, `d19648f`), referred to as **WF**.
- QniConnect: `C:\dev\qniconnect front end\QniConnect-FrontEnd` (`Qnipay-workforce-pukar`, `0aa2699`), referred to as **QC**.

## Global constraints

- **No commits and no pushes** (user, 19 Oct). Each task ends with a local checkpoint, `git add -A`. A reviewer reviews `git diff` (unstaged = this task), and `git diff --cached` holds everything approved so far.
- `npm run verify` (typecheck, lint, unit, e2e, build:check) passes at the end of every task. A task that cannot get it green stops and reports. It never skips, deletes or weakens a test to get there, unless the task says to remove that test with its module.
- Dev server port **3000** with `strictPort: true`. Playwright's default `E2E_PORT` is 3000 too.
- Vite `envPrefix: ['VITE_', 'REACT_APP_']`. QC's `.env.development` and `.env.production` are copied byte for byte.
- Product name **QniConnect**. The logo comes from QC `src/assets/QniConnect_Logo.png` (light) and `QniConnect_Logo_Dark.png` (dark). Never "Qnipay" or "Qnipay Workforce" in UI copy, page titles or test ids that show text. Test id *keys* may stay.
- MSAL config is QC `src/auth/authConfig.js`, copied verbatim in meaning:
  - authority `https://login.microsoftonline.com/common`
  - `redirectUri` and `postLogoutRedirectUri` = `window.location.origin`
  - `navigateToLoginRequestUrl: true`
  - cache in `sessionStorage` with `storeAuthStateInCookie: true`
  - login scopes `["User.Read","openid","profile","email"]`
  - Business Central scope `["https://api.businesscentral.dynamics.com/.default"]`
  - client id from `REACT_APP_CLIENT_ID`
- `@azure/msal-browser` only. No `@azure/msal-react`, which settles design risk R1 for React 19.
- QC's localStorage keys keep their names and meaning: `isAuthenticated`, `currentUser`, `activeEnvironment`, `registrationId`, `clientCompanies`, `clientCompanyId`, `clientCompanyName`, `employeeData`, `employeeId`, `employeeNo`. `isAdmin` is never written to storage and never read from it.
- `/bc` and `/session` requests go to `REACT_APP_API_BASE_URL + path`, with `credentials: 'include'`, and are unchanged on the wire. The method, path, query, headers, body and token audience are exactly what the task's inventory records. `/api/v1` stays same-origin (relative).
- Fake server switches:
  - `VITE_FAKE_BC` (`on`/`off`, default `on` in dev and test) for `/bc` and `/session`
  - the existing `__FAKE_SERVER_ON__` for `/api/v1`
  - `VITE_AUTH` (`stub`/`msal`, default `msal` in dev, `stub` in e2e and vitest)

  None of the three reaches a plain `npm run build`, and `build:check` proves it.
- Design system: colours, radii, shadows and type only through `src/ui/tokens.css`. The no-hex lint rule stays on. Use `src/ui` and `src/ui/shadcn` components first. A new component goes into `src/ui`. No inline `style={{ color/background/... }}` from QC survives.
- Motion (`emil-design-eng`):
  - easings `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`
  - durations: press 100–160 ms, tooltip 125–200 ms, dropdown 150–250 ms, modal and drawer 200–300 ms; exits faster than entries
  - never `ease-in` and never `transition-all`
  - `active:scale-[0.97]` on pressables
  - popovers use the Radix transform-origin variable; modals stay centred; nothing enters from `scale(0)`
  - no animation on keyboard-initiated or high-frequency actions
  - hover effects only under `(hover: hover) and (pointer: fine)`
  - `prefers-reduced-motion` keeps fades and drops movement
- Every task that adds or changes UI ends with an `emil-design-eng` pass. Findings go in the task's review notes as a `| Before | After | Why |` table, and every row is fixed before the checkpoint.
- Copy follows WF's style: plain sentences, a refusal says what happened and what to do next.

## Review focus

1. **Refresh mid-session.** After a reload, the MSAL account comes back from sessionStorage and the user stays signed in. `isAdmin` is fetched again before any admin page renders, never taken from storage. Test: Task 13.
2. **Token expires or needs interaction during a call.** An `InteractionRequiredAuthError` from a silent token call ends in an MSAL redirect, not a blank page or an unhandled rejection. Test: Task 9.
3. **The real backend sends more or less than the fake.** `/bc` response schemas accept unknown fields, and accept missing fields wherever QC's code guarded them (`?.`, `||`). A real response with an extra field never shows "unreadable". Test: Task 10.
4. **The two admin sources disagree.** `isAdmin` true with an employee Workforce persona shows the QniConnect setup pages only. `isAdmin` false with an admin persona shows Workforce setup pages but not the QniConnect ones, and `/setup/aenv` typed by hand is unavailable. Test: Task 19.
5. **A stale environment in localStorage.** An `activeEnvironment` whose id is no longer in `/bc/environments` sends the user back to environment selection, not to calls that fail. Test: Task 13.

---

## Phase 1: Workforce baseline and pruning

### Task 1: Copy Workforce and prove the baseline

**Files:**
- Create: everything tracked in WF at `d19648f` (`git -C C:/dev/qnipay-workforce-app archive HEAD | tar -x -C C:/dev/qniconnect-workforce`), except `handover.md`
- Move: WF `docs/*` → `docs/reference/workforce/` (keep `docs/backend` at `docs/reference/workforce/backend`)
- Modify: `package.json` (`"name": "qniconnect"`), `README.md` (replace with a short project README: purpose, `npm run dev`, `npm run verify`, the three fake switches, a link to the spec)
- Keep: `docs/superpowers/specs/...` (already present)

- [ ] **Step 1:** Extract the archive into the folder. Confirm `docs/superpowers/specs/2026-10-19-qniconnect-workforce-merge-design.md` is still there and unchanged.
- [ ] **Step 2:** Run `npm ci`. Expected: it installs with no errors.
- [ ] **Step 3:** Run `npm run verify`. Expected: PASS. If any WF test fails here, stop and report it, because the baseline must be green before anything changes.
- [ ] **Step 4:** Create `docs/superpowers/cuts.md` with a heading per module (Rota, Leave, Notices, Hours, Exceptions, Payroll readiness, Integration). Later tasks record every seam they cut there.
- [ ] **Step 5:** Checkpoint: `git add -A`.

### Task 2: Prune Rota

Remove Rota in full: shifts, rota, cover requests, the shift catalogue, working patterns, the `R` module and the `SHIFT` and `FULFIL` flags.

**Files:**
- Delete: `src/features/rota/**`, `src/api/rota.ts`, `src/contract/rota.ts`, `src/mocks/rota*.ts`, `src/domain/rota*.ts`, `e2e/*rota*`, `e2e/cover-3.spec.ts`, `e2e/support/rota.ts`
- Modify:
  - `src/mocks/handlers.ts`
  - `src/contract/index.ts`
  - `src/domain/nav.ts`: remove the `shifts`, `trota`, `tcover`, `tshifts`, `tpat` and `mrota` tabs
  - `src/domain/modules.ts`: remove `R`, the `SHIFT` and `FULFIL` flags, and rota helpers such as `rotaShiftsOff`/`rotaShiftsOn`
  - `src/mocks/seed/*.json`: drop the rota collections
  - every in-scope importer the compiler flags
- Modify: `docs/superpowers/cuts.md`

**Rule for seams:**
- When an in-scope file imports a Rota function (for example `isAbsence` in `domain/modules.ts`), move that pure function into the in-scope file that needs it, with its test.
- When in-scope UI shows a Rota layer (the planned shift on a timesheet day, the shift layer on the calendar), remove the layer and keep the screen.
- Tests that only cover the removed layer go. Tests that cover the screen stay.
- Record each cut in `cuts.md` as `file:line — what was removed — why`.

- [ ] **Step 1:** Delete the files listed above.
- [ ] **Step 2:** Run `npm run typecheck`. Expected: errors that list every seam.
- [ ] **Step 3:** Fix each seam using the rule above, until `npm run typecheck` passes.
- [ ] **Step 4:** Add the test `nav: no rota views` to `src/domain/nav.test.ts`. It asserts that `everyTab().map(t => t.view)` contains none of `shifts`, `trota`, `tcover`, `tshifts`, `tpat`, `mrota`.
- [ ] **Step 5:** Run `npm run verify`. Expected: PASS. Update visual baselines only for screens whose Rota layer was removed (`npx playwright test --update-snapshots <spec>`). List them in `cuts.md`.
- [ ] **Step 6:** Checkpoint: `git add -A`.

### Task 3: Prune Leave and sickness

Same method and seam rule as Task 2. The views are `leave`, `tleave`, `tsick` and `mleave`, and the module is `L`.

**Files:** `src/features/leave/**`, `src/api/leave.ts`, `src/contract/leave.ts`, `src/mocks/leave*.ts` (including `leave-config-usage.ts` and `leave-chain.test.ts`), `src/domain/leave*.ts`, `e2e/support/leave.ts`, the leave e2e specs, the seed collections, nav, modules, `cuts.md`. Home's leave and sickness layers are cut here (design D16).

- [ ] **Steps 1–6** as Task 2. The nav test is `nav: no leave views` (`leave`, `tleave`, `tsick`, `mleave`).

### Task 4: Prune Notices

Same method. The views are `notices` and `tnotices`, and the flag is `NOTICES`. Remove `features/notices/**`, including `NoticesHomeCard`, and its `api`, `contract`, `mocks`, `domain`, e2e specs (`notices-1c.spec.ts`) and seed.

- [ ] **Steps 1–6** as Task 2. The nav test is `nav: no notice views`.

### Task 5: Prune Hours, Exceptions, Payroll readiness, Integration and IT desk

Same method. The views are `hours`, `thours`, `texc`, `ipay`, `ibc` and `iit`, and the flag is `ITACCESS`.
- Remove `features/{hours,exceptions,payroll,integration}/**` and their `api`, `contract`, `mocks`, `domain`, e2e specs (`payroll-6.spec.ts` and the hours and exceptions specs) and seed.
- **Keep** the payroll *approval layer* in the timesheet approval chain (`pay_appr`, `features/timesheet/payroll-layer.test.tsx`). It is part of approvals, not payroll readiness.
- **Keep** Pay codes (`mpay`, read and edit as WF has it) and the Audit log (`iaudit`). The Integrations setup section holds just those two after this task.

- [ ] **Steps 1–6** as Task 2. The nav test is `nav: no hours, exceptions, payroll readiness, BC or IT views`.
- [ ] **Step 7:** Run `npm run openapi`. Confirm that `contract/openapi.json` no longer has operations for the pruned modules. Add a test to `src/contract/contract.test.ts`: `openapi: only in-scope paths` asserts that no path starts with `/api/v1/rota`, `/api/v1/leave`, `/api/v1/notices`, `/api/v1/hours`, `/api/v1/exceptions`, `/api/v1/payroll` or `/api/v1/integration`. Use WF's actual path roots, read from the deleted contracts.

## Phase 2: Brand, toolchain and design system

### Task 6: QniConnect name, logo, port and env

**Files:**
- Modify: `vite.config.ts` (`server: { port: 3000, strictPort: true }`, `envPrefix: ['VITE_', 'REACT_APP_']`), `playwright.config.ts` (default `E2E_PORT` 3000), `index.html` (`<title>QniConnect</title>`), `src/vite-env.d.ts` (type `ImportMetaEnv` for `REACT_APP_CLIENT_ID`, `REACT_APP_TENANT_ID`, `REACT_APP_AUTHORITY`, `REACT_APP_REDIRECT_URI`, `REACT_APP_API_BASE_URL`, `REACT_APP_BC_API_BASE_URL`, `REACT_APP_DEBUG`, `VITE_FAKE_BC`, `VITE_AUTH`, `VITE_MOCKS`)
- Create: `.env.development`, `.env.production` (QC copies), `.env.test` (`REACT_APP_API_BASE_URL=http://localhost:5000`, `VITE_FAKE_BC=on`, `VITE_AUTH=stub`)
- Create: `src/assets/qniconnect-logo.png`, `src/assets/qniconnect-logo-dark.png` (QC copies)
- Modify: `src/ui/Logo.tsx` (the QniConnect logo, swapped by theme)
- Modify: `src/domain/modules.ts`: `CORE` name `'QniConnect'`, description `'Employees, employee types, approvals and notifications.'`
- Modify: `src/domain/nav.ts`: the setup group label `'Setup'`, the setup index tab label `'Setup'`, `acal` label `'Bank holidays'`
- Modify: every UI string that says "Qnipay" (grep `-i qnipay` in `src/**/*.tsx`, `src/domain/**`, `src/mocks/**` refusal copy, `e2e/**` text assertions)
- Modify: visual baselines (regenerated)

- [ ] **Step 1:** Write the failing test `src/theme.test.ts`: `brand: no Qnipay in UI copy`. It reads every `src/**/*.{ts,tsx}` except tests, `mocks/seed` and `docs`, and asserts that no string literal matches `/qnipay/i`, apart from storage keys listed in an explicit allow-list in the test.
- [ ] **Step 2:** Run `npx vitest run src/theme.test.ts`. Expected: FAIL, listing the files.
- [ ] **Step 3:** Make the changes listed above.
- [ ] **Step 4:** Run `npx vitest run src/theme.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Regenerate the visual baselines (`npx playwright test --update-snapshots visual`). Check by eye that only the name, logo and labels changed.
- [ ] **Step 6:** Run `npm run verify`. Expected: PASS. Checkpoint: `git add -A`.

### Task 7: Motion and feel in the design system

Apply the design-system parts of `docs/reference/workforce/ui-review-2026-10-18.md`:
- Part A: the proposed motion tokens
- Part B: design system and chrome, only the items in `src/ui`, `src/ui/shadcn`, `src/shell` and `src/index.css` that still exist after pruning.

**Files:**
- Modify: `package.json` (add `tw-animate-css`), `src/index.css` (`@import 'tw-animate-css';`), `src/ui/tokens.css`, `src/ui/Button.tsx`, `src/ui/Seg.tsx`, `src/ui/Pill.tsx` (chips), `src/ui/shadcn/*` (dialog, popover, dropdown, select, tooltip, sheet), `src/shell/Shell.tsx` (bottom bar), `src/features/timesheet/ClockCard.tsx` (clock buttons)
- Modify: `scripts/ui-source.test.ts` (rules)

**Values:**
- Easings: `--ease-out`, `--ease-in-out` and `--ease-drawer` as in Global constraints.
- Durations: `--dur-press: 140ms`, `--dur-tooltip: 150ms`, `--dur-dropdown: 180ms`, `--dur-modal-in: 240ms`, `--dur-modal-out: 160ms`.
- Focus ring: 2 px offset plus a 2 px solid ring using the existing focus token, visible on the dark top bar.

- [ ] **Step 1:** Write failing source rules in `scripts/ui-source.test.ts`:
  - `ui: no transition-all`: no `transition-all` or `transition: all` in `src/**/*.{tsx,css}`
  - `ui: no ease-in`: no `ease-in ` and no `ease-in"` outside `ease-in-out`
  - `ui: pressables give feedback`: `src/ui/Button.tsx` and `src/ui/Seg.tsx` contain `active:scale-[0.97]`
  - `ui: popovers scale from their trigger`: each shadcn popover-like file (`popover`, `dropdown-menu`, `select`, `tooltip`) uses `origin-(--radix-` …`-transform-origin)`
  - `ui: hover gated`: no `hover:scale` or `hover:translate` without the `[@media(hover:hover)_and_(pointer:fine)]` variant
- [ ] **Step 2:** Run `npx vitest run scripts/ui-source.test.ts`. Expected: FAIL on each rule.
- [ ] **Step 3:** Add the tokens and the `tw-animate-css` import. Fix each component until the rules pass. Add a `prefers-reduced-motion: reduce` block to `tokens.css` that sets transform animations to none and keeps opacity.
- [ ] **Step 4:** Apply the remaining Part B items that touch these files. Record each one, applied or not applicable, in the review notes table.
- [ ] **Step 5:** Run `npm run verify`. Expected: PASS. Regenerate the visual baselines only where the focus ring or the chrome changed.
- [ ] **Step 6:** Do an `emil-design-eng` pass over `src/ui` and `src/shell`, and fix every row. Checkpoint: `git add -A`.

## Phase 3: Behaviour inventories (independent, can run in parallel)

Each inventory is a markdown file under `docs/superpowers/inventory/`, read from QC's code. It is the contract for its port, so it must be exact and complete. Format, one section per screen or service method:

```
## <ID> <name>   (source: QC path:lines)
### Calls
| id | method | path (with query) | headers sent (name ← where the value comes from) | token (none | login | bc) | body | credentials |
### Response fields read
| call id | field path | how it is used | guarded? (yes if `?.`, `||`, default) |
### States
loading / empty / error (exact message text) / success / partial, per screen
### Rules and edge cases
numbered: <ID>.R1, <ID>.R2 … (the port's tests name these ids)
### Storage
localStorage/sessionStorage keys read and written, and when
### Fakes or fallbacks in today's code
any mock data, placeholder or hard-coded value the code shows to users (e.g. businessCentralService.js:422 mockData)
```

Token rule from `businessCentralService.js:60-110`:
- A call sends `Authorization` only when it passes `scopes`. That is `bc`, the Business Central `.default` scope.
- The portal verify in `AuthContext.js:146` uses the login-scope token (`login`).
- `apiService.js` calls send no token (`none`), only cookies.

### Task 8: Inventory: sign-in, session and account setup

Sources: QC `src/index.js`, `src/App.js`, `src/auth/*`, `src/components/auth/*`, `src/services/apiService.js`, `businessCentralService.js` (`constructor`, `updateEnvironmentState`, `fetchThroughBackend`, `verifyPortalUser`, and environment methods), `src/components/PortalSwitcher.js`, the guard logic in `UserPortalLayout.js` and `admin/AdminLayout.js`, and `src/components/AdminRoutes.js`.

**Files:** Create `docs/superpowers/inventory/auth.md`, with IDs prefixed `AUTH`.

It must include:
- the full sign-in sequence
- every route guard in `App.js` (who goes where)
- the 15-second sign-out on "not registered"
- the `authRequired` event on 401
- the cross-tab `storage` listener
- the inactivity events and timeout
- the full logout cleanup list (`AuthContext.js` `logout`)
- the environment selection and activation calls
- the first-login overlay and what completes it
- the `X-Client-Company-ID` response header capture

- [ ] **Step 1:** Write the inventory.
- [ ] **Step 2:** Self-check. Grep QC for every `fetch(`, `this.get(`, `this.post(` and `fetchThroughBackend(` these files reach, and confirm each has a row. List any you left out on purpose, with the reason.
- [ ] **Step 3:** Checkpoint: `git add -A`.

### Task 9: Inventory: employee portal

Sources: QC `components/EmployeePortal.js` (the Dashboard), `components/portal/EmployeeDocuments.js`, `components/portal/EmployeeProfile.js`, `components/common/PdfPreviewModal.js`, `components/common/FiscalYearSelectionModal.js`, `components/common/ErrorMessage.js`, `components/UserPortalLayout.js` (top bar, bell, theme, environment badge, user menu), and the `businessCentralService.js` methods they call: `getEmployeeProfile`, `getPayslips`, `getPayslipPdf`, P45/P60/P11D, `getFiscalYears`, `getNotifications`, `markNotificationSeen`.

**Files:** Create `docs/superpowers/inventory/portal.md` (IDs `HOME`, `DOCS`, `PROF`, `BELL`, `FRAME`).

- [ ] **Steps 1–3** as Task 8.

### Task 10: Inventory: admin

Sources: QC `components/admin/*` and the `businessCentralService.js` methods they call (portal users CRUD, `updatePortalUser`, environments, `authorization/storeTokens`, `client-tenant/companies`, settings).

**Files:** Create `docs/superpowers/inventory/admin.md` (IDs `ADM`, `USERS`, `ENV`, `AUTHZ`, `SET`).

- [ ] **Steps 1–3** as Task 8.

### Task 11: Inventory: public pages and diagnostics

Sources: QC `components/RegistrationAndLanding.js`, `EnhancedRegistration.js`, `SiriusConnect365Licenses.js`, `AuthPages.js`, `services/tenantVerificationService.js`, `components/common/CorsDebugger.js`, `CorsErrorHandler.js`, `DebugPanel.js`, `utils/logger.js`, `App.css`, `index.css` (only the behaviour, not the styles).

**Files:** Create `docs/superpowers/inventory/public.md` (IDs `LAND`, `REG`, `PRICE`, `LOGIN`, `DIAG`).

- [ ] **Steps 1–3** as Task 8.

## Phase 4: Identity and the `/bc` foundation

### Task 12: Auth adapter (MSAL and stub)

**Files:**
- Create: `src/auth/types.ts`, `src/auth/config.ts` (QC authConfig values, typed), `src/auth/msal.ts`, `src/auth/index.ts`
- Create: `src/mocks/auth-stub.ts`
- Modify: `src/main.tsx`, `scripts/build-check.mjs` (`MARKERS` gains `qniconnect.stubAccount` and `alg":"none`), `package.json` (add `@azure/msal-browser@^4.12.0`)
- Test: `src/auth/msal.test.ts`, `src/mocks/auth-stub.test.ts`

**Interfaces (produces):**
```ts
// src/auth/types.ts
export interface AuthAccount { oid: string; email: string; name: string; loginHint?: string }
export type TokenKind = 'login' | 'bc';
export interface AuthAdapter {
  init(): Promise<void>;                       // MSAL initialize + handleRedirectPromise + set active account (QC index.js)
  account(): AuthAccount | null;
  signIn(): Promise<void>;                     // loginRedirect(loginRequest)
  reauthenticate(): Promise<void>;             // acquireTokenRedirect(loginRequest) — QC authRequired / cross-tab path
  signOut(): Promise<void>;                    // logoutRedirect({ account, logoutHint, postLogoutRedirectUri: origin })
  token(kind: TokenKind): Promise<string | null>; // acquireTokenSilent; InteractionRequiredAuthError → reauthenticate(), then rethrow
}
// src/auth/index.ts
export function setAuth(a: AuthAdapter): void;
export function auth(): AuthAdapter;           // throws if unset
```
- `logoutHint` uses the precedence from QC `AuthContext.js` `logout`: `login_hint`, then `sid`, then `username`.
- `src/mocks/auth-stub.ts` exports `stubAuth: AuthAdapter` and `STUB_ACCOUNT_KEY = 'qniconnect.stubAccount'`.
  - `account()` reads `{ oid, email, name }` from sessionStorage at that key.
  - `token()` returns an unsigned JWT: base64url `{"alg":"none"}` + `.` + base64url `{ preferred_username: email, email, oid, name }` + `.`.
  - `signIn()` sets `location.href = '/dev/sign-in'` (the dev picker, Task 14).
  - `signOut()` clears the key and goes to `/`.
- `main.tsx`: when `__FAKE_SERVER_ON__ && import.meta.env.VITE_AUTH === 'stub'`, `setAuth(stubAuth)`, loaded by dynamic import. Otherwise `setAuth(msalAuth)`. Then `await auth().init()` before rendering.

- [ ] **Step 1:** Write failing tests:
  - `msal.test.ts` (with `@azure/msal-browser` mocked via `vi.mock`):
    - `init sets the first cached account active`
    - `token('bc') asks for https://api.businesscentral.dynamics.com/.default`
    - `token('login') asks for User.Read openid profile email`
    - `InteractionRequiredAuthError redirects and rethrows`, which asserts that `acquireTokenRedirect` was called with the login scopes
    - `signOut passes login_hint, then sid, then username as logoutHint`
  - `auth-stub.test.ts`:
    - `account() is null with no stub account`
    - `token() decodes to the stub email`
- [ ] **Step 2:** Run `npx vitest run src/auth src/mocks/auth-stub.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the files above.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npm run build:check`. Expected: PASS, with no stub markers in `dist`.
- [ ] **Step 5:** Checkpoint: `git add -A`.

### Task 13: `/bc` foundation: contract, client, context and fake engine

**Files:**
- Create:
  - `src/contract/bc/endpoints.ts`
  - `src/contract/bc/session.ts` (verify, init, session verify)
  - `src/contract/bc/environments.ts`
- Create:
  - `src/api/bc/client.ts`
  - `src/api/bc/context.ts`
  - `src/api/bc/events.ts`
- Create:
  - `src/mocks/bc/serve.ts`
  - `src/mocks/bc/seed.ts`
  - `src/mocks/bc/handlers.ts`
  - `src/mocks/bc/session.ts`
  - `src/mocks/bc/environments.ts`
- Modify: `src/mocks/browser.ts` and `src/mocks/node.ts`, which register `bcHandlers` when `import.meta.env.VITE_FAKE_BC !== 'off'`
- Test:
  - `src/api/bc/client.test.ts`
  - `src/mocks/bc/session.test.ts`
  - `src/contract/bc/lenient.test.ts`

**Interfaces (produces):**
```ts
// src/contract/bc/endpoints.ts
export type BcHeader = 'X-BC-Environment' | 'X-Registration-ID' | 'X-Client-Environment' | 'X-Client-Company-ID'
  | 'X-Employee-No' | 'X-User-Email' | 'X-LocalStorage-EmployeeNo' | 'X-Session-Request-Time';
export interface BcEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: `/bc/${string}` | `/session/${string}` | '/cors-test';
  summary: string; inventory: string;          // the inventory row id(s), e.g. 'AUTH.C3'
  token: 'none' | 'login' | 'bc';
  headers: readonly BcHeader[];                // exactly the headers the inventory row lists, in that order
  request?: z.ZodType; response: z.ZodType; params?: z.ZodObject; query?: z.ZodObject;
  responseType?: 'json' | 'blob';
}
export const BC_ENDPOINTS: BcEndpoint[];
export function defineBcEndpoint<const E extends BcEndpoint>(e: E): E;
export const lenient: <S extends z.ZodRawShape>(shape: S) => z.ZodObject; // z.looseObject; fields the inventory marks guarded are .optional()

// src/api/bc/context.ts — the QC localStorage keys, typed
export interface BcEnvironment { id: string; name: string; [k: string]: unknown }
export const bcContext: {
  registrationId(): string | null; setRegistrationId(v: string | null): void;
  environment(): BcEnvironment | null; setEnvironment(e: BcEnvironment | null): void;
  clientCompanyId(): string | null; setClientCompanyId(v: string | null): void;
  employeeNo(): string | null; setEmployeeNo(v: string | null): void;
  userEmail(): string | null;                  // from currentUser.email
  headerValue(h: BcHeader): string;            // '' when unset, exactly as QC's `|| ''`
  clearAll(): void;                            // QC AuthContext.logout cleanup list, including its prefix/contains sweep
};

// src/api/bc/client.ts
export class BcError extends Error { constructor(public status: number, public data: unknown) }
export async function bcApi<E extends BcEndpoint>(ep: E, opts?: { params?; query?; body?; signal? }): Promise<z.infer<E['response']> /* or Blob */>;
// URL = import.meta.env.REACT_APP_API_BASE_URL + built path; credentials 'include'; Content-Type json;
// Authorization only when ep.token !== 'none' (auth().token(ep.token));
// response header X-Client-Company-ID → bcContext.setClientCompanyId;
// 401 → bcEvents.emit('auth-required') then throw BcError;
// error message = data.message || data.error || `API Error: ${status}` (QC apiService/fetchThroughBackend wording, per inventory).

// src/api/bc/events.ts
export const bcEvents: { on(e: 'auth-required', fn: () => void): () => void; emit(e: 'auth-required'): void };

// src/mocks/bc/serve.ts
export function bcServe<const E extends BcEndpoint>(ep: E, fn: (ctx: { request: Request; params; query; body; email: string | null }) => unknown): HttpHandler;
// registers at REACT_APP_API_BASE_URL + ep.path; 401 when ep.token !== 'none' and no Bearer; email from the unverified JWT;
// in dev/test validates the response against ep.response (loud 500 as WF serve()).
```
- `src/mocks/bc/seed.ts`:
  - one portal user per Workforce seed account in both seeds (same email). `isAdmin` = (`userType === 'admin'`), `status: 'Active'`, `registrationId: 'REG-DEMO-0001'`, and `employeeNo` = the Workforce `employeeCode`.
  - one extra user `firstlogin@brightpath.org` with status `PendingFirstLogin`, and its Workforce seed account
  - two environments, `Production` and `Sandbox`
  - the shapes come from the inventory
- Endpoints in this task: only the `AUTH` rows for portal verify, `/session/init`, `/session/verify`, environments list and activate, and `client-tenant/companies`, if the auth inventory has it.

- [ ] **Step 1:** Write failing tests:
  - `client.test.ts`:
    - `sends the inventory headers with QC's '' defaults`
    - `adds Authorization only for token bc/login`
    - `includes credentials`
    - `401 emits auth-required`
    - `stores X-Client-Company-ID from the response`
    - `error message falls back to API Error: <status>`
    - `InteractionRequiredAuthError from the token propagates after the redirect` (Review focus 2)
  - `lenient.test.ts`:
    - `every BC_ENDPOINTS response accepts an unknown extra field`
    - `fields the inventory marks guarded may be absent` (Review focus 3)
  - `session.test.ts`:
    - `verify returns exists:false for an unknown email`
    - `verify returns isAdmin true for the seed admin`
    - `firstlogin user is PendingFirstLogin`
    - `/bc passes through when VITE_FAKE_BC is off`, which stubs the env and asserts the handler list has no `/bc` handler
- [ ] **Step 2:** Run `npx vitest run src/api/bc src/contract/bc src/mocks/bc`. Expected: FAIL.
- [ ] **Step 3:** Implement the files above.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Add `'REG-DEMO-'` to the `build:check` `MARKERS`. Run `npm run verify`. Expected: PASS. Checkpoint: `git add -A`.

### Task 14: One session: the API client, fake identity, provider and dev picker

**Files:**
- Delete: `src/api/session-token.ts`, `src/shell/SignIn.tsx`, `src/shell/SignIn.test.tsx`, `e2e/sign-in.spec.ts` (replaced by `e2e/auth.spec.ts`)
- Modify:
  - `src/api/client.ts`: the token comes from `auth().token('login')`, plus `X-BC-Environment` and `X-Registration-ID` from `bcContext` when set; when `FAKE_SERVER_ON` and sessionStorage `qniconnect.devAccount` is set, it also sends `X-Dev-Account`
  - `src/contract/session.ts`: drop `token`, `simulated`, `SignInRequest` and `createSession`; keep the rest
  - `src/mocks/auth.ts`: `requireSession` resolves the email from `X-Dev-Account` (dev only), else from the bearer JWT `preferred_username`/`email`. The session record is keyed by lower-case email and created on first use; `viewingAs` is kept on it.
  - `src/mocks/session.ts`
- Rewrite: `src/shell/SessionProvider.tsx`
- Modify: `src/App.tsx` (the gate), `src/test/render-page.tsx`, `src/test/setup.ts`, `src/test/api-helpers.ts`, `e2e/support/fixtures.ts`
- Create: `src/shell/DevSignIn.tsx` (the dev picker at `/dev/sign-in`, only when `FAKE_SERVER_ON`)
- Create: `e2e/auth.spec.ts`
- Test: `src/shell/SessionProvider.test.tsx` (rewritten), `src/mocks/session.test.ts` (updated)

**Interfaces (produces):**
```ts
// src/shell/SessionProvider.tsx
export interface PortalUser { oid: string; email: string; name: string; id?: string; employeeNo?: string; registrationId?: string; status?: string; [k: string]: unknown }
export interface PortalState { user: PortalUser | null; isAdmin: boolean; adminVerified: boolean; pendingFirstLogin: boolean; error: string | null }
interface Ctx {
  session: Session | null;                  // Workforce session (unchanged shape minus token/simulated)
  ready: boolean;
  portal: PortalState;
  environment: BcEnvironment | null;
  signIn(): Promise<void>; signOut(): Promise<void>;
  setEnvironment(e: BcEnvironment): void; completeFirstLogin(): void;
  viewAs(employeeCode: string): Promise<void>; endViewAs(): Promise<void>;
}
export const useSession: () => Ctx;               // same name WF features already use
export const useCurrentSession: () => Session | null;
export const usePortal: () => PortalState;
```
**Sequence:** the provider runs these in order, following inventory `AUTH`:
1. auth account
2. portal verify (token `login`)
3. on `exists`:
   - merge user data
   - `isAdmin` lives in state only
   - store `currentUser` without `isAdmin`
   - set `registrationId`
   - `/session/init` (errors logged and ignored, as QC)
   - restore the environment
4. on not exists: the QC message, `isAuthenticated` removed, sign out after 15 s
5. `GET /api/v1/session`

`bcEvents 'auth-required'` and the Workforce `'signed-out'` event both call `auth().reauthenticate()`. `'signed-out'` toasts its refusal first.

**Gate (`App.tsx`):**
- Public routes always render.
- `/dev/sign-in` renders only when `FAKE_SERVER_ON`.
- Signed out on a protected route → `auth().signIn()`.
- Portal error → `/auth-error`.
- No environment → `/account-setup/environment` (Task 15).
- Otherwise `<Shell />`.

**Dev picker:**
- Lists `GET /api/v1/session/accounts` grouped by user type.
- Picking one sets sessionStorage `qniconnect.devAccount`, plus `qniconnect.stubAccount` when using the stub, then reloads.
- With MSAL and an Entra email that is not in the seed, the gate sends the user to `/dev/sign-in?unmatched=1`, which explains why in one sentence.

**e2e `signInAs(persona)`:**
- Sets `qniconnect.stubAccount` to the persona's seed account.
- Sets localStorage `activeEnvironment` to the seed `Production` environment.
- Reloads and waits for `tid.shell.account`.

Playwright `webServer` runs `npm run dev -- --port ${port}` with `env: { VITE_AUTH: 'stub', VITE_FAKE_BC: 'on' }`. The e2e specs keep their shape. Only `fixtures.ts` and the sign-in spec change.

- [ ] **Step 1:** Write failing tests in `SessionProvider.test.tsx`:
  - `signs in: verify, then session init, then the Workforce session`
  - `isAdmin is never read from localStorage`: seed `currentUser` with `isAdmin: true` for an employee and assert `portal.isAdmin === false` until verify answers
  - `unregistered user sees the QC message and is signed out after 15 s` (fake timers)
  - `auth-required triggers reauthenticate`
  - `a 401 from /api/v1 toasts and reauthenticates`
  - `refresh restores the user and re-verifies admin` (Review focus 1)
- [ ] **Step 2:** Write failing tests in `src/mocks/session.test.ts`:
  - `session from bearer JWT email`
  - `X-Dev-Account overrides the token email`
  - `unknown email is 401 signed-out`
- [ ] **Step 3:** Write failing tests in `e2e/auth.spec.ts`:
  - `employee lands on My Work`
  - `admin sees Setup`
  - `first-login user sees the overlay`, which is expected to fail until Task 15 and is marked `test.fixme` only until then
- [ ] **Step 4:** Run `npx vitest run src/shell src/mocks/session.test.ts`. Expected: FAIL.
- [ ] **Step 5:** Implement everything listed above. Update WF unit tests that used `setToken` or `createSession` to use the `render-page` helper, which now signs in through the stub as the requested persona (`renderPage(ui, path, { as: 'admin' })`).
- [ ] **Step 6:** Run `npm run verify`. Expected: PASS, with every WF e2e spec green through the new `signInAs`.
- [ ] **Step 7:** Do an `emil-design-eng` pass on `DevSignIn.tsx`. Checkpoint: `git add -A`.

### Task 15: Account setup, sign-out rules and auth pages

**Files:**
- Create:
  - `src/features/account-setup/EnvironmentPage.tsx`, the environment selection rebuilt from inventory `AUTH`
  - `src/features/account-setup/FirstLoginOverlay.tsx`
  - `src/features/account-setup/account-setup.test.tsx`
- Create: `src/features/auth-pages/AuthCallbackPage.tsx`, `src/features/auth-pages/AuthErrorPage.tsx`, `src/features/auth-pages/auth-pages.test.tsx`
- Create: `src/shell/useInactivitySignOut.ts`, `src/shell/useCrossTabSignOut.ts`, with tests
- Modify: `src/shell/SessionProvider.tsx` (wire both hooks; logout = `bcContext.clearAll()`, then the cookie sweep from QC, then `auth().signOut()`), `src/shell/Shell.tsx` (mount the first-login overlay)
- Modify: `src/contract/bc/environments.ts`, `src/mocks/bc/environments.ts` (any `AUTH` environment rows Task 13 did not cover)
- Modify: `e2e/auth.spec.ts` (remove the `fixme`)

**Values:**
- Inactivity: 5 × 60 × 1000 ms, reset on `mousemove`, `keydown`, `click`, `scroll` and `touchstart`.
- Cross-tab: a `storage` event where `key === 'isAuthenticated'` and `newValue === null` → `auth().reauthenticate()`.
- Routes: `/account-setup/environment`, `/auth/callback`, `/auth-error`.

- [ ] **Step 1:** Write failing tests:
  - one test per `AUTH.R*` rule on environment selection, first login, callback and error pages, named `AUTH.Rn: <rule>`
  - `inactivity signs out after 5 minutes and resets on activity`
  - `cross-tab sign-out reauthenticates`
  - `logout clears every QC key and the bc_/auth/user/token sweep`
  - `stale activeEnvironment returns to environment selection` (Review focus 5)
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement on the design system: `Page`, `Card`, `Field`, `SelectBox`/`Combobox`, `Modal`. Copy text comes from the inventory. Layout and visuals follow WF.
- [ ] **Step 4:** Run `npm run verify`. Expected: PASS, including `e2e/auth.spec.ts` with first login.
- [ ] **Step 5:** Do an `emil-design-eng` pass. Checkpoint: `git add -A`.

## Phase 5: QniConnect features

The method is the same for every task in this phase:
1. Add the typed `/bc` endpoints the inventory lists for the area (`src/contract/bc/<area>.ts`, `src/api/bc/<area>.ts` React Query hooks, `src/mocks/bc/<area>.ts` with seed data).
2. Write one test per inventory rule and per call row, named `<ID>: <rule>` and `<ID>.C<n> wire: <method> <path>`. The wire test asserts the method, path, query, headers and token on the captured request.
3. Build the screen on the design system.
4. Run `npm run verify`.
5. Do an `emil-design-eng` pass and fix every row.
6. Checkpoint: `git add -A`.

**Done when:** every `<ID>.R*` and `<ID>.C*` in the area's inventory has a passing test.

### Task 16: My Calendar moves, Home becomes the payslip dashboard

**Files:**
- Move: WF `src/features/home/HomePage.tsx` → `src/features/calendar/MyCalendarPage.tsx` (with `DayDialog.tsx`), view `cal`, path `/work/cal`, label `My Calendar`. The features folder `calendar` already holds the bank-holiday setup page `CalendarPage.tsx`, so rename that one to `BankHolidaysPage.tsx` to avoid confusion.
- Create: `src/features/home/HomePage.tsx` (the payslip dashboard, inventory `HOME`), `src/contract/bc/payroll.ts`, `src/api/bc/payroll.ts`, `src/mocks/bc/payroll.ts`
- Modify: `src/domain/nav.ts`: `work` order Onboarding, Home, My Calendar (`can('own_ts') && ts && !onboarding`), Timesheet, Profile, Documents. Documents is gated `can('own_home') && !onboarding`, with no `DOCS` flag.
- Test: `src/features/home/home.test.tsx` (rewritten for the dashboard), `src/features/calendar/my-calendar.test.tsx` (the WF home tests that still apply, renamed), `src/domain/nav.test.ts` (`nav: My Calendar after Home`)

- [ ] **Steps 1–6** of the phase method. In addition, My Calendar shows only the timesheet layer, bank holidays, today and the day dialog with "Record hours" (D16). Test: `my calendar: no shift, leave or notice layer`.

### Task 17: Documents (merged)

**Files:** `src/features/documents/DocumentsPage.tsx` replaces WF `features/home/DocumentsPage.tsx`. It contains:
- a **Payslips** section (inventory `DOCS`): the list, PDF preview in `Modal`, and download
- a **Tax documents** section: P45, P60 and P11D by fiscal year, with fiscal year selection in the design system's `Modal` or `SelectBox`
- the WF documents section, unchanged

Also `src/contract/bc/documents.ts`, `src/api/bc/documents.ts`, `src/mocks/bc/documents.ts` (blob responses are a small valid PDF), and `src/features/documents/documents.test.tsx`.

- [ ] **Steps 1–6** of the phase method. In addition, add the test `docs: payroll slot no longer says Not yet connected`.

### Task 18: Profile (merged) and the notification bell (merged)

**Files:**
- Profile: `src/features/profile/ProfilePage.tsx` gains the Business Central sections from inventory `PROF`: personal, contact, employment, tax and NI, banking (masked exactly as QC masks it) and pension. They come from `/bc/employees/current`. The WF "propose a change" flow and `ProfileQueue` stay, labelled "Not yet connected" while `/api/v1` is fake. Inventory `HOME`/`PROF` side effects stay too: `employeeNo`, `employeeId` and `employeeData` are written to storage.
- Bell: `src/shell/Inbox.tsx` merges `/bc/notifications` (inventory `BELL`) and `/api/v1/notifications/me`.
  - Add `src/domain/inbox.ts` with `mergeInbox(bc: BcNotification[], wf: WfNotification[]): InboxItem[]` and `InboxItem = { id: string; source: 'payroll' | 'workforce'; title: string; body?: string; at: string; read: boolean }`, sorted newest first.
  - Marking an item read calls the backend it came from: `/bc/notifications/:id` with QC's method and query, or WF's read endpoint.
- **Tests:**
  - `src/domain/inbox.test.ts`: `merges both feeds newest first`, `keeps source`, `ties keep payroll first`
  - `src/shell/inbox.test.tsx`: `mark read goes to the source backend`
  - the `PROF` and `BELL` inventory tests

- [ ] **Steps 1–6** of the phase method.

### Task 19: Setup: admin overview, Environments, Authorization and Settings

**Files:**
- Create:
  - `src/features/connection/OverviewPage.tsx` (inventory `ADM`)
  - `src/features/connection/EnvironmentsPage.tsx` (`ENV`)
  - `src/features/connection/AuthorizationPage.tsx` (`AUTHZ`)
  - `src/features/connection/SettingsPage.tsx` (`SET`)
- Create: the matching `contract/bc`, `api/bc` and `mocks/bc` modules
- Modify: `src/domain/nav.ts`. `NavInput` gains `portalAdmin: boolean`. Add a new first setup section, `sec('conn', 'Business Central', 'The environments, connection and settings this organisation runs on', [...])`, with tabs `aoverview` Overview, `aenv` Environments, `aauth` Authorization and `asettings` Settings, each gated `portalAdmin`.
- Modify: the setup group shows when there are `setupTabs` from either gate. `everyTab()` passes `portalAdmin: true`.
- Modify: `src/shell/Shell.tsx`. Admin landing: when `portalAdmin`, `/` goes to `/setup/aoverview`; otherwise to the first `work` tab, as WF does.
- Test:
  - `src/domain/nav.test.ts`: `nav: Business Central section needs portalAdmin`, `nav: isAdmin with employee persona shows only the Business Central section`, `nav: admin persona without isAdmin has no Business Central section` (Review focus 4)
  - `e2e/permissions-conn.spec.ts`: `typing /setup/aenv without isAdmin shows Page unavailable`
  - the `ADM`, `ENV`, `AUTHZ` and `SET` inventory tests

- [ ] **Steps 1–6** of the phase method.

### Task 20: People & access (merged)

**Files:**
- Modify:
  - `src/features/employees/AdminEmployeesPage.tsx`: label and nav title "People & access"; view `aemployees` is kept
  - `src/features/employees/EmployeesList.tsx`
  - `src/features/employees/EmployeeRecord.tsx`
- Create:
  - `src/features/employees/PortalLoginPanel.tsx`: invite, activate, deactivate, admin flag and first-login status, from inventory `USERS`. Gated `portalAdmin`.
  - `src/domain/people-access.ts`: `joinPeople(employees: Employee[], portalUsers: PortalUserRow[]): PersonRow[]` with `PersonRow = { employeeCode: string | null; employee?: Employee; portal?: PortalUserRow }`, joined on `employee.code === portalUser.employeeNo`. Unmatched rows are kept on both sides.
- Create: `contract/bc/portal-users.ts`, `api/bc/portal-users.ts`, `mocks/bc/portal-users.ts`
- Modify: `src/features/onboarding/*`, where the manager starts a starter. The "Send portal invite" offer calls a **fake-server** `/api/v1` endpoint (`POST /api/v1/onboarding/cases/:id/portal-invite`, contract `inviteToPortal`, capability `onb_track`), never `/bc` (N19).
- **Tests:**
  - `src/domain/people-access.test.ts`: `joins on employee number`, `keeps portal-only rows`, `keeps employee-only rows`, `a portal user with a blank employeeNo stays unmatched`
  - the `USERS` inventory tests
  - `onboarding: starting offers the portal invite on the fake server`, which asserts that no `/bc` request was made
  - an e2e spec, `e2e/people-access.spec.ts`

- [ ] **Steps 1–6** of the phase method. Rows or panels with fake-server data carry the "Not yet connected" pill.

### Task 21: Public pages, diagnostics and redirects

**Files:**
- Create:
  - `src/features/public/LandingPage.tsx` (`LAND`)
  - `src/features/public/RegistrationPage.tsx` (`REG`, with tenant verification and the company lookup)
  - `src/features/public/PricingPage.tsx` (`PRICE`)
  - `src/features/public/LoginPage.tsx` (`LOGIN`)
  - `src/features/public/PublicLayout.tsx`, using the WF tokens with no app frame
- Create: `src/lib/logger.ts` (QC logger semantics, gated by `REACT_APP_DEBUG`), `src/features/diagnostics/*` (CORS error handling as the user sees it today; the debugger and debug panel only when `REACT_APP_DEBUG === 'true'`)
- Create: `src/app/redirects.ts`: `export const REDIRECTS: Record<string, string>` with these entries:
  ```
  /portal → /work/home, /portal/dashboard → /work/home, /portal/documents → /work/docs, /portal/profile → /work/profile,
  /admin → /setup/aoverview, /admin/dashboard → /setup/aoverview, /admin/users → /setup/aemployees,
  /admin/environments → /setup/aenv, /admin/authorization → /setup/aauth, /admin/settings → /setup/asettings,
  /environment-select → /account-setup/environment, /forgot-password → /login
  ```
- Modify: `src/App.tsx` (public routes `/`, `/login`, `/register`, `/pricing`, plus the redirects)
- **Tests:**
  - the `LAND`, `REG`, `PRICE`, `LOGIN` and `DIAG` inventory tests
  - `src/app/redirects.test.tsx`: `each old QniConnect URL lands on its new route`
  - `e2e/public.spec.ts`
  - `build:check` asserts that the debug panel's marker string is absent when `REACT_APP_DEBUG` is not `true`

- [ ] **Steps 1–6** of the phase method.

## Phase 6: Module fixes from the UI review

### Task 22: Timesheet and My Calendar review fixes

From the review's P0, P1 and Part C "timesheet" and "calendar" sections, for code that still exists:
- Week grid day labels are derived from the ISO date, not hard-coded Monday-first (`WeekGrid.tsx`).
- Hours on DST nights count real elapsed time (`domain/timesheet.ts` and `domain/clock.ts`).
- The team queue keeps custom shift codes (`timesheet/team.tsx`). If that code was cut with Rota, record it as not applicable.

**Tests:**
- `domain/timesheet.test.ts`: `an 8h shift across the 25 Oct 2026 clock change counts 9h`, `across 28 Mar 2027 counts 7h`
- `features/timesheet/timesheet.test.tsx`: `Sunday-start tenant labels the week Sun..Sat`
- one test per other item applied

- [ ] Write the failing tests, run them (FAIL), fix, run them (PASS), run `npm run verify`, do an `emil-design-eng` pass, then checkpoint `git add -A`.

### Task 23: Shared-services and onboarding review fixes

From the review's P0, P1 and Part C sections for employees, employee types, dimensions, pay codes, access, profile, onboarding, organisation, notifications, approvals and audit, for code that still exists:
- Line manager: confirm it is stored by employee code. If it is still stored by name, store the code and show the name.
- Filtered lists keep focus while typing: `placeholderData: keepPreviousData`, and filters render outside the data guard. Applies to the audit log and any in-scope list that has the pattern.
- The audit log shows the true total when it truncates at 200.
- Destructive actions get a confirm or an undo: removing a delegation, Remove in the dimension and pay-code forms.

**Tests:**
- `audit-page.test.tsx`: `search keeps focus while results load`, `shows the total beyond 200`
- `dimensions.test.tsx`: `Remove asks for confirmation`
- `approvals.test.tsx`: `removing a delegation asks for confirmation`
- `employee-form.test.tsx`: `manager saved as employee code`

- [ ] Same steps as Task 22.

### Task 24: The design pass over every ported page

Run `emil-design-eng` and the design-system rules over every file created in Phase 5 and Tasks 15 and 21. Output one `| Before | After | Why |` table per page in `docs/superpowers/reviews/ui-pass.md`, fix every row, then run `npm run verify` and regenerate the visual baselines for the ported pages:
- `e2e/visual-qc.spec.ts`: Home, Documents, Profile, Overview, Environments, People & access, Landing, Registration and Pricing at 1440 and 390, light and dark
- the axe check in `e2e/a11y.spec.ts` extended to those routes

- [ ] Run the review, fix every row, run verify, update the baselines, then checkpoint `git add -A`.

## Phase 7: Hand-off to the backend step

### Task 25: Contract, hand-off note and final verification

**Files:**
- Modify: `contract/openapi.json` (`npm run openapi`)
- Create: `docs/superpowers/handoff/backend-inputs.md`. It contains:
  - every `/api/v1` operation the app calls, grouped by module (core, timesheet, onboarding), with capability and refusal codes, generated from `ENDPOINTS` by a script `scripts/handoff.ts`, with its test `scripts/handoff.test.ts` (`lists every registered endpoint once`)
  - every `/bc` and `/session` endpoint from `BC_ENDPOINTS`, with headers, token audience and the response fields read (from the inventories), as the checklist for the real-backend check
  - the open questions from spec section 14
- Modify: `README.md` (the final run instructions)

- [ ] **Step 1:** Write `scripts/handoff.test.ts` and run it (FAIL).
- [ ] **Step 2:** Implement `scripts/handoff.ts` and generate the note. Run the test (PASS).
- [ ] **Step 3:** Run `npm run verify` from a clean `npm ci`. Expected: PASS.
- [ ] **Step 4:** Grep the production build output for `/api/_dev`, `qniconnect.stubAccount`, `REG-DEMO-` and `@brightpath.org`. Expected: none (`build:check`).
- [ ] **Step 5:** Checkpoint: `git add -A`. The whole-branch review follows (subagent-driven-development final review).
