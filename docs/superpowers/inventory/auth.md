# AUTH: sign-in, session and account setup

All paths are relative to `C:\dev\qniconnect front end\QniConnect-FrontEnd\src` (QC). Line numbers were read from the files as they stand today. `API` means the backend base URL (see AUTH.R5, there are two different defaults). `NODE_ENV === 'development'` is a build-time flag (`npm start`); production builds never take the "dev" branches.

IDs: `AUTH.C#` calls, `AUTH.M#` MSAL operations, `AUTH.S#` states, `AUTH.R#` rules. Rules are grouped under sub-headings but numbered in one sequence.

---

## AUTH Sign-in, session and account setup   (source: index.js; App.js; auth/authConfig.js; auth/AuthContext.js; components/auth/*; services/apiService.js; services/tenantVerificationService.js; services/businessCentralService.js; components/AdminRoutes.js; components/PortalSwitcher.js; guards in components/UserPortalLayout.js and components/admin/AdminLayout.js)

### Sign-in sequence (happy path, in order)

1. `index.js:12-18` create `PublicClientApplication(msalConfig)` and `await initialize()`. Nothing renders until this finishes.
2. `index.js:21-24` if MSAL cache already has accounts, `setActiveAccount(accounts[0])`.
3. `index.js:27-38` register the MSAL event callback (AUTH.R3). Render `<MsalProvider><App/></MsalProvider>` inside `React.StrictMode` (`index.js:41-48`).
4. `App.js:257-265` tree is `AuthProvider > Router > AppRoutes`.
5. `AuthContext.js:31-93` mount effect restores state from localStorage (AUTH.R20) and registers the `storage` and `authRequired` listeners.
6. `App.js:150-172` `AppRoutes` calls `instance.handleRedirectPromise()` (AUTH.R14).
7. User at `/login` (or `/`) clicks the sign-in button. `SignInButton.js:26-41`: window width > 768 gives `loginPopup(loginRequest)` (AUTH.M2), falling back to `loginRedirect` on popup failure; width <= 768 goes straight to `loginRedirect` (AUTH.M3).
8. MSAL now has an account. `AuthPages.js:17-23` (if on `/login`) calls `onLogin()` then `navigate('/portal')`. `App.js:199-208` also redirects `/login` to `/portal`.
9. `AuthContext.js:279-285` validation effect fires (AUTH.R21): silent token (AUTH.M1), write `currentUser` and `isAuthenticated`, then portal-user verify (AUTH.C1).
10. Verify result `exists` true: set `portalUserVerified`, flag `PendingFirstLogin`, merge user data and `isAdmin`, store `registrationId`, call session init (AUTH.C2), restore `activeEnvironment` from localStorage.
11. `/portal` renders inside `ProtectedRoute` (AUTH.R38). No `activeEnvironment` means redirect to `/environment-select`.
12. Environment selector (AUTH.C3, AUTH.C4, optionally AUTH.C5) then `updateActiveEnvironment` and `navigate('/portal')` (AUTH.R52-R60).
13. If `isPendingFirstLogin`, the first-login overlay is drawn on top of the portal until completed (AUTH.C6, AUTH.R65-R69).
14. Inactivity timer runs from the moment `user` is set (AUTH.R25).

Admin users are NOT sent to the admin portal on login. They land on `/portal` like everyone else and switch manually (AUTH.R42, AUTH.R43).

---

### Calls

Credentials column: `include` = `credentials: 'include'` is set. `default` = no `credentials` option, so the browser default (`same-origin`) applies and cross-origin cookies are NOT sent.

| id | method | path (with query) | headers sent (name ← where the value comes from) | token | body | credentials |
|---|---|---|---|---|---|---|
| AUTH.C1 | POST | `API/bc/portalUsers/verify` (source: `BusinessCentralService.verifyPortalUser` `businessCentralService.js:163-177` via `fetchThroughBackend` `:60-155`; caller `AuthContext.js:146-149`) | `Content-Type` ← literal `application/json`; `Accept` ← literal `application/json`; `Authorization` ← literal `Bearer ` + `response.accessToken` from `instance.acquireTokenSilent({...loginRequest, account})` (`AuthContext.js:116-119`, injected as `() => Promise.resolve(response.accessToken)` at `:146`); `X-Registration-ID` ← `localStorage.registrationId`, only if present (`businessCentralService.js:108-111`); `X-BC-Environment` ← NOT sent here (this instance never has `activeEnvironment`, see AUTH.R9) | login (the `scopes` option `businessCentralScopes.read` is passed but the injected callback ignores it, so the token is the login-scope one; `AuthContext.js:146`) | `JSON.stringify({ email, userId })` where `email = basicUserData.email`, `userId = basicUserData.oid` (`:172-175`) | include (`:97`) |
| AUTH.C2 | POST | `API/session/init` (source: `ApiService.initSession` `apiService.js:105-107`; caller `AuthContext.js:212-213`) | `Content-Type` ← literal `application/json` (`apiService.js:20`); no `Authorization`; no other headers | none (cookies only) | `JSON.stringify({ registrationId: userData.registrationId \|\| '', userEmail: enhancedUser.email \|\| '', employeeNo: '' })` (`AuthContext.js:205-209`) | include (`apiService.js:18`) |
| AUTH.C3 | POST | `API/bc/portalUsers/verify` (source: `TenantVerificationService.verifyUserAccess` `tenantVerificationService.js:18-92`; caller `EnvironmentSelector.js:55-58`) | `Content-Type` ← literal `application/json`; `Authorization` ← literal `Bearer ` + `getAccessToken(businessCentralScopes.read)` (`:28`, `:38`); no `X-Registration-ID`; no `X-BC-Environment` | bc (`https://api.businesscentral.dynamics.com/.default`) | `JSON.stringify({ email, userId })` with `email = user?.email`, `userId = user?.oid` | default (no cookies cross-origin) |
| AUTH.C4 | GET | `API/bc/environments` when no registrationId, else `API/bc/environments?$filter=` + `encodeURIComponent("registrationId eq '" + registrationId + "'")` (the apostrophes are inside the encoded value) (source: `TenantVerificationService.getAvailableEnvironments` `tenantVerificationService.js:138-218`; callers `EnvironmentSelector.js:79` and `:204`) | `Authorization` ← literal `Bearer ` + `getAccessToken(businessCentralScopes.read)` (`:141`, `:161`). Nothing else (no `Content-Type`, no `Accept`) | bc | none | default |
| AUTH.C5 | POST | `API/bc/client-tenant/companies` (inline `fetch`, `EnvironmentSelector.js:181-191`). Only when the chosen environment has no real `company_Id` AND both a token and `localStorage.registrationId` exist | `Content-Type` ← literal `application/json`; `Authorization` ← literal `Bearer ` + `await getAccessToken()` with NO scopes argument (`:164`), which resolves to `loginRequest.scopes` (`AuthContext.js:329`) | login (NOT bc; differs from AUTH.C3/C4/C6) | `JSON.stringify({ environmentName: selectedEnvironment.name, registrationId })` (`:187-190`) | default |
| AUTH.C6 | POST | `API/bc/portalUsers/{userId}/updateStatus`, `userId` = `user.id`, not URL-encoded (source: `BusinessCentralService.updateUserStatus` `businessCentralService.js:932-994`; caller `FirstLoginHandler.js:41`). The code comment at `:954` says "PATCH" but the method is POST | `Content-Type` ← literal `application/json`; `Authorization` ← literal `Bearer ` + `getAccessToken(businessCentralScopes.read)` (`:948`, `:962`) | bc | `JSON.stringify({ status: newStatus })`, `newStatus` = `'Active'` from the caller | default |
| AUTH.C7 | GET | `API/bc/environments` or `API/bc/environments?$filter=registrationId eq <encodeURIComponent(registrationId)>` (NO apostrophes, `businessCentralService.js:1008`) (source: `BusinessCentralService.getAvailableEnvironments` `:1000-1056`). Not called by the sign-in flow. Callers are admin: `admin/AdminDashboard.js:73`, `admin/EnvironmentManagement.js:34` | via `fetchThroughBackend`: `Content-Type`, `Accept` literals; `Authorization` ← `Bearer` + `getAccessToken(businessCentralScopes.read)`; `X-Registration-ID` ← `localStorage.registrationId`; `X-BC-Environment` ← `this.activeEnvironment.id` if set | bc | none | include |
| AUTH.C8 | POST | `API/bc/environments/activate` (source: `BusinessCentralService.setActiveEnvironment` `:1068-1134`, only when `updateBackend === true`, skipped in dev `:1085-1091`). Note `EnvironmentManagement.js:101` passes `true` as the 3rd argument (`companyId`), not as `updateBackend`, so this call is not made from there. Not called by the sign-in flow | `Content-Type` literal; `Authorization` ← `Bearer` + `getAccessToken(businessCentralScopes.read)` | bc | `JSON.stringify({ environmentId, environmentName, companyId: this.companyId })` | default |
| AUTH.C9 | POST | `API/bc/client-tenant/companies` (source: `BusinessCentralService.getClientTenantCompanies` `:1579-1636`). Not called by the sign-in flow. Caller `EmployeePortal.js:76` (portal inventory) | via `fetchThroughBackend` (same as AUTH.C7) | bc | `JSON.stringify({ environmentName, registrationId })`; `registrationId` falls back to `localStorage.registrationId`; throws `Environment name is required` / `Registration ID is required` if missing | include |
| AUTH.C10 | any | `fetchThroughBackend` generic contract (`businessCentralService.js:60-155`). Used by AUTH.C1, C7, C9 and by the portal/admin calls in other inventories | see AUTH.R7 to AUTH.R10 | bc or login depending on caller | caller | include |
| AUTH.C11 | POST | `API/auth/validate-token` (`ApiService.validateToken` `apiService.js:78-87`, `apiConfig.validateTokenEndpoint`). DEAD: no caller in QC | `Content-Type` literal | none | `{ token }` | include |
| AUTH.C12 | GET | `API/user` (`ApiService.getUserProfile` `apiService.js:90-102`). DEAD: no caller in QC | `Content-Type` literal; `Authorization` ← `Bearer ${token}` argument | caller-supplied | none | include |
| AUTH.C13 | GET | `API/session/verify` (`ApiService.verifySession` `apiService.js:110-112`). DEAD: no caller in QC | `Content-Type` literal | none | none | include |

