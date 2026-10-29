# Behaviour inventory: employee portal

Source repo: `C:\dev\qniconnect front end\QniConnect-FrontEnd\src` (QC). Read-only. Covers the dashboard (`HOME`), documents (`DOCS`), profile (`PROF`), notification bell (`BELL`) and the portal frame (`FRAME`).

Path abbreviations used in citations (all under `src/`):

| abbr | file |
|---|---|
| EP | `components/EmployeePortal.js` |
| ED | `components/portal/EmployeeDocuments.js` |
| EPR | `components/portal/EmployeeProfile.js` |
| UPL | `components/UserPortalLayout.js` |
| PDF | `components/common/PdfPreviewModal.js` |
| FYM | `components/common/FiscalYearSelectionModal.js` |
| BCS | `services/businessCentralService.js` |
| API | `services/apiService.js` |
| AC | `auth/AuthContext.js` |

Token vocabulary: `bc` = `getAccessToken(businessCentralScopes.read)` = `["https://api.businesscentral.dynamics.com/.default"]` (`auth/authConfig.js:36-41`; `read`, `readWrite` and `api` are all the same value). `none` = no `Authorization`, cookies only.

---

## SHARED Transport rules for every `fetchThroughBackend` call   (source: BCS:60-155)

All portal BC calls (HOME.C1 to C5 except C5, DOCS.C1 to C4, BELL.C1 and C2) go through `fetchThroughBackend`. These rules apply to each. Test IDs `SHARED.R1` and up.

1. **SHARED.R1** URL = `${backendApiUrl}${endpoint}` where `backendApiUrl = process.env.REACT_APP_API_BASE_URL || 'https://demobackend-backend-demo.uksouth-01.azurewebsites.net/api'` (BCS:10, 118). Note `ApiService` has a different fallback host (see SHARED.R12).
2. **SHARED.R2** Default headers on every call, including GET: `Content-Type: application/json`, `Accept: application/json` (BCS:63-66).
3. **SHARED.R3** Token: the call sends `Authorization: Bearer <token>` only when `this.getAccessToken` exists AND `options.scopes` is passed (BCS:69-75). All portal calls pass `scopes` (`bc`). If `getAccessToken` throws, or returns a falsy token, `'Not Readable'` or `'mock-token-for-development'`, the call throws `Error('Authentication failed. Please log in again.')` (BCS:72-78) and no request is sent. (`AC:311-` `getAccessToken` returns `null` after calling `acquireTokenRedirect` when there is no account, so this is the "no account" outcome.)
4. **SHARED.R4** If `getAccessToken` is missing or `scopes` is not passed: throws `Error('Authentication service not available. Please log in again.')` (BCS:80-82). The inner `try/catch` at BCS:70-79 does not wrap this throw. It reaches the outer catch (SHARED.R9). No portal call hits this branch.
5. **SHARED.R5** Per-call `options.headers` are merged over the defaults (BCS:85-89). Then `credentials: 'include'` is forced (BCS:97). The whole `options` object is spread into the `fetch` init, so the non-standard `scopes` key is passed to `fetch` and ignored.
6. **SHARED.R6** `X-BC-Environment: <this.activeEnvironment.id>` is added only when the service INSTANCE has `activeEnvironment` set (BCS:100-105). `activeEnvironment` is set only by `updateEnvironmentState` (BCS:22). No portal component calls it. Every portal component builds `new BusinessCentralService(getAccessToken)` (EP:39-42, ED:45-48, EPR:57-60, UPL:41-44), so portal calls NEVER send `X-BC-Environment`. The port must not send it either, unless a design decision changes this.
7. **SHARED.R7** `X-Registration-ID` rewrite: if `localStorage.registrationId` is truthy and the outgoing `X-Registration-ID` header is falsy (absent or `''`), the header is set to `localStorage.registrationId` (BCS:107-111). Effect: calls that pass no headers (HOME.C1, BELL.C1, BELL.C2) still send `X-Registration-ID` when a registrationId is stored. Calls that pass `''` when none is stored send an empty header.
8. **SHARED.R8** Response header `X-Client-Company-ID`, if present and non-empty on ANY response (even a non-ok one), is written to `localStorage.clientCompanyId` (BCS:122-129).
9. **SHARED.R9** Non-ok response: reads `response.json()` (falls back to `{}` if the body is not JSON). `message = errorData.message || errorData.error || 'API Error: ' + status`. Throws a plain object `{ message, response: { status, data: errorData } }` (BCS:132-141). `message` can therefore be a non-string (an object) when the backend sends `error` as an object. See ambiguity A1.
10. **SHARED.R10** Ok response: returns `response.json()`. A 2xx with a non-JSON body rejects and is treated as an error (BCS:144).
11. **SHARED.R11** Development mode only (`process.env.NODE_ENV === 'development'`): ANY thrown error, including SHARED.R3 and R4, is swallowed and the call returns `getMockData(endpoint)` (BCS:148-151). See the "Fakes" section. In production the error is re-thrown.
12. **SHARED.R12** Session init (HOME.C5) uses `ApiService`, not this function: base `process.env.REACT_APP_API_BASE_URL || 'https://demo-backend-demo.uksouth-01.azurewebsites.net/api'` (API:7). The fallback host differs from SHARED.R1: `demo-backend-demo` vs `demobackend-backend-demo`. Same env var, different hard-coded fallback. Reproduce only if tests rely on the fallback (see A2).
13. **SHARED.R13** `logger.*` is a no-op unless `REACT_APP_DEBUG === 'true'` (`utils/logger.js`). No log line is user-visible.

### SHARED.formatBCErrorMessage   (source: BCS:560-595)

Used by P45, P60, P11D and fiscal years only (not by payslips or notifications). Input is the thrown error (usually the SHARED.R9 object, or an `Error`). Evaluated in order, first match wins:

| id | condition | result |
|---|---|---|
| SHARED.F1 (default) | initial value | `'An error occurred while processing your request'` |
| SHARED.F2 | `error.response?.data?.error?.message` truthy | `message.split('CorrelationId:')[0].trim()`. Everything from the first `CorrelationId:` on is dropped; the part after it is only logged. |
| SHARED.F3 | else `error.response?.data?.error` truthy | `error.response.data.error.code \|\| error.response.data.error.toString()` (a string `error` gives that string; an object without `code` gives `'[object Object]'`) |
| SHARED.F4 | else `error.response?.data?.message` truthy | that message |
| SHARED.F5 | else `error.message` truthy | `error.message` (this covers the `Error` throws below) |
| SHARED.F6 | an exception inside the formatter | returns SHARED.F1 |

Note SHARED.R9 puts `errorData.message || errorData.error` into `error.message`, but F2 to F4 read `response.data` first, so they win over `error.message`.

---

## HOME Dashboard   (source: EP:15-491, EP:686-698; BCS:231-431, 437-500, 507-553, 1579-1636)

Route: `/portal/dashboard` (FRAME.R1). Component `Dashboard` (EP:27).

### Calls

| id | method | path (with query) | headers sent (name ← where the value comes from) | token | body | credentials |
|---|---|---|---|---|---|---|
| HOME.C1 (`getClientTenantCompanies`, BCS:1594) | POST | `/bc/client-tenant/companies` | Content-Type, Accept (SHARED.R2); Authorization; `X-Registration-ID` ← `localStorage.registrationId` (only if truthy, SHARED.R7). No `headers` option. | bc | `{"environmentName": activeEnvironment.name, "registrationId": localStorage.registrationId}` | include |
| HOME.C2 (`getEmployeeProfile`, BCS:338) | GET | `/bc/employees/current` plus `?` and the params below, in this order, each only if truthy: `registrationId` ← `localStorage.registrationId`; `clientEnvironment` ← `JSON.parse(localStorage.activeEnvironment).name`; `clientCompanyId` ← `localStorage.clientCompanyId` (possibly just re-derived, see HOME.R6); `email` ← `JSON.parse(localStorage.currentUser).email.toLowerCase()`. Built with `URLSearchParams` (standard percent-encoding, spaces as `+`). | default headers; Authorization; `X-Registration-ID` ← `localStorage.registrationId \|\| ''`; `X-Client-Environment` ← activeEnvironment.name from localStorage `\|\| ''`; `X-Client-Company-ID` ← clientCompanyId `\|\| ''`; `X-User-Email` ← `userEmail.toLowerCase() \|\| ''` (BCS:345) | bc | none | include |
| HOME.C3 (`getPayslips`, BCS:487) | GET | `/bc/payslips` (no query) | default headers; Authorization; `X-Registration-ID` ← localStorage.registrationId `\|\| ''`; `X-Client-Environment` ← localStorage activeEnvironment.name `\|\| ''`; `X-Client-Company-ID` ← localStorage.clientCompanyId `\|\| ''`; `X-Employee-No` ← localStorage.employeeNo `\|\| ''`; `X-User-Email` ← currentUser.email lower-cased, `''` if none; `X-LocalStorage-EmployeeNo` ← localStorage.employeeNo `\|\| ''` (same value as `X-Employee-No`, read twice); `X-Session-Request-Time` ← `Date.now().toString()` | bc | none | include |
| HOME.C4 (`getPayslipPdf`, BCS:529) | POST | `/bc/payslips/{systemId}/pdf` (`systemId` not URL-encoded) | default headers; Authorization; `X-Registration-ID`, `X-Client-Environment`, `X-Client-Company-ID` as in HOME.C3 (each `\|\| ''`) | bc | `{"systemId": "<systemId>"}` | include |
| HOME.C5 (`ApiService.initSession`, BCS:371-382, API:105-107) | POST | `{ApiService base}/session/init` | `Content-Type: application/json` only (API:19-22) | none | `{"registrationId": localStorage.registrationId \|\| '', "userEmail": currentUser.email.toLowerCase() \|\| '', "employeeNo": response.employeeNo}` | include |

