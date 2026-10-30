# Inventory: public pages and diagnostics

Source repo: `C:\dev\qniconnect front end\QniConnect-FrontEnd`. Paths below are relative to `src/` unless they start with `.env`. Citations are `file:line` (ranges use `-`).
IDs: `LAND`, `REG`, `PRICE`, `LOGIN`, `DIAG`. Call ids are `<ID>.C<n>`; rules `<ID>.R<n>`; states `<ID>.S<n>`.
Token column values: `none` (no `Authorization` header), `login` (login-scope token), `bc` (Business Central `.default` scope token). Every `bc` call here gets its token from `getAccessToken(businessCentralScopes.read)` (`services/tenantVerificationService.js:28,141`), where `businessCentralScopes.read = ["https://api.businesscentral.dynamics.com/.default"]` (`auth/authConfig.js:36-41`).

## 0. Routing and app shell that governs the public pages (source: App.js)

| Route | Element | Cite |
|---|---|---|
| `/` | `RegistrationAndLanding` (no props, so `pageType='landing'`) | App.js:198 |
| `/login` | if `(localAuthState \|\| isAuthenticated) && accounts.length > 0` then `<Navigate to="/portal"/>`, else `<AuthPages pageType="signin" onLogin={handleLogin}/>` | App.js:199-210 |
| `/forgot-password` | `<Navigate to="/login"/>` | App.js:211 |
| `/register` | `EnhancedRegistration` | App.js:211 |
| `/pricing` | `SiriusConnect365Licenses` (the default export is named `QniConnectLicenses`) | App.js:212 |
| `/auth-error`, `/auth/callback` | auth inventory (not here) | App.js:213-214 |

Shell rules (apply before any public page renders):
- SHELL.R1: While `useAuth().isLoading` is true, every route (public ones too) is replaced by a centred spinner and the text `Authenticating...` (App.js:175-182).
- SHELL.R2: When `useAuth().authError` is truthy, the router is replaced by only two routes: `/auth-error` (AuthErrorPage with the message) and `*` redirecting to `/auth-error`. Public pages are unreachable (App.js:185-192).
- SHELL.R3: `DebugPanel` is mounted only when `process.env.NODE_ENV === 'development'` (App.js:252).
- SHELL.R4: There is no catch-all route outside the authError branch (no 404 page): an unknown path renders nothing under the router (App.js:196-250).
- SHELL.R5: `App.css` is not imported anywhere (grep `App.css` finds no importer); it is CRA boilerplate with no behaviour. `index.css` is imported by `index.js:8` and contributes behaviour only through the `qni-landing-*` classes (LAND.R14).

---

## LAND Landing page   (source: components/RegistrationAndLanding.js:1-556, index.css:71-125)

### Calls
No `fetch`/HTTP calls. The page uses MSAL directly (the auth inventory owns MSAL behaviour):

| id | method | path | headers | token | body | credentials |
|---|---|---|---|---|---|---|
| LAND.C1 | MSAL `instance.loginPopup(loginRequest)` (line 120) | n/a (MSAL) | n/a | login scopes `["User.Read","openid","profile","email"]` (auth/authConfig.js:31-33) | n/a | n/a |
| LAND.C2 | MSAL `instance.loginRedirect({...loginRequest, redirectUri: window.location.origin})` (line 129) | n/a | n/a | login scopes | n/a | n/a |
| LAND.C3 | MSAL `instance.logoutPopup({mainWindowRedirectUri: window.location.origin, onRedirectNavigate: () => false})` (lines 91-94) | n/a | n/a | n/a | n/a | n/a |

### Response fields read
None (no HTTP responses). The `loginPopup` result is ignored (line 120).

### States
- LAND.S1 default: hero, sign-in card, enabled button text `Sign in with Microsoft` with the four-square Microsoft logo (225-238).
- LAND.S2 signing in (`signInLoading`): button disabled, spinner plus text `Signing in…` (U+2026 ellipsis), button gradient `linear-gradient(135deg,#8fd25a,#2a6e2f)`, cursor not-allowed, opacity 0.85 (213-238).
- LAND.S3 error (`signInError`): paragraph under the button, exact text `Sign in failed. Please try again.` (132, 240-244).
- LAND.S4 no empty, loading or error state for data (static page).

### Static content (exact text, in order)
- Top bar: link `Need help?` -> `mailto:support@dogmagroup.co.uk` (157-163).
- Logo image `alt="QniConnect"`: light variant `assets/QniConnect_Logo.png`, height 84px (172, 32-38).
- Eyebrow pill: `Employee Self-Service Portal` (179).
- H1: `Your payroll.` line break `On your time.` (187).
- Paragraph: `Secure self-service access to your payslips, documents and employment records directly connected to your organisation's Microsoft Business Central.` (190-193).
- Trust badges, three, in order: `Microsoft Azure secured`, `HMRC compliant`, `Real-time BC data` (197-199).
- Card: label `Already have an account?` (206); H2 `Sign in to QniConnect` (209); the button above; divider text `OR` (248); label `New to QniConnect?` (253); text `Connect your Business Central environment and get your team set up.` (256); link `Register your organisation` with arrow icon -> `/register` (258-265).
- Footer: `© {current year} QniPay. All rights reserved.` (276); links `Privacy` and `Terms`, both `https://qnipay.com/legal/`, `target="_blank" rel="noreferrer"` (279-280).

### Rules and edge cases
- LAND.R1: `pageType` prop defaults to `'landing'` and `setPageType` is never called (grep: only the `useState` declaration, line 68). The route passes no prop, so the page is always the landing page.
- LAND.R2: The `/` route does not redirect authenticated users; a signed-in user sees the landing page (App.js:198, no guard).
- LAND.R3: `handleSignIn` first calls `clearSessionStorage()`, which removes these **localStorage** keys (despite the name): `clientCompanies`, `clientCompanyId`, `clientCompanyName`, `employeeData`, `employeeId`, `employeeNo` (108-111, 114). It does not remove `isAuthenticated`, `registrationId` or `activeEnvironment`.
- LAND.R4: Then sets `signInLoading=true`, `signInError=null` (115-116).
- LAND.R5: If `window.innerWidth > 768`, try `loginPopup(loginRequest)`; on success call `navigate('/portal')` and return (118-124). `signInLoading` is not reset after popup success.
- LAND.R6: If the popup throws (any reason), log a warning and fall through to `loginRedirect` (125-128). If `window.innerWidth <= 768` (including exactly 768) go straight to `loginRedirect` (129).
- LAND.R7: If `loginRedirect` throws, set `signInError='Sign in failed. Please try again.'` and `signInLoading=false` (130-134). After a successful redirect call the loading state stays true (the page navigates away).
- LAND.R8: The redirect uses `redirectUri: window.location.origin` (129).
- LAND.R9: On mount and whenever `instance` changes, if `sessionStorage['manual_redirect'] === 'true'`: remove the key, and if `instance` exists call `logoutPopup({mainWindowRedirectUri: window.location.origin, onRedirectNavigate: () => false})`; success logs `MSAL logout completed successfully`, failure logs a warning only, with no user-visible message (84-103). The key is written by `components/auth/AuthErrorPage.js:18` (auth inventory).
- LAND.R10: The "Register your organisation" link is a router `Link` to `/register` (258-259).
- LAND.R11: Differences from LOGIN's SignInButton: LAND clears the six keys (R3), navigates to `/portal` after a popup success, uses the label `Sign in with Microsoft` and error text `Sign in failed. Please try again.`; LOGIN uses `Sign in with Microsoft 365`, error `Login failed. Please try again.`, no clearing and no manual navigate (LOGIN.R6).
- LAND.R12: Dead code: lines 287-493 are a second, three-step registration form shown only when `pageType !== 'landing'`, which can never happen (R1). It is listed at the end of this section for completeness and must not be ported as live behaviour.
- LAND.R13: Unused imports (`Mail`, `CreditCard`, etc.) have no behaviour.
- LAND.R14: Interactive presentation: `.qni-landing-card` lifts `translateY(-4px)` on hover with `transition: transform .3s ease, box-shadow .3s ease` (index.css:84-110); `.qni-pulse-dot` runs `qni-pulse-glow` 2.4s ease-in-out infinite (index.css:112-125). `index.css` has no `prefers-reduced-motion` handling.