`ApiService.get`/`post` (`apiService.js:61-75`) are generic wrappers. In the auth flow only AUTH.C2 uses them.

Note on AUTH.C2 reached from elsewhere: `getEmployeeProfile` also calls `initSession` with the employee number (`businessCentralService.js:376-382`). That belongs to the portal inventory.

### MSAL operations (network calls to Microsoft, not to the backend)

| id | operation | where | args |
|---|---|---|---|
| AUTH.M1 | `instance.acquireTokenSilent` | `AuthContext.js:116` | `{ scopes: ["User.Read","openid","profile","email"], account }` |
| AUTH.M2 | `instance.loginPopup(loginRequest)` | `SignInButton.js:28`; also landing page sign-in `RegistrationAndLanding.js:120` | `loginRequest` |
| AUTH.M3 | `instance.loginRedirect` | `SignInButton.js:36-39`; `RegistrationAndLanding.js:129` | `{ scopes: loginRequest.scopes, redirectUri: window.location.origin }` |
| AUTH.M4 | `instance.acquireTokenRedirect` | `AuthContext.js:75` (cross-tab), `:83` (authRequired), `:266` (interaction required on validate), `:323` (no account in `getAccessToken`), `:336` (interaction required in `getAccessToken`) | `loginRequest`, or `{ scopes: scopes \|\| loginRequest.scopes }` at `:336` |
| AUTH.M5 | `instance.logoutRedirect` | `AuthContext.js:434-438` | `{ account: currentAccount, logoutHint, postLogoutRedirectUri: window.location.origin }` |
| AUTH.M6 | `instance.logoutRedirect` | `SignOutButton.js:20` (component is unused, see AUTH.R70); `App.js:133` (`handleLogout`, dead, see AUTH.R15) | `{ postLogoutRedirectUri: window.location.origin }` |
| AUTH.M7 | `instance.handleRedirectPromise()` | `App.js:157` | none |
| AUTH.M8 | `instance.logoutPopup` | `RegistrationAndLanding.js:91-94`, run when `sessionStorage.manual_redirect === 'true'` (set by AUTH.R63) | `{ mainWindowRedirectUri: window.location.origin, onRedirectNavigate: () => false }` |
| AUTH.M9 | `instance.getActiveAccount()` / `getAllAccounts()` | `AuthContext.js:318`, `:385-387`; `index.js:21` | none |

---

### Response fields read

| call id | field path | how it is used | guarded? |
|---|---|---|---|
| AUTH.C1 | `exists` | truthy continues; falsy is the "not registered" path (AUTH.R23) (`AuthContext.js:155`) | `portalUserResult && portalUserResult.exists` (yes) |
| AUTH.C1 | `userData.status` | equals `'PendingFirstLogin'` sets `isPendingFirstLogin` (`:162`) | `userData &&` (yes) |
| AUTH.C1 | `userData` (whole) | if absent, the merge block, session init and `adminStatusVerified` are all skipped (`:171`) | yes |
| AUTH.C1 | `userData.id` | `enhancedUser.id = userData.id \|\| basicUserData.oid` (`:176`) | yes (`\|\|`) |
| AUTH.C1 | `userData.email` | `userData.email \|\| basicUserData.email` (`:177`) | yes |
| AUTH.C1 | `userData.name` | `userData.name \|\| basicUserData.name` (`:178`) | yes |
| AUTH.C1 | `userData.isAdmin` | `userData.isAdmin \|\| false`; this is the only source of admin status (`:179`) | yes |
| AUTH.C1 | every other `userData.*` field | spread into `enhancedUser` and stored in `currentUser` (without `isAdmin`) (`:172-191`) | n/a |
| AUTH.C1 | `userData.registrationId` | stored in `localStorage.registrationId` (`AuthContext.js:194-196` and `businessCentralService.js:184-189`, which uses `response?.userData?.registrationId`); sent in AUTH.C2 body | yes (`if`, `?.`) |
| AUTH.C1 | error `response.status` | `404` makes `verifyPortalUser` return `{ exists:false, message }` (`:196-201`) | `error.response &&` (yes) |
| AUTH.C1 | error `response.data.message` | message for the 404 return, fallback `'User is not registered in Business Central Portal'` (`:199`) | `?.` and `\|\|` (yes) |
| AUTH.C1 | error `response.data.message` / `.error.message` / `message` | user-visible text for `authError` (AUTH.R24) (`AuthContext.js:245-248`) | `?.` chain with literal fallback (yes) |
| AUTH.C1 | response header `X-Client-Company-ID` | stored to `localStorage.clientCompanyId` (AUTH.R11) | `if (clientCompanyId)` (yes) |
| AUTH.C2 | whole response | only logged (dev) (`:213-217`); errors swallowed (AUTH.R26) | n/a |
| AUTH.C3 | HTTP `status === 404` | return `{exists:false,isActive:false,message,requiresRedirect:true}` and `cleanupSession()` (`tenantVerificationService.js:44-57`) | n/a |
| AUTH.C3 | 404 body `message` | `errorData.message \|\| 'User not found in Business Central Portal'` (`:54`). `await response.json()` at `:46` is NOT guarded: a non-JSON 404 body throws into the outer catch (AUTH.R47) | partial |
| AUTH.C3 | non-OK body `shouldCleanup`, `message` | `shouldCleanup` true returns redirect result with `message \|\| "Failed to verify user access"` and cleans up; otherwise `throw new Error(error.message \|\| "Failed to verify user access")` (`:59-72`). `response.json()` at `:60` unguarded | partial |
| AUTH.C3 | OK body `exists`, `isActive` | `exists === false` or `isActive === false` sets `requiresRedirect = true` and cleans up (`:77-84`). Note: absent (undefined) values do NOT trigger this | strict `=== false` |
| AUTH.C3 | OK body `userData.registrationId` | stored to `localStorage.registrationId` and `this.registrationId` (`:87-91`) | yes (`&&` chain) |
| AUTH.C3 | result `requiresRedirect`, `exists`, `isActive`, `message` | `EnvironmentSelector.js:65-70`: any of `requiresRedirect`, `!exists`, `!isActive` shows access denied with `message \|\| "Your account is not active or not found."` | `\|\|` (yes) |
| AUTH.C4 | `value` or `environments` | `data.value \|\| data.environments \|\| []` (`:174`) | yes |
| AUTH.C4 | per item `id` / `environmentId` | `env.id \|\| env.environmentId` (`:178`) | yes |
| AUTH.C4 | per item `environmentName` / `name` | `env.environmentName \|\| env.name` (`:179`) | yes |
| AUTH.C4 | per item `environmentType` / `type` | `\|\| 'Production'` (`:180`) | yes |
| AUTH.C4 | per item `environmentUrl` / `url` | `\|\| ''` (`:181`) | yes |
| AUTH.C4 | per item `status` | `\|\| 'Active'` (`:182`) | yes |
| AUTH.C4 | per item `companyName` / `company_Name` | `\|\| ''` (`:183`) | yes |
| AUTH.C4 | per item `company_Id` / `companyId` | `\|\| ''` (`:184`) | yes |
| AUTH.C4 | error body `message` | `throw new Error(error.message \|\| "Failed to retrieve environments")`; but see AUTH.R47: this error is swallowed and turned into `{environments: []}` | `await response.json()` at `:166` unguarded |
| AUTH.C5 | `response.ok` | OK path reads body; non-OK path reads error body (`EnvironmentSelector.js:193`, `:228-288`) | n/a |
| AUTH.C5 | `updateResult.success` | truthy triggers a refresh of environments via AUTH.C4 (`:199-200`) | `companiesData.updateResult &&` (yes) |
| AUTH.C5 | error body `message`, `error`, `responseData.error.message` | substring tests for auth-ish failure (AUTH.R57) (`:239-241`) | `\|\| ''`, `\|\| {}`, `?.` (yes) |
| AUTH.C6 | `success`, `message` | `!result \|\| !result.success` throws `Error(result?.message \|\| 'Failed to update user status')` (`FirstLoginHandler.js:45-46`) | yes |
| AUTH.C6 | non-OK body `message` | `throw { message: result.message \|\| "API Error: <status>", status, data }`; `await response.json()` unguarded (`businessCentralService.js:969-976`) | partial |
| AUTH.C9 | `value` | `response.value \|\| response \|\| []` (`:1604`) | yes |