HOME.C5 is a side effect of HOME.C2. It fires only when the profile response has `id` AND `employeeNo` (BCS:351-356). It is awaited. Any failure is caught, logged and ignored (BCS:387-390). On a non-ok response `ApiService` also dispatches `window` event `authRequired` when status is 401 (API:34-36). The BC calls never do this.

### Response fields read

| call id | field path | how it is used | guarded? |
|---|---|---|---|
| HOME.C1 | `response.value \|\| response \|\| []` (BCS:1604) | companies array; `.length` read for log | yes (falls to `response`, then `[]`) |
| HOME.C1 | each company: `id`, `companyId`, `name`, `companyName`, `displayName` | `id` stored as `clientCompanyId`; `name \|\| displayName` stored as `clientCompanyName`; `name`/`displayName` compared with `activeEnvironment.companyName`; the others are only logged | `(company.name \|\| '')`, `(company.displayName \|\| '')` guarded for the compare; `matchingCompany.id` unguarded |
| HOME.C2 | `id` | if truthy: written to `localStorage.employeeId` and the whole response to `localStorage.employeeData`; and gates HOME.C5 | yes (`response && response.id`) |
| HOME.C2 | `employeeNo` | `localStorage.employeeNo`; Dashboard `employeeId` (`\|\| 'N/A'`); gates `employeeNoReady` event | yes |
| HOME.C2 | `firstName`, `middleName`, `lastName` | joined with a space after `.filter(Boolean)`; `fullName \|\| user.name` | yes |
| HOME.C2 | `jobTitle` | position, `\|\| 'Employee'` | yes |
| HOME.C2 | `email` | `\|\| user.email` | yes |
| HOME.C2 | `employmentDate` | join date, `\|\| 'N/A'` | yes |
| HOME.C2 | `manager`, `address`, `address2`, `birthDate`, `gender` | `\|\| 'N/A'`. Of these only `address` and `address2` are rendered. | yes |
| HOME.C2 | `addressLine3`, `addressLine4`, `city`, `postCode` | `\|\| ''` | yes |
| HOME.C2 | `frequency` | pay frequency, `\|\| 'N/A'` | yes |
| HOME.C2 | `hmrcTaxCode` | tax code, `\|\| 'N/A'` | yes |
| HOME.C2 | `nationalInsuranceNumber` | `\|\| 'N/A'` | yes |
| HOME.C2 | `niClassCode`, `nationalInsuranceCode` | `niClassCode + ' ' + nationalInsuranceCode \|\| 'N/A'` (EP:189). The `\|\| 'N/A'` never fires because the concatenation is always a non-empty string. See HOME.R17. | NO (undefined renders as the text `undefined`) |
| HOME.C2 | `weeklyHoursWorked` | `\|\| 'N/A'`; stored in state, not rendered on the dashboard | yes |
| HOME.C2 | `mobilePhoneNo` | phone, `\|\| 'N/A'` | yes |
| HOME.C2 | `response` itself null | `employeeProfile.employeeNo` at EP:159 is unguarded; null/undefined response throws into the catch (HOME.R9) | NO |
| HOME.C3 | whole response | `Array.isArray(response) ? response : []` (BCS:494) | yes |
| HOME.C3 | per payslip `id` | React key | no |
| HOME.C3 | per payslip `period` | period text; also `.replace(/\s+/g,'-')` for the download filename | NO (unguarded in the table; `.replace` throws if missing, caught silently) |
| HOME.C3 | per payslip `payDate` | `formatDate(payDate)` | yes (`formatDate('')` for falsy) |
| HOME.C3 | per payslip `grossPay`, `taxPaid`, `netPay` (table rows) | `(x \|\| 0).toLocaleString('en-GB', {min 2, max 2 fraction digits})` | yes |
| HOME.C3 | `payslips[0].netPay` (Latest card, EP:349) | `payslips[0].netPay.toLocaleString(...)` | NO. Throws a render error if `netPay` is null or undefined. See HOME.R14. |
| HOME.C3 | per payslip `systemId` | required to act on PDF buttons (guard) | yes (checked) |
| HOME.C4 | `value` | base64 PDF string. `response && response.value` truthy, else `Error('Invalid response format from payslip PDF API')` | yes |

### States

- **Loading**: spinner (`h-12 w-12` ring, `animate-spin`, `border-brand-500`), centred in a `h-64` box, no text (EP:275-281). `isLoading` initial value is `true`. It stays `true` forever while `user` or `activeEnvironment` is missing, because the effect returns early without clearing it (EP:146).
- **Success**: the full page (HOME.R10 to R16).
- **Empty payslips**: Latest card shows `No payslips found`; table shows 6 placeholder rows of `—` (HOME.R12, R13).
- **Error, profile fetch fails**: nothing is shown to the user. The catch only logs (EP:203-205). `userData` stays `null`, payslips are never fetched, spinner clears, and the page renders with blanks (HOME.R9).
- **Error, payslip fetch fails**: indistinguishable from empty; `getPayslips` returns `[]` (BCS:495-499).
- **Error, PDF fetch fails**: nothing shown; silent (HOME.R20).
- **Partial**: companies fetch failure is swallowed (HOME.R5), the page proceeds.

### Rules and edge cases