### Storage
- localStorage removed on sign-in click: the six keys in LAND.R3 (108-111).
- sessionStorage read then removed: `manual_redirect` (86-88).
- Nothing written.

### Fakes or fallbacks in today's code
- Hard-coded support address `support@dogmagroup.co.uk` (158; also 384 and EnhancedRegistration.js:494) while LOGIN shows `support@qnipay.com`.
- Hard-coded marketing claims `HMRC compliant`, `Microsoft Azure secured` (static text).

### LAND dead branch (RegistrationAndLanding.js:287-554, unreachable)
- Steps (288-292): `Company Details` / `Your organisation info`; `BC Configuration` / `Connect Business Central`; `Confirmation` / `Review & submit`.
- Step 1 fields: `Company Name*` (placeholder `Acme Corporation Ltd`), `Company Email*` (type email, `admin@company.com`); Continue disabled unless both non-empty and not loading (411-418).
- Step 2 fields: `Tenant ID*` (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`), `Environment Name*` (`Production`), `BC Company Name*` (`CRONUS UK Ltd.`); Continue disabled unless all non-empty (428-441).
- Step 3: review rows `Company`, `Email`, `Tenant ID`, `Environment`, `BC Company`; checkbox `I agree to the Terms of Service and Privacy Policy` (both links `https://qnipay.com/legal/`); button `Complete Registration` disabled until checked (453-475).
- Submit (`handleRegistrationSubmit`, 137-148) makes **no network call**: `isLoading=true`, `setTimeout` 1500 ms, then steps 1-2 advance and step 3 runs `alert('Registration successful! You will receive an email with further instructions.')` then `navigate('/')`. Button shows spinner and `Processing…` while loading. It is a fake.

---

## REG Registration   (source: components/EnhancedRegistration.js:1-937; services/tenantVerificationService.js:1-285)

Route `/register` (App.js:211). Four steps in one `<form onSubmit={handleSubmit}>` (line 535). There is **no tenant verification call and no company lookup during registration**. `TenantVerificationService` is used only after login by `EnvironmentSelector` (EnvironmentSelector.js:6,32-34,55,79,204). The `client-tenant/companies` fetch lives in `components/auth/EnvironmentSelector.js:181` and in `businessCentralService.getClientTenantCompanies` (called at EmployeePortal.js:76); those belong to the auth and portal inventories. The service's own calls are inventoried here (REG.C2, REG.C3) because the file is in this task's source list.

### Calls
| id | method | path (with query) | headers sent (name <- source) | token | body | credentials |
|---|---|---|---|---|---|---|
| REG.C1 | POST | `${process.env.REACT_APP_API_BASE_URL}/bc/portalRegistrations` (EnhancedRegistration.js:152,156). No fallback: if the env var is unset the URL is the literal `undefined/bc/portalRegistrations`. | `Content-Type` <- literal `application/json` (159) | none | JSON per REG.R17 (129-147, 161) | not set (fetch default) |
| REG.C2 | POST | `${backendApiUrl}/bc/portalUsers/verify`, with `backendApiUrl = process.env.REACT_APP_API_BASE_URL \|\| "https://demo-backend-demo.uksouth-01.azurewebsites.net/api"` (tenantVerificationService.js:8,34) | `Content-Type` <- literal `application/json` (36-37); `Authorization` <- `Bearer ${token}` with token = `getAccessToken(businessCentralScopes.read)` (28,38) | bc | `{ email, userId }` as JSON (40) | not set |
| REG.C3 | GET | `${backendApiUrl}/bc/environments`, plus `?$filter=<encodeURIComponent("registrationId eq '<id>'")>` when `this.registrationId` is set (147-152) | `Authorization` <- `Bearer ${token}` (bc token, 141,161) | bc | none | not set |

Callers: `EnvironmentSelector.js:55-58` calls `verifyUserAccess(user?.email, user?.oid)` (so `userId` is the OID); `:79` and `:204` call `getAvailableEnvironments()`.

### Response fields read
| call id | field path | how it is used | guarded? |
|---|---|---|---|
| REG.C1 | `response.ok`, `response.status` | success vs error (177); status only in fallback `API Error: ${status}` (188) | n/a |
| REG.C1 | body read as text, `JSON.parse`, on failure replaced by `{ message: responseText }` (170-175) | `result` | yes (try/catch) |
| REG.C1 | `result.error` | if truthy on non-ok, thrown as is (181) | yes (`if`) |
| REG.C1 | `result.message` | if no `result.error`, thrown (183) | yes |
| REG.C1 | whole `result` | else thrown as `JSON.stringify(result)` (185) | yes |
| REG.C1 | success body | logged only, never shown (192) | n/a |
| REG.C2 | `response.status === 404` | user-not-found path (44) | n/a |
| REG.C2 | 404 body `errorData.message` | `errorData.message \|\| 'User not found in Business Central Portal'` (54); `await response.json()` at 46 is **unguarded**: a non-JSON 404 body throws into the catch (REG.R44) | message guarded; parse not |
| REG.C2 | non-ok body `error.shouldCleanup` | truthy means cleanup and return a failure result (62-70) | `if` |
| REG.C2 | non-ok body `error.message` | `error.message \|\| "Failed to verify user access"` (67,71) | yes |
| REG.C2 | ok body `userData.exists`, `userData.isActive` | `=== false` on either triggers cleanup and `requiresRedirect=true` (77-84) | `userData &&` |
| REG.C2 | `userData.userData.registrationId` | stored in `this.registrationId` and localStorage `registrationId` (87-90) | `&&` chain |
| REG.C2 | whole ok body | returned to the caller unchanged (93); other fields are consumed by EnvironmentSelector (auth inventory) | n/a |
| REG.C3 | non-ok body `error.message` | `error.message \|\| "Failed to retrieve environments"` (166-167); `response.json()` unguarded | `\|\|` |
| REG.C3 | `data.value`, else `data.environments`, else `[]` | environment array (174) | yes |
| REG.C3 | per env: `id \|\| environmentId` -> `id`; `environmentName \|\| name` -> `name`; `environmentType \|\| type \|\| 'Production'` -> `type`; `environmentUrl \|\| url \|\| ''` -> `url`; `status \|\| 'Active'` -> `status`; `companyName \|\| company_Name \|\| ''` -> `companyName`; `company_Id \|\| companyId \|\| ''` -> `company_Id` | mapping (177-185) | yes, except `id` and `name`, which may be `undefined` |

### States
- REG.S1 form, step N of 4: header `Step {N} of 4`, title and subtitle from `stepMeta` (330-335, 520-528).
- REG.S2 submitting (`isLoading`): final button disabled, spinner plus `Processing...` (901-912).
- REG.S3 error: red alert above the card on any step, heading `Registration Error`, body = message, dismiss button (screen-reader text `Dismiss`) which sets error to null (281-307, 531). Message rules REG.R23-R25.
- REG.S4 success (`formSubmitted`): replaces the form; check icon, H2 `Registration Successful!`, text `Thank you for registering. We've sent a confirmation email to <contactEmail || companyEmail> with further instructions to complete your setup.`, button `Return to Home` -> `navigate('/')` (497-511).
- REG.S5 no loading state before submit; no empty state.
- REG.S6 disabled buttons: Continue disabled when `!isStepValid(step)`; Complete Registration disabled when `!isStepValid(4) || isLoading` (609, 690, 794, 899-902).

### Steps, fields, labels (exact)
Step meta (330-335): 1 `Company Info` / `Company Information` / `Tell us about your organisation`; 2 `BC Configuration` / `Business Central Configuration` / `Connect your Business Central environment`; 3 `Plan Selection` / `Select Your Plan` / `Choose the right plan for your organisation`; 4 `Contact & Confirm` / `Contact & Confirmation` / `Review your details and complete registration`.

Step 1 (538-614):
- `Company Name *` text, id/name `companyName`, placeholder `Acme Corporation Ltd`, `required`.
- `Company Email *` type email, `companyEmail`, placeholder `info@company.com`, `required`; helper `We'll send important account notifications to this email`.
- `Company Website` type url, `companyWebsite`, placeholder `https://company.com`.
- `Company Phone` type tel, `companyPhone`, placeholder `+44 20 1234 5678`.
- `Industry` select `industry`, first option `Select an industry` (value `""`), then `Accounting & Finance`, `Construction`, `Consulting`, `Education`, `Healthcare`, `Information Technology`, `Manufacturing`, `Retail`, `Transportation`, `Other` (63-74).
- Button `Continue`.

Step 2 (617-695):
- `Tenant ID *` text `tenantId`, placeholder `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, required.
- `Domain Name *` text `domainName`, placeholder `company.onmicrosoft.com`, required.
- `BC Environment *` text `bcEnvironment`, placeholder `Production`, required.
- `BC Company Name *` text `bcCompanyName`, placeholder `CRONUS UK Ltd.`, required.
- `Number of Employees *` type number `numberOfEmployees`, `min="1"`, placeholder `25`, required; helper `For approximate calculation only. Actual billing is based on employees with salaries posted per month.`
- Buttons `Back`, `Continue`.

Step 3 (698-799):
- `Billing Frequency` toggle, two buttons: `Monthly` (`monthly`) and `Annual (Save 20%)` (`annual`); the selected one has a filled green background (704-722).
- Three plan cards (728-731); clicking selects `selectedPlan`:
  - `basic`: name `Basic`, price `£0.5`, features `Profile visibility`, `Payslip access`, `Secure auth`.
  - `essential`: name `Essential`, price `£5`, badge `POPULAR`, features `All Basic`, `Document mgmt`, `Leave mgmt`.
  - `premium`: name `Premium`, price `£7`, features `All Essential`, `Starter checklist`, `Priority support`.
  - Each card shows `{price}/user/mo`; the selected card shows a `SELECTED` strip (762-766).
- Summary box (773-790): left text `{Plan} Plan · {numberOfEmployees || '—'} users · billed {annually|monthly}` plus, when annual, a green `20% off`; right: `£{total}` and `per year` (annual) or `per month` (monthly).
- Buttons `Back`, `Continue`.

Step 4 (802-916):
- `Contact Name *` text `contactName`, placeholder `John Smith`, required.
- `Contact Email *` type email `contactEmail`, placeholder `john@company.com`, required.
- `Contact Phone` type tel `contactPhone`, placeholder `+44 20 1234 5678`.
- `Registration Summary` box, six pairs, empty shown as `—` (849-861): `Company`, `Email` (companyEmail), `BC Environment`, `BC Company`, `Plan` = `{Plan} · £{monthlyPrice}/user/mo`, `Employees`.
- Checkbox `agreeTerms` (required): `I agree to the Terms of Service and Privacy Policy *` (both links `https://qnipay.com/legal/`, `target="_blank" rel="noopener noreferrer"`) (867-880).
- Checkbox `agreeDataProcessing` (required): `I consent to the processing of my company and personal data as described in the Privacy Policy *` (same link) (881-894).
- Buttons `Back`, `Complete Registration` (type submit).

Chrome: left panel only from the `lg` breakpoint (`className="hidden lg:flex"`, 390); mobile logo `lg:hidden` (490). Left panel has `← Back` -> `navigate('/')` (406-422), H1 `Get your team` / `up and running.`, paragraph `Register your Business Central environment and give employees secure, instant access to their payroll data — all in minutes.` (427-433), a step tracker with the four `label`s (check mark when done, number otherwise) (437-476), and `Powered by QniPay` (481). Top-right `Need help?` -> `mailto:support@dogmagroup.co.uk` (494). Footer `© {year} QniPay. All rights reserved.`, `Privacy`, `Terms` (`https://qnipay.com/legal/`) (923-927).

### Rules and edge cases
Initial state and navigation
- REG.R1: Initial `formData` (35-60): all strings `''`, `agreeTerms=false`, `agreeDataProcessing=false`, `selectedPlan='essential'`, `paymentFrequency='annual'`. Initial step is 1. Port (Ruling Q23): no `selectedPlan`; billing still starts annual.
- REG.R2: `handleChange` copies `value` (or `checked` for checkboxes) into the field named by the input `name` (77-83).
- REG.R3: `nextStep` increments `currentStep` only while `< 4` and calls `window.scrollTo(0,0)`; `prevStep` decrements only while `> 1` and scrolls to top (102-114). Data is kept when going back.
- REG.R4: The Continue buttons on steps 1-3 are `type="button"`, so they never submit the form and never trigger native `required` validation. Only `isStepValid` gates them.
- REG.R5: `isStepValid` (241-260) is a truthiness test, with no trimming and no format check:
  - step 1: `companyName && companyEmail`.
  - step 2: `tenantId && domainName && bcEnvironment && bcCompanyName && numberOfEmployees`.
  - step 3: `selectedPlan && paymentFrequency` (always true).
  - step 4: `contactName && contactEmail && agreeTerms && agreeDataProcessing`.
  - any other step: false.
- REG.R6: There are no custom validation messages. Validation is native HTML only (`required`, `type=email|url|number`, `min=1`), enforced by the browser only on submit and only for mounted inputs. Only step 4 is mounted at submit, so only `contactName`, `contactEmail` (email format), `agreeTerms` and `agreeDataProcessing` are natively validated, with the browser's own tooltip text. The email format of `companyEmail`, the URL format of `companyWebsite` and `min=1` of `numberOfEmployees` are never enforced.
- REG.R7: Whitespace-only values pass `isStepValid` (truthy). `numberOfEmployees` of `"0"` or `"-5"` passes (non-empty string).
- REG.R8: Enter key: steps 1-3 have no submit button, so implicit submission does not occur; on step 4 Enter submits only while the submit button is enabled. (Derived from HTML form rules and the markup at 609, 690, 794, 899.)
- REG.R9: An error shown on step 4 stays visible if the user goes back; it is cleared only by `handleSubmit` start (line 125) or `dismissError` (117-119).
- REG.R10: The page does not check authentication; signed-in users can register.

Plan and pricing in the form
- REG.R11: `getPricing()` (263-278): `basePricing = { basic: 0.5, essential: 5, premium: 7 }`. Annual: `monthlyPrice = (price*0.8).toFixed(2)` (string), `annualPrice = (price*0.8*12).toFixed(2)` (string), `discount='20%'`. Monthly: `monthlyPrice = price` (number), `annualPrice = (price*12).toFixed(2)`, `discount='0%'`. `discount` is unused in the UI. Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- REG.R12: Step 3 total = `(annualPrice * (numberOfEmployees || 0)).toFixed(2)` when annual, `(monthlyPrice * (numberOfEmployees || 0)).toFixed(2)` when monthly (783-785). Values the port must reproduce: Essential annual, 10 employees -> `£480.00` per year (annualPrice `"48.00"`); Basic annual, 10 -> `£48.00` (`"4.80"`); Premium annual, 10 -> `£672.00` (`"67.20"`); Essential monthly, 10 -> `£50.00`; Basic monthly, 10 -> `£5.00`; Premium monthly, 10 -> `£70.00`. Port (Ruling Q23): the base price times employees, per year or per month, in `£` to two places.
- REG.R13: The step 4 summary `Plan` line uses `monthlyPrice` as is (854): Essential annual `£4.00/user/mo`; Basic annual `£0.40/user/mo`; Premium annual `£5.60/user/mo`; monthly shows `£0.5`, `£5`, `£7` (numbers, no decimals). Port: monthly Basic shows `£0.50` (pence in two places; whole pounds stay `£5`, `£7`) (Ruling Q22). Port (Ruling Q23): `QniConnect · £0.50/user/mo` monthly, `£0.40` annual.
- REG.R14: The plan name in summaries is the key with its first letter upper-cased (`Basic`, `Essential`, `Premium`) (777, 854). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- REG.R15: Prices are hard-coded in both `basePricing` and the card list (729-731). The text `Annual (Save 20%)` and `20% off` are hard-coded. Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).