---

### States

| id | screen | state | exact text and behaviour |
|---|---|---|---|
| AUTH.S1 | `AppRoutes` (`App.js:175-182`) | loading (`AuthContext.isLoading`) | full-screen spinner plus `Authenticating...` |
| AUTH.S2 | `AppRoutes` (`App.js:185-191`) | error (`authError` truthy) | only two routes: `/auth-error` shows `AuthErrorPage message={authError}`, `*` navigates to `/auth-error`. Every other route is hidden |
| AUTH.S3 | `ProtectedRoute` (`App.js:51-57`) | loading (`isLoading` or MSAL `inProgress !== None`) | spinner only, no text |
| AUTH.S4 | `ProtectedRoute` (`App.js:60-62`) | error | `AuthErrorPage message={authError}` inline. Unreachable in practice because S2 intercepts first |
| AUTH.S5 | `AuthErrorPage` | error | title `Authentication Error`; body `message \|\| 'You do not have access to this application.'`; button `Return to Home` (AUTH.R62) |
| AUTH.S6 | `AuthPages` (`AuthPages.js:27-34`) | redirecting | spinner plus `Redirecting to dashboard...` (when MSAL has an account and path is `/login`) |
| AUTH.S7 | `AuthPages` (`AuthPages.js:36-70`) | empty (signed out) | heading `Sign in to QniConnect`; sub `Access your payslips, profile, and employee documents`; contains `SignInButton`; footer `Need help? Contact` link text `support@qnipay.com` pointing to `https://qnipay.com/legal/` |
| AUTH.S8 | `SignInButton` | idle | button text `Sign in with Microsoft 365` |
| AUTH.S9 | `SignInButton` | loading | disabled, spinner plus `Signing in...`. `isLoading` is set true on click and is only reset to false in the final catch; after a successful popup it is never reset (`SignInButton.js:14-45`) |
| AUTH.S10 | `SignInButton` | error | `Login failed. Please try again.` (red text under button) |
| AUTH.S11 | `EnvironmentSelector` | loading | card text `Loading your environments…` (with the Unicode ellipsis) |
| AUTH.S12 | `EnvironmentSelector` | error, `bcAccessDenied` false | heading `Sign In Required`; body `Your session could not be verified. Please sign in again to continue.`; button `Sign In` goes to `window.location.href = '/'` (`:426-448`) |
| AUTH.S13 | `EnvironmentSelector` | error, `bcAccessDenied` true | heading `Access Not Provisioned`; body `Your account is authenticated but has not been granted access to QniConnect. Contact your administrator to request access.`; button `Sign Out` calls `logout()` (falls back to `window.location.href = '/'` if `logout` is falsy). The `error` string itself (e.g. `Your account is not active or not found.`, `No environments found for your account. Please contact your administrator.`, `Authentication required. Please sign in again.`, `Please select an environment to continue`) is NOT displayed in the card; only the two canned bodies above are shown. Debug section shows it only in dev |
| AUTH.S14 | `EnvironmentSelector` | success | label `Environment Select`; heading `Choose your workspace`; sub `Select the Business Central environment you want to access.`; one card per environment (name, `type`, ` · companyName`, badge `Ready` when `!hasCompanyId`, check icon when selected); empty list shows `No environments available`; buttons `← Home` and `Continue to Portal →` (disabled when nothing selected or loading); footer `© <current year> QniPay` |
| AUTH.S15 | `EnvironmentSelector` | partial (continue clicked) | button shows spinner plus `Processing…` (Unicode ellipsis); whole page `isLoading` is true meanwhile, which swaps the page to S11 (the loading card), see AUTH.R54 |
| AUTH.S16 | `FirstLoginHandler` | overlay | title `Welcome!`; text `This is your first login to the QniConnect Employee Portal. We need to set up a few things before you can access your information.`; `By continuing, you agree to our terms of use and privacy policy.`; button `Continue to Portal`; while processing: disabled, spinner plus `Processing...` |
| AUTH.S17 | `FirstLoginHandler` | error | `There was an error updating your account status. Please try again or contact support.` (red box, above button). Overlay stays |
| AUTH.S18 | `AuthCallbackPage` | processing | title `Processing Authorization`; message `Processing authorization response...` |
| AUTH.S19 | `AuthCallbackPage` | success | title `Authorization Successful`; message `Authorization successful! Redirecting...` |
| AUTH.S20 | `AuthCallbackPage` | error | title `Authorization Failed`; button `Return to Authorization Page` (goes to `/admin/authorization`); messages: `Authorization failed: <error_description or error>`, `No authorization code was provided in the callback.`, `Authentication flow configuration error. The authorization code was sent to the frontend instead of the backend. Please check your Azure AD app registration.`, `Error processing authorization: <error.message>` |
| AUTH.S21 | `AdminLayout` (`AdminLayout.js:66-72`) | loading (`!user`) | spinner only |
| AUTH.S22 | `ErrorComponent` (`App.js:23-38`) | error | title `Authentication Error`; `{error.message}`; button `Return to Home`. Defined but never rendered (imported helpers `ErrorComponent`, `ErrorMessage`, `MsalAuthenticationTemplate`, `InteractionType`, `loginRequest`, `useNavigate` result `navigate` are unused in `App.js`) |

---

### Rules and edge cases

#### Bootstrap and configuration