- **HOME.R1** The dashboard effect runs on `[user, bcService, activeEnvironment]` (EP:212). `bcService` is memoised on `[activeEnvironment]` only (EP:39-42). So each change of `user` (AuthContext sets the basic user, then the enhanced user, `AC:136, 178-191`) or of `activeEnvironment` re-runs the whole sequence: companies, profile, payslips. A double fetch at login is current behaviour.
- **HOME.R2** Sequence is strictly serial: `fetchClientCompanies()` then `getEmployeeProfile()` then `getPayslips()`. Payslips MUST come after the profile because HOME.C3 reads `localStorage.employeeNo` written by the profile step (EP:155-201).
- **HOME.R3** Guard: `if (!user || !activeEnvironment) return;` (EP:146). No call is made without both.
- **HOME.R4** HOME.C1 is skipped when `activeEnvironment.company_Id` is truthy and not `'00000000-0000-0000-0000-000000000000'`. In that case it writes `localStorage.clientCompanyId = company_Id` and, if `activeEnvironment.companyName` is truthy, `localStorage.clientCompanyName = companyName`, then returns (EP:51-60). Without `activeEnvironment` it logs and returns (EP:46-49). Without `localStorage.registrationId` it logs and returns without a call (EP:67-70).
- **HOME.R5** HOME.C1 errors are caught and logged only (EP:138-140). In production `getClientTenantCompanies` rethrows (BCS:1634) and the dashboard catch swallows it, then the flow continues to the profile.
- **HOME.R6** After HOME.C1 succeeds with an array: `localStorage.clientCompanies = JSON.stringify(companies)`. Then, if `activeEnvironment.companyName` is truthy, it finds the company whose `name` or `displayName` equals it, with trim and lower-case on both sides and an EXACT match (no partial match, no fallback). On a match: `clientCompanyId = id` and `clientCompanyName = name || displayName`. With no match: both keys are REMOVED. If `companyName` is falsy: both keys are REMOVED (EP:94-131). If the result is not an array: only logged, nothing stored (EP:135-137). Then `setClientCompanies(companies)` (state never read).
- **HOME.R7** `getEmployeeProfile` clientCompanyId recovery (BCS:243-286): if `localStorage.clientCompanyId` is empty AND `localStorage.activeEnvironment.companyName` is set AND `localStorage.clientCompanies` parses to a non-empty array, do the same exact-match search. On a match it stores `clientCompanyId` and `clientCompanyName`; on no match it removes both keys and uses null. A JSON parse failure of `clientCompanies` is logged and ignored.
- **HOME.R8** `getEmployeeProfile` reads `JSON.parse(localStorage.activeEnvironment || '{}')` and `JSON.parse(localStorage.currentUser || '{}')`. Missing values are logged only; the query params and headers listed are omitted or set to `''` (HOME.C2). EXCEPTION: `X-User-Email: userEmail.toLowerCase()` (BCS:345) throws `TypeError` when `currentUser.email` is missing, BEFORE any request is made. The outer catch (BCS:395) returns the dev mock in development, else rethrows to the dashboard catch (HOME.R9).
- **HOME.R9** Profile failure (production): `getEmployeeProfile` rethrows; the dashboard catch logs; `finally` sets `isLoading=false`. Result: `userData === null`, no payslip fetch. The page renders: heading `Welcome back` (no name), empty name/position, `Employee ID: `, `Joined: `, ` Pay`, `Tax Code: `, `NI Number: `, `NI Category: `, blank email/phone/address, `No payslips found`, and 6 `—` rows. The `userData?.` accesses make this safe. No error text is shown.
- **HOME.R10** After a successful profile, localStorage side effects in order: `employeeNo` set to `''` (BCS:350, always, even when the response has no id); then if `response.id`: `employeeId`, `employeeData` (full JSON); then if `response.employeeNo`: `employeeNo`, then HOME.C5 (HOME.C5 failure ignored). Then in the dashboard: `employeeNo` is set to `''` again, then to `employeeProfile.employeeNo` if truthy, and `window.dispatchEvent(new CustomEvent('employeeNoReady'))` ONLY when truthy (EP:158-166). The event is what makes the notification bell load (BELL.R1). If `employeeNo` is falsy, only a log warning; no event, so no notifications.
- **HOME.R11** userData mapping (EP:169-197): `name = [firstName, middleName, lastName].filter(Boolean).join(' ') || user.name`; `position = jobTitle || 'Employee'`; `department = activeEnvironment.department || ''` (from the ENVIRONMENT, not the employee profile); `employeeId = employeeNo || 'N/A'`; `email = email || user.email`; `joinDate = employmentDate || 'N/A'`; `payFrequency = frequency || 'N/A'`; `taxCode = hmrcTaxCode || 'N/A'`; `niNumber = nationalInsuranceNumber || 'N/A'`; `phone = mobilePhoneNo || 'N/A'`; `address = address || 'N/A'`; `address2 = address2 || 'N/A'`; `addressLine3/4`, `city`, `postCode` default `''`.
- **HOME.R12** Welcome heading: `Welcome back` plus `, <first word of name>` when `userData.name` is truthy: `userData.name.split(' ')[0]` (EP:295). Subtitle `Here's what's happening with your payroll.` (EP:296).
- **HOME.R13** Summary card: avatar circle shows initials = the FIRST CHARACTER OF EVERY space-separated word of the name, joined, no limit and no upper-casing (EP:311), so `'Jane Anne Smith'` gives `JAS`. Name heading; `{position} • {department}`; three tags: `Employee ID: {employeeId}`, `Joined: {formatDate(joinDate)}`, `{payFrequency} Pay` (so `N/A Pay` when missing).
- **HOME.R14** Latest Payslip card (EP:347-355): uses `payslips[0]` with NO client-side sorting, so the port relies on the API order (assumed newest first). Shows `£` plus `netPay.toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits:2})`, `Period: {period}`, `Paid on: {formatDate(payDate)}`. `netPay` is unguarded here (a missing `netPay` throws during render; nothing in these files catches it). Empty: `No payslips found`. A payslip whose `netPay` is `0` renders `£0.00` normally.
- **HOME.R15** Tax Information card: `Tax Code: {taxCode}`, `NI Number: {niNumber}`, `NI Category: {niCategory}`. NI numbers and tax code are shown in the clear here (no masking, unlike PROF.R10).
- **HOME.R16** Contact Information card: Email, Phone, Address. Address text: `address`; then `, {address2}` only when `address2` is truthy and `!== 'N/A'`; then on new lines (`<br/>`) `addressLine3`, `addressLine4`, `[city, postCode].filter(Boolean).join(', ')` if either is set, and `[county, country]...` which can never show because `county` and `country` are never put into `userData` (EP:400-402 is dead). `address` itself shows `N/A` when missing.
- **HOME.R17** NI Category bug: when either of `niClassCode` / `nationalInsuranceCode` is missing the text includes the literal word `undefined` (e.g. `undefined undefined`, `A undefined`), because the `|| 'N/A'` guard sits on a string that is always truthy (EP:189). Contrast PROF.R9, which guards each part. The port must decide: reproduce, or fix and record it as a deliberate change.
- **HOME.R18** Recent payslips table (EP:419-486): header columns `Period`, `Pay Date`, `Gross Pay`, `Tax`, `Net Pay`, `Actions`. Always exactly 6 rows: the first 6 payslips in API order, padded with placeholder rows of `—` in every cell. Payslips beyond the 6th are NOT shown (no "view all" link). The `RECENT PAYSLIPS` tag is the heading. Money cells: `£` plus `(value || 0)` formatted en-GB with 2 decimals; `Tax` reads `taxPaid` only (the documents page also reads `taxAmount`, DOCS.R16). Row key is `payslip.id`.
- **HOME.R19** `formatDate` (EP:15-24): `''` for falsy; `new Date(s)`; if invalid returns the original string unchanged (this is how `'N/A'` stays `N/A`); else `date.toLocaleDateString('en-GB')`, i.e. `dd/mm/yyyy` in the browser's local timezone. A date-only string such as `2022-01-15` parses as UTC midnight, so it can show the previous day in a timezone west of UTC. The same function is copied in ED:13-22.
- **HOME.R20** Payslip PDF buttons (EP:224-273). Eye = `view`, title attr `View payslip`; Download = `download`, title attr `Download payslip`. A shared `isLoadingPdf` disables BOTH buttons of EVERY row while any PDF request is in flight (opacity 50). Guard: no `payslip.systemId` gives a silent return (log only). Failure of `getPayslipPdf` in production throws and is caught silently (log only, no message). If the returned data is falsy: silent return. No user-visible error text exists on the dashboard for any PDF failure.
- **HOME.R21** `view`: sets `currentPdf` to the base64 string, title `Payslip - {period}`, opens `PdfPreviewModal` (PDF section).
- **HOME.R22** `download`: `atob(base64)`; builds a `Uint8Array`; `Blob` of type `application/pdf`; `URL.createObjectURL`; creates a hidden `<a download>` with filename `Payslip-{period with each run of whitespace replaced by '-'}.pdf`, appends, clicks, removes; `URL.revokeObjectURL` after `setTimeout` 30000 ms. An invalid base64 string makes `atob` throw, caught silently. Not guarded: the `finally` always sets `isLoadingPdf=false`.
- **HOME.R23** Unrouted dead code in EP (not reachable from any route, the port must not build screens for it): components `Payslips` (EP:494), `Benefits` (501), `Support` (508), `Settings` (515), and `PayslipsPage` (523-684, a full "All Payslips" table with its own `getPayslips`/`getPayslipPdf` calls). Also `handleManualClientCompanyFetch` (EP:215) and the `clientCompanies` state are unused. The `onLogout` prop passed by `App.js:233` is never read.

### Storage

| key | read | written / removed |
|---|---|---|
| `registrationId` | HOME.C1 (EP:65), HOME.C2, C3, C4, C5, SHARED.R7 | not by these screens (auth sets it) |
| `clientCompanyId` | HOME.C2, C3, C4 | written EP:55, 118, BCS:270, SHARED.R8; removed EP:123, 129, BCS:275 |
| `clientCompanyName` | not read here | written EP:57, 119, BCS:271; removed EP:124, 130, BCS:276 |
| `clientCompanies` | BCS:248 | written EP:94 |
| `activeEnvironment` (JSON; `name`, `companyName`, `id`, `company_Id`) | BCS:236, 442, 516 | by AuthContext only; the portal reads it |
| `currentUser` (JSON; `email`) | BCS:240, 367, 446 | by AuthContext only |
| `employeeNo` | HOME.C3, BELL | written BCS:350, 357; EP:158, 161 |
| `employeeId`, `employeeData` | DOCS | written BCS:352-353 |

### Fakes or fallbacks in today's code

- **HOME.X1** Dev-only (`NODE_ENV === 'development'`) `getEmployeeProfile` mock (BCS:399-427) returned from the outer catch: `id "f1fe0e52-ec2e-f011-9a4a-002248415f33"`, `name "John Smith"`, `position "Senior Software Engineer"`, `department "Engineering"`, `employeeId "EMP001"`, `employeeNo "1001"`, `email "john.smith@example.com"`, `joinDate "2022-01-15"`, `manager "Jane Wilson"`, `address "123 Main Street"`, `address2 "Apartment 4B"`, `birthDate "1990-05-20"`, `gender "Male"`, `payFrequency "Monthly"`, `taxCode "1150L"`, `niNumber "QQ123456C"`, `niCategory "A"`, `hoursWorked "37.5"`. It writes `employeeId`, `employeeData`, `employeeNo` to localStorage. Note its field names (`name`, `joinDate`, `taxCode`, ...) are not the names the UI reads (`firstName`, `employmentDate`, `hmrcTaxCode`, ...), so even in dev the UI falls back to `user.name`, `'N/A'`, etc. Reachable only for errors raised outside `fetchThroughBackend` (such as the `X-User-Email` TypeError) because `fetchThroughBackend` itself swallows errors first (SHARED.R11).
- **HOME.X2** Dev-only `getMockData` (BCS:1643-1739): `/bc/employees/current` returns another mock (`_isMockData: true`, `name` like `Employee from <registrationId first 8 chars>`, `employeeId` like `EMP-<first 6>`). `/bc/client-tenant/companies` returns `{value:[CRONUS UK Ltd. (cmp-001), Demo Company (cmp-002)]}`. Any other endpoint returns `{success:true, message:'Mock data for <endpoint>'}`, which every portal parser rejects or treats as empty.
- **HOME.X3** Dev-only mock companies from `getClientTenantCompanies` catch (BCS:1613-1632), same two companies.
- **HOME.X4** Dev-only mock base64 PDF returned by `getPayslipPdf` on ANY error (BCS:545-549). It decodes to a PDF with the text `Mock Payslip PDF`. Because of SHARED.R11 plus this, in dev a failing PDF call opens a fake PDF instead of failing.
- **HOME.X5** Hard-coded `department` is NOT in the code (it comes from `activeEnvironment.department`). Hard-coded user-visible literals: `Welcome back`, `Here's what's happening with your payroll.`, `RECENT PAYSLIPS`, `Latest Payslip`, `Tax Information`, `Contact Information`, `No payslips found`.