Submit
- REG.R16: Submit handler: `e.preventDefault()`, `isLoading=true`, `error=null` (122-125).
- REG.R17: Payload (129-147), exact keys and values:
  - `company_Name` <- `companyName`
  - `contactEmail` <- `contactEmail || companyEmail`
  - `contactName` <- `contactName`
  - `tenantId` <- `tenantId`
  - `primaryEnvironment` <- `bcEnvironment`
  - `primaryCompanyName` <- `bcCompanyName`
  - `numberOfEmployees` <- `parseInt(numberOfEmployees, 10) || 1` (so `0`, empty and `NaN` become `1`; `-5` stays `-5`; `2.5` becomes `2`)
  - `industry` <- `industry` (may be `''`)
  - `registrationSource` <- `"Portal"`
  - `vatRegistrationNo` <- `""`
  - `companyRegistrationNo` <- `""`
  - `primaryContactLanguage` <- `"EN"`
  - `address`, `city`, `county`, `postCode`, `countryRegionCode` <- `formData.<key> || ""`; these keys do not exist in `formData`, so they are always `""`.
- REG.R18: Collected but **never sent**: `companyEmail` (only as fallback for `contactEmail`), `companyWebsite`, `companyPhone`, `domainName`, `selectedPlan`, `paymentFrequency`, `contactPhone`, `agreeTerms`, `agreeDataProcessing`. The chosen plan and billing frequency never reach the backend.
- REG.R19: Request: `POST`, header `Content-Type: application/json` only; no `Authorization`; no `credentials` option (REG.C1).
- REG.R20: Response handling: `await response.text()`, try `JSON.parse`, on failure result = `{ message: responseText }` (165-175).
- REG.R21: Non-ok: if `result` is a truthy object, throw `result.error` if truthy, else throw `result.message` if truthy, else throw `JSON.stringify(result)`. If `result` is not a truthy object (a JSON string, number, boolean or `null`), throw `new Error('API Error: ' + status)` (177-189).
- REG.R22: Ok (`response.ok`): whatever the body, `formSubmitted=true` and `isLoading=false` (193-194). The body is not inspected.
- REG.R23: Catch message derivation (196-227), default `An error occurred during registration. Please try again.`:
  - thrown value is a string: use it;
  - an `Error` instance (a network `TypeError`, or the `API Error: n` error): use `.message`;
  - another non-null object: `.message` if truthy, else `.error` if it is a string, else `.error.message` if truthy, else `JSON.stringify(object)`, and if that throws `Unknown error format received from server`.
