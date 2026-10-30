# Inventory: admin area (ADM, USERS, ENV, AUTHZ, SET, BCS)

Source repo: `C:\dev\qniconnect front end\QniConnect-FrontEnd\src` (cited as `src/...`).
`BC` = `src/services/businessCentralService.js`. `AC` = `src/auth/authConfig.js`. Bare `:123` line cites inside a section refer to that section's source file named in its heading.
All line numbers were read from the files as they stand. "Dev" means `process.env.NODE_ENV === 'development'`.

Token column: `bc` = the call passes `scopes`, so `fetchThroughBackend` sends `Authorization: Bearer <MSAL token for ["https://api.businesscentral.dynamics.com/.default"]>` (AC:36-41; `read`, `readWrite` and `api` are the same single scope). `login` = login-scope token, `none` = no token. No admin call uses `login` or `none`. The two direct `fetch` calls (USERS.C4, ENV.C3) send `Authorization` themselves (also `bc`).

Cross-cutting files this inventory depends on but does not own: `AuthContext.js` (`useAuth()`: `user`, `isAuthenticated`, `getAccessToken`, `activeEnvironment`, `logout`), `App.js:239-248` (`/admin/*` mount), `components/PortalSwitcher.js`, `components/auth/AuthCallbackPage.js` (popup that posts `AUTH_SUCCESS`). Those belong to `auth.md` / `portal.md`; only the contract with admin is recorded here.

---

## BCS Shared transport `fetchThroughBackend` (source: BC:60-155)

Every call in USERS.C1-C3, ENV.C1-C2, ENV.C4, ADM.C1-C4 and AUTHZ.C1-C4 goes through this method. USERS.C4 and ENV.C3 do not.