---

## DOCS Documents   (source: ED:1-704; BCS:437-553, 597-780, 856-924; PDF; FYM)

Route: `/portal/documents`. Component `EmployeeDocuments`. Payslip list and payslip PDF use HOME.C3 and HOME.C4; the profile uses HOME.C2.

### Calls

| id | method | path (with query) | headers sent | token | body | credentials |
|---|---|---|---|---|---|---|
| DOCS.C0 | GET | `/bc/payslips` | identical to HOME.C3 | bc | none | include |
| DOCS.C0b | GET | `/bc/employees/current?...` | identical to HOME.C2 (a second, separate call; the profile is fetched on every documents load) | bc | none | include |
| DOCS.C0c | POST | `/bc/payslips/{systemId}/pdf` | identical to HOME.C4 | bc | `{"systemId":...}` | include |
| DOCS.C1 (`getFiscalYears`, BCS:752) | GET | `/bc/fiscalyears` (no query) | default headers; Authorization; `X-Registration-ID`, `X-Client-Environment`, `X-Client-Company-ID` as HOME.C4 (each `\|\| ''`) | bc | none | include |
| DOCS.C2 (`getP60Pdf`, BCS:698) | POST | `/bc/employees/{employeeId}/p60` (`employeeId` = the employee GUID, not URL-encoded) | same three `X-` headers as DOCS.C1 | bc | `{"employeeId": "<guid>"}` plus `"taxYear": "<fiscalYear string>"` ONLY when `taxYear` is truthy | include |
| DOCS.C3 (`getP11DPdf`, BCS:894) | POST | `/bc/employees/{employeeId}/p11d` | same three `X-` headers | bc | same shape as DOCS.C2 | include |
| DOCS.C4 (`getP45Pdf`, BCS:624) | POST | `/bc/employees/{employeeId}/p45` | same three `X-` headers | bc | `{"employeeId": "<guid>"}` | include |

DOCS.C0, C0b and C0c are the same wire calls as HOME.C3, C2 and C4 (IDs kept separate so the documents tests name their own). **DOCS.C4 exists in the service but NO screen calls it** (grep: `getP45Pdf` has no caller). The port needs it only if it keeps the service method; there is no UI path to P45.

### Response fields read

| call id | field path | how it is used | guarded? |
|---|---|---|---|
| DOCS.C0 | array, per item `id`, `period`, `payDate`, `expectedPaymentDate`, `grossPay`, `taxAmount`, `taxPaid`, `netPay`, `systemId`, `fiscalYear` | list rows, filter, PDF action | `payDate`/`expectedPaymentDate`: `expectedPaymentDate \|\| payDate` then `formatDate`; `grossPay`, `netPay`: `\|\| 0`; tax: `taxAmount ?? taxPaid ?? 0`; `fiscalYear`: optional (derived if absent); `period` and `id` unguarded; `systemId` checked before use |
| DOCS.C1 | whole response | must satisfy `Array.isArray`, else it throws `Error('Invalid response format from fiscal years API')` and the method returns the failure shape | yes |
| DOCS.C1 | each element: `fiscalYear` (string such as `2024/2025`), `active` (boolean), `id`, `startDate`, `endDate`, `allowP60Print` (boolean) | dropdown label/value, default pick, modal list, modal filter, P60/P11D `taxYear` | `option.active ? ' (Active)' : ''` is a truthiness test; `fiscalYear.active === false && allowP60Print === true` is STRICT in the modal (a missing flag excludes the year from the P60 list); `id` is the React key and the selection identity (undefined `id` would make every row look selected together); `startDate`/`endDate` rendered raw |
| DOCS.C2/C3 | `value` | base64 PDF; `response && response.value` truthy, else `Error('Invalid response format from P60 document API')` / `...P11D document API` | yes |
| DOCS.C0b | `validP11D` | `employeeProfile?.validP11D \|\| false` decides whether the P11D row exists | yes |
| DOCS.C0c | `value` | as HOME.C4 | yes |

Return shapes (service level): P45/P60/P11D give `{success:true, data:<base64>, error:null}` or `{success:false, data:null, error:<formatBCErrorMessage string>}` and never throw. `getFiscalYears` gives `{success:true, data:[...], error:null}` or `{success:false, data:[], error:<string>}` and never throws. `getPayslips` returns `[]` on error. `getPayslipPdf` returns the base64 string, or THROWS in production.

Error strings thrown inside these methods (end up as `error` via SHARED.F5 when the error is an `Error`): `Employee ID is required` (empty `employeeId`, raised before the call), `Invalid response format from P45 document API`, `Invalid response format from P60 document API`, `Invalid response format from P11D document API`, `Invalid response format from fiscal years API`, `Payslip systemId is required`, `Invalid response format from payslip PDF API`, `Authentication failed. Please log in again.`, `API Error: <status>`, or the backend `message`/`error` text.

### States

- **Loading**: `isLoading` starts `false` (ED:26), so the FIRST render shows the full page (header, tabs, empty-state card). The effect then sets it to `true`, which shows the same spinner as HOME (ED:548-554), then back to `false`. It stays `false` forever (the page keeps its empty state) while `user` or `activeEnvironment` is missing. Contrast HOME and PROF where the spinner stays.
- **Empty payslips (tab `payslips`)**: card with a file icon, `No Payslips Found`, `No payslips are available for the selected fiscal year. Try selecting a different year or contact your administrator.` (ED:388-400).
- **Empty tax docs (tab `tax`)**: `No Tax Documents Found`, `No tax documents are available for the selected year. Tax documents like P60s are typically issued annually at the end of the tax year, and P45s when you leave employment.` (ED:468-479). Shown when `taxDocuments` is `[]`: never loaded, or the profile call failed (DOCS.R6).
- **Error banner** (ED:589-620): yellow box titled `Document Not Available` with the `errorMessage` text and a dismiss button (`aria-label="Dismiss"`) that sets it to `null`. A single string state, shown above the tabs. It is cleared at the start of `handleDocumentView` (ED:230) but NOT at the start of `handleFiscalYearSelection`, on tab switch or on dropdown change. See DOCS.R12 to R15 for the strings.
- **Success**: payslips table, tax documents table, PDF modal, fiscal-year modal.
- **Info panel** (always shown at the bottom, ED:685-700): `Secure Access to Payroll Documents`, and the text `This portal provides controlled and secure access to your payslips, tax forms, and other payroll-related documents. Files are not stored within the portal itself but are securely retrieved in real time from Dynamics 365 Business Central. Access is restricted to authorized users, and all data transmission adheres to GDPR and data protection standards, including encryption in transit.`
- Page header: `Employee Documents` / `Access and manage your employment documents`.

### Rules and edge cases