- REG.R24: If the resulting message is a string containing `CorrelationId:`, cut everything from `CorrelationId:` on and trim (230-233).
- REG.R25: `setError(errorMessage)` and `isLoading=false`; the user stays on step 4 with data intact (235-236). An empty-string message shows no alert at all (`{error && ...}` is falsy for `''`, line 531).
- REG.R26: Double submit is prevented only by the disabled button (`isLoading`), not inside `handleSubmit`.
- REG.R27: The success screen email text uses `contactEmail || companyEmail` (506). No storage is written; the only exit is the `Return to Home` button.
- REG.R28: Network failures show the browser message (for example `Failed to fetch`) in the alert, since a `TypeError` is an `Error` instance.

Tenant verification service (REG.C2, REG.C3 and helpers; called after login)
- REG.R40: The constructor stores `getAccessToken` and `backendApiUrl` (env var or demo default), and `registrationId=null` (6-10).
- REG.R41: `verifyUserAccess(email, userId)` first reads localStorage `registrationId` and, if present, sets `this.registrationId` (21-25).
- REG.R42: Token check: if the token is falsy, or equals `'Not Readable'` or `'mock-token-for-development'`, throw `Error('Invalid authentication token. Please log in again.')` (29-31), which goes to the catch (REG.R47). `AuthContext.getAccessToken` returns `null` and starts a redirect when no account exists (AuthContext.js:320-325).
- REG.R43: 404 (34-57): body parsed, `cleanupSession()`, returns `{ exists:false, isActive:false, message: errorData.message || 'User not found in Business Central Portal', requiresRedirect:true }`.
- REG.R44: The 404 body's `response.json()` is unguarded: a non-JSON 404 throws into the catch, which gives a failure result carrying the SyntaxError message, or the dev mock (REG.R47).
- REG.R45: Other non-ok (59-72): if the body has `shouldCleanup` truthy, cleanup and return `{ exists:false, isActive:false, message: error.message || "Failed to verify user access", requiresRedirect:true }`; else `throw new Error(error.message || "Failed to verify user access")`, which goes to the catch.
- REG.R46: Ok body (74-93): if `exists === false` or `isActive === false`, cleanup, set `requiresRedirect = true` on the body and return it. Otherwise store `userData.userData.registrationId` into `this.registrationId` and localStorage `registrationId` (when present) and return the body.
- REG.R47: Catch (94-131): log; **if `process.env.NODE_ENV === 'development'` return the mock success** (see Fakes) after setting `this.registrationId='mock-registration-id'` and localStorage `registrationId='mock-registration-id'`; otherwise `cleanupSession()` and return `{ exists:false, isActive:false, message: error.message || "Error verifying user access", requiresRedirect:true }`. So every failure path (token, network, 5xx, parse) returns a successful mock in development. `email.split('@')` in the mock throws a `TypeError` out of the catch when `email` is undefined (107).
- REG.R48: `getAvailableEnvironments()` (138-218): same token check; URL as REG.C3 (filter only when `registrationId` is set, else the debug log `No registrationId available for filtering environments`); non-ok throws `Error(error.message || "Failed to retrieve environments")`; success returns `{ environments: [...mapped] }`; the catch returns the two mock environments in development, else `{ environments: [] }`.
- REG.R49: `setActiveEnvironment(environmentId, environmentName)` makes no network call; writes localStorage `activeEnvironment = JSON.stringify({ id, name, activatedAt: new Date().toISOString() })` and returns `{ success:true, environment, message:'Environment activated successfully' }`; a thrown error is rethrown (227-250).
- REG.R50: `cleanupSession()` (255-283): removes localStorage keys `isAuthenticated`, `activeEnvironment`, `registrationId`, `currentUser`, `employeeNo`, `employeeId`, `clientCompanyId`, `clientCompanyName`, `clientCompanies`; removes every sessionStorage key that `startsWith('msal.')` or `includes('token')` or `includes('auth')`; expires every cookie (`expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`) whose name `includes('msal')`, `includes('auth')` or `includes('session')`.
- REG.R51: `cleanupSession` does not remove `employeeData` (which LAND.R3 does clear).