- **AUTH.R1** MSAL config (`authConfig.js:4-28`): `clientId = process.env.REACT_APP_CLIENT_ID || 'demoClientID'`; `authority = 'https://login.microsoftonline.com/common'`; `redirectUri` and `postLogoutRedirectUri = window.location.origin`; `navigateToLoginRequestUrl: true`; `cache.cacheLocation: "sessionStorage"`; `storeAuthStateInCookie: true`; logger `logLevel: 1`, `piiLoggingEnabled: false`, callback drops any message with `containsPii` and otherwise forwards to `logger.log`.
- **AUTH.R2** `loginRequest.scopes = ["User.Read", "openid", "profile", "email"]` (`authConfig.js:31-33`). `businessCentralScopes.read`, `.readWrite`, `.api` are all `["https://api.businesscentral.dynamics.com/.default"]` (`:36-41`). `apiConfig.bcEndpoint` (`/bc`) is unused.
- **AUTH.R3** MSAL event callback (`index.js:27-38`): `LOGIN_SUCCESS` with a payload runs `setActiveAccount(payload.account)` and `localStorage.setItem('isAuthenticated','true')`; `LOGOUT_SUCCESS` runs `localStorage.removeItem('isAuthenticated')`.
- **AUTH.R4** If `msalInstance.initialize()` throws, the error is only logged (`index.js:50-52`) and the app never renders (blank page).
- **AUTH.R5** Backend base URL has THREE spellings. `ApiService`, `TenantVerificationService`, `apiConfig` and `EnvironmentSelector.js:172` default to `https://demo-backend-demo.uksouth-01.azurewebsites.net/api`. `BusinessCentralService` (`businessCentralService.js:10`) defaults to `https://demobackend-backend-demo.uksouth-01.azurewebsites.net/api` (different host name). All honour `process.env.REACT_APP_API_BASE_URL` first. The port must read one env var and decide whether the differing defaults matter (they only matter when the env var is unset). `REACT_APP_BC_API_BASE_URL` populates `BusinessCentralService.apiBaseUrl` (`:8-9`) which no auth call uses.
- **AUTH.R6** `logger` only prints when `REACT_APP_DEBUG === 'true'` (`utils/logger.js:5-11`).

#### `fetchThroughBackend` contract (`businessCentralService.js:60-155`)

- **AUTH.R7** A token is mandatory. If `this.getAccessToken` and `options.scopes` are both truthy, it calls `getAccessToken(options.scopes)`; the result must be truthy and not `'Not Readable'` or `'mock-token-for-development'`; otherwise (or on any throw) it throws `Error('Authentication failed. Please log in again.')`. If either is missing it throws `Error('Authentication service not available. Please log in again.')`. (`:68-82`). So a call without `scopes` never reaches the network.
- **AUTH.R8** Default headers `Content-Type: application/json`, `Accept: application/json`; `options.headers` are merged over them and then deleted from `options` (`:63-65`, `:84-89`). `options.scopes` stays in the options object passed to `fetch` (harmless).
- **AUTH.R9** `X-BC-Environment` ← `this.activeEnvironment.id` is added only when the service instance has an `activeEnvironment`, which only happens after `updateEnvironmentState` / `setActiveEnvironment` was called on THAT instance (`:100-105`). The instance created at `AuthContext.js:146` never has one.
- **AUTH.R10** `X-Registration-ID` ← `localStorage.registrationId` is added if present and not already in headers (`:107-111`). `credentials: 'include'` is always set (`:97`).
- **AUTH.R11** `X-Client-Company-ID` response header capture: after every response (OK or not, before the OK check) `response.headers.get('X-Client-Company-ID')`; if non-empty, `localStorage.setItem('clientCompanyId', value)` (`:122-129`). The browser only exposes it cross-origin if the backend sends `Access-Control-Expose-Headers`; that is a backend concern the port must keep working.
- **AUTH.R12** Non-OK: parse JSON body (`.catch(() => ({}))`), message = `errorData.message || errorData.error || 'API Error: <status>'`, throw plain object `{ message, response: { status, data } }` (`:132-142`). This path does NOT dispatch `authRequired` on 401 (only `ApiService` does, AUTH.R31).
- **AUTH.R13** OK: returns `response.json()` unguarded (an empty body throws, and in dev gets replaced by mock data, see Fakes).

#### Route-level sign-in handling (`App.js`)

- **AUTH.R14** On mount of `AppRoutes` (`[instance]`) `handleRedirectPromise()` runs; a truthy result sets `localAuthState` true and `localStorage.isAuthenticated = 'true'`; errors only logged (`App.js:150-172`).
- **AUTH.R15** `localAuthState` starts false; it becomes true when `localStorage.isAuthenticated === 'true'` or `accounts.length > 0` (`:139-147`), on `handleLogin` (`:119-123`), or after a redirect result. `handleLogout` (`:126-136`: sets false, removes `isAuthenticated` and `activeEnvironment`, then `logoutRedirect`) is passed to `EmployeePortal` as `onLogout` but `EmployeePortal` and `UserPortalLayout` never use that prop, so it is dead. Real logout is `AuthContext.logout` (AUTH.R27).
- **AUTH.R16** `DebugPanel` renders only when `process.env.NODE_ENV === 'development'` (`:252`); its body is commented out, it renders nothing useful.
- **AUTH.R17** `AuthPages` receives `pageType="signin"` which it ignores. It calls `onLogin()` (which sets `localAuthState` and `isAuthenticated='true'`) and `navigate('/portal')` when MSAL has an account and `window.location.pathname === '/login'` (`AuthPages.js:17-23`).
- **AUTH.R18** `SignInButton` (`SignInButton.js:14-45`): on click clears the error and sets loading. If `window.innerWidth > 768` tries `loginPopup(loginRequest)`; success returns (no navigation: `AuthContext` and `AuthPages` handle routing); popup failure is logged and falls through to `loginRedirect({...loginRequest, redirectUri: window.location.origin})`. Width `<= 768` skips the popup. It must NOT clear localStorage (other tabs treat `isAuthenticated` removal as logout, see AUTH.R30). Failure of `loginRedirect` shows S10.
- **AUTH.R19** The landing page has a second sign-in entry (`RegistrationAndLanding.js:113-135`, public inventory): it first removes `clientCompanies`, `clientCompanyId`, `clientCompanyName`, `employeeData`, `employeeId`, `employeeNo` from localStorage, uses the same popup then `navigate('/portal')` / redirect logic, and on failure shows `Sign in failed. Please try again.` (note: different wording from S10).

#### AuthContext state, restore and validation

- **AUTH.R20** State restore on mount (`AuthContext.js:31-65`). Only if `localStorage.isAuthenticated === 'true'` AND `currentUser` exists: parse `currentUser`, REMOVE `isAdmin` from it, `setUser`, `tokenValidated = true`, `portalUserVerified = true`; if `activeEnvironment` is in storage `setActiveEnvironment(JSON.parse(...))`. On any exception remove `currentUser` only (not `isAuthenticated`). Always end with `authInitialized = true` and `isLoading = false`. `isLoading` starts true. The restored user has no `isAdmin`, so admin rights only come from a fresh AUTH.C1.
- **AUTH.R21** Validation trigger (`:279-285`): run `validateTokenWithBackend` when `account && authInitialized && (!user || user.oid !== account.idTokenClaims?.oid || !adminStatusVerified)`. Effect deps `[account, instance, user, authInitialized, adminStatusVerified]`. `account = useAccount(accounts[0] || {})`.
- **AUTH.R22** Validation steps (`:96-277`): no account means (if not yet initialized) `isLoading=false` and stop; a `validationInProgress` ref blocks concurrent runs; `isLoading = true`; `acquireTokenSilent({...loginRequest, account})`; build `basicUserData = { oid: account.idTokenClaims?.oid || account.localAccountId || 'unknown-id', email: account.username || 'unknown@example.com', name: account.name || 'Unknown User' }`; write `localStorage.currentUser = JSON.stringify(basicUserData)` and `isAuthenticated = 'true'` BEFORE the backend check; `setUser(basicUserData)`, `tokenValidated = true`; then AUTH.C1. `finally`: `isLoading = false`, ref released.
- **AUTH.R23** Not registered (`exists` falsy; includes the 404 conversion in `verifyPortalUser`) (`:229-240`): `authError = 'Your account is not registered in QniConnect. Please contact your administrator.'`; `localStorage.removeItem('isAuthenticated')` (only that key; `currentUser` stays); `setTimeout(() => logout(), 15000)`. The timer is never cleared. Meanwhile S2 shows `AuthErrorPage` for 15 seconds. The 15 s sign-out runs `logout()` (AUTH.R27) which ends in a Microsoft logout redirect.
- **AUTH.R24** Verify call threw (non-404) (`:241-252`): `authError = bcError.response?.data?.message || bcError.response?.data?.error?.message || bcError.message || 'Failed to verify your account in Business Central'`; remove `isAuthenticated`; NO auto-logout (user must press `Return to Home`). Possible texts include `Authentication failed. Please log in again.` and `Authentication service not available. Please log in again.` (AUTH.R7) and any backend `message`.
- **AUTH.R25** Inactivity (`:287-308`): when `user` is truthy, register window listeners for `mousemove`, `keydown`, `click`, `scroll`, `touchstart` (names verbatim, in that order); each event resets a `setTimeout` of `5 * 60 * 1000` ms (300000) and the timer also starts immediately; on expiry call `logout()`. The listeners and timer are torn down and rebuilt whenever the `user` object changes (effect dep `[user]`), and cleaned up on unmount. Events are not throttled. Applies to admin and non-admin and to every route.
- **AUTH.R26** Session init (AUTH.C2) runs only when `exists` is truthy AND `userData` is present, after storing `currentUser` and `registrationId`. Any failure is caught and logged; sign-in continues. A 401 from it dispatches `authRequired` (AUTH.R31) via `ApiService`.
- **AUTH.R26a** Outer catches: failure inside the part that wraps AUTH.C1 and the localStorage writes sets `authError = 'Authentication validation failed. Please try again.'` and removes `isAuthenticated` (`:253-260`). Failure of `acquireTokenSilent`: `InteractionRequiredAuthError` triggers `acquireTokenRedirect(loginRequest)` (no error shown); any other error removes `isAuthenticated` and sets `authError = 'Authentication error. Please try again.'` (`:261-272`).
- **AUTH.R26b** Restoring `activeEnvironment` after verify (`:224-228`) runs `JSON.parse` inside the verify `try`, so malformed stored JSON lands in the AUTH.R24 handler (message is the parse error text) and clears `isAuthenticated`.
- **AUTH.R26c** `isAuthenticated` exposed by `useAuth()` (`:446-447`) is `(msalIsAuthenticated && tokenValidated && portalUserVerified) || (localStorage.getItem('isAuthenticated') === 'true' && user)`. It can therefore be a `user` object, `null` or `false`; treat as truthy/falsy only. It is recomputed each render and reads localStorage each render.
- **AUTH.R26d** Any code path that removes `localStorage.isAuthenticated` (R23, R24, R26a, `logout`, EnvironmentSelector `Return to Home`, `cleanupSession`, `AuthErrorPage`) fires the `storage` event in every OTHER tab, which then redirects to Microsoft login (AUTH.R30). This is a side effect of error paths, not only of logout.