### Rules and edge cases
- BCS.R1 (BC:63-66) Default headers: `Content-Type: application/json`, `Accept: application/json`.
- BCS.R2 (BC:69-82) A token is mandatory. If `this.getAccessToken` is falsy OR `options.scopes` is falsy, throw `Error('Authentication service not available. Please log in again.')`. Otherwise call `getAccessToken(options.scopes)`. If the token is falsy, `'Not Readable'` or `'mock-token-for-development'`, or `getAccessToken` throws, throw `Error('Authentication failed. Please log in again.')` (the original error is only logged). Header is `Authorization: Bearer <token>`.
- BCS.R3 (BC:84-89) `options.headers` are merged over the defaults (caller wins), then `delete options.headers` (it MUTATES the caller's options object).
- BCS.R4 (BC:94-98) Fetch init = `{headers, ...options, credentials: 'include'}`. `scopes` leaks into the fetch init (harmless). Cookies are always included.
- BCS.R5 (BC:100-105) If the service instance has `this.activeEnvironment` (set by `updateEnvironmentState`), send `X-BC-Environment: <activeEnvironment.id>`. Which instance has it: see ADM.DASH.R2 and ENV.R6.
- BCS.R6 (BC:107-111) Read `localStorage.registrationId` at call time; if truthy and `X-Registration-ID` is not already truthy in headers, send `X-Registration-ID: <registrationId>`.
- BCS.R7 (BC:117-120) URL is `${backendApiUrl}${endpoint}`. `backendApiUrl = process.env.REACT_APP_API_BASE_URL || 'https://demobackend-backend-demo.uksouth-01.azurewebsites.net/api'` (BC:10). (`AC:45` has a different default host, `demo-backend-demo...`; only BC:10 applies to these calls.)
- BCS.R8 (BC:122-129) After every response (also non-ok), if response header `X-Client-Company-ID` is present, write `localStorage.clientCompanyId`.
- BCS.R9 (BC:131-142) Non-ok: parse JSON body (`{}` on parse failure); message = `body.message || body.error || 'API Error: <status>'`; throw a plain object `{message, response:{status, data: body}}` (NOT an `Error`).
- BCS.R10 (BC:144) Ok: `return response.json()`. An empty or non-JSON 2xx body (for example 204 from the PATCH) throws a `SyntaxError`; nothing guards it.
- BCS.R11 (BC:145-154) On any error: log, then in Dev return `getMockData(endpoint)` (swallows the error, see Fakes) else rethrow. In Dev no admin catch block that depends on a thrown error ever fires for a `fetchThroughBackend` call.
- BCS.R12 (AdminRoutes.js:18-21) The admin pages share ONE `BusinessCentralService` instance, created once with `useMemo(..., [])` from the `getAccessToken` of the first render (stale-closure risk). `AdminDashboard` creates its OWN instance (AdminDashboard.js:45) and ignores the prop.

### Storage
Reads `registrationId` (every call). Writes `clientCompanyId` (BCS.R8).

### Fakes or fallbacks
`getMockData` BC:1643-1739 (Dev only): `/bc/portalUsers/verify` mock user; `/bc/client-tenant/companies` two companies; `/bc/employees/current` mock employee; anything including `/bc/environments` returns `{value:[{id:'env-production-01',name:'Production',type:'Production',url:'https://businesscentral.dynamics.com/production',status:'Active'},{id:'env-sandbox-01',name:'Sandbox',type:'Sandbox',url:'https://businesscentral.dynamics.com/sandbox',status:'Active'}]}`; anything else (including `/bc/portalUsers`, `/bc/portalUsers/{id}`, `/auth/status`, `/auth/refresh`, `/auth/bc-auth-url`, `/bc/portalRegistrations`, `/bc/authorization/storeTokens`) returns `{success:true, message:'Mock data for <endpoint>'}`.

---

## ADM.ROUTES Admin routing and guard (source: src/components/AdminRoutes.js:1-48; App.js:239-248)

### Calls
None.

### Response fields read
n/a (reads context `user.isAdmin`, `isAuthenticated`).

### States
Redirects only.

### Rules and edge cases
- ADM.ROUTES.R1 (AdminRoutes.js:15) `isAdmin = user?.isAdmin === true` (strict).
- ADM.ROUTES.R2 (AdminRoutes.js:24-26) Not `isAuthenticated` -> `<Navigate to="/login">`.
- ADM.ROUTES.R3 (AdminRoutes.js:29-31) Authenticated but not admin -> `<Navigate to="/portal">`.
- ADM.ROUTES.R4 (AdminRoutes.js:35-43) Routes under `/admin/*`, all inside `AdminLayout` (`<Outlet/>`): index -> `/admin/dashboard`; `dashboard`; `users`; `environments`; `authorization`; `settings`; `*` -> `/admin/dashboard`. Each page receives `bcService` (the shared instance), except the dashboard ignores it (BCS.R12).
- ADM.ROUTES.R5 (App.js:240-247) Outer guard: `!isAuthenticated && !localAuthState` -> `/login`, else `<ProtectedRoute><AdminRoutes/></ProtectedRoute>`.
- ADM.ROUTES.R6 (EnvironmentManagement.js:516) "Edit Environment" navigates to `/admin/environments/edit/:id`, which has no route, so the `*` rule redirects to `/admin/dashboard`.
- ADM.ROUTES.R7 (App.js:81-87, ProtectedRoute; the `<AdminRoutes/>` mount is wrapped by it, App.js:244-246) An admin (`user?.isAdmin === true`) is redirected with `<Navigate to="/admin/dashboard">` ONLY when ALL hold: `!pathname.startsWith('/admin')` AND `!pathname.startsWith('/portal')` AND `pathname !== '/environment-select'` AND `!isPendingFirstLogin`. So admins are exempt on `/admin*`, on `/portal*` (this is what makes ADM.LAYOUT.R5/R9 "Switch to User Portal" work), on `/environment-select`, and while `isPendingFirstLogin` is truthy. The `/portal` branch at App.js:75-77 is an empty no-op. Earlier ProtectedRoute checks (App.js:51-71): spinner while `isLoading` or MSAL `inProgress !== None`; `authError` -> `AuthErrorPage`; `!isAuthenticated` -> `/login`; `!activeEnvironment && pathname !== '/environment-select'` -> `/environment-select` (so an admin with no active environment cannot reach `/admin` at all). `isPendingFirstLogin` also renders `<FirstLoginHandler/>` over the children (App.js:93). Owner: auth.md; listed here for the admin contract.

### Storage
None.

### Fakes or fallbacks
None.

---

## ADM.LAYOUT Admin layout (source: src/components/admin/AdminLayout.js:1-331)

### Calls
None. Uses `useAuth()` for `user`, `activeEnvironment`, `logout` (:18).

### Response fields read
Reads context, not a response.

| field | use | guarded? |
|---|---|---|
| `user` | if falsy, render full-screen spinner only (:66-72) | yes |
| `user.name?.charAt(0) \|\| 'U'` | avatar initial (:211) | yes |
| `user.name \|\| 'User'` | name in header (:214) | yes |
| `user.name`, `user.email` | dropdown header (:223-224, `title={user.email}`) | no (renders blank) |
| `activeEnvironment.name` | sidebar (:117, inside `activeEnvironment &&`); header `\|\| 'Unknown'` (:199) | partial |
| `activeEnvironment.type` | sidebar dot (:121-125, exact case: `'Production'` green-400, `'Sandbox'` blue-400, else gray-400); header pill (:193-197, lower-cased compare, `(type \|\| '')`: production green, sandbox blue, else gray) | partial |

### States
- Loading: `!user` -> centered spinner, no chrome (:66-72).
- Normal: sidebar (md+), top bar, `<Outlet/>`, footer.

### Rules and edge cases
- ADM.LAYOUT.R1 (:41-47) Nav items in order: Dashboard `/admin/dashboard`, Users `/admin/users`, Environments `/admin/environments`, Authorization `/admin/authorization`, Settings `/admin/settings`.
- ADM.LAYOUT.R2 (:22-31) `activeSection` = last `/` segment of `location.pathname`; if empty or `'admin'` -> `'dashboard'`. Clicking a nav link also sets it immediately (:99, :277). Title = nav item name for that id, else `'Dashboard'` (desktop, :157) / `'Admin'` (mobile, :165). Example: path `/admin/environments/edit/x` gives section `x` and title `Dashboard`.
- ADM.LAYOUT.R3 (:111-130) Sidebar "Active Environment" block shown only when `activeEnvironment` truthy.
- ADM.LAYOUT.R4 (:190-202) Header environment pill shown only when `activeEnvironment` truthy and md+.
- ADM.LAYOUT.R5 (:226-234) Dropdown "Switch to User Portal" -> `navigate('/portal')`; does NOT close the dropdown.
- ADM.LAYOUT.R6 (:235-244) Dropdown "Settings" -> link `/admin/settings`, closes dropdown.
- ADM.LAYOUT.R7 (:245-253) "Sign out" -> `onClick={logout}` (the click event is passed as `logout`'s first argument).
- ADM.LAYOUT.R8 (:50-58) Search forms (desktop :172, mobile :295) are a stub: on submit, if `searchQuery.trim()` is non-empty, log and clear the input. No navigation, no filtering. Placeholders: desktop `Search users, environments...`, mobile `Search...`.
- ADM.LAYOUT.R9 (:264-311) Mobile menu (below md): nav links (click closes menu), `<PortalSwitcher currentPortal="admin" className="w-full"/>`, mobile search. PortalSwitcher with `currentPortal="admin"` shows only "Switch to User Portal" -> `navigate('/portal')` (PortalSwitcher.js:19-26, 52-80). The toggle button reads `Admin Portal` with a shield icon and a trailing chevron (PortalSwitcher.js:35-46; `User Portal` with a database icon when `currentPortal` is not admin); clicking it toggles only its own dropdown (`isOpen`); choosing an item navigates and closes only that dropdown (:25). The item text is `Switch to User Portal` with an arrow icon. It renders only in the mobile menu; the desktop sidebar has none.
- ADM.LAYOUT.R10 (:143-152) Mobile menu toggle button; icon X when open, Menu when closed.
- ADM.LAYOUT.R11 (:82, :322) Sidebar title text `Admin Portal`. Footer text `© 2025 QniConnect. All rights reserved.` (hard-coded year).
- ADM.LAYOUT.R12 (:77, :155, :171) Responsive: sidebar `hidden md:flex`; desktop title and search `hidden md:*`.

### Storage
None directly.

### Fakes or fallbacks
Hard-coded copyright year 2025 (:322).

---

## ADM.DASH Admin dashboard (source: src/components/admin/AdminDashboard.js:1-483)

Uses its own `new BusinessCentralService(getAccessToken)` (:45), not the prop. Four calls run sequentially (await each), each in its own try/catch, so one failing gives an empty value, not an error screen.

### Calls
| id | method | path (with query) | headers sent | token | body | credentials |
|---|---|---|---|---|---|---|
| ADM.C1 | GET | `/bc/portalUsers` (BC:1416) | BCS.R1 defaults; `Authorization`; `X-BC-Environment` iff context `activeEnvironment` exists (ADM.DASH.R2); `X-Registration-ID` <- `localStorage.registrationId` if set | bc | none | include |
| ADM.C2 | GET | `/bc/environments` or `/bc/environments?$filter=registrationId eq <encodeURIComponent(registrationId)>` when `localStorage.registrationId` is set (BC:1003-1014; value deliberately NOT quoted, comment BC:1007) | as ADM.C1 | bc | none | include |
| ADM.C3 | GET | `/auth/status` or `/auth/status?registrationId=<encodeURIComponent(regId)>` (BC:1144-1152; regId = param or `localStorage.registrationId`) | as ADM.C1 | bc | none | include |
| ADM.C4 | GET | `/bc/portalRegistrations` (BC:1552-1555) | as ADM.C1 | bc | none | include |

ADM.C1-C3 are the same service methods as USERS.C1, ENV.C1, AUTHZ.C1.

### Response fields read
| call id | field path | how it is used | guarded? |
|---|---|---|---|
| ADM.C1 | `response.value` | returned as `users`; `[]` if falsy (BC:1420) | yes `\|\| []` (a truthy non-array throws at `.filter` -> outer catch) |
| ADM.C1 | `users[].status` | counts, exact strings `'Active'`, `'PendingFirstLogin'`, `'Inactive'` (:117-119) | n/a (undefined just not counted) |
| ADM.C2 | `response.value \|\| response.environments \|\| []` | mapped (BC:1020-1030): `id: id\|\|environmentId`; `name: name\|\|environmentName`; `type: type\|\|environmentType\|\|'Production'`; `url: url\|\|environmentUrl\|\|''`; `status: status\|\|'Active'`; `companyName: companyName\|\|company_name\|\|''` | yes |
| ADM.C2 | `environments[].status` | `environments.total = length`; `environments.active = count status==='Active'` (:135-136; `active` is computed but never rendered) | yes (mapper defaults `'Active'`) |
| ADM.C3 | `status` | `auth.status = status \|\| 'Unknown'` (:139) | yes |
| ADM.C3 | `expiresAt` | days = `Math.floor((new Date(expiresAt) - now)/86400000)`, `0` if absent (:122-124); also stored raw as `auth.expiresAt` (not rendered) | yes (ternary) |
| ADM.C4 | `companyName` | `tenantInfo.name = companyName \|\| activeEnvironment?.name \|\| 'Unknown'` (:144) | yes |
| ADM.C4 | `id` | `tenantInfo.id = id \|\| activeEnvironment?.id \|\| 'Unknown'` (:145) | yes |
| ADM.C4 | `registrationDate` | `tenantInfo.registrationDate = registrationDate \|\| '2025-01-01'` (:146) | yes |

Note: ADM.C3 and ADM.C4 results are dereferenced with no null check (`authStatus.expiresAt`, `tenantInfo.companyName`). A JSON `null` body throws inside the outer try and the OUTER catch (:149-151) leaves the default state.

### States
- Loading: `isLoading` true initially -> centered spinner (:225-231).
- Success: header, 4 stat cards, optional expiry alert, quick actions, user status overview, BC resources.
- **Port layout (Ruling Q20, taste review 2026-10-26):** the connection leads: a `Business Central connection` block with the authorization (status in its R5 colour, `Remaining: n days`, and a meter of the days left against the term from `issuedAt` to `expiresAt`, both read from ADM.C3), the active environment with its type, the environment count, the R6 expiry alert inside the block, and `Refresh authorization` as its one primary action (the third quick action, moved, so it is not offered twice). The users are one strip, `Total`, `Active`, `Pending`, `Inactive`; R7's `Active: n` line is the strip's Active count (so a zero still has its name). The `Add user` and `Add environment` quick actions and the resources share one row below. Every figure, text and link above is kept; the wire is unchanged.
- Partial: a failed sub-call gives `[]`/`{}`: counts 0, status `Unknown`, days 0 (so the alert and a red badge show, R5-R6).
- Error: there is no error UI. The outer catch only logs; the page shows the initial zeros (`users` 0, `environments` 0, `auth.status 'Unknown'`, `daysRemaining 0`).
- Static strings: title `Admin Dashboard`; subtitle `Management console for QniConnect Employee Portal`; stat titles `Total Users` (secondary `Active: <n>`), `Environments`, `Authentication Status` (secondary `Remaining: <n> days`), `Active Environment` (value `activeEnvironment?.name || 'None'`, secondary `Type: <activeEnvironment?.type || 'N/A'>`); alert title `Authentication Token Expiring Soon`; alert text `Your authentication token will expire in {n} days. Please refresh your authorization to ensure uninterrupted access to Business Central.`; alert link `Manage Authorization` -> `/admin/authorization`; `Quick Actions` cards (each footer is a router `<Link>` whose text is `<buttonText>`, a space, then an aria-hidden `→` (`&rarr;`), AdminDashboard.js:190-195; so `Add User →`, `Add Environment →`, `Go to Authorization →`): `Add User` (`Create a new portal user account`, button `Add User` -> `/admin/users`), `Add Environment` (`Connect a new Business Central environment`, button `Add Environment` -> `/admin/environments`), `Refresh Authorization` (`Update Business Central OAuth authorization`, button `Go to Authorization` -> `/admin/authorization`); `User Status Overview` / `Portal Users` / link `View All Users` -> `/admin/users`; tiles `Active`, `Pending`, `Inactive`; `Business Central Resources` with two external links (`https://learn.microsoft.com/en-us/dynamics365/business-central/` titled `Business Central Documentation` / `Official Microsoft documentation for Business Central`; `https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication` titled `Service-to-Service Authentication Guide` / `Learn about OAuth and service-to-service authentication`; `target=_blank rel="noopener noreferrer"`).

### Rules and edge cases
- ADM.DASH.R1 (:40-157) The effect runs on mount and whenever context `activeEnvironment` changes (identity). It sets `isLoading` true each run.
- ADM.DASH.R2 (:48-50) If context `activeEnvironment` exists, call `bcService.setActiveEnvironment(activeEnvironment.id, activeEnvironment.name)` (not awaited; it runs synchronously because `updateBackend` is false). Effects: (a) the dashboard's own service instance sends `X-BC-Environment: <id>` on ADM.C1-C4 (BCS.R5); (b) side effect: `updateEnvironmentState` overwrites `localStorage.activeEnvironment` with `{id, name, companyId:null, company_Id:null}` (BC:46-51), which DROPS any `type`, `companyName` or other fields stored there, and leaves `clientCompanyId` untouched (both company args falsy, BC:30-38). Ambiguous whether intended; the port must reproduce it or consciously drop it (see report).
- ADM.DASH.R3 (:53-114) Each sub-call failure is logged and replaced by `[]`/`[]`/`{}`/`{}` (Dev: mock sets, see Fakes; in Dev the service has already swallowed the error, BCS.R11).
- ADM.DASH.R4 (:117-119) User counts are exact-string status matches: `Active`, `PendingFirstLogin` (shown as "Pending"), `Inactive`. Other statuses count only in the total.
- ADM.DASH.R5 (:234-246) Auth badge colour: red if `status === 'Inactive' || 'Expired'` (case-sensitive) OR `daysRemaining <= 0`; else yellow if `<= 14`; else green.
- ADM.DASH.R6 (:310-351) Expiry alert shown when `daysRemaining <= 14` (includes 0 and negatives; also whenever `expiresAt` is missing since days = 0). Red variant when `<= 7`, yellow when 8-14.
- ADM.DASH.R7 (:213) StatCard secondary line renders `{secondaryValue && ...}`: a numeric `0` (Active users = 0) renders the literal text `0` instead of `Active: 0`. Port: the strip names every count, so `Active` `0` shows (Ruling Q20).
- ADM.DASH.R8 (:264 vs :143-147) BUG in today's code: the header "Tenant" line renders `dashboardData.tenantInfo.companyName`, but state is written as `tenantInfo.name`, so the tenant name is always empty (initial value `''`). `tenantInfo.id` is never rendered. `Registered: <formatDate(registrationDate)>` does render.
- ADM.DASH.R9 (:160-168) `formatDate`: falsy -> `Unknown`; else `toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'})` (invalid date -> `Invalid Date`).
- ADM.DASH.R10 (:122) Days use `Math.floor` here; the AUTHZ page uses `Math.ceil` (AUTHZ.R9), so the two pages can disagree by one day.
- ADM.DASH.R11 No auto-refresh timer, and no use of `adminSettings` (SET) on the dashboard.
- ADM.DASH.R12 (:38) `user` is read from context but unused.

### Storage
Writes `activeEnvironment` (ADM.DASH.R2). Reads `registrationId` (via BCS). May write `clientCompanyId` through the `X-Client-Company-ID` header (BCS.R8).

### Fakes or fallbacks in today's code
- Dev mock sets in the page catch blocks: users (5 statuses) :59-67; environments 2 Active :77-82; authStatus `{status:'Active', expiresAt: now+67d}` :92-97; tenantInfo `{companyName:'Demo Company Ltd', id:'tenant-123', registrationDate:'2025-01-15'}` :107-112.
- Production fallbacks: `registrationDate` defaults to the literal `'2025-01-01'` (:146), shown to users as "Registered: 01 Jan 2025" when the backend has none. `'Unknown'` name/id.

---

## USERS Portal user management (source: src/components/admin/UserManagement.js:1-813; BC:786-800, 932-994, 1414-1513)

### Calls
| id | method | path (with query) | headers sent | token | body | credentials |
|---|---|---|---|---|---|---|
| USERS.C1 | GET | `/bc/portalUsers` (BC:1416) | BCS.R1; `Authorization`; `X-BC-Environment` iff the shared instance has an active env (set only by ENV.R6); `X-Registration-ID` <- `localStorage.registrationId` | bc | none | include |
| USERS.C2 | POST | `/bc/portalUsers` (BC:1491) | as USERS.C1 | bc | `JSON.stringify({name, email, role, isAdmin})`: name trimmed with `<...>` tags stripped; email trimmed and lower-cased; `role` `'User'` or `'Admin'`; `isAdmin` boolean (UserManagement.js:361) | include |
| USERS.C3 | PATCH | `/bc/portalUsers/${userId}` (not URL-encoded; BC:789) | BCS.R1; `Authorization`; `X-Registration-ID: <localStorage.registrationId \|\| ''>` (BC:792; sent as empty string if none); `X-BC-Environment` as C1 | bc | `JSON.stringify({name, email, role, isAdmin})`, same sanitising (UserManagement.js:211) | include |
| USERS.C4 | POST | `${backendApiUrl}/bc/portalUsers/${userId}/updateStatus` (BC:955-965; direct `fetch`, NOT `fetchThroughBackend`) | ONLY `Content-Type: application/json` and `Authorization: Bearer <token>`. No `Accept`, no `X-BC-Environment`, no `X-Registration-ID`. | bc (`getAccessToken(businessCentralScopes.read)`, BC:948) | `{"status": "Active"}` or `{"status": "Inactive"}` | not set (fetch default `same-origin`; cookies NOT sent cross-origin) |

USERS.C4 behaviours (BC:932-994): invalid token (falsy, `'Not Readable'`, `'mock-token-for-development'`) -> `Error('Invalid authentication token. Please log in again.')`. Non-ok: `await response.json()` with NO catch (a non-JSON body throws SyntaxError), then throws `{message: result.message || 'API Error: <status>', status, data}`. Ok: `return await response.json()`. The `X-Client-Company-ID` header is NOT read on this path. Dev: never calls the API: waits 500 ms and returns `{success:true, message:'User status updated successfully (development mode)'}`; after any error in Dev returns mock success.

### Response fields read
| call id | field path | how it is used | guarded? |
|---|---|---|---|
| USERS.C1 | `response.value` | users array; `[]` if falsy | yes |
| USERS.C1 | `user.id` | React key, action-menu id, status/edit target | no |
| USERS.C1 | `user.name` | `user.name.toLowerCase()` in search (:124), `user.name.charAt(0)` avatar (:701), display | NO: a user without `name` throws in the filter effect and render (page crashes) |
| USERS.C1 | `user.email` | `user.email.toLowerCase()` in search (:125), display | NO |
| USERS.C1 | `user.status` | tabs, badge, activate/deactivate choice | default case shows the raw value |
| USERS.C1 | `user.isAdmin` | Admins tab, Admin badge, locks the action menu | truthy test |
| USERS.C1 | `user.lastLogin` | `Last login: <formatDate>`; falsy -> `Never` | yes |
| USERS.C1 | `user.role` | not displayed in the list; seeds the edit form `editingUser?.role \|\| 'User'` | yes |
| USERS.C2 | whole `result` | appended to the list as `{status:'Active', ...result}` (:371) | `status` defaults to `'Active'` if result lacks it |
| USERS.C3 | whole `result` | merged `{...u, ...formData, ...(result \|\| {})}` (:216); `formData` is the UNSANITISED form values, then result overrides | yes `\|\| {}` |
| USERS.C4 | none | result not read; success = no throw | n/a |

### States
- Loading: `isLoading && users.length === 0` -> centered spinner (:582-588). Later `isLoading` toggles (activate/deactivate) show no spinner because the list is non-empty.
- Error (page banner, red box with X icon): `Failed to load users. Please try again.` (:42); `Failed to activate user. Please try again.` (:154); `Failed to deactivate user. Please try again.` (:177). It is cleared only by a reload (`setError(null)` on fetch start); a successful activate/deactivate does not clear a previous error.
- Empty: `No users found matching your criteria.` + button `Clear filters` (resets search to `''` and tab to `all`) (:678-690). Also shown after a load failure in production (users stays `[]`) together with the error banner.
- Success: rows (avatar initial, name, email, `Last login: ...`, status badge, `Admin` badge, actions).
- Header: `User Management`; subtitle `Manage employee access to the Business Central portal`; button `Add User`; search placeholder `Search by name or email`.
- Badges: `Active` (green), `PendingFirstLogin` shows `Pending` (yellow), `Inactive` (gray), anything else shows the raw status string (gray) (:553-580).
- Create modal strings: title `Add New User`; text `Create a new portal user account. The user will receive an email with login instructions.`; labels `Full Name`, `Email Address`, `Role` (options `User`, `Admin`), checkbox `Administrator Access` + helper `Administrators can manage users, environments, and authentication settings`; notice `Security Notice: Administrator users have complete access to all portal features and can manage other users.`; buttons `Create User` / `Creating...` (spinner) / `Cancel`.
- Edit modal strings: title `Edit User`; subtitle `<editingUser.email>`; same fields, helper and notice; buttons `Save Changes` / `Saving...` / `Cancel`.
- Form error (red box inside the modal): messages in R7, R8, R11, R12.
- **Port layout (user ruling, 2026-10-27).** These rules apply to Setup · Employees, where a portal admin with `master_data` sees records and logins in one table.
  - **Login-only logins are not listed there.** A login that matches no Workforce record is left out of that table. It still appears in the logins-only list that a portal admin without `master_data` gets, which keeps the tabs, Add and the row menu above.
  - **One button per row: View.** It opens the record. The login's status, admin flag, last login, menu (R4 to R5, R12) and, for a record without a login, Invite are all on the record.
  - **Errors appear where the action was taken.** A failed activate or deactivate shows its banner on the record while the record is open.
  - **Edit login closes the record first.**
  - **The row shows the login as a symbol beside the Status pill**, not as a column of its own. Each symbol has screen-reader text, and the Status header's tip is the legend.
    - No symbol: no login.
    - An envelope: invited, pending first login.
    - A green key: active.
    - A lock: inactive.
    - An amber key: an active login on a leaver or archived record.
    - A shield: admin.
  - **No Add on that page.** A login for a person is started from their record's Invite.
  - **Other changes to the same page:**
    - Contracted hours became an Hours column.
    - The prototype's Working hours page (admContracts, `acon`) is gone; `/setup/acon` redirects to Employees.
    - Dimensions became **Master data**, in three sections: Dimensions (sites, departments, cost centres), Positions, and Projects. Each project lists its tasks, read only, from its BC job.

### Rules and edge cases
- USERS.R1 (:30-104) Users load once on mount (and if `bcService` identity changes, which does not happen in practice). No refetch after create, edit or status change.
- USERS.R2 (:107-130) Filtering is client-side. Tab `all` = no filter; `active` = `status === 'Active'`; `inactive` = `status === 'Inactive' || 'PendingFirstLogin'`; `admin` = truthy `isAdmin`. Then search: case-insensitive `includes` on `name` OR `email` (term not trimmed).
- USERS.R3 (:618-640) Tabs and counts (counts come from the full list, ignoring search): `All Users`, `Active`, `Inactive` (includes pending), `Admins`.
- USERS.R4 (:746-793) Row action menu (one open at a time, toggled by the `...` button; closes after an action): if `user.isAdmin` -> only the text `Admin users cannot be modified` (no actions). Else: `status !== 'Active'` -> `Activate User`; `status === 'Active'` -> `Deactivate User`; always `Edit User`. The menu opens upward (`bottom-10`) for the last two rows (`index >= filteredUsers.length - 2`).
- USERS.R5 (:138-158, :161-181) Activate/Deactivate: set `isLoading`, call USERS.C4 with `'Active'` / `'Inactive'`; on success update only that row's `status` locally (from the closure `users`) and close the menu; no toast, no refetch; on failure set the page banner and leave the menu open. `isLoading` reset in `finally`.
- USERS.R6 (:199, :346) Checking `Administrator Access` forces `role: 'Admin'` and disables the Role select; unchecking does NOT reset the role (stays `'Admin'`, select enabled again).
- USERS.R7 (:352-360) Create validation, in order, after sanitising (name: `trim()` then remove `/<[^>]*>/g`; email: `trim().toLowerCase()`): (1) name or email empty -> `Name and email are required fields.`; (2) email fails `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` -> `Please enter a valid email address.`; (3) sanitised name length > 100 -> `Name must be 100 characters or fewer.`. Nothing is sent when invalid. The sanitised name is not re-trimmed after tag stripping.
- USERS.R8 (:205-210) Edit validation: same order, same regex and sanitising; message (1) is `Name and email are required.` (no "fields"); (2) and (3) identical to R7.
- USERS.R9 (:311, :516 buttons; :203, :350 handlers) Submit is wired both as form `onSubmit` and as the footer buttons' `onClick` (buttons are `type="button"`, outside the `<form>`), so clicking the button bypasses native HTML5 validation of `type="email"`; pressing Enter inside the form triggers native validation first.
- USERS.R10 (:363-373) Create success: append `{status:'Active', ...result}` to the list and close the modal. No toast. Duplicate emails are not checked client-side.
- USERS.R11 (:375-378) Create failure: modal stays open, form error = `error.message || 'Failed to create user. Please try again.'`. `error.message` is the backend `message`/`error` field, `API Error: <status>`, or the BCS.R2 texts.
- USERS.R12 (:212-223) Edit success: row replaced with `{...u, ...formData, ...result}`, modal closes, `editingUser` cleared. Failure: form error = `error.message || 'Failed to update user. Please try again.'`, modal stays open. `isSubmitting` reset in `finally`; submit buttons disabled while submitting.
- USERS.R13 (:317, :529) Cancel closes the modal; no confirmation; form data discarded.
- USERS.R14 (:184, :330) The modals are components defined INSIDE `UserManagement`, so any parent re-render remounts them and resets their form state (the parent re-renders on list/filter/menu state changes, not on typing inside the modal).
- USERS.R15 (:542-550) `formatDate`: falsy -> `Never`; else `en-GB`, day 2-digit, month short, year numeric.
- USERS.R16 (:805, :808) Edit modal rendered only when `showEditModal && editingUser`; create modal when `showCreateModal`.
- USERS.R17 (BC:782-800) The doc comment above `updatePortalUser` (BC:782-785) is a stale copy ("Get notifications"); the method really is `PATCH /bc/portalUsers/{id}`.
- USERS.R18 (BC:958-965) `updateUserStatus` omits `credentials: 'include'` and the `X-Registration-ID` / `X-BC-Environment` headers; the backend currently accepts that on the bearer token alone. The port must send exactly this shape unless the backend is confirmed to accept the other.

### Storage
Reads `registrationId` (USERS.C1-C3, BCS.R6 and BC:788). Writes none directly (may write `clientCompanyId` through BCS.R8 for C1-C3).

### Fakes or fallbacks in today's code
- Dev mock users in the component catch (UserManagement.js:46-93) and in the service (BC:1426-1477): five hard-coded people (John Smith, Emma Thompson, Michael Johnson, Sarah Williams, Admin User, `@example.com`).
- Dev create fallback: the component adds a user with `id: new-<Date.now()>`, status `Active` (:381-394); the service returns `{id:'new-...', ...userData, status:'PendingFirstLogin', created, lastLogin:null}` (BC:1502-1508). The two Dev paths disagree on status.
- Dev `updatePortalUser`: no mock; `fetchThroughBackend` returns `{success:true, message:'Mock data for /bc/portalUsers/<id>'}`, which is merged into the row (adds `success` and `message` keys to the user object).
- Dev `updateUserStatus`: mock success (BC:937-946, 984-990).
- Dev-only catch paths (reachable only if the service rethrows, which Dev never does, BCS.R11): users list failure sets the banner `Failed to load users. Please try again.` AND fills the 5 mock users, so the banner shows above the mock list (UserManagement.js:42-97). Create failure sets the form error, then adds `{id:'new-<ts>', name, email` (unsanitised form values), `status:'Active', role, isAdmin, lastLogin:null, created}` and closes the modal (:376-394), so the error is set but not seen. Environments list failure likewise shows `Failed to load environments. Please try again.` above the 2 mock environments (EnvironmentManagement.js:46-73); create failure adds a mock environment (without `companyName`/`companyId`) and closes the modal (:158-175).
- The modal copy "The user will receive an email with login instructions." is presented as fact; the frontend sends no email.

---

## ENV Environment management (source: src/components/admin/EnvironmentManagement.js:1-554; BC:22-52, 1000-1134, 1520-1544, 1579-1636)

### Calls
| id | method | path (with query) | headers sent | token | body | credentials |
|---|---|---|---|---|---|---|
| ENV.C1 | GET | `/bc/environments` or `/bc/environments?$filter=registrationId eq <encodeURIComponent(registrationId)>` if `localStorage.registrationId` (BC:1003-1014) | BCS.R1; `Authorization`; `X-BC-Environment` iff the shared instance has an active env; `X-Registration-ID` <- localStorage | bc | none | include |
| ENV.C2 | POST | `/bc/environments` (BC:1522) | as ENV.C1 | bc | `JSON.stringify(formData)` = `{name, type, url, companyId, companyName}` (strings; NOT trimmed; `type` default `'Production'`; `companyId` may be `''`) (EnvironmentManagement.js:121-127, 149) | include |
| ENV.C3 | POST | `${backendApiUrl}/bc/environments/activate` (BC:1099-1110, direct `fetch`) | `Content-Type: application/json`, `Authorization: Bearer <token>` only | bc | `{environmentId, environmentName, companyId: this.companyId}` | not set |
| ENV.C4 | POST | `/bc/client-tenant/companies` (BC:1594-1601) | as ENV.C1 | bc | `{environmentName, registrationId}` | include |

ENV.C3 and ENV.C4 are NOT reachable from the admin pages. ENV.C3 only runs when `updateBackend === true`, and the admin page calls `setActiveEnvironment(id, name, true)`, which binds `true` to the `companyId` parameter, not `updateBackend` (ENV.R6). ENV.C4 (`getClientTenantCompanies`) has no admin caller (callers: `EmployeePortal.js:76`, and a direct `fetch` at `auth/EnvironmentSelector.js:181`, both other inventories). They are documented because the service contract lists them.
- ENV.C4 pre-checks (BC:1581-1590): no `environmentName` -> `Error('Environment name is required')`; no registrationId (param or localStorage) -> `Error('Registration ID is required')`; companies = `response.value || response || []` (BC:1604).
- ENV.C3 behaviour (BC:1093-1122): invalid token -> Error (caught and swallowed); non-ok body logged as a warning and ignored; any error swallowed ("continue despite backend error"); Dev skips the call entirely and returns `{success:true, message:'Environment activated successfully (development mode)'}`. The method always resolves `{success:true, environment:{id, name, companyId}}` (BC:1126-1133).

### Response fields read
| call id | field path | how it is used | guarded? |
|---|---|---|---|
| ENV.C1 | `response.value \|\| response.environments \|\| []` | mapped to `{id, name, type, url, status, companyName}` (fallbacks as in the ADM.C2 row, BC:1020-1030). The mapper DROPS `isDefault`, `lastSync`, `version`, `company_Id` | yes |
| ENV.C1 (page) | `Array.isArray(response)` | always true from the service; the else-branches `response.environments` and `throw Error('Invalid environment data format')` are unreachable via the service (:37-43) | yes |
| ENV.C1 | `env.id` | React key, activation target | no |
| ENV.C1 | `env.name`, `env.url` | text; `href={env.url}` external link | no |
| ENV.C1 | `env.type` | icon colour: `'Production'` green, `'Sandbox'` blue, else purple (exact case) | no |
| ENV.C1 | `env.version` | `env.version \|\| 'Unknown version'`; always undefined from the mapper, so always `Unknown version` | yes |
| ENV.C1 | `env.lastSync` | `Last synchronized: <formatDate>`; always `Never` from the mapper | yes |
| ENV.C1 | `env.isDefault` | `Default` badge; hides `Set as Default`; always falsy from the mapper until the user sets one locally | yes |
| ENV.C2 | whole `result` | appended raw (NOT passed through the mapper) to the list (:152) | no (without `id` the React key is `undefined` and id lookups fail) |

### States
- Loading: `isLoading && environments.length === 0` -> centered spinner (:344-350).
- Error banner (red box with X icon): `Failed to load environments. Please try again.` (:46, also for the invalid-format throw); `Failed to activate environment. Please try again.` (:113). Cleared when a load starts and when an activation starts.
- Empty: server icon, `No environments found.`, `Get started by adding your first environment.`, button `Add Environment` (:393-406).
- Success: rows with icon, name, `Default` badge, URL (globe), version (database icon), `Last synchronized: ...`, external-link button, `...` menu.
- Header: `Environments`; subtitle `Manage your Business Central environments`; button `Add Environment`.
- Create modal strings: title `Add New Environment`; text `Connect a new Business Central environment to your portal.`; labels `Environment Name` (placeholder `Production`), `Environment Type` (options `Production`, `Sandbox`, `Test`, `Development`), `Environment URL` (placeholder `https://businesscentral.dynamics.com/production`), `Company ID (Optional)` (placeholder `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`), `Company Name` (placeholder `CRONUS UK Ltd.`); buttons `Add Environment` / `Creating...` / `Cancel`.
- Row menu items: `Set as Default` (only if `!env.isDefault`), `Sync Environment`, `Edit Environment`, `Delete Environment`.

### Rules and edge cases
- ENV.R1 (:27-81) Load once on mount; no refetch after create or activate.
- ENV.R2 (:139-142) Create validation: `!name || !url || !companyName` (raw strings; whitespace-only passes) -> form error `Name, URL, and Company Name are required fields.`; nothing sent. No URL format check; `companyId` optional.
- ENV.R3 (:144-158) Create success: append result, close modal; no toast. Failure: modal stays open, form error = `error.message || 'Failed to create environment. Please try again.'`.
- ENV.R4 (:136, :306) Create submit is wired as form `onSubmit` and as the footer button `onClick` (`type="button"`); no `required` attributes exist, so there is no native validation either way.
- ENV.R5 (:84-86) One row menu open at a time.
- ENV.R6 (:89-117; BC:1068-1079, 22-52) "Set as Default": looks up the env in the list (missing -> `Error('Environment not found')` -> banner `Failed to activate environment. Please try again.`), then `bcService.setActiveEnvironment(env.id, env.name, true)`. BUG in today's code: the third positional parameter is `companyId`, so `companyId = true` and `updateBackend` stays `false`. Resulting behaviour to preserve (or consciously change): (a) NO backend call (ENV.C3 never fires); (b) `this.companyId = true`; `localStorage.clientCompanyId = "true"` (string); (c) `localStorage.activeEnvironment = {id, name, companyId: true, company_Id: true}`; (d) the shared service instance now sends `X-BC-Environment: <env.id>` on all later admin calls from that instance (BCS.R5); (e) `AuthContext.activeEnvironment` is NOT updated, so the layout and dashboard keep showing the old environment until the context reloads from storage.
- ENV.R7 (:104-110) After activation succeeds: the local list marks `isDefault: true` for that id and false for all others; menu closes; no toast. This default flag is local only and is lost on reload (the mapper never returns `isDefault`).
- ENV.R8 (:503-514) `Sync Environment`: logs only and closes the menu. No request.
- ENV.R9 (:515-522) `Edit Environment` -> `navigate('/admin/environments/edit/${env.id}')` -> no route -> redirected to `/admin/dashboard` (ADM.ROUTES.R6). The menu is not closed first.
- ENV.R10 (:523-535) `Delete Environment`: `window.confirm("Are you sure you want to delete this environment?")`; on OK it only logs `Delete environment <id>`; nothing is deleted or sent. The menu stays open.
- ENV.R11 (:460-467) External link opens `env.url` in a new tab (`rel="noopener noreferrer"`); no URL validation.
- ENV.R12 (:332-342) `formatDate`: falsy -> `Never`; `en-GB` with day 2-digit, month short, year numeric, hour 2-digit, minute 2-digit.
- ENV.R13 (:120) The create modal is defined inside the page component (same remount caveat as USERS.R14).
- ENV.R14 (BC:1023-1030) The mapper defaults `type` to `'Production'`, `status` to `'Active'`, `companyName` to `''`.

### Storage
Writes (via `setActiveEnvironment` -> `updateEnvironmentState`, BC:22-52): `clientCompanyId` (value `"true"` through the admin page, ENV.R6) and `activeEnvironment` (JSON). Reads `registrationId` (ENV.C1). May write `clientCompanyId` via BCS.R8.

### Fakes or fallbacks in today's code
- Dev mock environments in the component catch (:50-71: Production default + Sandbox, with `isDefault`, `lastSync`, `version '23.0.13234.0'`) and in the service (BC:1036-1051).
- Dev create fallback: the component adds `{id:'env-<ts>', ..., status:'Active', isDefault:false, lastSync:now, version:'23.0.13234.0'}` (:162-175); the service returns the same shape with `...environmentData` (BC:1533-1539).
- Sync, Edit and Delete are visible UI that does nothing useful (R8-R10).
- The create form's `Environment Type` list (Production/Sandbox/Test/Development) differs from the Settings list (Production/Sandbox/Development).

---

## AUTHZ Authorization (Business Central connection) page (source: src/components/admin/AuthorizationManagement.js:1-886; BC:1141-1408)

### Calls
| id | method | path (with query) | headers sent | token | body | credentials |
|---|---|---|---|---|---|---|
| AUTHZ.C1 | GET | `/auth/status` or `/auth/status?registrationId=<encodeURIComponent(regId)>`, regId = `localStorage.registrationId` (BC:1144-1152) | BCS.R1; `Authorization`; `X-BC-Environment` iff the shared instance has an active env; `X-Registration-ID` <- localStorage | bc | none | include |
| AUTHZ.C2 | GET | `/auth/bc-auth-url` or `/auth/bc-auth-url?registrationId=<encodeURIComponent(regId)>` (BC:1202-1208) | as AUTHZ.C1 | bc | none | include |
| AUTHZ.C3 | POST | `/auth/refresh` (BC:1301) | as AUTHZ.C1 | bc | `{"registrationId": "<regId>"}` or `{}` if no regId (BC:1299) | include |
| AUTHZ.C4 | POST | `/bc/authorization/storeTokens` (BC:1371-1383) | as AUTHZ.C1 | bc | `{registrationId, accessToken, refreshToken, expiresInSeconds: expiresIn (default 3600), clientId, tenantId, environment (default 'Production')}` | include |

AUTHZ.C4 (`storeTokensInBusinessCentral`) has NO caller anywhere in `src` (checked by grep). It is documented as service contract only. Behaviour: `regId = param || tokenData.registrationId || localStorage.registrationId`; none -> `Error('Registration ID is required for storing authorization tokens')`; `expiresAt` is destructured but not sent; Dev returns mock success `{success:true, message:'Tokens stored in Business Central (mock) for registration ID: <regId>', registrationId}` without calling the API (BC:1336-1368).

Non-HTTP channels used by the page:

| id | channel | detail |
|---|---|---|
| AUTHZ.M1 | `window.addEventListener('message')` (:291-403) | Inbound `event.data = {type:'AUTH_SUCCESS', registrationId, timestamp, tokenReceived, tokenStoredInBC}` posted by `AuthCallbackPage.js:105-111` via `window.opener.postMessage(..., '*')`. No `event.origin` check. `AUTH_ERROR` messages (AuthCallbackPage.js:163) are ignored (logged "Ignoring message"). |
| AUTHZ.W1 | `window.open(finalAuthUrl, '_blank', 'width=800,height=600')` (:270) | popup to the Microsoft login |
| AUTHZ.U1 | `window.location.search` read on mount (:35-39) | query params written by the callback redirect (`/admin/authorization?status=...`): `status`, `tokenReceived`, `registrationId`, `timestamp`, `tokenStoredInBC`, `diagnostics`, `message` |

### Response fields read
| call id | field path | how it is used | guarded? |
|---|---|---|---|
| AUTHZ.C1 | whole response | `setAuthData(response)` | no (any shape accepted) |
| AUTHZ.C1 | `isAuthorized` | `!authData?.isAuthorized` -> "Not Authorized" view; else details view (:666) | yes `?.` |
| AUTHZ.C1 | `status` | badge via `getStatusBadge(status)`: falsy -> nothing; `status.toLowerCase()`: `active` green `Active`, `expired` red `Expired`, `warning` yellow `Warning`, else gray with the raw status (:478-507) | falsy-guarded; a non-string truthy `status` would throw |
| AUTHZ.C1 | `clientId`, `tenantId`, `environment`, `scope` | rendered as text (:689-701) | no (blank if absent) |
| AUTHZ.C1 | `issuedAt`, `expiresAt` | `formatDate`; falsy -> `Unknown` | yes |
| AUTHZ.C1 | `expiresAt` | days-remaining pill (R9) | yes |
| AUTHZ.C1 | `accessToken`, `refreshToken` | read-only input values (masked unless shown) and clipboard copy (:732, :767) | no (`value={undefined}` makes the input uncontrolled) |
| AUTHZ.C1 (mount) | `diagnostics?.hasAccessToken` | only when URL `status === 'success'` (:109) | yes `?.` |
| AUTHZ.C1 (after popup) | `diagnostics?.hasAccessToken`, `diagnostics?.hasRefreshToken`, `diagnostics?.tokenStoredInBC === true`, `isAuthorized === true`, `diagnostics` truthiness | decides the message branch (R14); `response` is dereferenced WITHOUT a null check (:328) | partial |
| AUTHZ.C2 | `authUrl` | popup URL; NOT null-checked in the service (`response.authUrl.includes`, BC:1231), so a missing `authUrl` throws a TypeError (R11) | no |
| AUTHZ.C2 | `registrationId` | stored to `localStorage.registrationId` (BC:1225-1228 and page :213-215) | yes (`if`) |
| AUTHZ.C2 | `pkceEnabled` | logging only in the service. The service returns only `{authUrl, registrationId}`, so the page's `response.pkceEnabled` (:281) is always `undefined` | yes |
| AUTHZ.C3 | whole response | replaces `authData` (`setAuthData(result)`) | no |

### States
- Loading: `isLoading && !authData` -> centered spinner (:576-582). Because `handleNewAuthorization` sets `isLoading` true, starting a new authorization while `authData` is null replaces the page with the spinner until the URL call resolves.
- Message box (single `error` state `{type, message}`; green with check icon for `type==='success'`, red with triangle icon for any other type, including `warning`) (:627-648).
- Not authorized (`!authData?.isAuthorized`): shield icon, `Not Authorized`, `The application is not currently authorized to access Business Central.`, button `Start Authorization` (opens the modal).
- Authorized: definition list `Client ID`, `Tenant ID`, `Environment`, `Scope`, `Issued At`, `Expires At` (+ pill), `Access Token`, `Refresh Token`.
- Header: `Authentication Management`; subtitle `Manage OAuth authentication for Business Central`; buttons `Refresh Token` (`Refreshing...` and disabled while busy) and `New Authorization`; card title `Authorization Status` / `Current OAuth authorization details`.
- New Authorization modal: title `New Authorization`; text `You are about to start a new authorization flow with Microsoft. This will allow the application to access Business Central on behalf of your users.`; info box `Administrator privileges required` / `You will need to log in with a Business Central admin account to authorize the application. Make sure you have the necessary permissions before proceeding.`; buttons `Start Authorization` / `Cancel`.
- Static how-to card, verbatim (:789-878). Title `How to Authorize Business Central`; subtitle `Guide to setting up and refreshing OAuth authorization`. Body, in order:
  - h4 `Authorization Process Overview`
  - p `To connect the portal to Business Central, you need to authorize the application using the OAuth 2.0 Authorization Code flow. This allows the portal to access Business Central API on behalf of your users.`
  - ordered list (5 steps): 1 `Click on the "New Authorization" button at the top of this page.` 2 `You will be redirected to Microsoft login page.` 3 `Sign in with your Business Central admin account.` 4 `Review and accept the permissions requested by the application.` 5 `After authorization, you will be redirected back to the portal.`
  - h4 `Token Management`; p `The application uses two types of tokens:`; bullets `Access Token: Used to make API calls to Business Central. Valid for 1 hour.` and `Refresh Token: Used to obtain new access tokens without requiring user interaction. Valid for 90 days.` (the labels `Access Token:` and `Refresh Token:` are bold)
  - p `The application automatically refreshes access tokens as needed. However, you should manually refresh the tokens if:`; bullets `You changed permissions or settings in Business Central.` / `The refresh token is about to expire (less than 7 days remaining).` / `You encounter authorization errors in the portal.`
  - yellow box: h5 `Important`; p `If the refresh token expires, you will need to perform a full authorization again. We recommend refreshing tokens at least once a month to prevent expiration.`
  - h4 `Additional Resources`; bullets: link `Microsoft Documentation on Business Central API Authentication` (external-link icon) -> `https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication` (`target=_blank rel="noopener noreferrer"`); link `QniConnect Authentication Guide` (file icon) -> `href="#"` (dead).
  - The step text says "redirected", while the real flow opens a popup (AUTHZ.W1).

Exact message strings (all rendered in the message box):

| key | type | text |
|---|---|---|
| M-url-ok | success | `Authorization completed and tokens stored successfully in Business Central!` |
| M-url-warn | warning | `Authorization completed and tokens stored in memory, but failed to store in Business Central. Some features may not work correctly.` |
| M-url-fail | error | `Authorization started but token exchange or storage failed. Please check server logs and try again.` |
| M-url-err | error | `<URL param message>` or `Authorization failed. Please try again.` |
| M-no-tokens | warning | `Authorization completed but tokens may not have been stored correctly. Please try again.` |
| M-load-fail | error | `Failed to load authorization data. Please try again.` |
| M-refresh-ok | success | `Token refreshed successfully!` |
| M-refresh-fail | error | `<error.message>` or `Failed to refresh token. Please try again.` |
| M-opened | success | `Authorization window opened. Please complete the login process in the new window.` |
| M-no-url | error | `Failed to get authorization URL from the server.` (page level; effectively unreachable, see R11) |
| M-pkce | error | `PKCE setup failed. Authorization URL is missing required parameters.` |
| M-blocked | error | `The authorization window was blocked by your browser. Please allow popups for this site.` |
| M-start-fail | error | `<error.message>` or `Failed to start authorization flow. Please try again.` |
| M-popup-done | success | `Authorization completed successfully! Refreshing data...` |
| M-popup-ok | success | same text as M-url-ok |
| M-popup-warn | warning | same text as M-url-warn |
| M-popup-nostore | error | `Authorization started but token storage failed. Please check server logs and try again.` |
| M-popup-unclear | warning | `Authorization status is unclear. Please check logs for errors and refresh the page.` |
| M-popup-refresh-fail | error | `Authorization may have failed. Unable to verify token status. Please refresh and try again.` |

### Rules and edge cases
- AUTHZ.R1 (:28-100) On mount (and when `bcService` or `navigate` identity changes) read `window.location.search`. If any of `status`, `tokenReceived`, `registrationId` is present: store the `registrationId` param to `localStorage.registrationId` (if present); read `tokenStoredInBC` and `diagnostics` (JSON; parse errors only logged; value used for logging only); choose a message: `status=success & tokenReceived=true & tokenStoredInBC=true` -> M-url-ok; `success & true & tokenStoredInBC=false` -> M-url-warn; `success & tokenReceived=false` -> M-url-fail; `status=error` -> M-url-err (param `message`); anything else (for example `tokenStoredInBC` missing with received true) -> no message. Then `history.replaceState({}, document.title, location.pathname)` strips the query string. `timestamp` is only logged.
- AUTHZ.R2 (:102-115) Then AUTHZ.C1 is fetched and stored. If `response` truthy AND `!response.diagnostics?.hasAccessToken` AND URL `status === 'success'`, replace any message with M-no-tokens (this overrides M-url-ok when diagnostics lack `hasAccessToken`).
- AUTHZ.R3 (:116-120) AUTHZ.C1 failure: M-load-fail (replaces any message from R1); `authData` stays null -> "Not Authorized" view. (Dev: mock `authData` set, :124-143.)
- AUTHZ.R4 (:154-179) Refresh Token: set `refreshing`, clear the message, call AUTHZ.C3; on success `authData := result` (REPLACES the whole object with the refresh response) and show M-refresh-ok; on failure M-refresh-fail with `error.message` (backend message / `API Error: <status>` / BCS.R2 text). The button is disabled while refreshing.
- AUTHZ.R5 Because of R4, a refresh response that lacks `isAuthorized: true` switches the page to "Not Authorized". The Dev mock refresh response (`{accessToken, refreshToken, expiresAt, issuedAt, registrationId}`) has no `isAuthorized`, `status`, `clientId`, and so on. The real backend refresh response shape is not visible in this repo (see report).
- AUTHZ.R6 (:182-218) Start Authorization (modal button): `isLoading` true, clear the message, call AUTHZ.C2. `authUrl` falsy -> throw M-no-url (see R11). Store `response.registrationId` to `localStorage.registrationId` if present.
- AUTHZ.R7 (:224-237) If `authUrl` does not contain `code_challenge=`: set M-pkce AND throw (same text); no popup.
- AUTHZ.R8 (:240, :255-263) If `authUrl` does not contain `prompt=consent`, append `&prompt=consent` (or `?prompt=consent` if there is no `?`).
- AUTHZ.R9 (:451-475; :713-717) Days remaining on this page: `Math.ceil((expiresAt - now)/86400000)`; falsy `expiresAt` -> `Unknown`. Text: `Unknown` | `Expired` (days <= 0) | `1 day remaining` | `<n> days remaining`. Pill colour: `<= 7` red, `<= 30` yellow, else green (for `Unknown` the comparisons are false, so green). The dashboard uses `floor` and different thresholds (ADM.DASH.R5-R6).
- AUTHZ.R10 (:270-275) Popup: `window.open(finalAuthUrl,'_blank','width=800,height=600')`; a falsy return -> M-blocked (thrown, shown by the R13 catch).
- AUTHZ.R11 (:199-204, :208-209; BC:1231-1235) A missing `authUrl` in the C2 response throws inside the SERVICE first (`response.authUrl.includes`): `TypeError: Cannot read properties of undefined (reading 'includes')`; that message is shown through M-start-fail's `error.message`, not M-no-url. Also `logger.log(\`... ${new URL(authUrl).hostname}\`)` builds its template string even when logging is off, so an `authUrl` that is not a valid absolute URL throws a `TypeError` (`Invalid URL`, browser wording) before the popup opens, and that message is shown.
- AUTHZ.R12 (:290-412) After the popup opens: add a `message` listener (removed only when AUTH_SUCCESS arrives; not removed on unmount; repeated attempts stack listeners), close the modal, show M-opened. On `event.data.type === 'AUTH_SUCCESS'` from ANY origin: store `event.data.registrationId` if present, remove that listener, show M-popup-done, call AUTHZ.C1 and `setAuthData(response)`, then the R14 branches.
- AUTHZ.R13 (:413-421) Catch: message `error.message || 'Failed to start authorization flow. Please try again.'`; `isLoading` false in `finally`. The modal stays open on failure (it is only closed on the success path at :406).
- AUTHZ.R14 (:327-396) Post-popup evaluation (`hasAccessToken = diagnostics?.hasAccessToken`, `tokenStoredInBC = diagnostics?.tokenStoredInBC === true`, `isAuthorized = response.isAuthorized === true`): (a) `isAuthorized && hasAccessToken && tokenStoredInBC` -> M-popup-ok; (b) `isAuthorized && hasAccessToken && !tokenStoredInBC` -> M-popup-warn; (c) else `diagnostics && !hasAccessToken` -> M-popup-nostore; (d) else M-popup-unclear. C1 failure, or a null response throwing inside `.then`, -> M-popup-refresh-fail.
- AUTHZ.R15 (:424-435) Copy: `navigator.clipboard.writeText(text)`; success -> `copySuccess = '<Access token|Refresh token> copied!'`, cleared after 2000 ms; failure -> `copySuccess = 'Failed to copy!'`, never cleared and never displayed (the spans only render when `copySuccess` equals one of the two success strings).
- AUTHZ.R16 (:729-745, :764-770) Show/Hide tokens: a single `showTokens` state toggles BOTH inputs between `password` and `text`; only the access-token row has the eye button.
- AUTHZ.R17 (:732, :767) The page reveals raw `accessToken` and `refreshToken` values returned by the backend to the admin's browser. The port must keep the masked default and the copy action.
- AUTHZ.R18 (:323) The post-popup AUTHZ.C1 reuses the shared service instance, so it carries `X-BC-Environment` if an environment was set (ENV.R6).
- AUTHZ.R19 (:437-448) `formatDate`: falsy -> `Unknown`; `en-GB` day 2-digit, month short, year numeric, hour 2-digit, minute 2-digit.

### Storage
Writes `registrationId` at: URL param (:53), the `getAuthorizationUrl` response (BC:1227 and page :215), the AUTH_SUCCESS message (:306). Reads `registrationId` in C1-C4 (BC:1144, 1198, 1296, 1343). May write `clientCompanyId` (BCS.R8). Reads `window.location.search` once on mount.

### Fakes or fallbacks in today's code
- Dev mock `authData` in the component (:125-141) and in the service (BC:1165-1178): `isAuthorized true`, `status 'active'`, truncated JWT strings, `scope 'https://api.businesscentral.dynamics.com/.default'`, `clientId 'demoClientID'`, `tenantId 'demotenantId'` / `'demoTenantID'`, `expiresAt` now+87d, `environment 'Production'`.
- Dev mock auth URL `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=mock-client-id&response_type=code&redirect_uri=http://localhost:3000/auth/callback&response_mode=query&scope=https://api.businesscentral.dynamics.com/.default&prompt=consent&state=<json {registrationId}>` (BC:1276) and mock registration id `00000000-0000-0000-0000-000000000001` (BC:1163, 1271, 1313). The mock URL lacks `code_challenge=`, so in Dev the flow hits M-pkce.
- Dev mock refresh `{accessToken:'new-mock-access-token', refreshToken:'new-mock-refresh-token', expiresAt: now+90d, issuedAt, registrationId}` (BC:1315-1321).
- Dev: `fetchThroughBackend` itself returns `{success:true, message:'Mock data for /auth/status'}` on any failure (BCS.R11), which makes the page show "Not Authorized".
- Dead link `href="#"` "QniConnect Authentication Guide" (:868). Token lifetime numbers (1 hour, 90 days) are static text.

---

## SET Admin settings (source: src/components/admin/AdminSettings.js:1-292)

### Calls
None. The API calls are commented out (`bcService.getAdminSettings()` :35, `saveAdminSettings` :65). The `bcService` prop and `useAuth().user` are unused.

### Response fields read
None.

### States
- Loading: `isLoading` (set true during the synchronous load) -> centered spinner (:97-103). Practically instantaneous.
- Message box (green with Save icon for `type==='success'`, otherwise red with Settings icon): success `Settings saved successfully`; error `Failed to save settings: <error.message>`.
- Header: `Admin Settings`; subtitle `Configure the admin portal settings and preferences`; card `General Settings`.
- Fields: `Default Environment` select (options `''` = `Select a default environment`, `Production`, `Sandbox`, `Development`) + helper `The default environment to select when users log in`; checkbox `Enable Admin Notifications` + `Receive notifications about user activities and system events`; checkbox `Auto-refresh Dashboard Data` + `Automatically refresh dashboard data at the specified interval`; number `Refresh Interval (minutes)` (min 1, max 60; shown only while `autoRefreshData`); checkbox `Enable Debug Mode` + `Show additional debugging information (development only)` (rendered only when `NODE_ENV === 'development'`).
- Buttons: `Reset`, `Save Settings` (`Saving...` with spinner, disabled while saving).

### Rules and edge cases
- SET.R1 (:10-16) Defaults: `{defaultEnvironment:'', enableNotifications:true, autoRefreshData:true, refreshInterval:15, debugMode:false}`.
- SET.R2 (:22-46) On mount (re-run when `bcService` changes): `localStorage.getItem('adminSettings')`; if present, `JSON.parse` and use it as BOTH `settings` and `savedSettings` (full replacement, no merge with defaults, so missing keys become `undefined`). A parse/read failure is only logged; defaults stay; `savedSettings` stays `{}`.
- SET.R3 (:49-56) Change handler: checkbox -> `checked`; number -> `parseInt(value, 10)` (an empty input gives `NaN`, serialised as `null`); else raw `value`. No range enforcement beyond the HTML `min=1 max=60` attributes.
- SET.R4 (:59-89) Save: `isSaving` true, clear message, `localStorage.setItem('adminSettings', JSON.stringify(settings))`, `savedSettings := settings`, message `Settings saved successfully`. A thrown storage error (for example quota) -> `Failed to save settings: <message>`. `isSaving` false in `finally`. No server call; nothing else in the app reads `adminSettings` (grep).
- SET.R5 (:158-161) `defaultEnvironment` options are the fixed list Production/Sandbox/Development; the value is stored but never consumed by login or the environment selector.
- SET.R6 (:84-87) Auto-clear of the message is buggy: in `finally`, the check is `message?.type === 'success'` on the CLOSURE `message` (the value from the render in which Save was clicked, i.e. the PREVIOUS message). So a 3000 ms `setTimeout(() => setMessage(null))` is armed only if the previous visible message was a success; on a first save the success message never auto-clears; on a second consecutive save the timer clears whichever message is showing 3 s later.
- SET.R7 (:92-95) Reset: `settings := savedSettings`, message cleared. If nothing has ever been saved, `savedSettings` is `{}`, so Reset blanks every field (controlled inputs go `undefined`, checkboxes unchecked, interval row hidden) instead of restoring the defaults.
- SET.R8 (:214, :232) Refresh Interval input shown only while `autoRefreshData` is truthy; Debug Mode only in Dev builds.
- SET.R9 The settings have no effect elsewhere: the dashboard has no auto-refresh, and nothing reads `enableNotifications`, `refreshInterval` or `debugMode` (checked by grep over `src`).

### Storage
`localStorage.adminSettings` (JSON of the settings object): read on mount, written on Save.

### Fakes or fallbacks in today's code
The whole page is a placeholder for an unbuilt API (comments at :34-37 and :64-67). Settings persist per browser only.