- **DOCS.R1** Effect runs on `[user, activeEnvironment]` (ED:126, not `bcService`). Guard: returns without a call if either is missing. Order: (1) `getPayslips`, `setPayslips(payslipData || [])`; (2) `getFiscalYears` inside its own `try/catch` (a failure never blocks payslips); (3) fiscal-year options decided (DOCS.R2, R3); (4) `getEmployeeProfile` (DOCS.R6); (5) tax docs built. The outer `try/catch` logs only and `finally` clears `isLoading`.
- **DOCS.R2** Fiscal-year option source: use the DOCS.C1 data when `response.success && response.data.length > 0` (ED:65-67). Otherwise (failure, empty array, thrown) fall back to years derived from the payslips (DOCS.R3).
- **DOCS.R3** Fallback derivation (ED:72-84): for each payslip, year string = `p.fiscalYear` if present, else from `new Date(p.expectedPaymentDate || p.payDate)`: invalid date gives null (dropped); else UK tax year start `= (month > 4 || (month === 4 && day >= 6)) ? year : year - 1`, formatted `"{start}/{start+1}"`. Uses the browser-local getters `getFullYear/getMonth/getDate`. Unique values, `Array.sort()` default (lexicographic string) then `reverse()` (newest first). Each becomes `{fiscalYear, active:false}`.
- **DOCS.R4** Default selected year (ED:86-91): `options.find(fy => fy.active) || options[0]`; sets `selectedFiscalYear` to its `fiscalYear`. With zero options `selectedFiscalYear` stays `null`. The options order from the API is kept as-is (no sort).
- **DOCS.R5** Payslip filter (ED:378-386): when `selectedFiscalYear` is set, keep payslips where `(payslip.fiscalYear || getFiscalYearFromDate(payslip.expectedPaymentDate || payslip.payDate)) === selectedFiscalYear` (exact string compare). `getFiscalYearFromDate` (ED:367-376) returns `null` for falsy or invalid dates. When `selectedFiscalYear` is `null`, ALL payslips are shown. No sorting here either: API order.
- **DOCS.R6** Profile and tax docs: `validP11D = employeeProfile?.validP11D || false`. Tax rows are always `[{id:'p60', systemId:'p60', type:'P60', description:'End of Year Certificate'}, {id:'p11d', systemId:'p11d', type:'P11D', description:'Expenses and Benefits Statement'}]`. The `P11D` row is removed unless `validP11D` is truthy. If the profile call throws (production), the outer catch runs AFTER the fiscal options and the payslips were already set, so they remain; `taxDocuments` stays `[]` and the tax tab shows the empty state.
- **DOCS.R7** Tabs (ED:622-651): `Payslips` (state `payslips`, default) and `Tax Documents` (state `tax`). Active tab: green underline and text `#36893b`. Switching does not refetch and does not clear the error banner.
- **DOCS.R8** Fiscal year filter bar (`Fiscal Year` label, a `<select id="fiscalYearSelect">`) shows ONLY on the payslips tab, always (ED:654-678). Options render as `{fiscalYear}` plus ` (Active)` when `active` is truthy. With no options, one option `Loading...` with value `''` is shown (and it stays so if the lists are really empty). `onChange` sets `e.target.value || null`. There is no "All" option. The tax tab has no year filter (the year is chosen in the modal).
- **DOCS.R9** Payslips table (ED:402-461), heading `Payslips`, columns `Period`, `Pay Date`, `Gross Pay`, `Tax`, `Net Pay`, `Actions`. Pay Date uses `formatDate(expectedPaymentDate || payDate)` (the dashboard reads `payDate` only). Money: `£` + `(value || 0)` formatted `toLocaleString('en-GB', 2 dp)`; tax = `payslip.taxAmount ?? payslip.taxPaid ?? 0`. Row key `payslip.id`. Buttons: eye `View payslip`, download `Download payslip` (title attrs), both disabled while `isLoadingPdf`.
- **DOCS.R10** Tax docs table (ED:482-545), heading `Tax Documents`, columns `Document Type`, `Description`, `Actions`. Row: type, description. Buttons titled `View {type}`, `Download {type}`.
- **DOCS.R11** `handleDocumentView(doc, type)` (ED:222-364): `type` is `'view'` or `'download'`. No `doc` gives a silent return (log). It clears `errorMessage`, sets `isLoadingPdf=true`, then reads `employeeData = JSON.parse(localStorage.employeeData || '{}')` (a corrupt value throws into DOCS.R15). `employeeGuid = employeeData.id || localStorage.employeeId`; `employeeNo` is read but unused.
- **DOCS.R12** Payslip path (`activeTab === 'payslips'`, ED:243-261): if `!doc.systemId`, `errorMessage = 'Payslip ID is missing'` and return. Else `getPayslipPdf(doc.systemId)`; falsy result gives an inner `Error('No payslip data returned from API')`; any throw gives `{success:false, error: error.message || 'Failed to retrieve payslip'}`. A failed result gives `errorMessage = response.error || 'Failed to retrieve document'` (ED:301-305). So a failed payslip PDF shows the raw server or error text, NOT passed through `formatBCErrorMessage`. A falsy `pdfData` gives `'No document data returned'`.
- **DOCS.R13** P60 and P11D path (ED:262-293): the active tab is `tax`, and the branch is picked by `doc.type`. If `!employeeGuid`, `errorMessage = 'Employee GUID is required but not available'` and return. Else `pendingP60Action = {doc, type, employeeGuid}`; `isLoadingPdf=false`; `await loadFiscalYears()` (a fresh DOCS.C1 call every time); then open `FiscalYearSelectionModal` (even if the load failed). Any other `doc.type` gives `errorMessage = 'Unknown document type: {type}'` (ED:294-298; not reachable from the two rows).
- **DOCS.R14** `loadFiscalYears` (ED:132-151): sets `fiscalYearsLoading` true/false around the call. Success: `setFiscalYears(response.data)`. `response.success === false`: `errorMessage = 'Failed to load fiscal years: ' + response.error`, `fiscalYears = []`. A throw (cannot happen from the service): `errorMessage = 'Failed to load fiscal years'`. The modal still opens afterwards, showing `No fiscal years available`.
- **DOCS.R15** Outer catch of `handleDocumentView`: `errorMessage = 'An error occurred while processing your request'`; `finally` sets `isLoadingPdf=false`.
- **DOCS.R16** `handleFiscalYearSelection(selectedFiscalYear)` (ED:154-220; the parameter shadows the state of the same name). Needs `pendingP60Action`, else a silent return (log). `taxYear = selectedFiscalYear.fiscalYear`. `P60` calls `getP60Pdf(employeeGuid, taxYear)`; `P11D` calls `getP11DPdf(...)`; else throws `Unsupported document type: {type}`. On `response.success && response.data`:
  - `download`: atob, Blob, anchor, filename `{doc.type}_{fiscalYear}.pdf` (underscore, e.g. `P60_2024/2025.pdf` with the slash kept as typed, so the browser sanitises it). `URL.revokeObjectURL` is called IMMEDIATELY (not after 30 s as in the payslip paths).
  - `view`: `currentPdf = data`, title `{doc.type} - {fiscalYear}` (e.g. `P60 - 2024/2025`), opens `PdfPreviewModal`.
  - Else: `errorMessage = response.error || 'Failed to retrieve {doc.type} document'`.
  - Catch: `errorMessage = 'Failed to process {pendingP60Action?.doc?.type || 'document'} document'`.
  - `finally`: `isLoadingPdf=false` and `pendingP60Action=null`. Errors are shown through the banner (DOCS error state), so P60/P11D server errors are formatted per SHARED.formatBCErrorMessage.
- **DOCS.R17** The modal's Confirm calls `onSelect(fiscalYear)` then `onClose()` (FYM:56-61). Documents' `onClose` clears `pendingP60Action`, but `handleFiscalYearSelection` already took the action from its closure. Net effect: modal closes at once while the PDF request runs; `isLoadingPdf` disables the row buttons.
- **DOCS.R18** Modal title `Select Fiscal Year for {pendingP60Action?.doc?.type || 'Document'}`; `documentType` prop = the type. Modal behaviour is in the FYM section below.
- **DOCS.R19** The tax-document `download` branch at the end of `handleDocumentView` (ED:339-345 with `doc.taxYear`) is unreachable, since tax docs always return early through the modal. Likewise the `doc.type ? '{type} - {taxYear || period}' : 'Payslip - {period}'` title (ED:317-319): for payslips, `doc.type` is undefined so the title is `Payslip - {period}`. Payslip download filename is `Payslip-{period with whitespace runs replaced by '-'}.pdf` (ED:342). `doc.period` unguarded (a missing period throws into DOCS.R15).
- **DOCS.R20** Payslip `view`: title `Payslip - {period}`; the modal opens with base64 data. Payslip `download`: as HOME.R22 (revoke after 30 s).
- **DOCS.R21** Only one PDF flow at a time: `isLoadingPdf` disables all row buttons. The spinner overlay is not used; there is no in-button spinner.
- **DOCS.R22** Unused imports and state: `Filter`, `ChevronDown`, `RefreshCw` icons; `ErrorMessage` is not used here (see FRAME.R25).

### Storage

| key | read | written |
|---|---|---|
| `employeeData` | ED:234 (`JSON.parse`, `\|\| '{}'`) | BCS:353 (by the profile call) |
| `employeeId` | ED:237 | BCS:352 |
| `employeeNo` | ED:238 (unused), HOME.C3 | BCS:350, 357 |
| the keys of SHARED and HOME.C2/C3 | | |

Nothing is written by ED itself. No session or local storage for the selected year or tab (all in memory, reset on remount).

### Fakes or fallbacks in today's code

- **DOCS.X1** In dev, the fiscal-year, P60, P11D and P45 calls hit `getMockData` default `{success:true, message:...}`: fiscal years then fail with `Invalid response format from fiscal years API`, and the P-forms fail with the corresponding `Invalid response format ...` text (dev mode returns the mock BEFORE the format check turns it into an error; then they go through `formatBCErrorMessage`, which gives `Invalid response format from P60 document API`).
- **DOCS.X2** In dev, `getPayslipPdf` returns the fake base64 PDF (HOME.X4) for any error, so a failed payslip PDF opens the fake in dev.
- **DOCS.X3** Fallback of fiscal years to payslip-derived values (DOCS.R3) is real behaviour in production, not just dev. The tax doc rows (P60 / P11D) are hard-coded constants, not API data (DOCS.R6).