#### Events

- **AUTH.R30** Cross-tab `storage` listener (`:72-77`, `:86`): `if (e.key === 'isAuthenticated' && e.newValue === null)` then `instance.acquireTokenRedirect(loginRequest)` (message logged: `Sign-out detected from another tab — redirecting to login`). `localStorage.clear()` (key null) does not match. Only fires in tabs other than the one that changed storage. Added on mount, removed on unmount, re-registered if `instance` changes.
- **AUTH.R31** `authRequired` event (`:81-84`, `:87`; dispatched at `apiService.js:34-36` as `window.dispatchEvent(new CustomEvent('authRequired'))`): on any `ApiService` response with status 401, dispatch first, then still parse and throw the error. The `AuthContext` listener calls `instance.acquireTokenRedirect(loginRequest)`. Only `ApiService` calls dispatch it (in the auth flow that is AUTH.C2; elsewhere `ApiService` has no callers except `businessCentralService.js:382`). `fetchThroughBackend` and the plain `fetch` calls do not.
- **AUTH.R32** `ApiService.fetchWithCredentials` (`apiService.js:11-58`): URL is the endpoint if it starts with `http`, else `baseUrl + endpoint`; options get `credentials: 'include'` and headers `{'Content-Type':'application/json', ...options.headers}` (caller headers win); non-OK: `errorData = await response.json().catch(() => ({}))`, message `errorData.message || errorData.error || 'API Error: <status>'`, throws `{ message, response: { status, data } }`; OK: `await response.json()` and if that throws returns `{ success: true, message: 'Operation completed successfully' }`.

#### Token helper and environment state

- **AUTH.R33** `getAccessToken(scopes)` (`:311-343`): throws `MSAL instance not available` if no instance; account = `useAccount` result or `instance.getAllAccounts()[0]`; if none, `acquireTokenRedirect(loginRequest)` and RETURN `null`; else `acquireTokenSilent({ scopes: scopes || loginRequest.scopes, account })` and return `accessToken`; on `InteractionRequiredAuthError` call `acquireTokenRedirect({ scopes: scopes || loginRequest.scopes })`; the error is rethrown in all failure cases.
- **AUTH.R34** `updateActiveEnvironment(environment)` (`:346-357`): requires `environment && environment.id`, else logs `Invalid environment provided:` and returns without change; sets state and `localStorage.activeEnvironment = JSON.stringify(environment)`. `clearActiveEnvironment()` (`:360-366`) sets state null and removes the key.
- **AUTH.R35** `updateFirstLoginStatus()` (`:369-374`): if `isPendingFirstLogin`, set it false. No API call, nothing stored (the comment says a BC update "could" be added).
- **AUTH.R36** `useAuth()` throws `useAuth must be used within an AuthProvider` outside the provider (`:469-471`). Context value members: `user`, `isAuthenticated`, `isLoading`, `authError`, `isPendingFirstLogin`, `updateFirstLoginStatus`, `getAccessToken`, `activeEnvironment`, `updateActiveEnvironment`, `clearActiveEnvironment`, `logout` (`:444-457`). `ProtectedRoute` also reads `authError` etc.; `tokenValidated`, `portalUserVerified` are internal.
- **AUTH.R37** `BusinessCentralService.updateEnvironmentState(id, name, companyId=null, company_Id=null)` (`:22-52`): sets `this.activeEnvironment = {id, name}`; `company_Id` wins over `companyId`; when one is truthy sets `this.companyId` and `localStorage.clientCompanyId`; always writes `localStorage.activeEnvironment = {id, name, companyId: this.companyId, company_Id: this.companyId}` (this overwrites whatever shape `AuthContext` stored, dropping `type`, `url`, `companyName`; callers are admin pages `AdminDashboard.js:49`, `EnvironmentManagement.js:101`). `setActiveEnvironment(idOrObject, name, companyId, updateBackend=false)` (`:1068-1134`): if first arg is an object it takes `.id`, `.name`, `.company_Id`; calls `updateEnvironmentState`; calls AUTH.C8 only if `updateBackend`; failures of AUTH.C8 are logged and ignored; always returns `{ success: true, environment: {id, name, companyId} }`.

#### Route guards in `App.js` (who goes where)

Evaluation order inside `AppRoutes`: (1) `authContextLoading` shows S1; (2) `authError` shows S2 and nothing else is routable; (3) the route table below.

| path | element / result |
|---|---|
| `/` | `RegistrationAndLanding` (public, no guard) |
| `/login` | if `(localAuthState \|\| msalIsAuthenticated) && accounts.length > 0` then `<Navigate to="/portal">`, else `AuthPages` (`App.js:199-208`) |
| `/forgot-password` | `<Navigate to="/login">` |
| `/register` | `EnhancedRegistration` (public inventory) |
| `/pricing` | `SiriusConnect365Licenses` (public inventory) |
| `/auth-error` | `AuthErrorPage message={authError}`; when `authError` is null the message is undefined so the default text of S5 shows |
| `/auth/callback` | `AuthCallbackPage` (unguarded) |
| `/environment-select` | `!msalIsAuthenticated && !localAuthState` then `<Navigate to="/login">`, else `EnvironmentSelector`. NOT wrapped in `ProtectedRoute`, so no first-login overlay and no environment check here |
| `/portal/*` | `!msalIsAuthenticated && !localAuthState` then `<Navigate to="/login">`, else `ProtectedRoute > EmployeePortal` |
| `/admin/*` | same outer test, then `ProtectedRoute > AdminRoutes` |
| anything else | no route matches, nothing renders (no catch-all) |