### Storage
- localStorage read: `registrationId` (tenantVerificationService.js:21).
- localStorage written: `registrationId` (89, 117), `activeEnvironment` (237).
- localStorage removed: the nine keys in REG.R50.
- sessionStorage removed: keys matching REG.R50. The registration form itself uses no storage.
- Cookies expired: REG.R50.

### Fakes or fallbacks in today's code
- tenantVerificationService.js:101-113 mock verification (development only): `{ exists:true, isActive:true, message:'User access verified (mock)', userData:{ id:'mock-user-id', name: email.split('@')[0] || 'User', email, role:'Employee', status:'Active', registrationId:'mock-registration-id' } }`.
- tenantVerificationService.js:195-211 mock environments (development only): `{id:'env-production-01', name:'Production', type:'Production', url:'https://businesscentral.dynamics.com/production', status:'Active'}` and `{id:'env-sandbox-01', name:'Sandbox', type:'Sandbox', url:'https://businesscentral.dynamics.com/sandbox', status:'Active'}`.
- Token sentinel strings `'Not Readable'` and `'mock-token-for-development'` (29, 142).
- Default backend host `https://demo-backend-demo.uksouth-01.azurewebsites.net/api` (service line 8; also auth/authConfig.js:45).
- EnhancedRegistration.js:138-146 hard-coded empty VAT, registration number and address fields; `registrationSource: "Portal"`, `primaryContactLanguage: "EN"`.
- `.env.development` has `REACT_APP_API_BASE_URL=http://localhost:5000` (no `/api` suffix); `.env.production` has `https://siriusconnect365-dev-backend-eectg5bub3a0agge.uksouth-01.azurewebsites.net/api`, so the REG.C1 URL differs by environment.

---

## PRICE Pricing and licences   (source: components/SiriusConnect365Licenses.js:1-886)

Route `/pricing` (App.js:212). Static page, no calls.

### Calls
None (grep for `fetch`, `axios`, `onSubmit`, `<form`, `localStorage`, `sessionStorage` in the file finds nothing).

### Response fields read
None.

### States
- PRICE.S1 default: tab `Basic` selected (`selectedTier='basic'`, line 8); comparison table hidden (`showComparison=false`, line 9). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- PRICE.S2 tier `essential` or `premium` selected: that tier's panel shows. Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- PRICE.S3 comparison open: toggle label `Hide detailed comparison` and chevron rotated 180 degrees; closed: `View detailed comparison` (596-597). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- No loading, empty or error states.

### Header and navigation (83-101)
- Logo (`QniConnect_Logo_Dark.png`, `alt="QniConnect"`, 42px) linking to `/`.
- `Register` -> `/register`; `Sign in` -> `/login` (router Links).

### Page copy (exact)
- H2 `Choose the right plan for your organization` (108); sub `QniConnect offers flexible license options to meet the specific needs of your business` (111).
- Tier selector: from `sm` up, three tab buttons `Basic`, `Essential`, `Premium` (119-148); below `sm`, a `<select>` with options `Basic` (basic), `Essential` (essential), `Premium` (premium) (156-164). Both call `handleTierChange`.

Tier panels (only the selected one renders):

**Basic** (173-296)
- Badge `BASIC`; H2 `Basic License`; text `Essential employee self-service for payslip access, ideal for small businesses looking for core functionality.`
- Price `£0.5`, then `per employee/month` and `billed monthly` (192-196).
- Check list (4): `Employee profile visibility`; `Payslip list and detailed preview`; `Secure PDF payslip download`; `Microsoft 365 authentication` (207-231).
- CTA link `Get started with Basic` -> `/register` (237-238).
- Right card `Designed for employees who need:` with: `Secure access` to personal payroll information; `Self-service access` to current and historical payslips; `Easy download` of payslips for tax filing and record-keeping; `Seamless login` with existing Microsoft 365 credentials (249-290; the first phrase of each is bold).

**Essential** (298-444)
- Badges `ESSENTIAL` and `MOST POPULAR`; H2 `Essential License`; text `Complete employee portal with expanded features for comprehensive HR self-service capabilities.`
- Price `£5`, `per employee/month`, `billed monthly` (322-326).
- Check list (5): `All Basic features` included (bold part `All Basic features`); `Personalized employee dashboard`; `Document management system`; `Leave management and time tracking`; `Reporting and analytics tools` (337-369).
- CTA `Get started with Essential` -> `/register` (375-376).
- Right card `Perfect for organizations that need:` with: `Comprehensive dashboard` for employee self-service; `Centralized document repository` for important employee documents; `Leave and absence management` to streamline time-off requests; `Advanced reporting` for better workforce insights; `Time tracking capabilities` for accurate attendance records (387-436).