---

## PDF PdfPreviewModal   (source: PDF:1-130)

Props `isOpen`, `onClose`, `pdfData` (base64 without prefix), `title`. Used by HOME and DOCS.

- **PDF.R1** `isOpen` false renders nothing (PDF:71).
- **PDF.R2** When open, an `Escape` keydown on `document` calls `onClose`, and `document.body.style.overflow = 'hidden'` is set. The effect cleanup (on close, unmount or `onClose` change) sets `document.body.style.overflow = 'auto'` (PDF:9-27). Note the cleanup runs even if the modal never opened, and it forces `auto` rather than restoring the previous value. The parents pass an inline arrow for `onClose`, so the effect re-runs on every parent render; harmless.
- **PDF.R3** Backdrop click closes when the click target is outside the inner panel (PDF:30-34). The inner panel also `stopPropagation`s clicks (PDF:81).
- **PDF.R4** Header: `title || 'Document Preview'` and an X button (no `aria-label`). Footer: `Close` and `Download` buttons.
- **PDF.R5** Body: with data, `<iframe src="data:application/pdf;base64,{pdfData}" title="PDF Viewer">`. Without data, `No PDF data available`.
- **PDF.R6** `Download` is `disabled` when there is no `pdfData`. Handler: atob, Blob `application/pdf`, anchor click, revoke after 30000 ms. Filename: `title` with whitespace runs replaced by `-`, then every character outside `[a-zA-Z0-9-_.]` removed, plus `.pdf` (so `Payslip - 6 Apr 2024` gives `Payslip---6-Apr-2024.pdf`; the slash in `P60 - 2024/2025` is dropped, giving `P60---20242025.pdf`); with no title, `document.pdf`. An invalid base64 string makes `atob` throw, uncaught in this handler.
- **PDF.R7** The parents never clear `currentPdf` on close, so reopening the modal shows the last data until replaced.
- **PDF.R8** CSS class `animate-modal-appear` and 300 ms transitions are cosmetic.

## FYM FiscalYearSelectionModal   (source: FYM:1-160)

Props `isOpen`, `onClose`, `onSelect(fiscalYearObject)`, `fiscalYears=[]`, `isLoading=false`, `title='Select Fiscal Year'`, `documentType=null`.

- **FYM.R1** `isOpen` false renders nothing. Escape and body-overflow behaviour is the same as PDF.R2 (FYM:18-36).
- **FYM.R2** On each open, the local selection resets to `null` (FYM:39-43).
- **FYM.R3** Backdrop click (outside the panel) calls `onClose`; X button (`aria-label="Close modal"`) and `Cancel` call `onClose`.
- **FYM.R4** Loading: spinner and the text `Loading fiscal years...`. Empty list (`fiscalYears.length === 0`): calendar icon and `No fiscal years available`. Otherwise the prompt `Please select a fiscal year to generate the {documentType} document:` and a list.
- **FYM.R5** List filter: when `documentType === 'P60'`, keep only `fiscalYear.active === false && fiscalYear.allowP60Print === true` (so the current open year and years flagged non-printable are hidden). For `P11D` (or anything else) all years show. If the P60 filter removes everything, the prompt shows with an empty list and NO empty message (the empty text depends on the unfiltered length).
- **FYM.R6** Each item is a button: bold `{fiscalYear}`, grey `{startDate} to {endDate}` (raw strings from the API), and a check icon when selected. Selection identity is `fiscalYear.id`. Order is the API order.
- **FYM.R7** `Confirm Selection` is disabled while nothing is selected or `isLoading`. It calls `onSelect(selectedObject)` and then `onClose()`.

---

## PROF Profile   (source: EPR:1-382; BCS:231-431)

Route: `/portal/profile`. Call: HOME.C2 (the same wire call; PROF has no other call). No separate call ID is minted. Tests name `HOME.C2`.

### Response fields read (all from HOME.C2)

All guarded with `|| ''` unless noted; mapping at EPR:74-131.

| field | state | note |
|---|---|---|
| `firstName`, `middleName`, `lastName` | `name = [..].filter(Boolean).join(' ') \|\| user.name` | also stored individually (unused in the render) |
| `birthDate` | `birthDate` | rendered with PROF.R7 |
| `gender`, `maritalStatus` | | `maritalStatus` is stored but never rendered |
| `email` | `email = email \|\| user.email` | |
| `mobilePhoneNo` | `phone` | |
| `address`, `address2`, `addressLine3`, `addressLine4`, `city`, `county`, `postCode`, `country` | | rendered per PROF.R8 |
| `employeeNo` | `employeeId` | |
| `jobTitle` | `position = jobTitle \|\| 'Employee'` | |
| `manager` | stored, not rendered | |
| `employmentDate` | `joinDate` | |
| `status` | `status = status \|\| 'Active'` | |
| `weeklyHoursWorked` | `hoursWorked` | |
| `hmrcTaxCode` | `taxCode` | masked |
| `nationalInsuranceNumber` | `niNumber` | masked |
| `niClassCode`, `nationalInsuranceCode` | `niCategory = (niClassCode \|\| '') + ' ' + (nationalInsuranceCode \|\| '') \|\| ''` | each part guarded; with both missing the value is the single space `' '` |
| `validP11D` | stored, not rendered | |
| `bankName`, `bankAccountName`, `bankAccountNo`, `bankBranchNo` | | `bankAccountName` is stored but NOT rendered (see PROF.R11) |
| `frequency` | `payFrequency` | |
| `annualSalary` | stored, not rendered | |
| `pensionSet`, `pensionContribution`, `pensionProvider` | | |

Not read from the response: nothing writes `employeeData` here except the service (HOME.R10).

### States

- **Loading**: spinner, same as HOME (EPR:143-149). It stays on while `user` or `activeEnvironment` is missing (initial `isLoading` is `true`). The full-page spinner shows again on every effect re-run (`setIsLoading(true)` at EPR:68; the same applies to HOME at EP:149 and DOCS at ED:55), replacing the page content for the duration of the refetch.
- **Error**: no message. The catch logs (EPR:133-135), `employeeData` stays `null`, the page renders all six sections with blank values (PROF.R12).
- **Success**: six cards.

### Rules and edge cases

- **PROF.R1** Effect runs on `[user, bcService, activeEnvironment]`; no-op without `user` and `activeEnvironment`; one `getEmployeeProfile` call (with all HOME.R7 to R10 side effects, including `employeeNoReady` NOT being dispatched here: only the dashboard dispatches it, see BELL.R2).
- **PROF.R2** Page title `Employee Profile`. Cards in order: `Personal Information`, `Contact Information`, `Employment Details`, `Tax & National Insurance`, `Banking Details`, `Pension Information`.
- **PROF.R3** Personal: `Full Name`, `Date of Birth`, `Gender`.
- **PROF.R4** Contact: `Email Address`, `Phone Number`, `Address`.
- **PROF.R5** Employment: `Employee ID`, `Position`, `Start Date`, `Weekly Hours`, `Status`.
- **PROF.R6** Banking: `Bank Name`, `Account Name`, `Account Number` (eye toggle), `Sort Code`, `Payment Frequency`.
- **PROF.R7** Date format (`formatDate`, EPR:38-54): falsy or `'N/A'` gives `N/A`; an invalid date returns the original string; else `toLocaleDateString('en-GB', {day:'2-digit', month:'long', year:'numeric'})`, e.g. `15 January 2022`. Used for `Date of Birth` and `Start Date`. Same UTC-parse timezone caveat as HOME.R19. With data absent, the empty state is `N/A` (not blank).
- **PROF.R8** Address block: `address`; `, {address2}` if truthy (no `'N/A'` check here, since `address2` defaults to `''`); `<br/>addressLine3`; `<br/>addressLine4`; `<br/>` + `[city, postCode].filter(Boolean).join(', ')` if either; `<br/>` + `[county, country].filter(Boolean).join(', ')` if either. Here `county` and `country` ARE read (unlike the dashboard).
- **PROF.R9** Other text fields render `value || ''`: so missing values are empty, not `N/A`. EXCEPTION: `Date of Birth` and `Start Date` show `N/A` (PROF.R7), and the masked fields show `N/A` (PROF.R10).
- **PROF.R10** Masking (`maskValue(value, showLast = 4)`, EPR:30-35): falsy or `'N/A'` gives `'N/A'`; `length <= showLast` gives `'*'` repeated `length` times; else `'*'.repeat(length - showLast) + value.slice(-showLast)`. Per field, shown last N chars when masked:
  - Tax Code: `showLast = 2`; toggle `taxCode`.
  - NI Number: `showLast = 3`; toggle `niNumber`.
  - Account Number: `showLast = 4`; toggle `bankAccount`.
  - Sort Code: `showLast = 2`; toggled by the SAME `bankAccount` toggle as the Account Number (one eye reveals both).
  - Revealed: the raw value `|| ''`. Defaults: all hidden at mount (`visibleFields = {bankAccount:false, niNumber:false, taxCode:false}`). Hidden state is lost on remount. Eye icon `Eye` (hidden) / `EyeOff` (visible); no `aria-label` on these buttons. NI Category is never masked.
  - Masking uses `value.length`, so a non-string value (e.g. a number from the API) would throw on `.slice`; there is no type guard (see A3).