- **AUTH.R38** `ProtectedRoute` (`App.js:41-96`) order: (a) `isLoading || inProgress !== InteractionStatus.None` shows spinner; (b) `authError` shows `AuthErrorPage`; (c) `!isAuthenticated` (AuthContext's value) then `<Navigate to="/login">`; (d) `!activeEnvironment && window.location.pathname !== '/environment-select'` then `<Navigate to="/environment-select">` (uses `window.location`, not the router location); (e) admin redirect: `isAdmin && pathname not startsWith '/admin' && not startsWith '/portal' && pathname !== '/environment-select' && !isPendingFirstLogin` then `<Navigate to="/admin/dashboard">`. Because `ProtectedRoute` is only mounted under `/portal/*` and `/admin/*`, branch (e) cannot trigger today. The block at `:75-77` (admin on `/portal`) is an empty `if` and does nothing; (f) render `children` plus `<FirstLoginHandler />` when `isPendingFirstLogin`.
- **AUTH.R39** Net effect for a signed-in user with no `activeEnvironment`: any `/portal/*` or `/admin/*` URL goes to `/environment-select`, including admins.
- **AUTH.R40** Net effect for a signed-in user: `/login` goes to `/portal` (only if `accounts.length > 0`); `/portal` index goes to `/portal/dashboard` (`EmployeePortal.js:690`); unknown `/portal/*` goes to `/portal/dashboard` (`:694`).
- **AUTH.R41** `AdminRoutes` guard (`AdminRoutes.js:13-31`): `!isAuthenticated` then `/login`; `!isAdmin` (`user?.isAdmin === true`) then `<Navigate to="/portal">`; else render admin routes inside `AdminLayout`: index and `*` go to `/admin/dashboard`; `dashboard`, `users`, `environments`, `authorization`, `settings` are the pages (each gets `bcService = new BusinessCentralService(getAccessToken)` memoised once with `[]`). A non-admin typing an admin URL ends at `/portal`.
- **AUTH.R41a** Because the restored user has no `isAdmin` (AUTH.R20), `AdminRoutes` sees a non-admin until AUTH.C1 returns; a hard refresh on an `/admin/*` URL may therefore bounce to `/portal` before admin status is known. Whether it does depends on render timing between the restore and the validation effect; the port must decide the intended behaviour and test it (see report, ambiguities).
- **AUTH.R42** `PortalSwitcher` (`PortalSwitcher.js`): prop `currentPortal` default `'admin'`; button label `Admin Portal` or `User Portal`; menu items `Switch to Admin Portal` (shown when `currentPortal !== 'admin'`, navigates `/admin/dashboard`) and `Switch to User Portal` (shown when `currentPortal !== 'user'`, navigates `/portal`). It has no guard itself; only rendered when `isAdmin` in `UserPortalLayout.js:347-349` and always in `AdminLayout.js:289`.
- **AUTH.R43** `UserPortalLayout` has no redirect guard. Its auth-related behaviour: user menu shows `Switch to Admin Portal` (navigates `/admin/dashboard`) only when `isAdmin` (`:301-311`); `Sign out` calls `logout` (`:314`); environment pill shows `activeEnvironment.name || 'Unknown'` with colour by `type` lowercased `production` (green) / `sandbox` (blue) / other (grey) (`:190-203`); `bcService` is rebuilt when `activeEnvironment` changes (`:41-44`).
- **AUTH.R44** `AdminLayout` guard: only `!user` shows a spinner (S21). It does not check `isAdmin` itself (that is `AdminRoutes`). User menu: `Switch to User Portal` (navigate `/portal`), `Settings` link `/admin/settings`, `Sign out` calls `logout` (`AdminLayout.js:221-253`). Environment pill by `activeEnvironment.type` exact-case compare `'Production'` / `'Sandbox'` at `:121-123` and lowercase compare at `:193-195` (two different pills).
- **AUTH.R45** Admin notification banner in `UserPortalLayout` (`:46-56`, `:84-89`, `:358-395`): when `isAdmin` and `localStorage.adminAuthIncomplete === 'true'` show a yellow banner titled `Business Central Environment Setup Incomplete` with text `The environment "<adminAuthEnvironment>" requires additional authorization setup in Business Central. Missing refresh token for API access. Please go to Admin Portal to complete the setup.`; buttons `Go to Admin Portal` (navigate `/admin/authorization`) and `Dismiss` (removes `adminAuthIncomplete`, `adminAuthEnvironment`, `adminAuthErrorCode`). The keys are written by AUTH.R57.

#### Logout (`AuthContext.js:377-442`), full cleanup list

- **AUTH.R46** In order: (1) capture `currentAccount = instance.getActiveAccount() || instance.getAllAccounts()[0]` (null if no instance) and `logoutHint = idTokenClaims.login_hint || idTokenClaims.sid || username` BEFORE any cleanup; (2) state: `user = null`, `tokenValidated = false`, `portalUserVerified = false`, `isPendingFirstLogin = false`, `adminStatusVerified = false`, `validationInProgress.current = false`, `clearActiveEnvironment()` (state null and removes `activeEnvironment`); (3) localStorage `removeItem` for exactly: `isAuthenticated`, `activeEnvironment`, `registrationId`, `currentUser`, `clientCompanies`, `clientCompanyId`, `clientCompanyName`, `employeeData`, `employeeId`, `employeeNo`; (4) sweep: remove every localStorage key where `key.startsWith('bc_') || key.includes('auth') || key.includes('user') || key.includes('token')` (case-sensitive, lower-case substrings); (5) cookies: for each cookie in `document.cookie`, if its name includes `msal`, `auth` or `session`, set `name=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;` (cannot remove HttpOnly cookies or cookies set for another path/domain); (6) if `instance` exists `instance.logoutRedirect({ account: currentAccount, logoutHint, postLogoutRedirectUri: window.location.origin })`, else `window.location.href = '/'`. `sessionStorage` is deliberately NOT touched (MSAL does it). No backend sign-out call is made.
- **AUTH.R46a** Left in storage by logout (not matched): `portalTheme`, `adminAuthIncomplete`, `adminAuthEnvironment`, `adminAuthErrorCode` (capital `A`), `manual_redirect` (sessionStorage).
- **AUTH.R46b** Callers of `logout`: user and admin menus (`onClick={logout}`, the click event is passed as an ignored argument), inactivity (AUTH.R25), 15 s timer (AUTH.R23), `EnvironmentSelector` `Sign Out` button (AUTH.S13). After `logout()` sets `user = null`, the validation effect (AUTH.R21) may fire again while MSAL still holds the account before the redirect navigates away; whether it issues AUTH.C1 again before the browser leaves is unspecified (see report).

#### EnvironmentSelector (`components/auth/EnvironmentSelector.js`)

- **AUTH.R47** `TenantVerificationService.verifyUserAccess` never throws; in the catch it logs, (dev: returns mock, see Fakes), else calls `cleanupSession()` and returns `{ exists:false, isActive:false, message: error.message || "Error verifying user access", requiresRedirect:true }` (`:94-131`). So network errors, missing token (`Invalid authentication token. Please log in again.`, when token is falsy, `'Not Readable'` or `'mock-token-for-development'`), 404 and non-OK responses all end up as the S13 access-denied card. `getAvailableEnvironments` also never throws: any failure returns `{ environments: [] }` (dev: mock) (`:188-217`), which shows `No environments found for your account. Please contact your administrator.` via R49 (but displayed as S12 text, see S13 note).
- **AUTH.R48** `cleanupSession()` (`tenantVerificationService.js:255-283`) removes localStorage `isAuthenticated`, `activeEnvironment`, `registrationId`, `currentUser`, `employeeNo`, `employeeId`, `clientCompanyId`, `clientCompanyName`, `clientCompanies`; removes sessionStorage keys that `startsWith('msal.')` or include `token` or `auth`; expires cookies whose name includes `msal`, `auth`, `session` (path `/`). It does NOT sweep `bc_*` keys and does NOT call `logout`/MSAL. Called on 404, `shouldCleanup`, `exists === false` / `isActive === false`, and any exception. Because it removes `isAuthenticated`, other tabs are redirected (AUTH.R26d).
- **AUTH.R49** On mount, with `user` present and no `redirectInProgress`: AUTH.C3 first. If `requiresRedirect || !exists || !isActive`: `redirectInProgress = true`, `bcAccessDenied = true`, `error = verificationResult.message || "Your account is not active or not found."`, loading off, stop. Else AUTH.C4. Empty list: `error = "No environments found for your account. Please contact your administrator."`. Else `setEnvironments(list)`; exactly one environment is pre-selected. Thrown errors: `redirectInProgress = true`, `error = apiError.message || "Failed to retrieve Business Central environments"`. No `user`: `isLoading=false`, `error = "Authentication required. Please sign in again."`, `redirectInProgress = true`. Because the effect depends on `redirectInProgress`, once it is true no further fetch happens.
- **AUTH.R50** The registration filter for AUTH.C4 uses `localStorage.registrationId` read inside AUTH.C3 and the value returned by AUTH.C3 (`userData.userData.registrationId`, which overwrites storage). If neither exists, AUTH.C4 is sent with no filter (all environments the token can see).
- **AUTH.R51** `handleSelect` stores the clicked environment object. `handleContinue` with nothing selected sets `error = "Please select an environment to continue"` (this error replaces the whole page with S12, since `error` truthy renders the error card).
- **AUTH.R52** `hasCompanyId = !!company_Id && company_Id !== '00000000-0000-0000-0000-000000000000'`.
- **AUTH.R53** If `!hasCompanyId`: get `token = await getAccessToken()` (login scope) and `registrationId = localStorage.registrationId`. If either is missing: warn and continue. Else send AUTH.C5. On OK and `updateResult.success`: call AUTH.C4 again; find the environment with the same `id`; if it now has `company_Id`, mutate `selectedEnvironment.company_Id` in place. Every failure inside this block is logged and ignored: the user always proceeds.
- **AUTH.R54** `handleContinue` sets page `isLoading = true` at the start, which swaps the page to the S11 card (`Loading your environments…`) until navigation; on an exception it sets `error` and `isLoading=false`.
- **AUTH.R55** Placeholder company id: after the company step, if `company_Id` is still missing or all-zero GUID, it is set to `company_Id || '00000000-0000-0000-0000-000000000000'` (`:338-349`). The id is written to `localStorage.clientCompanyId` unconditionally (so a placeholder zero GUID, or empty string `''` if `company_Id` was `''`, can be stored; note `'' || zeros` yields zeros so empty becomes zeros).
- **AUTH.R56** Activation: `updateActiveEnvironment({ id, name, type: type || 'Production', url: url || '', companyName: companyName || company_Name || '', company_Id })` (this writes `localStorage.activeEnvironment`), then `navigate('/portal')`. No backend call (`TenantVerificationService.setActiveEnvironment` and AUTH.C8 are not used here).
- **AUTH.R57** Admin-notification flags (`:243-334`): on a non-OK AUTH.C5 response treat it as an auth problem when any of: body (or raw text) `responseData.error.message` includes `getClientToken`; message/text includes `No HTTP resource was found`, `auth` or `token`; status is 401 or 403. Network exceptions and setup exceptions test message includes `getClientToken`, `auth`, `token`, `unauthorized` or `permission`. When true set `localStorage.adminAuthIncomplete = 'true'`, `adminAuthEnvironment = selectedEnvironment.name`, and `adminAuthErrorCode` = `String(status)` for HTTP failures, `'FETCH_ERROR'` for the fetch exception handler, `'SETUP_ERROR'` for the outer handler. (Substring tests are case-sensitive; text-body variant also tests `No HTTP resource was found`; the JSON variant tests it on `errorMessage` only.)
- **AUTH.R58** `Return to Home` (`← Home`) (`:379-395`) removes `isAuthenticated`, `currentUser`, `activeEnvironment`, `registrationId`, `employeeNo`, `employeeId`, `clientCompanyId`, `clientCompanyName`, `clientCompanies` and does `window.location.href = '/'`. It does not log out of MSAL (MSAL session survives; landing page may then send the user back through `/login` to `/portal`).
- **AUTH.R59** Card shows `{environment.type}` and, if present, ` · {companyName || company_Name}`; badge `Ready` shows when the environment has NO real company id (verbatim from code, the label looks inverted).
- **AUTH.R60** The service instance is memoised once with `[]` deps, so it keeps the first `getAccessToken`.

#### First-login overlay (`FirstLoginHandler.js`)

- **AUTH.R65** Set: `isPendingFirstLogin` becomes true only when AUTH.C1 returns `userData.status === 'PendingFirstLogin'` (exact string). It is held in React state only, never persisted, so a reload re-derives it from AUTH.C1.
- **AUTH.R66** Shown: `ProtectedRoute` renders `<FirstLoginHandler />` after `children` whenever `isPendingFirstLogin` is true, on any `/portal/*` or `/admin/*` route that passes the earlier guards (so only after an environment is active). The component itself returns `null` when not pending. It is a fixed full-screen modal (`fixed inset-0`, `z-50`, dark backdrop) with no close button.
- **AUTH.R67** What completes it: clicking `Continue to Portal` runs `new BusinessCentralService(getAccessToken).updateUserStatus(user.id, 'Active')` (AUTH.C6). If `user && user.id` is missing it logs a warning and skips the call. Success needs `result.success` truthy; then `updateFirstLoginStatus()` (clears the overlay) and `navigate('/portal')`.
- **AUTH.R68** Failure (call throws or `!result || !result.success`): shows S17 text; overlay stays; button re-enabled. The user's backend status is unchanged, so the overlay returns on next login.
- **AUTH.R69** Dev only (`NODE_ENV === 'development'`): debug box with a `Force Proceed` button that clears the overlay and navigates to `/portal` without calling the backend; `updateUserStatus` is mocked (see Fakes). While pending, `ProtectedRoute` skips the admin-dashboard redirect (R38e).

#### Auth error and callback pages

- **AUTH.R62** `AuthErrorPage` `Return to Home` (`AuthErrorPage.js:13-22`, `:24-50`): removes localStorage `isAuthenticated`, `activeEnvironment`, `registrationId`, `currentUser`, `employeeNo`, `employeeId`, `clientCompanyId`, `clientCompanyName`, `clientCompanies`; sweeps localStorage keys (`startsWith('bc_')` or includes `auth`, `user`, `token`); sweeps sessionStorage keys (`startsWith('msal.')` or includes `token` or `auth`); expires cookies whose name includes `msal`, `auth`, `session`; `sessionStorage.manual_redirect = 'true'`; `window.location.href = '/'`. (It imports `useMsal`, `useNavigate`, `useAuth().logout` but does not call them.)
- **AUTH.R63** The landing page consumes the flag (`RegistrationAndLanding.js:84-103`): if `sessionStorage.manual_redirect === 'true'` it removes it and runs `instance.logoutPopup({ mainWindowRedirectUri: window.location.origin, onRedirectNavigate: () => false })`, logging any error. This completes the sign-out that `AuthErrorPage` started.
- **AUTH.R64** `AuthCallbackPage` (`/auth/callback`, serves the admin Business Central authorization flow; the backend redirects here). Reads query `code`, `error`, `error_description`, `status`, `state`, `registration_id`, `registrationId`, `tokenReceived`, `tokenStoredInBC`. `registrationId` resolution: `localStorage.registrationId`; if `state` parses as JSON with `registrationId`, use it and store it; if still none, `registration_id` query param, stored. Outcomes: `status === 'success'` then S19; if `window.opener` it posts `{ type: 'AUTH_SUCCESS', registrationId: <query registrationId>, timestamp: Date.now(), tokenReceived: (=== 'true'), tokenStoredInBC: (=== 'true') }` to `'*'` and closes the window after 2000 ms, else after 2000 ms `navigate('/admin/authorization', { replace: true })`. `error` param then S20 with `Authorization failed: <error_description || error>`. No `code` then S20 `No authorization code was provided in the callback.`. A `code` present is treated as a misconfiguration: S20 configuration message; if `window.opener` posts `{ type: 'AUTH_ERROR', error: 'Authentication flow configuration error', message: 'The authorization code was sent to the frontend instead of the backend', timestamp }` and closes after 5000 ms, else after 5000 ms `navigate('/admin/authorization', { replace: true, state: { error: 'Authentication flow configuration error', message: 'The authorization code was sent to the frontend instead of the backend' } })`. Exceptions: S20 `Error processing authorization: <message>`. The page makes no network call of its own. It does not require sign-in (route is unguarded).
- **AUTH.R70** `SignOutButton` (`Log out` / `Signing out...`) calls optional `onLogout()` then `instance.logoutRedirect({ postLogoutRedirectUri: origin })`; it is not imported anywhere (dead).

---

### Storage

localStorage (`L`) and sessionStorage (`S`):

| key | store | written | read | removed |
|---|---|---|---|---|
| `isAuthenticated` (`'true'`) | L | `index.js:32` (LOGIN_SUCCESS), `App.js:122`, `:161`, `AuthContext.js:137` | `AuthContext.js:35`, `:447`; `App.js:141` | `index.js:36`, `App.js:129`, `AuthContext.js:234`, `:251`, `:257`, `:269`, `:402`; `AuthErrorPage.js`; `EnvironmentSelector.js:383`; `tenantVerificationService.js:259` |
| `currentUser` (JSON; `isAdmin` never stored) | L | `AuthContext.js:136` (basic), `:191` (enhanced minus `isAdmin`) | `AuthContext.js:36`; `businessCentralService.js:240` (email filter) | `AuthContext.js:60` (parse error), `:405`; `AuthErrorPage`; `EnvironmentSelector.js:384`; `tenantVerificationService.js:262` |
| `activeEnvironment` (JSON) | L | `AuthContext.js:353`; `businessCentralService.js:46-51` | `AuthContext.js:50`, `:225`; `businessCentralService.js:236` | `AuthContext.js:362`, `:403`; `App.js:130` (dead); others as above |
| `registrationId` | L | `AuthContext.js:195`; `businessCentralService.js:188`; `tenantVerificationService.js:89`; `AuthCallbackPage.js:54`, `:75` | `businessCentralService.js:108`, `:234`, `:1003`, `:1586`; `tenantVerificationService.js:21`; `EnvironmentSelector.js:165`; `AuthCallbackPage.js:40` | `AuthContext.js:404`; others as above |
| `clientCompanyId` | L | `EnvironmentSelector.js:352`; `businessCentralService.js:32`, `:36`, `:128` (X-Client-Company-ID), `:270` | `businessCentralService.js:235` | `AuthContext.js:407`; `businessCentralService.js:275`; others |
| `clientCompanyName` | L | `businessCentralService.js:271` | (portal) | `AuthContext.js:408`; others |
| `clientCompanies`, `employeeData`, `employeeId`, `employeeNo` | L | portal inventory | portal inventory | `AuthContext.js:406-411` (`employeeData` only here and the landing page) |
| `adminAuthIncomplete`, `adminAuthEnvironment`, `adminAuthErrorCode` | L | `EnvironmentSelector.js` (AUTH.R57) | `UserPortalLayout.js:49-50` | `UserPortalLayout.js:86-88` (Dismiss). Not cleared by `logout` |
| `portalTheme` (`'dark'`/`'light'`) | L | `UserPortalLayout.js:22` | `:18` | never |
| any key `startsWith('bc_')`, or containing `auth`, `user`, `token` | L | not written by auth code | n/a | swept in `logout` and `AuthErrorPage` |
| `manual_redirect` (`'true'`) | S | `AuthErrorPage.js:18` | `RegistrationAndLanding.js:86` | `RegistrationAndLanding.js:88` |
| `msal.*` and MSAL cache entries | S | MSAL (`cacheLocation: "sessionStorage"`) | MSAL | MSAL `logoutRedirect`; `AuthErrorPage` and `cleanupSession` sweep keys starting `msal.` or including `token`/`auth` |
| cookies containing `msal`, `auth`, `session` (path `/`) | cookie | MSAL (`storeAuthStateInCookie: true`) and backend session cookie | browser | expired in `logout`, `AuthErrorPage`, `cleanupSession` |

Window events: `authRequired` (CustomEvent, no detail), `storage` (browser), `employeeNoReady` (dispatched at `EmployeePortal.js:163`, consumed by `UserPortalLayout.js:68`; portal inventory).

---

### Fakes or fallbacks in today's code

Dev-only branches (`NODE_ENV === 'development'`, not in production builds):

1. `businessCentralService.js:148-151` `fetchThroughBackend`: on ANY error (including no token, 404, 500) in dev it returns `getMockData(endpoint)` instead of throwing. This also hides the AUTH.R7 errors in dev.
2. `getMockData` (`:1643-1739`): `/bc/portalUsers/verify` returns `{ exists:true, isActive:true, message:'User found in Business Central Portal (mock)', userData:{ id:'mock-user-id', name:'Test User', email:'test.user@example.com', status:'Active', registrationId:'mock-registration-id', role:'Employee' } }` (no `isAdmin`); `/bc/client-tenant/companies` returns `{ value:[ {id:'cmp-001', name:'CRONUS UK Ltd.', displayName:'CRONUS UK Ltd.', businessProfileId:'prof-001', systemVersion:'22.0.54157.55220'}, {id:'cmp-002', name:'Demo Company', displayName:'Demo Company', businessProfileId:'prof-002', systemVersion:'22.0.54157.55220'} ] }`; `/bc/employees/current` returns a fake employee (`John Smith`, `Senior Software Engineer`, `EMP001`, `_isMockData: true`, portal inventory); `/bc/environments` returns `Production` (`env-production-01`) and `Sandbox` (`env-sandbox-01`) with `businesscentral.dynamics.com/production|sandbox` URLs; default is `{ success:true, message:'Mock data for <endpoint>' }`. Match is by `endpoint.includes(...)`, first match wins in this order.
3. `businessCentralService.js:203-220` `verifyPortalUser` catch: dev mock admin `{ exists:true, isActive:true, message:'User found in Business Central Portal (mock)', userData:{ id:'mock-user-id', name:<email local part or 'User'>, email, status:'Active', registrationId:'mock-registration-id', role:'Admin', isAdmin:true } }`. Effectively shadowed by item 1 because `fetchThroughBackend` already swallows errors in dev.
4. `businessCentralService.js:936-946` and `:983-990` `updateUserStatus` returns `{ success:true, message:'User status updated successfully (development mode)' }` after a 500 ms delay without calling the backend, and `... (mock after error)` after a failed call.
5. `businessCentralService.js:1034-1052` `getAvailableEnvironments` dev mock: the two environments from item 2 (without `companyName`).
6. `businessCentralService.js:1085-1091` `setActiveEnvironment(..., updateBackend=true)` skips AUTH.C8 in dev.
7. `businessCentralService.js:1612-1632` `getClientTenantCompanies` dev mock: the two companies from item 2.
8. `tenantVerificationService.js:97-120` `verifyUserAccess` dev mock `{ exists:true, isActive:true, message:'User access verified (mock)', userData:{ id:'mock-user-id', name: email local part || 'User', email, role:'Employee', status:'Active', registrationId:'mock-registration-id' } }`, also writes `localStorage.registrationId = 'mock-registration-id'`.
9. `tenantVerificationService.js:191-213` `getAvailableEnvironments` dev mock: `env-production-01` Production and `env-sandbox-01` Sandbox (status `Active`, no company ids).
10. `FirstLoginHandler.js` dev `Force Proceed` button and debug box; `EnvironmentSelector.js` debug section; `App.js:252` `DebugPanel` (empty body).

Always on (production too):

11. `authConfig.js:6` `clientId` falls back to `'demoClientID'` when `REACT_APP_CLIENT_ID` is unset. `authConfig.js:45`, `apiService.js:7`, `tenantVerificationService.js:8`, `EnvironmentSelector.js:172` default API URL `https://demo-backend-demo.uksouth-01.azurewebsites.net/api`; `businessCentralService.js:10` default `https://demobackend-backend-demo.uksouth-01.azurewebsites.net/api`; `businessCentralService.js:8-9` default `https://api.businesscentral.dynamics.com/v2.0/demotenant/api/v2.0`.
12. `AuthContext.js:127-131` user placeholders: `oid` `'unknown-id'`, `email` `'unknown@example.com'`, `name` `'Unknown User'`.
13. `AuthContext.js:208` `employeeNo: ''` placeholder in session init body.
14. `EnvironmentSelector.js:338-349` placeholder company id `'00000000-0000-0000-0000-000000000000'` written to `localStorage.clientCompanyId` and into `activeEnvironment.company_Id`.
15. Defaults for environment fields: `type || 'Production'`, `url || ''`, `companyName || company_Name || ''` (`EnvironmentSelector.js:359-361`); `status || 'Active'`, `type || 'Production'` in both `getAvailableEnvironments` mappers; `activeEnvironment.name || 'Unknown'` in the layouts.
16. `BusinessCentralService` constructor `this.environment = 'Production'` (`:13`) is never read by the auth flow.
17. `AuthCallbackPage.js:154` log text names `https://demo-dev-backend-demo.uksouth-01.azurewebsites.net/auth/callback` (logging only, never shown).
18. `apiService.js:52` fallback body `{ success: true, message: 'Operation completed successfully' }` when a 2xx response has no JSON body.
19. `AuthPages.js` support link text `support@qnipay.com` pointing to `https://qnipay.com/legal/` (hard-coded).
20. Token sentinel strings `'Not Readable'` and `'mock-token-for-development'` are rejected as invalid tokens (`businessCentralService.js:72`, `:949`, `:1095`; `tenantVerificationService.js:29`, `:142`). The port must keep rejecting them or knowingly drop the check.