**Premium** (446-588)
- Badge `PREMIUM`; H2 `Premium License`; text `Our most comprehensive solution with advanced features including the employee starter checklist.`
- Price `£7`, `per employee/month`, `billed monthly` (465-469).
- Check list (5): `All Basic & Essential features` included; `Comprehensive starter checklist`; `Advanced onboarding tools`; `Enhanced reporting capabilities`; `Priority support` (480-512).
- CTA `Get started with Premium` -> `/register` (518-519).
- Right card `Ideal for organizations that want:` with: `Complete employee lifecycle management` from onboarding to offboarding; `Comprehensive starter checklist` to streamline new employee setup; `Advanced document workflows` for approvals and digital signatures; `Enhanced analytics and reporting` with customizable dashboards; `Priority support` with dedicated account management (530-579).

**Comparison table** (button 592-598; table 603-650): columns `Feature`, `Basic`, `Essential`, `Premium`; 12 rows, a green check when included, a grey X when not:

| Feature | Basic | Essential | Premium |
|---|---|---|---|
| Profile page visibility | yes | yes | yes |
| Payslip list view | yes | yes | yes |
| Payslip preview | yes | yes | yes |
| Payslip download (PDF) | yes | yes | yes |
| Microsoft 365 authentication | yes | yes | yes |
| Business Central integration | yes | yes | yes |
| Dashboard | no | yes | yes |
| Document management | no | yes | yes |
| Leave management | no | yes | yes |
| Time tracking | no | yes | yes |
| Reporting & analytics | no | yes | yes |
| Starter checklist | no | no | yes |

(data in `tiers`, lines 20-78; row order and names come from `tiers.basic.features`; Essential and Premium values are read by the same index.)

**How it works** (659-706): H2 `How license-based access works`; text `QniConnect intelligently adapts to your organization's license tier, showing only the features your employees have access to.` Three steps: `1` `User Authentication` - `Employees sign in using their Microsoft 365 credentials, providing a seamless and secure authentication experience.`; `2` `License Detection` - `The system automatically detects the organization's license tier (Basic, Essential, or Premium) from Business Central.`; `3` `Personalized Experience` - `The portal dynamically adapts to show only the features and functions available in your license tier.`
Mock browser frame (716-735): title `QniConnect Employee Portal`, an `<img src="/api/placeholder/800/450" alt="QniConnect License Visualization">`, and a floating pill `Visibility adapts to license tier`.

**Footer** (741-882): columns, all links `href="#"` with no behaviour. `Solutions`: `Payroll Management`, `Employee Self-Service`, `Document Management`, `HR Analytics`. `Support`: `Documentation`, `API Reference`, `Guides`, `Help Center`. `Company`: `About`, `Blog`, `Careers`, `Contact`. `Legal`: `Privacy`, `Terms`, `Cookie Policy`, `GDPR`. Right block: logo (46px), `The premier employee portal solution for Business Central users. Simplify HR operations and enhance employee experience.`, `Subscribe to our newsletter`, email input (`aria-label="Email address"`, `type="email"`, `required`, placeholder `Enter your email`), button `Subscribe`. Bottom line: `© 2025 QniConnect. All rights reserved.` (year hard-coded).

### Rules and edge cases
- PRICE.R1: `selectedTier` is local state, default `basic`; the tab buttons and the mobile `<select>` both call `handleTierChange(tier)` (11-13, 119-164). Only the selected tier panel is rendered (173, 298, 446). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- PRICE.R2: `toggleComparison` flips `showComparison` (15-17). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- PRICE.R3: Comparison rows are shaded by `parseInt(index) % 2 === 0 ? 'bg-white' : 'bg-gray-50'` (622). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- PRICE.R4: Every CTA (`Get started with Basic|Essential|Premium`) links to `/register` and does not carry the tier; the register form defaults to `essential` regardless (REG.R1). Port (Ruling Q23): one CTA, `Register your organisation`.
- PRICE.R5: The `tiers` fields `name`, `price` and `description` are never rendered; displayed prices and copy are the literal strings in the JSX (the lists above are the contract). Prices: Basic `£0.5`, Essential `£5`, Premium `£7`, all `per employee/month`, `billed monthly`. Port: Basic shows `£0.50` (Ruling Q22). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- PRICE.R6: No annual-discount concept exists on this page (unlike REG.R11). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- PRICE.R7: Feature wording differs between PRICE and the REG plan cards (REG: `Profile visibility`, `Payslip access`, `Secure auth`, ...). Each is contract content for its own page. Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).
- PRICE.R8: The page is public; no auth check and no redirect for signed-in users.
- PRICE.R9: The newsletter control has no handler and is not inside a `<form>`: clicking `Subscribe` does nothing; `required` is never validated.
- PRICE.R10: Responsive switch: tab bar `hidden sm:block`, select `sm:hidden` (116, 154). Port (Ruling Q23): superseded, one base price and add-ons priced separately (`src/domain/pricing.ts`).

### Storage
None.

### Fakes or fallbacks in today's code
- `/api/placeholder/800/450` image (723-728): a placeholder URL that does not exist in this app (a broken image, or the SPA fallback).
- The section comment calls it `Mock License Access UI Section` (658).
- Footer links `href="#"`, dead newsletter form, hard-coded `2025`.
- The header comment says `QniConnectLicenses.js`; the file is `SiriusConnect365Licenses.js`.

---

## LOGIN Login page   (source: components/AuthPages.js:1-83; components/auth/SignInButton.js:1-81; App.js:199-211)

### Calls
| id | method | path | headers | token | body | credentials |
|---|---|---|---|---|---|---|
| LOGIN.C1 | MSAL `instance.loginPopup(loginRequest)` (SignInButton.js:28) | n/a | n/a | login scopes `User.Read, openid, profile, email` | n/a | n/a |
| LOGIN.C2 | MSAL `instance.loginRedirect({...loginRequest, redirectUri: window.location.origin})` (SignInButton.js:36-39) | n/a | n/a | login scopes | n/a | n/a |

No HTTP calls.

### Response fields read
None (MSAL results are ignored in `SignInButton`).

### States
- LOGIN.S1 default: header with logo, H2 `Sign in to QniConnect`, sub `Access your payslips, profile, and employee documents`, a white card holding the sign-in button, help text, footer (AuthPages.js:36-80).
- LOGIN.S2 redirecting: when `(isAuthenticated || accounts.length > 0) && window.location.pathname === '/login'`: full-screen spinner with text `Redirecting to dashboard...` (27-34).
- LOGIN.S3 button loading: disabled, spinner plus `Signing in...` (SignInButton.js:54-61).
- LOGIN.S4 button error: centred red text `Login failed. Please try again.` (SignInButton.js:42, 72-76).
- LOGIN.S5 button default: Windows-style icon plus `Sign in with Microsoft 365` (SignInButton.js:63-69).