- **PROF.R11** `Account Name` shows `employeeData.name` (the employee's full name), NOT `bankAccountName` (EPR:316). Reproduce or flag as a deliberate fix.
- **PROF.R12** Error / not-yet-loaded render with `employeeData === null`: text fields are empty, date fields `N/A`, masked fields `N/A`, NI Category empty. Same on any profile failure.
- **PROF.R13** `Status` default `Active` and `Position` default `Employee` apply even when the response omits them (and so also appear when the profile is real but incomplete).
- **PROF.R14** The profile screen is read-only: no edit action and no call other than HOME.C2.
- **PROF.R15** Tax & National Insurance card (EPR:247-300, heading `Tax & National Insurance`). Three cells, in this order:
  1. `Tax Code` (label EPR:256), source `hmrcTaxCode` (state `taxCode = hmrcTaxCode || ''`). Has an eye toggle button (key `taxCode`). Hidden: `maskValue(employeeData?.taxCode, 2)`, i.e. all but the last 2 characters as `*`, and `N/A` when empty. Revealed: `employeeData?.taxCode || ''` (empty, not `N/A`).
  2. `NI Number` (EPR:276), source `nationalInsuranceNumber`. Eye toggle (key `niNumber`). Hidden: `maskValue(employeeData?.niNumber, 3)` (last 3 shown, `N/A` when empty). Revealed: `employeeData?.niNumber || ''`.
  3. `NI Category` (EPR:295), source `niClassCode` and `nationalInsuranceCode`: `(niClassCode || '') + ' ' + (nationalInsuranceCode || '') || ''`. No toggle, never masked. Rendered as `employeeData?.niCategory || ''`. With both parts missing the value is the single space `' '` (truthy), so it renders as blank; with one part missing it keeps the space (e.g. `A ` or ` B`).
  The two toggles here are independent of each other and of the bank toggle. Before load or after a failed load (`employeeData === null`): Tax Code and NI Number show `N/A` (masked path), NI Category is empty.
- **PROF.R16** Pension Information card (EPR:356-377, heading `Pension Information`). Three cells, in this order, no toggles and no masking, each rendered `employeeData?.<field> || ''` (empty when missing, never `N/A`; raw API value, no number or currency formatting):
  1. `Pension Set` (EPR:364) ← `pensionSet`
  2. `Pension Provider` (EPR:368) ← `pensionProvider`
  3. `Contribution` (EPR:372) ← `pensionContribution` (the label is `Contribution`, not `Pension Contribution`)
  Each source is mapped `|| ''` in state (EPR:124-126).

### Storage

Same as HOME.C2. Writes are done by the service (HOME.R10), reads by the service. EPR itself touches no storage.

### Fakes or fallbacks in today's code

The dev mocks HOME.X1 and HOME.X2. The user-visible hard-coded defaults are `Employee` (position) and `Active` (status), PROF.R13.

---

## BELL Notification bell   (source: UPL:29-31, 58-70, 94-119, 207-266, 419-454; BCS:802-854)

### Calls

| id | method | path (with query) | headers sent | token | body | credentials |
|---|---|---|---|---|---|---|
| BELL.C1 (`getNotifications`, BCS:844) | GET | `/bc/notifications` plus `?` and, in this order and each only when truthy: `registrationId` ← localStorage.registrationId; `clientEnvironment` ← `JSON.parse(localStorage.activeEnvironment).name`; `clientCompanyId` ← localStorage.clientCompanyId; `employeeNo` ← localStorage.employeeNo | default headers; Authorization; `X-Registration-ID` only via SHARED.R7 (when stored). No `headers` option. | bc | none | include |
| BELL.C2 (`markNotificationSeen`, BCS:816) | PATCH | `/bc/notifications/{systemId}` plus `?` and, each only if truthy, in order: `registrationId`, `clientEnvironment`, `clientCompanyId` (NO `employeeNo`). `systemId` is not URL-encoded. | default headers; Authorization; `X-Registration-ID` via SHARED.R7 | bc (`readWrite`, same scope value) | `{"seen": true}` | include |

### Response fields read

| call id | field path | how it is used | guarded? |
|---|---|---|---|
| BELL.C1 | whole response | `Array.isArray(response) ? response : []` | yes |
| BELL.C1 | item `systemId` | React key; identity for the optimistic update; BELL.C2 path | no (a missing id gives a `undefined` key, and BELL.C2 would target `/bc/notifications/undefined`) |
| BELL.C1 | item `seen` | falsy means unseen | yes (truthiness) |
| BELL.C1 | item `message` | list line and detail text | no (renders blank) |
| BELL.C1 | item `createdDate` | shown raw (no date formatting), see BELL.R9 | yes (`if (!date) return ''`) |
| BELL.C1 | item `createdTime` | `time.substring(0, 5)` | yes (`if (time)`) |
| BELL.C2 | response body | ignored | n/a |

### States

- **Not loaded / empty**: bell with no badge; panel text `No notifications` (bell icon) (UPL:238-243).
- **Loaded**: list; badge when any unseen.
- **Error**: `getNotifications` returns `[]` and swallows errors (BCS:850-853), so a failure is shown as `No notifications`, with no message. The layout's `.catch(() => {})` is an extra no-op.
- **Detail overlay**: a modal for the selected notification.

### Rules and edge cases

- **BELL.R1** Notifications are fetched ONLY in response to the `window` event `employeeNoReady` (UPL:62-70). The handler returns without a call when `localStorage.employeeNo` is falsy. On success it REPLACES the list with `data || []`. Reason in the code comment: `employeeNo` is required so the backend filters to this employee; without it the backend would return the whole company (UPL:58-61). Do not add a fetch on environment change.
- **BELL.R2** The only dispatcher of `employeeNoReady` is the Dashboard, after a successful profile with a truthy `employeeNo` (HOME.R10, EP:163). Consequences: (a) landing directly on `/portal/documents` or `/portal/profile` (page reload) loads NO notifications until the user visits the dashboard; (b) every dashboard (re)load, including the double fetch of HOME.R1, refetches and replaces the list, discarding optimistic `seen` flags not yet persisted; (c) there is no polling or interval.
- **BELL.R3** The listener is registered in an effect keyed on `[bcService]`; `bcService` is memoised on `[activeEnvironment]`, so a new environment re-registers it.
- **BELL.R4** Client does NO slicing or sorting. The doc comment "top 5, newest first" (BCS:782-785, sits above `updatePortalUser` by mistake) describes backend behaviour at best. The UI renders whatever array comes back, in order, with `max-h-72 overflow-y-auto`.
- **BELL.R5** Badge: `unseenCount = notifications.filter(n => !n.seen).length` (UPL:107). Shown only when `> 0`; text `9+` when `> 9`, else the number.
- **BELL.R6** The bell button (`aria-label="View notifications"`) toggles the panel and closes the user menu (UPL:209). Opening the user menu closes the panel (UPL:272). The panel closes on `mousedown` outside the `notifRef` container (button plus panel); it does not close on Escape (UPL:73-82).
- **BELL.R7** Panel: title `Notifications`; `{unseenCount} new` pill when `> 0`. Each row: dot (brand colour when unseen, grey when seen), `message` (bold dark when unseen, grey when seen), and the date line.
- **BELL.R8** Click on a row (`handleNotifClick`, UPL:94-105): `selectedNotif = notif`; panel closes. If `!notif.seen`: optimistic update setting `seen: true` on the matching `systemId` in state; then BELL.C2 fire-and-forget (not awaited). BELL.C2 errors are swallowed with no rollback and no message (BCS:821-823). The optimistic mark is therefore kept even if persisting fails. Seen rows only open the overlay (no call).
- **BELL.R9** Date line (`formatNotifDate(date, time)`, UPL:114-119): empty string if `!date`; else `date` raw, joined with the first 5 characters of `time` by ` • ` (`2024-06-01 • 09:30`). `date` is NOT parsed or reformatted (differs from `formatDate` elsewhere).
- **BELL.R10** Detail overlay: backdrop (click closes), icon, heading `Notification`, the date line (BELL.R9), the `message` in a box, and a `Done` button (closes). No Escape handling. `selectedNotif` is a snapshot object: it keeps showing the unseen version of the data it was opened with.

### Storage

| key | read | written |
|---|---|---|
| `employeeNo` | UPL:64 (gate), BCS:832 | HOME (BCS:350, 357; EP:158, 161) |
| `registrationId`, `clientCompanyId`, `activeEnvironment` | BCS:828-831, 804-807 | not by BELL |

### Fakes or fallbacks in today's code

In dev, a failed BELL.C1 hits `getMockData` default `{success:true,...}`, which is not an array and gives `[]`. There are no mock notifications.

---

## FRAME Portal frame (UserPortalLayout and routes)   (source: UPL:1-459; EP:686-698; `App.js:228-236`; `components/PortalSwitcher.js`)

### Calls

None of its own. Bell calls are BELL.C1 and C2. Sign-out is delegated to `AuthContext.logout` (auth inventory). The frame has no fetch.

### States

- Not a data screen. States are: mobile menu open or closed, user menu open or closed, notification panel open or closed, theme `dark` or `light`, admin banner shown or hidden, notification overlay.

### Rules and edge cases

- **FRAME.R1** Routing inside `/portal/*` (EP:686-698): `/portal` (index) redirects to `/portal/dashboard`; children `dashboard` (HOME), `documents` (DOCS), `profile` (PROF); any other path (`*`) redirects to `/portal/dashboard`. There is no route for payslips, benefits, support or settings (HOME.R23).
- **FRAME.R2** `App.js:228-236`: `/portal/*` renders `<Navigate to="/login" />` when `!isAuthenticated && !localAuthState`, else `<ProtectedRoute><EmployeePortal onLogout=.../></ProtectedRoute>`. Details belong to the auth inventory.
- **FRAME.R3** Theme: state initial value `localStorage.portalTheme || 'dark'` (UPL:18). Toggle flips `dark` and `light` and writes `localStorage.portalTheme` (inside the state updater). The root `<div class="portal-shell ..." data-theme={theme}>`. The toggle button has `aria-label="Toggle light/dark theme"`; it shows a sun icon when light, a moon icon when dark. It is not synced with the OS theme and is not read by other screens.
- **FRAME.R4** Logo: `src` is `QniConnect_Logo_Dark.png` when theme is `light`, else `QniConnect_Logo.png` (assets), `alt="QniConnect"`, height 76 px; links to `/portal/dashboard`.
- **FRAME.R5** Nav items (exact): `Homepage` to `/portal/dashboard` (home icon); `Documents` to `/portal/documents` (file icon). Desktop (md and up) shows them inline; active when `location.pathname.startsWith(item.path)` (colour tokens `--p-nav-link-active` / `--p-nav-link-inactive`). The profile page therefore highlights neither.
- **FRAME.R6** Mobile menu: hamburger (`sr-only` text `Open main menu`) toggles; an X icon shows when open. It lists the same two links, each closing the menu on click. For admins it also renders `<PortalSwitcher currentPortal="user" />`, a dropdown labelled `User Portal` with one item `Switch to Admin Portal`, which navigates to `/admin/dashboard` and closes the dropdown (`PortalSwitcher.js:14-22, 55-70`). The `Switch to User Portal` item (`navigate('/portal')`) is not shown when `currentPortal === 'user'`.
- **FRAME.R7** Environment badge (UPL:190-204): rendered only when `activeEnvironment` is truthy, and hidden below `md` (`hidden md:flex`). Text `activeEnvironment.name || 'Unknown'` (also as the `title` attr, truncated at 200 px). Colour from `(activeEnvironment.type || '').toLowerCase()`: `production` gives green (`bg-green-100 text-green-800`), `sandbox` gives blue (`bg-blue-100 text-blue-800`), anything else gives grey (`bg-gray-100 text-gray-800`).
- **FRAME.R8** User menu button: avatar circle shows `user?.name?.charAt(0) || 'U'`; beside it (md and up) `user?.name || 'User'` and a chevron. Click toggles the menu and closes the notification panel. The menu does NOT close on outside click or Escape. It closes only via its toggle button, the `Your Profile` link, or leaving the page.
- **FRAME.R9** Menu content: block with `user?.name` (truncated) and `user?.email` (truncated, `title` attr = email); link `Your Profile` to `/portal/profile` (closes the menu); if `user?.isAdmin === true`, a button `Switch to Admin Portal` that calls `navigate('/admin/dashboard')` (UPL:303); `Sign out` calls `logout` (AuthContext) directly as the click handler (so it receives the click event as an argument).
- **FRAME.R10** `isAdmin = user?.isAdmin === true` (strict) (UPL:34). Used for the menu item, the mobile PortalSwitcher and the setup banner.
- **FRAME.R11** Admin setup banner (UPL:47-56, 84-89, 357-397): on mount and when `isAdmin` changes, if `isAdmin` and `localStorage.adminAuthIncomplete === 'true'`, the banner shows with `authEnvironment = localStorage.adminAuthEnvironment || ''`. Heading `Business Central Environment Setup Incomplete`. Body: `The environment "{authEnvironment}" requires additional authorization setup in Business Central. Missing refresh token for API access. Please go to Admin Portal to complete the setup.` Buttons: `Go to Admin Portal` navigates to `/admin/authorization`; `Dismiss` sets state false and removes the localStorage keys `adminAuthIncomplete`, `adminAuthEnvironment`, `adminAuthErrorCode`. The keys are read once per `isAdmin` change, not live. `adminAuthErrorCode` is never read here.
- **FRAME.R12** Footer: `© {current year} QniPay. All rights reserved.` Links `Privacy` and `Terms`, both `https://qnipay.com/legal/`, `target="_blank"`, `rel="noreferrer"`.
- **FRAME.R13** Page background: radial green glow behind `<main>` using `--p-glow-mult`. The theme CSS custom properties (`--p-nav-bg`, `--p-nav-border`, `--p-text-primary`, `--p-text-secondary`, `--p-text-muted`, `--p-card-bg`, `--p-table-border`, `--p-table-row-hover`, `--p-glow-mult`, `--p-nav-link-active`, `--p-nav-link-inactive`) come from `index.css` or `App.css`, keyed on `data-theme`; not reproduced here.
- **FRAME.R14** The `Outlet` renders the child screen inside `max-w-7xl` main. The layout never gates children on loading.
- **FRAME.R15** Layout `bcService` is a memo on `[activeEnvironment]` only, as in the screens (UPL:41-44). Each screen and the layout therefore hold separate service instances, each reading storage at call time.
- **FRAME.R16** Inactivity or cross-tab logout is in AuthContext (`AC:69, 287-295`; auth inventory).
- **FRAME.R17** Dead or unused code related to the frame and portal: `components/common/ErrorMessage.js` is imported at `App.js:15` but never rendered anywhere in the repo (grep), so there is no `ErrorMessage` user-visible behaviour to port (a red box with an alert icon and a `message` prop; returns null for a falsy message). `Filter`, `ChevronDown`, `RefreshCw` icon imports in ED are unused.

### Storage

| key | read | written / removed |
|---|---|---|
| `portalTheme` | UPL:18 at mount | UPL:22 on toggle (`'dark'` or `'light'`) |
| `employeeNo` | UPL:64 | not here |
| `adminAuthIncomplete`, `adminAuthEnvironment` | UPL:49-50 | removed UPL:86-88 on Dismiss |
| `adminAuthErrorCode` | not read | removed UPL:88 on Dismiss |

### Fakes or fallbacks in today's code

User-visible defaults: `Unknown` (environment name), `User` / `U` (user name), `dark` (theme). No mock data in the frame.

---

## Cross-screen storage summary (portal only)

| key | type | writer | reader |
|---|---|---|---|
| `registrationId` | string | auth (verify) | all BC calls |
| `clientCompanyId` | string | HOME dashboard, service, SHARED.R8 | all BC calls |
| `clientCompanyName` | string | HOME, service | none in the portal |
| `clientCompanies` | JSON array | HOME | service (HOME.R7) |
| `activeEnvironment` | JSON | auth | service, all portal calls |
| `currentUser` | JSON | auth | service |
| `employeeNo` | string | service, HOME | HOME.C3 headers, BELL |
| `employeeId` | string | service | DOCS.R11 |
| `employeeData` | JSON | service | DOCS.R11 |
| `portalTheme` | string | FRAME | FRAME |
| `adminAuthIncomplete`, `adminAuthEnvironment`, `adminAuthErrorCode` | string | admin | FRAME |

Window events: `employeeNoReady` (dispatched by HOME, listened to by FRAME, BELL.R1). `authRequired` is dispatched only by `ApiService` on a 401 (HOME.C5).

## Ambiguities in the source

- **A1** `fetchThroughBackend` can throw an object whose `message` is itself an object (BCS:134, when the backend answers `{ "error": { ... } }`). DOCS.R12 puts `error.message` straight into `errorMessage`, and the banner renders `{errorMessage}`. React would throw ("Objects are not valid as a React child") and the screen would break. The behaviour on such a response is undefined. The port should coerce to a string, and tests should say which text is expected.
- **A2** Two different hard-coded fallback backend hosts (SHARED.R12). Only matters when `REACT_APP_API_BASE_URL` is unset.
- **A3** `maskValue` assumes strings; the API field types are not documented in the repo.
- **A4** HOME.R14 assumes the API returns payslips newest first; nothing in the client sorts.
- **A5** `getEmployeeProfile` stores `employeeNo` as `''` unconditionally (BCS:350), so a profile without `employeeNo` clears a previously stored value; BELL then never fetches.
- **A6** The dev-mode mocks depend on the build mode `development`. The port's dev behaviour (mocks or not) is a design decision. They are listed under each "Fakes" section so the port can drop or keep them on purpose.