### Static content (exact)
- Header logo `assets/QniConnect_Logo_Dark.png`, `alt="QniConnect"`, 42px (42).
- `Need help? Contact` followed by a link whose text is `support@qnipay.com` and whose `href` is `https://qnipay.com/legal/` (62-65). Text and target differ (it is not a mailto).
- Footer `© {current year} QniConnect. All rights reserved.` (75).

### Rules and edge cases
- LOGIN.R1: Router level (App.js:201-209): `/login` redirects to `/portal` only when `(localAuthState || isAuthenticated) && accounts.length > 0`; otherwise it renders `AuthPages`. (`localAuthState` and `isAuthenticated` come from AppRoutes, App.js:102-103,138-147.)
- LOGIN.R2: Component level (AuthPages.js:17-23): effect with deps `[isAuthenticated, accounts, navigate, onLogin]`: if `(isAuthenticated || accounts.length > 0) && window.location.pathname === '/login'`, call `onLogin()` when provided and `navigate('/portal')`. localStorage is deliberately not consulted (comments at 14-16, 25-26: stale localStorage from other tabs must not redirect).
- LOGIN.R3: `onLogin` is `handleLogin` (App.js:119-123): `setLocalAuthState(true)` and `localStorage.setItem('isAuthenticated','true')`.
- LOGIN.R4: The `pageType="signin"` prop passed at App.js:205 is ignored by `AuthPages`.
- LOGIN.R5: `/forgot-password` redirects to `/login` (App.js:211).
- LOGIN.R6: `SignInButton` click (SignInButton.js:15-45): `isLoading=true`, `error=null`; if `window.innerWidth > 768` try `loginPopup(loginRequest)` and on success just return (no navigate, no storage clearing: AuthContext and the AuthPages effect handle routing); on popup failure log a warning and fall through; `loginRedirect` with `redirectUri: window.location.origin`; if that throws, `error='Login failed. Please try again.'` and `isLoading=false`. Loading stays true after a popup success.
- LOGIN.R7: The button does not clear any storage (comment at 22-23: other tabs treat removal of `isAuthenticated` as a logout signal).
- LOGIN.R8: The redirect check includes `window.location.pathname === '/login'`, so the component never auto-redirects when rendered on another path.
- LOGIN.R9: MSAL configuration that affects login (auth inventory owns it): authority `https://login.microsoftonline.com/common`, `cacheLocation: "sessionStorage"`, `storeAuthStateInCookie: true`, `navigateToLoginRequestUrl: true` (auth/authConfig.js:6-14). `index.js:27-38` sets `localStorage.isAuthenticated='true'` on `LOGIN_SUCCESS` and removes it on `LOGOUT_SUCCESS`.

### Storage
- localStorage written: `isAuthenticated='true'` via `handleLogin` (App.js:122).
- localStorage read: none in these components (explicitly avoided).
- sessionStorage: MSAL's own cache (not touched by this page).

### Fakes or fallbacks in today's code
- Help address text `support@qnipay.com` linked to a legal page.
- Fallback client id `'demoClientID'` when `REACT_APP_CLIENT_ID` is unset (authConfig.js:7).

---

## DIAG Diagnostics: logger, debug panel, CORS debugger, CORS error handler

### DIAG.LOG Logger   (source: utils/logger.js:1-14)
- DIAG.R1: `isDebug = process.env.REACT_APP_DEBUG === 'true'`, evaluated once at module load (line 5). Strict string equality: `'TRUE'`, `'1'` or unset all mean off.
- DIAG.R2: Default export is an object with four methods `log`, `warn`, `error`, `debug` that call `console.log|warn|error|debug(...args)` only when `isDebug`; otherwise they do nothing (no console output, including for errors) (7-12).
- DIAG.R3: Both env files set `REACT_APP_DEBUG=false` (`.env.development`, `.env.production`), so by default no logger output appears in any build. Setting it to `true` turns all output on.
- DIAG.R4: Logger output is never shown in the UI. Every `logger.*` call in the public files is debug-only; the user-visible strings are listed in each section.
- DIAG.R5: `msalConfig.system.loggerOptions.loggerCallback` forwards non-PII MSAL messages to `logger.log` (authConfig.js:14-24), so they are gated too.
- Note: `EnvironmentSelector.logDebugInfo` also gates on `NODE_ENV === 'development'` (EnvironmentSelector.js:25-28); out of scope.

### DIAG.DBG Debug panel   (source: components/common/DebugPanel.js:1-52; App.js:251-252)
- DIAG.R10: Mounted only when `process.env.NODE_ENV === 'development'` (App.js:252), inside the router as a sibling of `<Routes>`.
- DIAG.R11: The component first calls `useMsal()`, `useIsAuthenticated()` and `useAuth()` (DebugPanel.js:7-9; it must sit under the MSAL and Auth providers), then returns `null` when `NODE_ENV !== 'development'` (12-14).
- DIAG.R12: In development it reaches the end of the function with no `return` (the JSX at 16-49 is commented out), so it renders **nothing** (returns `undefined`). The user sees nothing in any environment today.
- DIAG.R13: The commented-out design (record only, not behaviour): a fixed bottom-right black overlay `Auth Debug` showing `Path`, `MSAL Auth: Yes|No`, `MSAL Accounts: <n>`, `LocalStorage Auth: Yes|No`, `User: <name> (<email>)|None`, `Environment: <name>|None`, with buttons `Force Auth` (set `isAuthenticated='true'`, go to `/environment-select`) and `Clear Auth` (remove `isAuthenticated` and `activeEnvironment`, go to `/`). The port must not ship these as live.
- No calls; no live storage access.

### DIAG.CORS CORS debugger   (source: components/common/CorsDebugger.js:1-166)
**Mount status:** never imported or rendered anywhere (grep `CorsDebugger` finds only its own file). Unreachable today; if kept it is a manual tool shown only where a parent mounts it.

#### Calls
| id | method | path | headers sent (name <- source) | token | body | credentials |
|---|---|---|---|---|---|---|
| DIAG.C1 | GET | `${apiConfig.baseUrl}/cors-test` (line 23; `apiConfig.baseUrl = REACT_APP_API_BASE_URL \|\| "https://demo-backend-demo.uksouth-01.azurewebsites.net/api"`, authConfig.js:45) | `Content-Type` <- literal `application/json` (25) | none | none | `include` (28) |
| DIAG.C2 | OPTIONS (built as `new Request(url, {...})`, then `fetch(request)`, 55-67) | `${apiConfig.baseUrl}/cors-test` | `Content-Type` <- `application/json`; `Authorization` <- literal `Bearer test-token`; `X-Test-Header` <- literal `test-value` (57-61) | none (a fake literal token is sent, not a real one) | none | `include`, `mode: 'cors'` (62-63) |

#### Response fields read
| call id | field path | how it is used | guarded? |
|---|---|---|---|
| DIAG.C1 | `response.ok`, `response.status` | non-ok throws `Error('HTTP error! Status: ' + status)` (31-33) | n/a |
| DIAG.C1 | body JSON | whole object shown in the results box (35-37) | no (a parse failure goes to the catch) |
| DIAG.C2 | `response.status === 204` | success branch (70) | n/a |
| DIAG.C2 | `status`, `statusText`, `type`, all response headers | shown in the results box on 204; headers collapsed to an object via `[...response.headers].reduce` (72-80) | n/a |
| DIAG.C2 | non-204: `response.json()` | shown as details; if parsing fails, details = `{ status, statusText, type }` (84-92) | yes (try/catch) |

#### States
- DIAG.S1 initial: status badge `Not tested`; the results box shows the environment block (DIAG.R21).
- DIAG.S2 testing: status `Testing...` (C1) or `Testing OPTIONS preflight...` (C2); both buttons disabled and both labelled `Testing...` (loading is shared) (17-18, 50, 143, 151).
- DIAG.S3 C1 success: status `Success` (green badge), details = response JSON (36-37).
- DIAG.S4 C1 failure: status `Failed` (red badge), red box `Error:` + `err.message || 'Unknown error'` (40-41, 130-134).
- DIAG.S5 C2 204: status `OPTIONS preflight successful` (blue badge), details with `status`, `statusText`, `type`, `headers`.
- DIAG.S6 C2 other status: status `OPTIONS returned status: <status>` (blue) plus details (94).
- DIAG.S7 C2 failure: status `OPTIONS Failed` (blue, because only `'Failed'` is red), error box as in S4 (98-99).
- Badge colours (123-127): `Success` green, `Failed` red, everything else blue.

#### Rules
- DIAG.R20: Heading `CORS Debugger`; status line `Status:` plus badge; error box prefix `Error:`; buttons `Test CORS Connection` (blue) and `Test OPTIONS Preflight` (purple); results heading `CORS Test Results:` with `JSON.stringify(corsDetails, null, 2)` in a `<pre>` (116-162).
- DIAG.R21: On mount, details are set to `{ environment: { NODE_ENV: process.env.NODE_ENV, REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL || apiConfig.baseUrl, origin: window.location.origin } }` (106-114).
- DIAG.R22: Each test sets `loading=true` and clears `error` at the start and sets `loading=false` in `finally`. On failure `corsDetails` is **not** cleared (the previous details stay visible) (16-20, 38-43, 98-102).
- DIAG.R23: Failures are logged through `logger.error('CORS test failed:', err)` and `logger.error('OPTIONS preflight test failed:', err)` (debug-only).
- DIAG.R24: The tool needs a backend endpoint `GET|OPTIONS /cors-test` under the API base.

Storage: none.

### DIAG.HAND CORS error handler   (source: components/common/CorsErrorHandler.js:1-168)
**Mount status:** never imported or rendered anywhere (grep `CorsErrorHandler` finds only its own file). Unreachable today.

#### Calls
It makes no calls of its own. While mounted it **replaces `window.fetch` globally** (lines 52-55), wrapping every fetch in the app (including REG.C1, C2, C3 and DIAG.C1), and restores the original on unmount (98-100).

#### States
- DIAG.S10 no CORS error: renders `null` (104).
- DIAG.S11 error detected: a fixed top red banner `CORS Error Detected:` + `<message split on ':', first part>` + (` (Click to collapse)` when open, ` (Click to expand details)` when closed) (110-114). The panel starts **open** on detection (89).
- DIAG.S12 panel open: white panel with `CORS Error Details` and a `Close` button (collapses, does not dismiss), sections `Error Information` (`Message:`, `URL:`, `Time:`, `Request Method:`), `What Happened?`, `Recommended Actions:`, `Diagnostic Information:` (116-164).

Exact texts: `What Happened?` body: `A CORS (Cross-Origin Resource Sharing) error occurred, preventing the application from accessing the backend API. This typically happens due to server configuration issues, where the API server isn't properly configured to accept requests from this domain ({window.location.origin}).` Recommended Actions, four bullets: `Verify the backend API is running and accessible`; `Ensure the API server has CORS configured to allow this origin`; `Check if the ALLOWED_ORIGINS environment variable on the backend includes {window.location.origin}`; `Try accessing the CORS test endpoint directly:` followed by a link (`target="_blank" rel="noopener noreferrer"`) to `${apiConfig.baseUrl}/cors-test` whose text is that URL (147-155).

#### Rules
- DIAG.R30: The override calls the original `fetch` with the same `this` and arguments and returns the response unchanged; on a thrown error it inspects it, then **re-throws the same error** (55-93).
- DIAG.R31: An error counts as CORS only if `error instanceof TypeError` and `error.message` includes (case-sensitive) `CORS`, `cross-origin` or `network` (61-64). Typical browser messages (`Failed to fetch`, `NetworkError when attempting to fetch resource.`, `Load failed`) do not contain these exact substrings, so the handler rarely triggers (see report, ambiguities).
- DIAG.R32: Captured info (75-84): `{ message, url, timestamp: new Date().toISOString(), requestInfo: { method: args[0]?.method || (args[1]?.method || 'GET'), headers: args[0]?.headers || args[1]?.headers || {}, mode: args[0]?.mode || args[1]?.mode || 'cors' } }`. `url` is `args[0].url` if `args[0] instanceof Request`, the string if it is a string, else `''` (a `URL` object gives `''`).
- DIAG.R33: On detection: `logger.error('CORS Error Detected:', info)`, `setCorsError(info)`, `gatherDiagnosticInfo()`, `setIsPanelOpen(true)`. A later detection overwrites the earlier one. There is no dismiss; `Close` only collapses; clicking the banner toggles open and closed (86-90, 112, 120-125).
- DIAG.R34: Diagnostic snapshot (`gatherDiagnosticInfo`, 15-48), shown as pretty JSON:
  - `browserInfo`: `userAgent`, `language`, `platform`, `vendor` (from `navigator`).
  - `apiConfig`: `baseUrl`, `validateTokenEndpoint` (`/auth/validate-token`), `userEndpoint` (`/user`), `bcEndpoint` (`/bc`).
  - `localStorage`: `isAuthenticated`, `registrationId`, `activeEnvironment` (raw values or `null`).
  - `location`: `origin`, `pathname`, `protocol`, `host`.
  - `environmentVars`: `NODE_ENV`, `REACT_APP_API_BASE_URL` (raw, omitted by JSON when undefined), `REACT_APP_CLIENT_ID` as `Set (not shown)` or `Not Set`.
- DIAG.R35: The effect depends on `gatherDiagnosticInfo` (stable via `useCallback([])`), so it installs once on mount.

#### Storage
- localStorage read (never written): `isAuthenticated`, `registrationId`, `activeEnvironment` (29-33).

---

## Cross-references (owned by other inventories, listed so no call is lost)
- `client-tenant/companies`: `components/auth/EnvironmentSelector.js:181` (`${apiBaseUrl}/bc/client-tenant/companies`) and `businessCentralService.getClientTenantCompanies` used by `EmployeePortal.js:76`.
- Callers of `TenantVerificationService`: `components/auth/EnvironmentSelector.js:6,32-34,55,79,204`.
- `manual_redirect` writer: `components/auth/AuthErrorPage.js:18`.
- `isAuthenticated` readers and writers: `App.js:122,129,141,161`, `index.js:32,36`.
