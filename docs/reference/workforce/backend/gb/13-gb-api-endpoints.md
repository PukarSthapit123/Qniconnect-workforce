# Qnipay Workforce on GB Qnipay: API endpoints

2026-10-26 · Status: draft for review

This document specifies the Business Central API that the Node layer calls for Workforce on the GB codebase: the conventions, every entity set and command with its real page or codeunit ID, the map from each `/api/v1` operation to its Business Central calls, the views Node assembles, the background jobs and the permission sets. It merges the five reviewers' API files and replaces 03 for GB. Objects and tables are in [`11-gb-new-tables.md`](11-gb-new-tables.md); fields in [`12-gb-field-mapping.md`](12-gb-field-mapping.md); decisions (GB-D*n*) and questions (GB-Q*n*) in [`10-gb-gap-analysis.md`](10-gb-gap-analysis.md).

Paths: `B/` = `C:\dev\Qnipay GB BC\Qnipay-base\SourceCode\`, `G/` = `C:\dev\Qnipay GB BC\Qnipay-GB\SourceCode\`. Contract truth: `docs/superpowers/handoff/backend-inputs.md` (124 operations) and `src/contract/*.ts`.

## 1. Conventions

### 1.1 Route

`https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/dogma/workforce/v1.0/companies({companyId})/<entitySet>`

Publisher `dogma`, group `workforce`, version `v1.0` for every Workforce page (GB-D2). Every slice agreed. The existing GB pages stay on `dogma/payroll` (`v2.0`, `v1.0`). A separate group keeps names such as `employees` from clashing with `dogma/payroll` and keeps the Workforce pages movable. All 68 pages are in Qnipay-base, `PageType = API`, `ODataKeyFields = SystemId` (exposed as `id`), `DelayedInsert = true`, and expose `version` and `updatedAt` (`SystemModifiedAt`), plus `publicId` where the table has it (doc 11, GB-D11). One exception: 70703216 `SIR_WF API Pay Grades` and 70703217 `SIR_WF API Pay Levels` are read only over payroll's `SIR Pay Grade` and `SIR Pay Level`, which have no version field, and expose no `version`. Workforce never writes them, so no If-Match applies, and the contract's `PayGrade` and `PayLevel` carry no version either. No version field is added to the payroll tables.

### 1.2 Sign-in

Node follows QniConnect's model: employees are portal users, not Business Central users. The browser signs in to Entra and calls Node; Node validates the Entra token, applies the rules in `src/domain`, and calls Business Central service to service with an app-only token from its own Entra app registration (client credentials). Business Central sees one connector identity (the registered app, given 70703150 `SIR_WF Connector`), never the employee. Node decides, Business Central commits and repeats only the structural checks (B5, GB-D45). Licensing of this model is GB-Q37.

### 1.3 `sessionId`

`sessionId` is the Guid of a 70703153 `SIR_WF Session` row, created by the `sessionOpens` command and held only by Node (GB-D6). Every write carries it: as a field on the `commands` page, as a parameter on a bound action, or as a write-only field on an entity POST or PATCH. It is never in a URL, a key or a `$filter` (B13). 70703151 `SIR_WF Session Mgt.Resolve(sessionId)` gives the real employee, the viewing-as employee and the capabilities, or refuses `signed-out`. Reads take no session: Node applies scope.

Gates checked in Business Central on every write (Node checks them first): `signed-out`; `viewing-as` (except view-as end and sign-out); `not-started` (except own onboarding, notification reads and sign-out); `capability`; `stale`.

### 1.4 The generic `commands` page

One API page, 70703150 `SIR_WF API Commands` (entity `command`, entity set `commands`), over the temporary table 70703166 `SIR_WF Command`. Every command that has no record to bind to is a POST to it (GB-D4). Insert only.

```
POST …/companies({id})/commands
{ "command": "timesheetDaySaves", "sessionId": "…", "correlationId": "…",
  "idempotencyKey": "…", "version": 0, "payload": "{…json…}" }
```

| Property | Direction | Type | Notes |
|---|---|---|---|
| `command` | in | Enum 70703150 `SIR_WF Command Type` | The command name (§4.1). |
| `sessionId` | in | Guid | §1.3. |
| `correlationId` | in | Guid | Node's request id; stored on audit rows. |
| `idempotencyKey` | in | Text[100] | Create commands; Node generates it and resends it on a retry (GB-D5). |
| `version` | in | Integer | The If-Match of the record the command changes; 0 = none yet. |
| `payload` | in | Text (JSON) | Command-specific; Node has already validated it with zod. |
| `result` | out | Text | `ok` or `noop`. |
| `recordId`, `recordIds` | out | Guid, Text (JSON array) | |
| `auditId` | out | Text | Blank on a no-op. |
| `warnings`, `summary` | out | Text (JSON) | |
| `message` | out | Text | |

`OnInsertRecord` calls 70703150 `SIR_WF Command Dispatcher`, which: resolves the session and applies the gates; checks the idempotency key against 70703165 `SIR_WF Idempotency Key` and returns the stored result on a repeat; runs the handler the enum value names, through the interface `SIR_WF Command Handler` (one codeunit per command); writes one 70703159 `SIR_WF Audit Event` unless the result is `noop`; stores the idempotency result; and fills the outputs. All of it is one transaction. The response body is the inserted record with the outputs.

Why one page and not one page per command (03's command entity sets): page IDs in Base are scarce, and Node already validates every payload with zod, so a typed page per command buys nothing (GB-D4).

### 1.5 Bound actions

Where a record exists, the command is a bound action on that record's entity page (GB-D4), the pattern GB already uses at `G/API Pages/Pag70702818.SIRGBPayslipAPI.al:108-117` (`[ServiceEnabled] procedure GetPayslip(systemId: Text): Text`). The trial confirms it works with service-to-service sign-in (§10).

```
POST …/companies({id})/timesheetDays({systemId})/Microsoft.NAV.transition
{ "sessionId": "…", "correlationId": "…", "idempotencyKey": "", "version": 4, "payload": "{\"to\":\"ok\", …}" }
```

Every bound action has the same five parameters, `(sessionId: Text; correlationId: Text; idempotencyKey: Text; version: Integer; payload: Text): Text`, and returns the same JSON text: `{result, recordId, recordIds, auditId, warnings, summary, message}`. The page fills a temporary 70703166 `SIR_WF Command` with the command type, the parameters and `Target System Id` = the bound record, and calls the same dispatcher, so gates, refusals, audit and idempotency are identical on both paths (GB-D12).

A session command stays on `commands` even though a session row exists, because binding to it would put the session id in the URL (GB-D14).

### 1.6 Entity writes

Entity POST and PATCH are allowed on the master-data pages listed in §2 (column Ops). They carry `sessionId` and `correlationId` as write-only fields in the body; `OnInsertRecord` and `OnModifyRecord` call the area's management codeunit through the dispatcher's entity entry point, so the same gates and audit apply, and a plain GB error (character rules, sort-code format, Birth Date) comes back as `invalid: <message>|{"field":"…"}` rather than `server-defect`.

No Workforce page allows entity DELETE (`DeleteAllowed = false`). A DELETE has no body, and 03 §1.4's workaround (PATCH a write-only page variable, then DELETE, in one `$batch` changeset) does not work: each request in a changeset gets a new page instance, so the variable set by the PATCH is gone when the DELETE runs. Removal is the bound action `remove` (command `recordRemove`), which takes `sessionId` like every other write (GB-D13).

### 1.7 If-Match and Version

- **Entity PATCH:** Node compares the contract's integer If-Match with the record's `version`, then sends Business Central's `@odata.etag` as `If-Match`.
- **Bound actions and commands:** `version` is a parameter; the handler re-reads the record with `UpdLock` and compares inside the transaction. A mismatch refuses `stale`.
- **Version rules:** new tables +1 on every modify (01 §4.2); reused coded tables bump `SIR_WF Version` only when a contract-mapped field changes (GB-D3); child rows bump their parent; the tenant version (`SIR_WF Setup.Version`) is bumped by subscribers too, so a BC-client edit also makes React's If-Match stale (GB-D28); the week's aggregate version is 70703179 `SIR_WF Timesheet Week.Version` (GB-D46).

### 1.8 Refusal format

AL raises `Error('<code>: <message>')`, or `Error('<code>: <message>|<json>')` when there is a `field` or `usedBy`. Node parses it and maps the code to the HTTP status and `next` text (statuses as `backend-inputs.md`: 401, 403, 404, 409, 412, 422, 428). Any error that does not parse is `server-defect`. Refusal codes are the contract's (`transition`, not `TRANSITION_NOT_ALLOWED`, in onboarding; `invalid` with a field, not `NAME_TAKEN`, for onboarding policy, document type and template names; `invalid`, never `REASON_REQUIRED`, for a missing reason). `NAME_TAKEN` (409, field `name`) stays in two places only: a setup preset name on save or import (`templateSaves`, `templateImports`) and a user type rename (`userTypes` PATCH). The codes that only Node raises are listed per command.

### 1.9 Paging

Lists follow Business Central's server-driven paging (`@odata.nextLink`); Node follows the link and pages to the contract itself. The approval queue's contract cursor must be digits (`timesheets.ts:188`), so Node pages that one with `$skip`/`$top` over the stable order `(date desc, employeeNo)`. Counts use `$count=true` or the query 70703150 `SIR_WF TS Queue Counts` (replacing 03's `$apply=groupby`).

### 1.10 `$batch`

One contract read is normally one `$batch` of independent GETs (`POST …/api/dogma/workforce/v1.0/$batch`), within Business Central's limit on requests per batch. A command and the re-read of its result can share one `$batch` when the record id is predictable. Changesets are used only where two writes must commit together and both are entity writes (an employee POST with its account POST); everything else is one command, which is already one transaction.

## 2. Entity set catalogue

68 API pages, all in Qnipay-base, 70703150–70703217, in module order except 70703216–70703217 (pay grades and levels, added after the block was numbered). Ops: R read; C entity POST; U entity PATCH. No page allows DELETE (§1.6). "Bound" lists the bound actions (§3).

### 2.1 Foundation

| Page | Entity set | Source table | Ops | Bound | Notes |
|---|---|---|---|---|---|
| 70703150 `SIR_WF API Commands` | `commands` | 70703166 `SIR_WF Command` (temporary) | C | — | §1.4. |
| 70703151 `SIR_WF API Workforce Setup` | `workforceSetup` | 70703150 `SIR_WF Setup` | R | `updateSettings`, `applyTemplate`, `updateNotificationMatrix` | Singleton; carries the tenant `version`. Also exposes, read only and computed in `OnAfterGetRecord`: `financialYearStart`, `financialYearEnd`, `financialYearLabel` (the `Active` `SIR Fiscal Year`, label through `OnGetFinancialYearLabel`), `defaultPayFrequency` and `payFrequencyOption` (`SIR Payroll Setup`, `SIR Pay Frequency`), so Workforce reads no GB page (GB-D15). |
| 70703152 `SIR_WF API Company Info` | `companyInformation` | Company Information (79) | R | — | name, registrationNo, address, address2, city, county, postCode, countryRegionCode. Written only by `updateSettings`. |
| 70703153 `SIR_WF API Modules` | `workforceModules` | `SIR Feature Register`, `SIR_WF Workforce = true` | R | `switchModule` | id (register ID), moduleCode, name, enabled (Enabled for = All Users), parentFeatureId, locked, restoreOnParent, sortOrder. |
| 70703154 `SIR_WF API Feature Flags` | `featureFlags` | 70703151 `SIR_WF Feature Flag` | R | `switchFlag` | code, moduleCode, name, description, enabled, notBuilt. |
| 70703155 `SIR_WF API Bank Holidays` | `bankHolidays` | Base Calendar Change, filtered to `SIR Timesheet Setup."Base Calender"`, Nonworking, Recurring System blank, `SIR Is Weekend` = false | R | — | date, name (`SIR_WF Holiday Name`, else Description), recurring. Written only by `updateSettings`. Replaces the GB page 70702764 for Workforce (GB-D15). |
| 70703156 `SIR_WF API Accounts` | `accounts` | 70703152 `SIR_WF Account` | R C U | `addException`, `removeException` | email, entraObjectId (never sent to React), employeeNo, blocked, lastSignInAt, version. `$expand=capabilityExceptions`. POST from the employee create; PATCH `blocked` only. An email change on the employee renames the account inside the employee PATCH. |
| 70703157 `SIR_WF API User Types` | `userTypes` | 70703154 `SIR_WF User Type` | R U | `setCapability` | code, name, description, version. PATCH `name` only (rename; `NAME_TAKEN`, `invalid`, `stale`). `$expand=userTypeCapabilities`. |
| 70703158 `SIR_WF API User Type Caps` | `userTypeCapabilities` | 70703155 `SIR_WF User Type Capability` | R | — | userTypeCode, capabilityCode, granted, default, locked. |
| 70703159 `SIR_WF API Capabilities` | `capabilities` | 70703156 `SIR_WF Capability` | R | — | Reference data. |
| 70703160 `SIR_WF API Capability Groups` | `capabilityGroups` | 70703157 `SIR_WF Capability Group` | R | — | `$orderby=sortOrder`. |
| 70703161 `SIR_WF API Cap. Exceptions` | `capabilityExceptions` | 70703158 `SIR_WF Capability Exception` | R | — | accountEmail, capabilityCode, mode, reason, addedBy, addedAt. |
| 70703162 `SIR_WF API Audit Events` | `auditEvents` | 70703159 `SIR_WF Audit Event` | R | — | Newest first; before and after as JSON text; `$count=true`. |
| 70703163 `SIR_WF API Templates` | `templates` | 70703160 `SIR_WF Template` | R | `remove` | key, name, description, scope, source, savedAt, savedByEmployeeNo, fromName, version; body (JSON text) only for one template. `remove` refuses `IN_USE`. |
| 70703164 `SIR_WF API Approval Chains` | `approvalChains` | 70703161 `SIR_WF Approval Chain` | R | `saveChain` | module, saved, version. `$expand=steps`. |
| 70703165 `SIR_WF API Chain Steps` | `approvalChainSteps` | 70703162 `SIR_WF Approval Chain Step` | R | — | module, stepNo, role, scope, when, sla, fixed. |
| 70703166 `SIR_WF API Delegations` | `delegations` | 70703163 `SIR_WF Delegation` | R C | `remove` | fromEmployeeNo, toEmployeeNo, dateFrom, dateUntil, timesheet, profile. Insert refuses `invalid` (self), `LOOP`, `OVERLAP`. |
| 70703167 `SIR_WF API Notif. Events` | `notificationEvents` | 70703164 `SIR_WF Notification Event` | R | — | The matrix rows. Written by `updateNotificationMatrix`. |
| 70703168 `SIR_WF API Notifications` | `notifications` | `SIR Notification Entry` | R | `markRead` | employeeNo, notificationType, area, title, body, at, seen, eventCode, channel, delivery, ref. Payslip rows included (area payroll). |
| 70703169 `SIR_WF API Employee Documents` | `employeeDocuments` | Document Attachment, Table ID = 5200, `SIR_WF Show In Workforce` = true | R | — | id (SystemId), employeeNo, fileName, fileExtension, category, documentDate, attachedDate, owner, source. No file content. |

Not built from 03 for this area: `modules` (B8 → `workforceModules`), `fiscalYears`, `payFrequencies` (now fields on `workforceSetup`), `notificationEvidence`, `notices*`, `documents` on Posted Payroll Header, `payslips` (03 WF+126), `myScope` (Node builds scope).

### 2.2 People and dimensions

| Page | Entity set | Source table | Ops | Bound | Notes |
|---|---|---|---|---|---|
| 70703170 `SIR_WF API Employees` | `employees` | Employee (5200) | R C U | `transition` | code, displayName, firstName, middleName, lastName, companyEmail, mobilePhoneNo, address parts (address, address2, city, postCode, extraLines through the localisation), positionCode, workPatternCode (lower case), category, locationCode (FlowField, filterable), departmentCode (page variable), managerNo, payGradeCode, payLevelCode, contractedHours, maxHours, nightWorker, resourceNo, cis, employmentDate, terminationDate, state, userTypeCode, version. Read-only page variables: emergencyFirstName, emergencyLastName, emergencyPhone, bankAccountMasked, bankSortCodeMasked (GB-D37). `state`, `terminationDate`, bank, address and emergency fields are not writable by PATCH. Never exposes Currency Code, IBAN, NINO or any amount FlowField. |
| 70703171 `SIR_WF API Employee History` | `employeeHistory` | 70703167 `SIR_WF Employee History` | R | — | `$filter=employeeNo eq …&$orderby=at desc`. |
| 70703172 `SIR_WF API Work Sites` | `workSites` | `SIR Work Sites` (70702606) | R C U | `remove` | code, description, area, address, siteManager, blocked, departmentCode and costCentreCode (page variables over Default Dimension), version. POST also creates the work-site Dimension Value and Default Dimension (GB-D35). `remove` refuses `in-use`. |
| 70703173 `SIR_WF API Departments` | `departments` | Dimension Value (349), Dimension Code = `SIR_WF Setup."Department Dimension Code"` | R C U | `remove` | code, name, managerNo, blocked, version. Insert sets Dimension Code. `remove` also checks Default Dimension rows on any table. |
| 70703174 `SIR_WF API Cost Centres` | `costCentres` | Dimension Value, Cost Centre Dimension | R C U | `remove` | code, name, blocked, version. |
| 70703175 `SIR_WF API Job Profiles` | `positions` | 70703168 `SIR_WF Job Profile` | R C U | `remove` | code, name, night, version. A name change also refreshes `Job Title` on holders. |
| 70703176 `SIR_WF API Projects` | `projects` | Job (167) | R C U | `remove` | code, description, clientName, costCentreCode (page variable), managerNo, status, startingDate, endingDate, budgetHours, billable, workSiteCode, version. `$expand=tasks`. BC also refuses a Job with ledger entries. |
| 70703177 `SIR_WF API Project Tasks` | `projectTasks` | Job Task (1001), Job Task Type = Posting | R | — | jobNo, code, description, taskGroup, billable. Written only by template apply. |
| 70703178 `SIR_WF API Employee Types` | `workPatterns` | 70703169 `SIR_WF Employee Type` | R C U | `remove` | code (lower case), name, category, entryMode, payBasis, vehicle, site, project, shift, employmentType (read only), version. `remove` refuses `in-use`, `last-type`. |
| 70703179 `SIR_WF API Profile Changes` | `profileChanges` | 70703170 `SIR_WF Profile Change` | R | `decide` | entryNo, employeeNo, fieldKey, fromValue (masked), toValueMasked, note, raisedAt, status, stage, needsManager, needsPayroll, version. `$expand=decisions`. The whole `To Value` is never exposed. |
| 70703180 `SIR_WF API Profile Decisions` | `profileChangeDecisions` | 70703171 `SIR_WF Profile Change Decision` | R | — | Part of `profileChanges`. |
| 70703181 `SIR_WF API Pay Codes` | `payCodes` | `SIR TIme Sheet Elements` (70702615), External Field Mapping ≠ '' | R C U | `remove` | code, description (`label`), basis, value, payElement, workType, version; read-only `usedBy` (JSON text from 70703158 `SIR_WF Usage Check`). POST sets External Field Mapping = code. Refuses a duplicate code or element (`invalid`); `remove` refuses `in-use`. Never Field Type, Pay Unit, Unit Of Measure or a rate. One page for both slices (GB-D18). |
| 70703182 `SIR_WF API Pay Elements` | `payElements` | `SIR Payroll Element` (70702581) | R | — | code, description, type, for Node's element check. No account or amount fields. |
| 70703216 `SIR_WF API Pay Grades` | `payGrades` | `SIR Pay Grade` (70702575) | R | — | code, description; `$orderby=code`. Payroll's list; Workforce only reads it. |
| 70703217 `SIR_WF API Pay Levels` | `payLevels` | `SIR Pay Level` (70702576) | R | — | code, description, rank; `$orderby=rank,code`. Never `Basic Salary` (field 4) or any amount. |

### 2.3 Timesheet and clocking

| Page | Entity set | Source table | Ops | Bound | Notes |
|---|---|---|---|---|---|
| 70703183 `SIR_WF API Timesheet Configs` | `timesheetConfigs` | 70703172 `SIR_WF Timesheet Config` | R | `save` | Rule fields, cutoffDay, cutoffTime, timeFormat, weekGrid, weekLayout. Parts: `fieldDefaults`, `allowances`, `typeCaptures`. |
| 70703184 `SIR_WF API TS Field Defaults` | `tsFieldDefaults` | 70703173 | R | — | Part of 70703183. |
| 70703185 `SIR_WF API TS Allowances` | `tsAllowances` | 70703174 | R | — | Part of 70703183. |
| 70703186 `SIR_WF API TS Type Captures` | `tsTypeCaptures` | 70703175 | R | — | Parts `fields` (70703187), `allowances` (70703188), `rules` (70703189). |
| 70703187 `SIR_WF API TS Type Fields` | `tsTypeFields` | 70703176 | R | — | |
| 70703188 `SIR_WF API TS Type Allowances` | `tsTypeAllowances` | 70703177 | R | — | |
| 70703189 `SIR_WF API TS Type Rules` | `tsTypeRules` | 70703178 | R | — | |
| 70703190 `SIR_WF API Timesheet Weeks` | `timesheetWeeks` | 70703179 `SIR_WF Timesheet Week` | R | — | employeeNo, weekStart, version (the aggregate version, R2). |
| 70703191 `SIR_WF API Timesheet Days` | `timesheetDays` | 70703180 `SIR_WF Timesheet Day` | R | `transition` | All day fields incl. minutes, waitingRole, workSiteCode, lineManagerNo, chainRoles, weekStart, postingState, lastPostingLineNo. `$expand=entries($expand=breaks,fields),allowances,log`. No Blob on the page (R8). |
| 70703192 `SIR_WF API Timesheet Entries` | `timesheetEntries` | 70703181 | R | — | Parts `breaks`, `fields`. |
| 70703193 `SIR_WF API Timesheet Breaks` | `timesheetBreaks` | 70703182 | R | — | |
| 70703194 `SIR_WF API TS Entry Fields` | `timesheetEntryFields` | 70703183 | R | — | |
| 70703195 `SIR_WF API TS Day Allowances` | `timesheetDayAllowances` | 70703184 | R | — | |
| 70703196 `SIR_WF API TS Day Logs` | `timesheetDayLogs` | 70703185 | R | — | |
| 70703197 `SIR_WF API Clock Records` | `clockRecords` | 70703186 `SIR_WF Clock Record` | R | `close` | isOpen, closedLate*, hasWritten, writtenBreaks (JSON text), closedNoDay*. `$expand=events`. |
| 70703198 `SIR_WF API Clock Events` | `clockEvents` | 70703187 | R | — | |
| 70703199 `SIR_WF API Pay Periods` | `payPeriods` | `SIR Pay Period` (70702586), `SourceTableTemporary = true` | R | — | payFrequency, fiscalYear, period, startDate, endDate, payDate, posted. `OnFindRecord` fills the buffer through 70703192 `SIR_WF Pay Period Lock`, which reads the `Posted` FlowField with `Permissions = tabledata "SIR Payroll Ledger Entry" = r`, so the connector holds no right on a money table (problem O). One page for the timesheet lock and for posting (GB-D16). |
| Query 70703150 `SIR_WF TS Queue Counts` | `tsQueueCounts` | 70703180 | R | — | Columns lineManagerNo, waitingRole, workSiteCode, chainRoles, date (filters), state, count (group by State). `QueryType = API`, same route. |

### 2.4 Onboarding

| Page | Entity set | Source table | Ops | Bound | Notes |
|---|---|---|---|---|---|
| 70703200 `SIR_WF API Onb. Config` | `onboardingConfig` | 70703188 `SIR_WF Onboarding Config` | R | `save`, `saveDocType` | `$expand=steps,docTypes,defaultPolicies`. |
| 70703201 `SIR_WF API Onb. Steps` | `onboardingSteps` | 70703189 | R | — | |
| 70703202 `SIR_WF API Onb. Doc. Types` | `onboardingDocTypes` | 70703190 | R | — | |
| 70703203 `SIR_WF API Onb. Policies` | `onboardingPolicies` | 70703191 `SIR_WF Onboarding Policy` | R | `update`, `attachFile`, `recordScan`, `fileKey`, `remove` | `ackCount` as a FlowField. No storage key on the page. `remove` cascades 70703196 rows and keeps 70703200. |
| 70703204 `SIR_WF API Onb. Templates` | `onboardingTemplates` | 70703192 `SIR_WF Onboarding Template` | R | `save`, `remove` | `$expand=positions,steps,documents,policies`. |
| 70703205 `SIR_WF API Onb. Tmpl. Profiles` | `onboardingTemplateJobProfiles` | 70703193 | R | — | |
| 70703206 `SIR_WF API Onb. Tmpl. Steps` | `onboardingTemplateSteps` | 70703194 | R | — | |
| 70703207 `SIR_WF API Onb. Tmpl. Docs` | `onboardingTemplateDocuments` | 70703195 | R | — | |
| 70703208 `SIR_WF API Onb. Tmpl. Policies` | `onboardingTemplatePolicies` | 70703196 | R | — | Blank `templateId` = Default. |
| 70703209 `SIR_WF API Onb. Cases` | `onboardingCases` | 70703197 `SIR_WF Onboarding Case` | R | `saveStep`, `uploadDocument`, `policyAck`, `submit`, `caseAction`, `readMyData` | **Never exposes `Data`, `Country Data` or `Signature`** (the tracker never shows answers). `$expand=caseSteps,documents,casePolicies`. |
| 70703210 `SIR_WF API Onb. Case Steps` | `onboardingCaseSteps` | 70703198 | R | — | |
| 70703211 `SIR_WF API Onb. Documents` | `onboardingDocuments` | 70703199 `SIR_WF Onboarding Document` | R | `check`, `recordScan`, `fileKey` | Metadata only; no preview or storage key on the page. |
| 70703212 `SIR_WF API Onb. Case Policies` | `onboardingCasePolicies` | 70703200 | R | — | |

03's WF+174 `myOnboardingData` read (`$filter=sessionToken`) is withdrawn: B13 forbids a session token in a `$filter`. It is the bound action `onboardingCases(id)/readMyData`.

### 2.5 Posting

All read only. No property holds a rate, amount or currency (IC-08). No API page over `SIR Timesheet Interface`: only the dispatcher writes it.

| Page | Entity set | Source table | Ops | Bound | Notes |
|---|---|---|---|---|---|
| 70703213 `SIR_WF API Posting Batches` | `postingBatches` | 70703202 `SIR_WF Posting Batch` | R | — | no, createdAt, createdBy, source, lineCount, totalQuantity, correlationId, auditEntryNo; `$expand=lines`. |
| 70703214 `SIR_WF API Posting Lines` | `postingLines` | 70703203 `SIR_WF Posting Line` | R | `retry` | Every field of 70703203; `$expand=attempts,timesheetDay`. |
| 70703215 `SIR_WF API Posting Attempts` | `postingAttempts` | 70703204 `SIR_WF Posting Attempt` | R | — | entryNo, postingLineEntryNo, attempt, at, outcome, errorCode, message, durationMs, errorKind, interfaceEntryNo, retriedBy, correlationId. |

Pages 70703218–70703267 are reserved for the Business Central client pages B7 needs; 70703268–70703299 are spare. The block holds the first product: 68 API pages plus up to 50 client pages is 118 of 150 (GB-D8).

## 3. Bound actions

`POST …/<entitySet>({systemId})/Microsoft.NAV.<action>` with the five parameters of §1.5. Each runs the handler codeunit of its command type (§4.1). The payload fields are listed; "V" means `version` is checked.

| Entity set and action | Command type | Payload | Effect | Refusals (raised by BC) |
|---|---|---|---|---|
| `notifications/markRead` | `notificationMarkRead` | — | Sets Seen on the row when it is in the eyes' inbox. Audits only when something changed. Allowed while onboarding. | `not-found` (not in my inbox) |
| `userTypes/setCapability` V | `userTypeSetCapability` | capabilityCode, granted | Sets Granted; bumps the user type's Version. No-op when unchanged. | `not-found`, `stale`, `locked` (own perm_cfg, Locked row, or last perm_cfg holder) |
| `accounts/addException` V | `accountAddException` | capabilityCode, mode, reason | Inserts or flips the exception; bumps the account's Version. | `not-found`, `stale`, `invalid` (grant already in template, revoke not in template, no reason), `locked` |
| `accounts/removeException` V | `accountRemoveException` | capabilityCode | Deletes the exception; bumps the account's Version. | `not-found`, `stale`, `invalid` (not an exception), `locked` |
| `workforceSetup/updateSettings` V (tenant) | `tenantUpdateSettings` | patch (`UpdateTenantSettings`) | One transaction: 70703150 `SIR_WF Setup` fields, Company Information name and address (GB-Q7), Base Calendar Change rows of the timesheet calendar (replace the set, GB-Q8). Refuses financial year or pay frequency changes (GB-D26). | `stale`, `invalid` (field named), `week-start-in-use` |
| `workforceSetup/applyTemplate` V (tenant) | `tenantApplyTemplate` | key, body (Node sends the shipped body), plan (from `planApply`) | Carries out the plan: flags, settings, user type names, approval chains, new structure codes and onboarding parts (through those areas' codeunits). Never deletes or overwrites employees or structure. Sets Template Key. | `not-found`, `stale`, `MODULE_OFF` |
| `workforceSetup/updateNotificationMatrix` V (matrix) | `notificationMatrixUpdate` | events (map) | Updates channel fields on 70703164 rows; bumps Notification Matrix Version. | `stale`, `invalid` (cell does not apply, unknown event), `MODULE_OFF` |
| `workforceModules/switchModule` V (tenant) | `moduleSwitch` | on | Validates `Enabled for` through the register table's OnValidate, so `OnAfterUpdateFeatureAvailibility` runs the Workforce branch: restore or remember capture methods; Sites off takes the site capability from employee types. Returns ModuleEffect counts (GB-D29, GB-Q9). | `not-found`, `stale`, `LOCKED` (CORE), `MODULE_OFF` (capture method while TS off) |
| `featureFlags/switchFlag` V (tenant) | `flagSwitch` | on?, weekGrid?, weekLayout?, breaksMax?, vehiclesMax? | Sets Enabled and extras (weekGrid and weekLayout go to 70703172). Bumps the tenant version. | `not-found`, `stale`, `MODULE_OFF`, `FLAG_OFF`, `invalid` (extra out of range or not this flag's) |
| `approvalChains/saveChain` V | `chainSave` | steps (≤ 12), usedBy (Node's stranded items from `walkChain`) | Replaces the step rows, sets Saved, bumps Version. Refuses if Node listed any stranded item. | `not-found`, `stale`, `FIXED`, `invalid`, `in-use` with usedBy |
| `<set>/remove` V on `templates`, `delegations`, `workSites`, `departments`, `costCentres`, `positions`, `projects`, `workPatterns`, `payCodes`, `onboardingPolicies`, `onboardingTemplates` | `recordRemove` | — | Runs 70703158 `SIR_WF Usage Check` for the record's table, then `Delete(true)` (the table's OnDelete cascades children). One audit row. Replaces entity DELETE (GB-D13). | `not-found`, `stale`, `in-use` with usedBy, `last-type`, `IN_USE` (template in use), `built-in` |
| `employees/transition` V | `employeeTransition` | to, reason | Sets `SIR_WF State`, base `Status` and `Inactive Date` per 02 §2.2; a leaver without an end gets `Termination Date` = today; history (transition) and audit; to candidate or preboard opens the onboarding case, to active marks it started. Node has already checked the lifecycle and the onboarding blockers. | `not-found`, `stale`, `transition`, `invalid` (unknown state, blank reason), `capability` (`emp_crud`), `scope`, `viewing-as` |
| `profileChanges/decide` V | `profileChangeDecide` | decision, reason | Adds a 70703171 row; moves Stage/Status (`afterDecision`). On the last approval: writes phone, address (through the localisation), emergency relative, or the bank row and re-validates `SIR Preferred Bank Acc. Code` (GB-D38); history row; bumps the Employee version; clears the bank To Value. `summary.employeeWritten`. | `not-found`, `stale`, `decided`, `changed-since`, `own-change`, `scope`, `capability` (`profile_appr` manager stage, `bank_verify` payroll stage) |
| `timesheetDays/transition` V | `timesheetDayTransition` | to (ok, mgrok, back), reason, layer, waitingRole; on the last layer's `ok` while posting is on, postingLines `[{payCode, workSiteCode, quantity, start, end, description}]` | Moves the day, sets Return Reason on back, inserts a log row with layer, sets Waiting Role; on the last `ok` writes the posting batch and lines through 70703221 `SIR_WF Posting Queue` and sets Posting State (IC-01). `summary.postingLineIds`. Bumps the week version. | `signed-out`, `viewing-as`, `not-found`, `stale`, `SELF_APPROVAL`, `capability`, `TRANSITION_NOT_ALLOWED`, `MISSING_PAY_SETUP` (no pay frequency, pay code not mapped, no work site, blocked site), `invalid` (quantity rules) |
| `clockRecords/close` V | `clockClose` | finish, closeMode (writeDay, noDay); for writeDay dayVersion, weekStart, day, writtenBreaks | writeDay: sets Closed Late Finish/At, clears Is Open, writes the day draft (through 70703190 `SIR_WF Timesheet Mgt`). noDay: sets Closed No Day Finish/At, clears Is Open, leaves the day. `summary.dayId`. | `not-found`, `stale`, `CLOCK_MOVE` (already closed), `TS_INVALID` (finish not HH:MM), and the day save's refusals on writeDay |
| `timesheetConfigs/save` V | `timesheetConfigSave` | patch (`UpdateTimesheetConfig`) | Merges rules; replaces fieldDefaults and allowances when given; replaces each given type's fields, allowances and rules; runs 70703191 `SIR_WF TS Config Check`; bumps the config Version. `noop` with blank auditId when nothing changed. | `capability` (mod_cfg), `stale`, `invalid` with field (`rules.maxDaily`, `cutoff`, `allowances.X.label`, `types.X.rules.n.value` …) |
| `onboardingConfig/save` V | `onbConfigSave` | steps `[{id,on}]`, documents `[{id,req,verify,blocks,expiry,on}]`, policies? | Updates 70703189 On, 70703190 settings, 70703196 blank-template rows; bumps the config Version. | `FIXED`, `FLAG_OFF`, `invalid` (renamed doc, bad verifier, unknown policy), `stale` |
| `onboardingConfig/saveDocType` V (config) | `onbDocTypeSave` | action (add, rename, remove), docTypeId, label, hint | add: custom row (req false, verify hr, on true). rename: custom only. remove: in-use check, deletes 70703195 rows. Bumps the config Version. | `built-in`, `in-use` with usedBy, `invalid` (name needed, taken, over 20 documents), `not-found`, `stale` |
| `onboardingPolicies/update` V | `onbPolicyUpdate` | label, ver, summary | Modifies 70703191. | `invalid` (name needed, taken), `not-found`, `stale` |
| `onboardingPolicies/attachFile` V | `onbPolicyAttachFile` | name, size, type, storageKey, contentHash, newVer, clearAcksFor `[employeeNo]` | Sets the file fields and Ver; clears Acked Ver and Read on the listed 70703200 rows (Node chose them). `summary.asked`. | `not-found`, `invalid` (size), `stale` |
| `onboardingPolicies/recordScan` | `onbPolicyRecordScan` | scanState | Node's malware-scan callback (Defender for Storage via Event Grid). | `not-found` |
| `onboardingPolicies/fileKey` | `onbPolicyFileKey` | — | Returns the storage key in `summary` to an authorised Node read; only when clean. No audit. | `not-found`, `SCAN_PENDING`, `INFECTED` |
| `onboardingCases/saveStep` V | `onbStepSave` | step, mode, data (whole `OnbDataRecord`), countryData?, stepState, signature? | Writes Data / Country Data and the 70703198 state. Raises `OnValidateTaxNumber` for step personal in mode check. Audit names sections only. | `NOT_ONBOARDING`, `not-found` (step not asked), `invalid` (field; GB: NINO format or duplicate), `SUBMITTED`, `FLAG_OFF`, `stale` |
| `onboardingCases/uploadDocument` V | `onbDocumentUpload` | docTypeId, name, size, type, storageKey, previewStorageKey?, contentHash, newState | Upserts 70703199 file fields, Scan State pending, clears the rejection, sets the state. | `NOT_ONBOARDING`, `not-found`, `SUBMITTED`, `invalid` (over 8 MB), `stale` |
| `onboardingCases/policyAck` V | `onbPolicyAck` | policyId, action (ack, unack, read) | Upserts 70703200. | `NOT_ONBOARDING`, `not-found`, `stale` |
| `onboardingCases/submit` V | `onbSubmit` | consent, signature, ref, asked `{steps[], documents[{id,req,blocks}]}` | Sets Consent, Signature, Submitted At, Ref, Asked Recorded and the Asked fields; notifies manager and checkers. | `NOT_READY`, `OUTSTANDING`, `SUBMITTED`, `stale`, `invalid` (Ref taken) |
| `onboardingCases/caseAction` V (except chase) | `onbCaseAction` | action (chase, invite, start, portalInvite) | chase: notification only. invite: candidate → preboard, Invited At, creates the 70703152 account if missing. start: 70703202 `SIR_WF Onboarding Start` (write-back and GB events, doc 11 §9), preboard → active. portalInvite: Portal Invited At. | `NOT_ONBOARDING`, `NOTHING_OUTSTANDING`, `NOT_READY`, `transition`, `NO_EMAIL`, `NOT_STARTED`, `ALREADY_INVITED`, `invalid` (GB start checks), `scope`, `stale` |
| `onboardingCases/readMyData` | `onbReadMyData` | — | Returns `data` and `countryData` of the case in `summary`, only when the session's employee is the case's employee. Nothing written; no audit. | `NOT_ONBOARDING`, `scope` |
| `onboardingDocuments/check` V (case) | `onbDocumentCheck` | action (verify, reject), reason, newState, documentsStepState | Sets the state, Verified By/At or Rejection Reason; reopens the documents step when Node says so; notification. | `SELF_CHECK`, `not-found`, `STALE` (not waiting), `SCAN_PENDING`, `INFECTED`, `invalid` (reason needed), `stale` |
| `onboardingDocuments/recordScan` | `onbDocumentRecordScan` | scanState | As the policy callback; an infected file goes back to todo with a rejection the starter sees. | `not-found` |
| `onboardingDocuments/fileKey` | `onbDocumentFileKey` | — | As the policy one. | `not-found`, `SCAN_PENDING`, `INFECTED` |
| `onboardingTemplates/save` V | `onbTemplateSave` | name, positions[], steps[], documents[], policies[] | Replaces the children whole. | `invalid` (name, unknown profile, steps changed, unknown doc or policy), `PROFILE_TAKEN` (also the unique key), `not-found`, `stale` |
| `postingLines/retry` V | `postingRetry` | — | Sets State queued, Next Attempt At now, clears Error Code, Last Error and Error Kind; keeps Attempt; writes a 70703204 row (Outcome queued, Retried By = actor); sets the day's Posting State queued; audit names the attempt number with `Posting Attempt Entry No.` (IC-07). A line failed by reconcile with `ROW_REMOVED` can be retried the same way. | `RETRY_NOT_ALLOWED` (state not failed), `not-found`, `stale`, `capability` (`integration`), `MODULE_OFF` (posting not enabled) |

## 4. Command catalogue

### 4.1 `SIR_WF Command Type` (enum 70703150)

48 values, each implementing `SIR_WF Command Handler` with its own codeunit (GB-D4). Value 0 is blank. Ordinals are grouped by area (100s foundation, 200s people, 300s timesheet, 400s onboarding, 500s posting) with room to grow; within an area, 00–19 are `commands`-page commands and 20 upwards are bound actions.

| Ordinal | Name | Where | Handler codeunit | Slice placeholder |
|---|---|---|---|---|
| 100 | `sessionOpens` | commands | 70703164 `SIR_WF Cmd Session Open` | — |
| 101 | `sessionResolves` | commands | 70703165 `SIR_WF Cmd Session Resolve` | — |
| 102 | `sessionEnds` | commands | 70703166 `SIR_WF Cmd Session End` | — |
| 103 | `viewAsStarts` | commands | 70703167 `SIR_WF Cmd View As Start` | — |
| 104 | `viewAsEnds` | commands | 70703168 `SIR_WF Cmd View As End` | — |
| 105 | `templateSaves` | commands | 70703169 `SIR_WF Cmd Template Save` | — |
| 106 | `templateImports` | commands | 70703170 `SIR_WF Cmd Template Import` | — |
| 107 | `notificationReads` | commands | 70703171 `SIR_WF Cmd Notif. Read All` | — |
| 120 | `notificationMarkRead` | `notifications/markRead` | 70703172 `SIR_WF Cmd Notif. Mark Read` | — (split from `notificationReads`) |
| 121 | `userTypeSetCapability` | `userTypes/setCapability` | 70703173 `SIR_WF Cmd Set Capability` | — |
| 122 | `accountAddException` | `accounts/addException` | 70703174 `SIR_WF Cmd Add Exception` | — |
| 123 | `accountRemoveException` | `accounts/removeException` | 70703175 `SIR_WF Cmd Remove Exception` | — |
| 124 | `tenantUpdateSettings` | `workforceSetup/updateSettings` | 70703176 `SIR_WF Cmd Update Settings` | — |
| 125 | `tenantApplyTemplate` | `workforceSetup/applyTemplate` | 70703177 `SIR_WF Cmd Apply Template` | — |
| 126 | `notificationMatrixUpdate` | `workforceSetup/updateNotificationMatrix` | 70703178 `SIR_WF Cmd Notif. Matrix Save` | — |
| 127 | `moduleSwitch` | `workforceModules/switchModule` | 70703179 `SIR_WF Cmd Switch Module` | — |
| 128 | `flagSwitch` | `featureFlags/switchFlag` | 70703180 `SIR_WF Cmd Switch Flag` | — |
| 129 | `chainSave` | `approvalChains/saveChain` | 70703181 `SIR_WF Cmd Save Chain` | — |
| 130 | `recordRemove` | `<set>/remove` (11 pages) | 70703182 `SIR_WF Cmd Record Remove` | entity DELETE; onboarding WF+266 delete |
| 200 | `profileChangeProposals` | commands | 70703188 `SIR_WF Cmd Profile Proposal` | people WF+208 |
| 220 | `employeeTransition` | `employees/transition` | 70703187 `SIR_WF Cmd Employee Transition` | people WF+207 |
| 221 | `profileChangeDecide` | `profileChanges/decide` | 70703189 `SIR_WF Cmd Profile Decide` | people WF+209 |
| 300 | `timesheetDaySaves` | commands | 70703194 `SIR_WF Cmd TS Day Save` | timesheet WF+224 |
| 301 | `timesheetWeekSubmits` | commands | 70703195 `SIR_WF Cmd TS Week Submit` | timesheet WF+225 (absorbs WF+226) |
| 302 | `timesheetBulkApprovals` | commands | 70703197 `SIR_WF Cmd TS Bulk Approve` | timesheet and posting WF+228 |
| 303 | `clockMoves` | commands | 70703198 `SIR_WF Cmd Clock Move` | timesheet WF+230 |
| 320 | `timesheetDayTransition` | `timesheetDays/transition` | 70703196 `SIR_WF Cmd TS Day Transition` | timesheet and posting WF+227 |
| 321 | `clockClose` | `clockRecords/close` | 70703199 `SIR_WF Cmd Clock Close` | timesheet WF+231 |
| 322 | `timesheetConfigSave` | `timesheetConfigs/save` | 70703200 `SIR_WF Cmd TS Config Save` | timesheet WF+271 |
| 400 | `onboardingPolicySaves` | commands | 70703203 `SIR_WF Cmd Onb. Policy Create` | onboarding WF+249 (create) |
| 401 | `onboardingTemplateSaves` | commands | 70703204 `SIR_WF Cmd Onb. Tmpl. Create` | onboarding WF+266 (create) |
| 420 | `onbConfigSave` | `onboardingConfig/save` | 70703205 `SIR_WF Cmd Onb. Config Save` | onboarding WF+248 |
| 421 | `onbDocTypeSave` | `onboardingConfig/saveDocType` | 70703206 `SIR_WF Cmd Onb. Doc. Type Save` | onboarding WF+265 |
| 422 | `onbPolicyUpdate` | `onboardingPolicies/update` | 70703207 `SIR_WF Cmd Onb. Policy Update` | onboarding WF+249 (edit) |
| 423 | `onbPolicyAttachFile` | `onboardingPolicies/attachFile` | 70703208 `SIR_WF Cmd Onb. Policy File` | onboarding WF+250 |
| 424 | `onbPolicyRecordScan` | `onboardingPolicies/recordScan` | 70703209 `SIR_WF Cmd Onb. Policy Scan` | onboarding WF+268 (policy) |
| 425 | `onbPolicyFileKey` | `onboardingPolicies/fileKey` | 70703210 `SIR_WF Cmd Onb. Policy Key` | onboarding WF+268 (keys) |
| 426 | `onbStepSave` | `onboardingCases/saveStep` | 70703211 `SIR_WF Cmd Onb. Step Save` | onboarding WF+251 |
| 427 | `onbDocumentUpload` | `onboardingCases/uploadDocument` | 70703212 `SIR_WF Cmd Onb. Doc. Upload` | onboarding WF+252 |
| 428 | `onbPolicyAck` | `onboardingCases/policyAck` | 70703213 `SIR_WF Cmd Onb. Policy Ack` | onboarding WF+253 |
| 429 | `onbSubmit` | `onboardingCases/submit` | 70703214 `SIR_WF Cmd Onb. Submit` | onboarding WF+254 |
| 430 | `onbCaseAction` | `onboardingCases/caseAction` | 70703215 `SIR_WF Cmd Onb. Case Action` | onboarding WF+255 |
| 431 | `onbReadMyData` | `onboardingCases/readMyData` | 70703216 `SIR_WF Cmd Onb. Read My Data` | onboarding WF+267 (03's WF+174) |
| 432 | `onbDocumentCheck` | `onboardingDocuments/check` | 70703217 `SIR_WF Cmd Onb. Doc. Check` | onboarding WF+256 |
| 433 | `onbDocumentRecordScan` | `onboardingDocuments/recordScan` | 70703218 `SIR_WF Cmd Onb. Doc. Scan` | onboarding WF+268 (document) |
| 434 | `onbDocumentFileKey` | `onboardingDocuments/fileKey` | 70703219 `SIR_WF Cmd Onb. Doc. Key` | onboarding WF+268 (keys) |
| 435 | `onbTemplateSave` | `onboardingTemplates/save` | 70703220 `SIR_WF Cmd Onb. Tmpl. Save` | onboarding WF+266 (save) |
| 520 | `postingRetry` | `postingLines/retry` | 70703226 `SIR_WF Cmd Posting Retry` | posting WF+229 |

### 4.2 Commands on the `commands` page

15 commands. Every one takes `sessionId` and `correlationId`; create commands take `idempotencyKey`. All write one audit row unless the result is `noop` (and except `sessionResolves`, a read).

| Command | Payload | Effect | Refusals (raised by BC) |
|---|---|---|---|
| `sessionOpens` | entraObjectId, email (no sessionId: it opens one) | Finds the account by Entra Object ID, else by email (then stores the Object ID). Ends any open session of the account, opens a new 70703153 `SIR_WF Session`, sets Last Sign-in At, audits "Signed in". Returns sessionId and the session summary (as `sessionResolves`). | `signed-out` (no account, blocked, or Object ID belongs to another account) |
| `sessionResolves` | — | Read only. Updates Last Seen At at most once a minute. Returns account, userType, roleName, roleDescription, employeeNo, capabilities (after exceptions; the viewed account's while viewing as), viewingAs, onboarding inputs. | `signed-out` |
| `sessionEnds` | — | Sets Ended At, End Reason signed-out, clears viewing-as. Audits "Signed out". Allowed while viewing as and while onboarding. | `signed-out` |
| `viewAsStarts` | employeeCode | Sets Viewing As Employee No. Audits "View-as started". | `capability` (perm_cfg), `invalid` (self, unknown, no account) |
| `viewAsEnds` | — | Clears Viewing As. Audits when one was set. Allowed while viewing as. | — |
| `templateSaves` | name, description, scope, body (built by Node) | Inserts 70703160 (Source saved, Key `tpl_…`). | `NAME_TAKEN`, `invalid`, `capability` (structure scope needs master_data) |
| `templateImports` | name, description, scope, body (parsed by Node) | Inserts 70703160 (Source imported). Node returns `ignored` itself. | `NAME_TAKEN` (Node also: `NOT_A_PRESET`, `UNREADABLE`) |
| `notificationReads` | all = true | Sets Seen on every unread row of the eyes' employee that the inbox shows. Audits only when something changed. Allowed while onboarding. | — |
| `profileChangeProposals` | changes `[{field, to}]`, route per field (needsManager, needsPayroll, from Node's `routeFor`), note | One 70703170 row per changed field, From Value from the record (masked for bank), hash, To Value. Writes nothing to Employee. | `feature-off` (SELF_EDIT off), `pending`, `unchanged`, `capability` (`own_home`), `viewing-as`, `invalid` |
| `timesheetDaySaves` | employeeNo, date, weekStart, version (day; 0 = new), submit, mode (self, proxy, clock), day (entries with start, finish, hours?, netMinutes, jobNo, jobTaskNo, workSiteCode, costCentreCode, departmentCode, fields{}, breaks[]; allowances[]; nonWorkingReason), Node results (workType, minutes, warnings[], daySiteCode, lineManagerNo; on submit waitingRole, chainRoles, logReason) | Locks the day (UpdLock). Creates the day and the week row if absent. Replaces entries, breaks, entry fields and allowances whole. Save: state stays draft (or back). Submit: draft → pend, back → resub, sets Submitted At, inserts a log row. Bumps the day and week versions. | `signed-out`, `viewing-as`, `capability` (own_ts; team_ts + proxy for another's day), `not-found` (employee), `stale`, `ALREADY_SUBMITTED`, `CLOCK_RUNNING` (an Is Open clock record on that date, unless mode = clock), `PERIOD_LOCKED` (date inside a posted `SIR Pay Period` of the employee's `SIR Pay Cycle Code`), `TS_INVALID` with field (over 6 entries or 5 breaks, a time not HH:MM, hours outside 0–24, unknown work type or allowance code, job not Open, task not on job, site Blocked, minutes ≠ sum of netMinutes, text too long) |
| `timesheetWeekSubmits` | employeeNo, mode, weeks (1–8): weekStart, weekVersion, days: date, version, unchanged or day (as `timesheetDaySaves`), Node results incl. to (pend, resub), waitingRole, chainRoles, logReason | Checks every weekVersion and day version first; any mismatch refuses everything. Then writes and moves each day listed. Days Node held back are not sent. Covers the week submit and the multi-week submit (03's WF+226 is retired). | as `timesheetDaySaves`, plus `stale` with field `weeks.i` or `weeks.i.days.j` |
| `timesheetBulkApprovals` | items (1–500): id, version, to (ok, mgrok), layer, waitingRole, postingLines | Checks every version first; then applies the day transition per item in one transaction; on each last-layer ok queues posting lines. `recordIds`; `summary {approved, passed, postingLineCount}`. Load-tested at 300 items in phase 3 (GB-D47). | `QUEUE_CHANGED` (any item missing or moved: nothing approved), `SELF_APPROVAL`, `TRANSITION_NOT_ALLOWED`, `capability`; `MISSING_PAY_SETUP` per day (held, not refused) |
| `clockMoves` | kind (in, breakStart, breakEnd, out), date (tenant-local, from Node), version (clock record; 0 = none), asOf (Node's UTC now); on out also dayVersion, weekStart, day (mode clock), writtenBreaks | Stamps each event `CurrentDateTime` (out while on a break adds breakEnd then out). Keeps Is Open. On out: clears Is Open, writes the day draft through 70703190 `SIR_WF Timesheet Mgt`, sets Has Written and Written Breaks. A command because the clock record may not exist yet (clock in). | `signed-out`, `viewing-as`, `capability` (own_ts), `stale`, `CLOCK_MOVE`, `CLOCK_OPEN`, `invalid` (date more than one day from `CurrentDateTime`, or asOf more than 60 s off, GB-D52); on out the day save's refusals |
| `onboardingPolicySaves` | label, ver, summary, policyId (from Node's `policyKey`) | Inserts 70703191 and its Default row in 70703196. Edits are `onboardingPolicies/update`. | `invalid` (name needed, taken) |
| `onboardingTemplateSaves` | templateId (`onbTemplateId`), name, copyFrom? | Inserts 70703192 and its children copied from the source or the Default. Saves are `onboardingTemplates/save`; deletes `onboardingTemplates/remove`. | `invalid` (name), `not-found` (copyFrom) |

Raised by Node only, never by BC: `NOTHING_TO_SUBMIT`, `ALREADY_SIGNED`, `WRONG_LAYER`, `scope` (except where listed), `MODULE_OFF` and `FLAG_OFF` on reads, `NOT_CLOCK_TYPE`, `BREAK_LIMIT`, the cut-off form of `PERIOD_LOCKED`, every capture rule of `TS_INVALID` (`validateTimes`, `missingMandatory`, `allocationProblem`), `invalid` for a return reason, `SHIPPED`, `NOT_A_PRESET`, `UNREADABLE`, `module-off` (onboarding switched off), `feature-off` on `/documents/mine`.

## 5. Operation map

Every `/api/v1` operation in `backend-inputs.md`, in the contract's three modules. "BC call(s)": `GET x` is a GET on entity set `x` (pages in §2); several GETs are one `$batch`; `POST x(id)/action` is a bound action (§3); `POST commands {name}` is a command (§4.2). All writes also carry the gates of §1.3. Capability is the contract's.

### 5.1 Core (83 operations)

| Contract operation | Capability | BC call(s) | Node-side logic (`src/domain`) | Notes |
|---|---|---|---|---|
| `GET /api/v1/session` | (signed in) | First call of a Microsoft token: POST `commands {sessionOpens}`. Then POST `commands {sessionResolves}`; GET `employees` (own, viewed), `userTypes` | `capabilities.ts` resolveCapabilities; `nav.ts` | Node caches sessionId per Entra Object ID (R11). Opening is the sign-in. |
| `DELETE /api/v1/session` | (signed in) | POST `commands {sessionEnds}` | — | Client then signs out of Microsoft. |
| `POST /api/v1/session/view-as` | `perm_cfg` | POST `commands {viewAsStarts}`; then as GET /session | `capabilities.ts` | |
| `DELETE /api/v1/session/view-as` | (signed in) | POST `commands {viewAsEnds}`; then as GET /session | — | Allowed while viewing as. |
| `GET /api/v1/session/view-as/employees` | `perm_cfg` | GET `employees?$filter=state eq 'active'`, `accounts`, `workPatterns`, `userTypes` | Mock rule: one per role and per employee type, ≤ 5 | |
| `GET /api/v1/capabilities` | `perm_cfg` | GET `capabilities`; GET `userTypeCapabilities?$filter=locked eq true` | — | lockedFor joined in Node. |
| `GET /api/v1/capability-groups` | `perm_cfg` | GET `capabilityGroups?$orderby=sortOrder` | — | |
| `GET /api/v1/user-types` | `perm_cfg` | GET `userTypes?$expand=userTypeCapabilities` | — | capabilities and defaults arrays. |
| `PATCH /api/v1/user-types/:id` | `perm_cfg` | PATCH `userTypes(id) {name, sessionId, correlationId}` (If-Match) | `modules.ts` roleNameProblem | |
| `PUT /api/v1/user-types/:id/capabilities/:capability` | `perm_cfg` | POST `userTypes(id)/setCapability` | `capabilities.ts` (last-holder simulation first) | BC repeats the lock checks. |
| `GET /api/v1/users` | `perm_cfg` | GET `accounts?$expand=capabilityExceptions`; GET `employees?$select=code,displayName,userTypeCode` | — | grants and revocations arrays. |
| `POST /api/v1/users/:email/exceptions` | `perm_cfg` | POST `accounts(id)/addException` | `capabilities.ts` | If-Match = account version. |
| `DELETE /api/v1/users/:email/exceptions/:capability` | `perm_cfg` | POST `accounts(id)/removeException` | `capabilities.ts` | |
| `GET /api/v1/audit` | `framework` | GET `auditEvents?$filter=…&$orderby=at desc&$top=limit&$count=true`; GET `employees?$select=code,displayName` | — | q filters `contains(reason,…)` or act. 03 said `integration`; the contract says `framework`. |
| `GET /api/v1/tenant` | (signed in) | GET `workforceSetup` (incl. financial year and pay frequency), `companyInformation`, `workforceModules`, `featureFlags`, `bankHolidays`, `timesheetConfigs` (weekGrid, weekLayout) | `modules.ts` (modules and flags maps, restore) | No GB page (GB-D15). |
| `PATCH /api/v1/tenant/modules/:code` | `mod_cfg` | POST `workforceModules(id)/switchModule`; then as GET /tenant | `modules.ts` switchModule, moduleSwitchText | If-Match = tenant version. GB-Q9: else Node refuses `locked`. |
| `PATCH /api/v1/tenant/flags/:code` | `mod_cfg` | POST `featureFlags(id)/switchFlag`; then as GET /tenant | `modules.ts` switchFlag, flagChangeText | If-Match = tenant version. |
| `PATCH /api/v1/tenant/settings` | `master_data` | POST `workforceSetup(id)/updateSettings`; then as GET /tenant | `bank-holidays.ts`; `time.ts` isTimeZone; address split | If-Match = tenant version. |
| `GET /api/v1/setup-presets` | `mod_cfg` | GET `templates?$select=` (no body); GET `workforceSetup` (templateKey) | `setup-presets.ts` shipped list, templateSummary | Shipped first, then saved and imported. |
| `POST /api/v1/setup-presets` | `mod_cfg` | Reads of the configuration (as GET /tenant plus `workPatterns`, `approvalChains`, structure, onboarding); POST `commands {templateSaves}` | `setup-presets.ts` captureTemplate, templateNameProblem, templateKey | Never employees, never money. |
| `DELETE /api/v1/setup-presets/:key` | `mod_cfg` | POST `templates(id)/remove` | `setup-presets.ts` removeProblem | Shipped key: Node refuses `SHIPPED`. |
| `POST /api/v1/setup-presets/:key/apply` | `mod_cfg` | Reads as GET /templates/:key/plan; POST `workforceSetup(id)/applyTemplate` | `setup-presets.ts` planApply, planSummary | If-Match = tenant version. |
| `GET /api/v1/setup-presets/:key/export` | `mod_cfg` | GET `templates?$filter=key eq …` (with body), or the shipped body | `setup-presets.ts` templateFile | |
| `GET /api/v1/setup-presets/:key/plan` | `mod_cfg` | GET the template body; reads of the current configuration | `setup-presets.ts` planApply | Writes nothing. |
| `POST /api/v1/setup-presets/import` | `mod_cfg` | POST `commands {templateImports}` | `setup-presets.ts` readTemplateFile, roleNamesProblem | Money and other disallowed keys listed as ignored. |
| `GET /api/v1/approvals/chains` | `framework` | GET `approvalChains?$expand=steps`; GET `featureFlags('EMAIL_APPROVAL')`; GET `timesheetConfigs` | `approvals.ts` defaultChainFor; `time.ts` periodStart; `timesheet.ts` periodLocked | Unsaved chains at version 0. SignOff from the timesheet config, not `SIR Pay Period`. |
| `PUT /api/v1/approvals/chains/:module` | `framework` | Reads for the stranded check (waiting days, profile changes, delegations); POST `approvalChains(id)/saveChain` | `approvals.ts` chainProblem, walkChain, chainText | |
| `GET /api/v1/approvals/delegations` | `framework` | GET `delegations?$orderby=dateFrom`; GET `employees` (active) with their capabilities | `approvals.ts` delegationActive; approver list | |
| `POST /api/v1/approvals/delegations` | `framework` | POST `delegations {…, sessionId, correlationId}` | `approvals.ts` delegationProblem, delegationText | LOOP and OVERLAP also enforced in BC. |
| `DELETE /api/v1/approvals/delegations/:id` | `framework` | POST `delegations(id)/remove` | `approvals.ts` delegationText | |
| `GET /api/v1/approvals/delegations/mine` | `team_ts` | GET `delegations?$filter=fromEmployeeNo eq '<own>' or toEmployeeNo eq '<own>'` | `approvals.ts` delegationActive | 03 said `team_leave`; the contract says `team_ts`. |
| `GET /api/v1/approvals/timesheets` | (signed in) | Queue `$batch`, §6.2 | `walkChain`, `whoDecides`, `decisionBlock`, `decide`, counts, `queueChecksum`, flagged, outside, `slaFor` | Cursor = offset. |
| `POST /api/v1/approvals/timesheets/bulk` | (signed in) | Re-read the lean decidable set; POST `commands {timesheetBulkApprovals}`; GET approved days | Checksum compare (`QUEUE_CHANGED`), walk each day, held list, target ok/mgrok, posting split per day, notifications | |
| `GET /api/v1/notifications/me` | (signed in) | GET `notifications?$filter=employeeNo eq '<eyes>' and (notificationType eq 'Payslip' or delivery eq 'delivered')&$orderby=at desc`; GET `workforceModules`, `featureFlags` | `notifications.ts` inboxOf, ageText, linkFor, unreadOf; `nav.ts` buildNav | Rows of modules that are off are hidden, not deleted. |
| `POST /api/v1/notifications/:id/read` | (signed in) | POST `notifications(id)/markRead` | `notifications.ts` unreadOf | Allowed while onboarding. |
| `POST /api/v1/notifications/read-all` | (signed in) | POST `commands {notificationReads}` | — | Allowed while onboarding. |
| `GET /api/v1/notifications/matrix` | `framework` | GET `notificationEvents`; GET `workforceSetup` (matrix version); GET `workforceModules`, `featureFlags`, `timesheetConfigs` | `notifications.ts` eventShown, channelFor | Only events the tenant can raise. |
| `PATCH /api/v1/notifications/matrix` | `framework` | POST `workforceSetup(id)/updateNotificationMatrix` | `notifications.ts` applyMatrixChange, changeText | If-Match = matrix version. Email and SMS recorded, not sent. |
| `GET /api/v1/home` | `own_home` | §6.4 | `home.ts` monthOf, monthDates, dayGlyph, monthTotals, monthSummary, greeting, whoLine | 422 outside the month bounds (Node). |
| `GET /api/v1/documents/mine` | `own_home` | GET `featureFlags('DOCS')`; GET `employeeDocuments?$filter=employeeNo eq '<eyes>'` | `documents.ts` | `feature-off` (403) when DOCS is off. No payroll rows (Task 25). |
| `GET /api/v1/documents/:id` | `own_home` | GET `employeeDocuments(id)` | — | Another employee's: `not-found`. |
| `GET /api/v1/profile` | `own_home` | GET `employees?$filter=code eq '<own>'`; GET `profileChanges?$filter=employeeNo eq '<own>' and status eq 'pending'&$expand=decisions`; GET `featureFlags('SELF_EDIT')` | `SELF_FIELDS`, selfEdit | Own record even while onboarding. |
| `GET /api/v1/employees` | (signed in): `master_data`, else `team_employees` | GET `employees?$filter=state …` (+ `locationCode eq '<own>'` without master_data); GET `positions` (for q) | Scope; state here/all/one; q on name, code, job profile; sort; mask bank; join userType | `nextLink` paging. |
| `GET /api/v1/employees/next-code` | `emp_crud` | GET `employees?$select=code` | `nextEmployeeCode` (`domain/codes.ts`); GB: never propose `_` | Does not touch No. Series (GB-D43). |
| `GET /api/v1/employees/:id` | (signed in): own, or in scope | GET `employees?$filter=code eq '<code>'` | id → code; scope through locationCode; mask | 404 `not-found`, 403 `scope`. |
| `POST /api/v1/employees` | `emp_crud`; `perm_cfg` for a non-employee user type | `$batch` changeset: POST `employees {…, state, userTypeCode, sessionId, correlationId}`; POST `accounts` when an email is given | `newEmployeeProblem`; GB code and name rules (localisation); manager must be a code; split name | BC inserts Employee (Validate order: No., names, dates), default site, Default Dimension, history (created), audit. |
| `PATCH /api/v1/employees/:id` | `emp_crud` | PATCH `employees(id)` (If-Match) | `employeeEditProblem`; `code`/`state` refused; user-type `locked` guards; `changed` = diff | No-op returns `auditId: null`. A location change moves the default site; an email change renames the account. |
| `GET /api/v1/employees/:id/history` | (signed in): own, or in scope | GET `employeeHistory?$filter=employeeNo eq …&$orderby=at desc` | by.name join; id `hist_` | |
| `POST /api/v1/employees/:id/transitions` | `emp_crud` | POST `employees(id)/transition` | `transitionProblem` (`domain/lifecycle.ts`), `activationProblem` (onboarding), reason required | 409 `transition` names allowed states. |
| `GET /api/v1/locations` | (signed in) | GET `workSites`; GET `employees?$select=code,displayName,locationCode`; GET `projects?$select=code,workSiteCode` | `usageOf('locations')`; `active = !blocked` | |
| `POST /api/v1/locations` | `master_data` | POST `workSites` | Code pattern, unique; refs exist; address ≤ 100 (GB-Q14) | BC adds the work-site Dimension Value. |
| `PATCH /api/v1/locations/:id` | `master_data` | PATCH `workSites(id)` | diff → `changed` | Code immutable. |
| `DELETE /api/v1/locations/:id` | `master_data` | POST `workSites(id)/remove` | `usageOf` → 409 `in-use` with usedBy | BC repeats; never deletes employee sites. |
| `GET /api/v1/departments` | (signed in) | GET `departments`; employees and locations as above | inUse | |
| `POST /api/v1/departments` | `master_data` | POST `departments` | code, name ≤ 50 | |
| `PATCH /api/v1/departments/:id` | `master_data` | PATCH `departments(id)` | diff | |
| `DELETE /api/v1/departments/:id` | `master_data` | POST `departments(id)/remove` | `in-use` | BC also checks Default Dimension rows on any table. |
| `GET /api/v1/cost-centres` | (signed in) | GET `costCentres`; locations and projects | inUse | |
| `POST /api/v1/cost-centres` | `master_data` | POST `costCentres` | | |
| `PATCH /api/v1/cost-centres/:id` | `master_data` | PATCH `costCentres(id)` | diff | |
| `DELETE /api/v1/cost-centres/:id` | `master_data` | POST `costCentres(id)/remove` | `in-use` | |
| `GET /api/v1/positions` | (signed in) | GET `positions`; employees; GET `onboardingTemplateJobProfiles` | inUse | |
| `POST /api/v1/positions` | `master_data` | POST `positions` | | |
| `PATCH /api/v1/positions/:id` | `master_data` | PATCH `positions(id)` | diff | A name change also refreshes `Job Title` on holders. |
| `DELETE /api/v1/positions/:id` | `master_data` | POST `positions(id)/remove` | `in-use` (employees, onboarding templates) | |
| `GET /api/v1/projects` | (signed in) | GET `projects?$expand=tasks` | inUse; budgetHours as text; status mapped back | |
| `POST /api/v1/projects` | `master_data` | POST `projects` | status map, name ≤ 100 | Job Status mapping 02 §3.4. |
| `PATCH /api/v1/projects/:id` | `master_data` | PATCH `projects(id)` | diff | |
| `DELETE /api/v1/projects/:id` | `master_data` | POST `projects(id)/remove` | `in-use` (timesheet entries) | BC also refuses a Job with ledger entries. |
| `GET /api/v1/work-patterns` | (signed in) | GET `workPatterns`; GET `employees?$select=workPatternCode` | inUse | |
| `GET /api/v1/work-patterns/library` | `type_cfg` | none | Archetypes shipped in Node | |
| `POST /api/v1/work-patterns` | `type_cfg` | POST `workPatterns` | `TYPE_CODE` pattern, unique; startedFrom to the audit reason | |
| `PATCH /api/v1/work-patterns/:id` | `type_cfg` | PATCH `workPatterns(id)` | code refused; diff | An employment type change updates the pattern only; holders keep their own employment type. |
| `DELETE /api/v1/work-patterns/:id` | `type_cfg` | POST `workPatterns(id)/remove` | `in-use`, `last-type` | |
| `GET /api/v1/pay-grades` | (signed in) | GET `payGrades` (SIR Pay Grade: Code, Description) | sorted by code | Read only. |
| `GET /api/v1/pay-levels` | (signed in) | GET `payLevels` (SIR Pay Level: Code, Description, Rank; never Basic Salary) | sorted by rank | Read only. |
| `POST /api/v1/profile-changes` | `own_home` | POST `commands {profileChangeProposals}` | `routeFor` per field from the Profile chain; drop unchanged fields | Returns `records` re-read from `profileChanges`. |
| `GET /api/v1/profile-changes` | (signed in): `profile_appr` and/or `bank_verify` | GET `profileChanges?$filter=status eq 'pending' and stage eq 'manager'` (own team) and/or `… stage eq 'payroll'` | Manager stage: employees whose managerNo is the caller (or delegated) | 403 when neither capability. |
| `POST /api/v1/profile-changes/:id/decision` | (signed in): stage capability | POST `profileChanges(id)/decide` | `afterDecision`; own-change; scope | Response `employee` re-read when written. |
| `GET /api/v1/pay-codes` | `mod_cfg` | GET `payCodes`; GET `tsAllowances`, `tsTypeAllowances`, `tsTypeRules` | `claimedBy`, `payCodeUsage` | Allowance rows read only. |
| `POST /api/v1/pay-codes` | `master_data` | POST `payCodes`; GET `payElements` (element exists) | `payCodeProblem`, `normalisePayCode` | Strict body: money keys refused. |
| `PATCH /api/v1/pay-codes/:id` | `master_data` | PATCH `payCodes(id)` (If-Match) | `payCodeChanges`; code may be sent unchanged | noop when nothing changed. |
| `DELETE /api/v1/pay-codes/:id` | `master_data` | POST `payCodes(id)/remove` | `payCodeUsage` → `in-use` | BC repeats against the timesheet tables. |

### 5.2 Timesheet (14 operations)

| Contract operation | Capability | BC call(s) | Node-side logic | Notes |
|---|---|---|---|---|
| `GET /api/v1/timesheets/:employeeId/weeks/:weekStart` | own_ts own; team_ts + scope | Week `$batch`, §6.1 | `access`, `requireWeekStart`, `weekModel`, `weekTotals`, `periodLocked`, `lockNote`, `advisoryFlags`, earlier weeks, `captureFor` | No rota, leave or sickness reads (contract dropped them). |
| `PUT /api/v1/timesheets/:employeeId/days/:date` | own_ts; team_ts + proxy | Cached config; GET the day (with children) and clock record; POST `commands {timesheetDaySaves, submit: false}`; GET `timesheetDays(id)?$expand=…` | `draftBase` (`ALREADY_SUBMITTED`), `clockRunsOn` (`CLOCK_RUNNING`), `checkDay`, `deriveWorkType`, `isLocked` (`PERIOD_LOCKED`), allocation names → codes, warnings | Command and re-read can share one `$batch`. |
| `POST /api/v1/timesheets/:employeeId/days/:date/submit` | as above | As PUT with `submit: true` | Plus the chain walk for waitingRole, chainRoles and reason; `ts_submitted` notification | |
| `POST /api/v1/timesheets/:employeeId/weeks/:weekStart/submit` | as above | GET the week's days and `timesheetWeeks` row; POST `commands {timesheetWeekSubmits}` (1 week) | Per-day stale check, `planWeekSubmit`, `clockHolds`, `NOTHING_TO_SUBMIT`, held days, flagged, `weekMinutes` | Node sends the week version it read (R2). |
| `POST /api/v1/timesheets/:employeeId/multiweek/submit` | as above (+ MULTIWEEK flag) | GET days and `timesheetWeeks` for the chosen weeks; POST `commands {timesheetWeekSubmits}` (n weeks) once, or nothing if all are held | `planWeek(… 'stored')`, locked weeks held with the lock note, clock holds | `auditId: null` when nothing is sent. |
| `POST /api/v1/timesheet-days/:id/transition` | chain layer (team_ts line manager, pay_appr payroll) or delegate | GET the day and log; POST `timesheetDays(id)/transition` (with postingLines on the last ok); GET the day; GET `postingLines?$filter=timesheetDayId eq …&$top=1` when lines were queued | `walkOf`, `block` → `SELF_APPROVAL`, `ALREADY_SIGNED`, `scope`, `WRONG_LAYER`, `capability`; ok → mgrok when not final; `tsTransitionProblem`; `returnReasonProblem`; pay code split (B5); notifications | `DayDecided.attempt` once the contract restores it (§5.6). |
| `GET /api/v1/timesheet-config` | mod_cfg | GET `timesheetConfigs?$expand=fieldDefaults,allowances,typeCaptures($expand=fields,allowances,rules)`; GET `payCodes` | Compose cutoff, map enums; add the field catalogue | Cached; invalidated on Version. |
| `PATCH /api/v1/timesheet-config` | mod_cfg | POST `timesheetConfigs(id)/save` | zod; `timesheetConfigProblem` (also in AL, B7); before/after diff for the audit | |
| `GET /api/v1/clock/me` | own_ts | GET `clockRecords?$filter=employeeNo eq E and (isOpen eq true or date eq today)&$expand=events`; `timesheetDays` for those dates; `payPeriods` | `locate`, `isForgotten`, `dayBlocked`, gates, `elapsedSeconds`; serverNow = the `Date` header | Employee type, flags and config from cache. |
| `POST /api/v1/clock/in` | own_ts | As `/clock/me`; POST `commands {clockMoves, kind: in}`; GET the record | `owner` (`MODULE_OFF`, `NOT_CLOCK_TYPE`), `closeFirst` (`CLOCK_OPEN`), `moveProblem`, `clockInAgainProblem` (`BREAK_LIMIT`), `dayBlocked` | |
| `POST /api/v1/clock/break/start` | own_ts | POST `commands {clockMoves, kind: breakStart}` | `breaksOn` (`FLAG_OFF`), breaksUsed vs breaksMax (`BREAK_LIMIT`) | breaksMax from `workforceSetup`. |
| `POST /api/v1/clock/break/end` | own_ts | POST `commands {clockMoves, kind: breakEnd}` | `moveProblem` | |
| `POST /api/v1/clock/out` | own_ts | GET clock and day; POST `commands {clockMoves, kind: out, day…}`; GET record and day | `clockEntry`, `checkDay`, `clockWritten`; on a day refusal next = `CHOOSE_FINISH_NEXT` | One transaction writes the event and the day. |
| `POST /api/v1/clock/:date/close` | own_ts | GET clock and day; POST `clockRecords(id)/close` | `isForgotten`, `finishAhead`, `BAD_FINISH`, `dayBlocked` → noDay + `ts_missing` notice to the line manager | |

### 5.3 Onboarding (27 operations)

Every operation refuses `module-off` (403) while the Onboarding module (`WF_ON` in `SIR Feature Register`, B8) is off, plus the shared codes. Node blanks `data` and `signature` in any `record` it returns to an onb_track or onb_verify caller (§9 of doc 10, contract change C3).

| Contract operation | Capability | BC call(s) | Node-side logic | Notes |
|---|---|---|---|---|
| `POST /api/v1/onboarding/cases/:id/portal-invite` | `onb_track` + scope | GET `onboardingCases?$filter=publicId eq …`; POST `onboardingCases(id)/caseAction {portalInvite}` | Scope; build the response; blank data and signature | Later also creates the portal login (GB-Q10). |
| `GET /api/v1/onboarding/config` | `onb_cfg` | GET `onboardingConfig?$expand=…`, `onboardingDocTypes`, `onboardingPolicies`, `onboardingTemplates?$expand=positions`, `positions`, `featureFlags`, cases and employees for counts | `onbFeatures`, step availability, verifiers, `inProgress`, template starters, `removeText` | |
| `PUT /api/v1/onboarding/config` | `onb_cfg` | POST `onboardingConfig(id)/save` | `configProblem` first; summary text | |
| `DELETE /api/v1/onboarding/documents/:doc` | `onb_cfg` | POST `onboardingConfig(id)/saveDocType {remove}` | `documentUsers` names for usedBy | In-use rule also in AL (B7). |
| `PATCH /api/v1/onboarding/documents/:doc` | `onb_cfg` | POST `onboardingConfig(id)/saveDocType {rename}` | `documentProblem` | |
| `POST /api/v1/onboarding/documents` | `onb_cfg` | POST `onboardingConfig(id)/saveDocType {add}` | `newDocumentId`, `documentProblem` | |
| `POST /api/v1/onboarding/me/documents/:doc` | `own_onb` | (1) stream the file to Blob Storage; (2) POST `onboardingCases(id)/uploadDocument` | `uploadProblem`, `uploadState`, preview made server side; §6.6 | The contract body has no bytes today (contract change C4). |
| `POST /api/v1/onboarding/me/policies/:id/ack` | `own_onb` | POST `onboardingCases(id)/policyAck {ack or unack}` | `setPolicyAck`; policies asked through `templateFor` | |
| `POST /api/v1/onboarding/me/policies/:id/read` | `own_onb` | POST `onboardingCases(id)/policyAck {read}` | | |
| `PUT /api/v1/onboarding/me/steps/:step` | `own_onb` | POST `onboardingCases(id)/readMyData`; POST `onboardingCases(id)/saveStep` | `stepsAsked`, `saveStep` (`mergeStep`, `stepProblem`); GB step validation | Data sent whole; audit names sections only. |
| `POST /api/v1/onboarding/me/submit` | `own_onb` | POST `onboardingCases(id)/submit` | `submitCase`, `askedNow`, `nextRef` | |
| `GET /api/v1/onboarding/me` | `own_onb` | GET `onboardingCases(own)?$expand=…`, `onboardingConfig?$expand=…`, `onboardingDocTypes`, `onboardingPolicies`, templates; POST `onboardingCases(id)/readMyData` | Template resolution, views, progress, `toSubmit`, `toStart` | Only while candidate or preboard (`NOT_ONBOARDING`). |
| `POST /api/v1/onboarding/policies/:id/file` | `onb_cfg` | (1) Blob Storage; (2) POST `onboardingPolicies(id)/attachFile` | `applyPolicyUpload`: picks still-onboarding cases asked this policy | |
| `DELETE /api/v1/onboarding/policies/:id` | `onb_cfg` | POST `onboardingPolicies(id)/remove` | `removePolicyText` | Removes template and Default rows; acknowledgements stay. |
| `PATCH /api/v1/onboarding/policies/:id` | `onb_cfg` | POST `onboardingPolicies(id)/update` | `policyProblem` | |
| `POST /api/v1/onboarding/policies` | `onb_cfg` | POST `commands {onboardingPolicySaves}` (idempotencyKey) | `policyKey`, `policyFromDraft` | |
| `POST /api/v1/onboarding/team/:employeeCode/chase` | `onb_track` + scope | POST `onboardingCases(id)/caseAction {chase}` | `blockers`, `outstandingText` | |
| `POST /api/v1/onboarding/team/:employeeCode/documents/:doc/reject` | `onb_verify` + scope | POST `onboardingDocuments(id)/check {reject}` | `decideDocument`; redact record | |
| `POST /api/v1/onboarding/team/:employeeCode/documents/:doc/verify` | `onb_verify` + scope | POST `onboardingDocuments(id)/check {verify}` | `decideDocument`; redact record | Refused until the scan is clean. |
| `POST /api/v1/onboarding/team/:employeeCode/invite` | `onb_track` + scope | POST `onboardingCases(id)/caseAction {invite}`; GET `employees(id)` | `transitionProblem`; redact record | No email sent yet. |
| `POST /api/v1/onboarding/team/:employeeCode/start` | `onb_track` + scope | POST `onboardingCases(id)/caseAction {start}`; GET `employees(id)` | `startProblem` (blockers against asked); redact record | BC writes Employee, Relatives, Qualifications; the GB events write NINO, the starter checklist, the declaration and student loans. One transaction. |
| `GET /api/v1/onboarding/team/:employeeCode` | onb_track or onb_verify + scope | GET the case with `$expand`, config, doc types, templates, the employee | `StarterOnboarding` (strict; no answers) | |
| `GET /api/v1/onboarding/team` | onb_track or onb_verify (all locations with onb_cfg) | GET `onboardingCases?$expand=…`, `employees?$filter=state eq 'candidate' or state eq 'preboard'` in scope, config, doc types, templates | Tracker rows, queue, `toVerify` | |
| `DELETE /api/v1/onboarding/templates/:id` | `onb_cfg` | POST `onboardingTemplates(id)/remove` | `templateDeletedText` | Its job profiles fall back to Default. |
| `GET /api/v1/onboarding/templates/:id` | `onb_cfg` | GET `onboardingTemplates?$filter=id eq …&$expand=…`; doc types | `normaliseTemplate` | |
| `PUT /api/v1/onboarding/templates/:id` | `onb_cfg` | POST `onboardingTemplates(id)/save`; GET `positions` | `onbTemplateProblem`, no-op detection, audit diff | `PROFILE_TAKEN` also guaranteed by the unique key. |
| `POST /api/v1/onboarding/templates` | `onb_cfg` | POST `commands {onboardingTemplateSaves}` | `onbTemplateNameProblem`, `onbTemplateId`, `newTemplateFrom` | |

### 5.4 Count check

| Module | `backend-inputs.md` | Mapped above | Not mapped |
|---|---|---|---|
| Core | 83 | 83 | 0 |
| Timesheet | 14 | 14 | 0 |
| Onboarding | 27 | 27 | 0 |
| **Total** | **124** | **124** | **0** |

Notes on the count: the foundation reviewer mapped 46 Core operations and the people reviewer 41, with pay codes (4) and profile (1) in both; the people reviewer's own total counted employees as 8 operations, but the contract has 7, so the people area is 40 (35 of its own plus the 5 shared). `GET /api/v1/approvals/timesheets` and `POST /api/v1/approvals/timesheets/bulk` are Core in the contract but built on the timesheet tables; they are mapped once, above. `GET /api/v1/pay-grades` and `GET /api/v1/pay-levels` came into the contract after the reviews and are the two Core operations above 81. Every operation in `backend-inputs.md` was checked against this section.

### 5.5 Operations not mapped

None of the 124. Left out on purpose, as the contract does: the development-only endpoints (`devOnly`: demo accounts, saved-data controls), `POST /api/v1/session` (03 #1, no longer in the contract), notices (deferred) and `POST /api/v1/integration/dispatch` (mock only; the Job Queue does it).

### 5.6 Posting operations to restore (not in the 124)

The posting surface was cut from the contract (`docs/superpowers/cuts.md:141-156`, `:165-167`; `src/contract/contract.test.ts:118` forbids `/api/v1/integration`). Posting is in the first product, so these come back (doc 10 §9, contract change C1):

| Operation | Capability | BC call(s) | Node derives |
|---|---|---|---|
| `GET /api/v1/integration/attempts` | `integration` | GET `postingLines?$orderby=queuedAt desc&$top=200&$expand=timesheetDay($select=publicId)`; GET `postingLines/$count` with `state eq 'queued'`, with `state eq 'failed'`, and with posted or reconciled lines of the current period (payFrequency, fiscalYear, payCyclePeriod); GET `payCodes` | `PostingLog`: attempts (`PostingRow` = IntegrationAttempt + integrationId = targetEntryNo as text, or batchNo before posting), tiles (posted this period, queued, failed, mapped, codes), mapping (code, label, basis, element = Pay Element, allowance) |
| `POST /api/v1/integration/attempts/:id/retry` | `integration` | Resolve id (publicId) to SystemId; POST `postingLines(id)/retry`; GET `postingLines(id)` | `mutation(IntegrationAttempt)` |
| `TimesheetDay.posting`, `.integrationAttemptId`, `DayDecided.attempt` (fields on existing operations) | as the operation | `timesheetDays` with `postingState`, `lastPostingLineNo` (→ `postingLines` publicId) in `$select` | day `posting`, `integrationAttemptId` |

## 6. Views assembled by Node

Each is one `$batch` of independent GETs unless stated. Everything under "from cache" is refreshed when its `version` or `updatedAt` moves.

### 6.1 Week view (`GET /timesheets/:employeeId/weeks/:weekStart`)

1. `employees('{E}')` (or cache). Never the GB `dogma/payroll` `employees` page: it exposes pay amounts.
2. `timesheetDays?$filter=employeeNo eq '{E}' and date ge {WS} and date le {WS+6}&$expand=entries($expand=breaks,fields),allowances,log`
3. `timesheetDays?$filter=employeeNo eq '{E}' and date lt {WS} and date ge {WS−364} and state ne 'ok'&$select=date,weekStart,state,minutes` (earlier weeks; Node keeps the newest 8 that are ready or submitted)
4. `clockRecords?$filter=employeeNo eq '{E}' and date ge {WS} and date le {WS+6}&$select=date,closedLateFinish`
5. `payPeriods?$filter=payFrequency eq '{SIR Pay Cycle Code}' and endDate ge {WS−364} and startDate le {WS+6}`
6. `timesheetWeeks('{E}','{WS}')` for the aggregate version.

From cache: `timesheetConfigs` with parts, `payCodes`, employee types, modules and flags, open projects (`projects` with tasks). Key reads only (PK range on the day, PK on the clock record, `SK1 Start Date` on the pay period). Target: under 300 ms p95 (O3).

### 6.2 Approval queue (`GET /approvals/timesheets`)

Node first resolves, from the session and the cached chain and delegations, the line managers the reader decides for (`M` = self and anyone whose delegation they cover) and whether they hold `pay_appr`.

1. Decidable set, lean, all rows: `timesheetDays?$filter=waitingRole eq 'Line manager' and lineManagerNo in ({M}) and (state eq 'pend' or state eq 'resub' or state eq 'mgrok')&$select=publicId,employeeNo,date,state,version,minutes,captureSource,submittedAt,workSiteCode`; for payroll holders also `waitingRole eq 'Payroll' and state eq 'mgrok'` (keys `QueueManager`, `QueueRole`).
2. Page rows for the requested tab, `$orderby=date desc,employeeNo&$skip={cursor}&$top=50&$expand=entries($expand=breaks,fields),allowances,log`: pend uses the filters of 1; ok, back, resub, mgrok use `lineManagerNo in ({M}) and state eq '{s}'` (or `contains(chainRoles,'Payroll')` for payroll holders); all uses `state ne 'draft'`; weekStart adds the week's dates and drops `$skip`/`$top`; q: Node turns matching names into `employeeNo in (…)` or matches a date.
3. Counts: `tsQueueCounts?$filter=lineManagerNo in ({M})` (and the week range) → (state, count); payroll holders add `contains(chainRoles,'Payroll')`.
4. `clockRecords?$filter=employeeNo in ({page employees}) and date ge {min} and date le {max}&$select=employeeNo,date,closedLateFinish`

Node then walks each row (`walkChain` with signed layers from `log`), sets `decide`, builds `bulk` (ids, `queueChecksum` over `id:state:version`, employees, minutes, flagged, outside) from call 1, `oldestPending` from `submittedAt`, and `sla` from the chain.

### 6.3 Tenant (`GET /tenant`)

`workforceSetup` (settings, tenant version, template key, flag extras, financial year with its label, default pay frequency), `companyInformation`, `workforceModules`, `featureFlags`, `bankHolidays`, `timesheetConfigs` (weekGrid, weekLayout). Node builds the modules and flags maps and `restore` from `restoreOnParent`.

### 6.4 Home (`GET /home`)

`employees(eyes)`; `timesheetDays?$filter=employeeNo eq E and date ge M1 and date le M2&$select=date,state,minutes,waitingRole,returnReason`; `timesheetDays?$filter=employeeNo eq E and state eq 'back'&$orderby=date desc&$top=1`; `bankHolidays`; `payPeriods`; `workforceModules`, `timesheetConfigs` (cache). Bank holidays match annual recurring rows on day and month (`B/Codeunit/Cod70702589.SIRTimesheetBaseEngine.al:206-211`). Rota and leave parts are gone.

### 6.5 Onboarding (`GET /onboarding/me`, `/team`, `/team/:employeeCode`)

The case with `$expand=caseSteps,documents,casePolicies`, `onboardingConfig?$expand=steps,docTypes,defaultPolicies`, `onboardingPolicies`, `onboardingTemplates?$expand=positions,steps,documents,policies`, and the employees. For `/me`, Node adds `onboardingCases(id)/readMyData` (answers, self only). Node resolves the template per starter from the job profile (GB-D58) and blanks answers for trackers.

### 6.6 File upload and read (P6: Azure Blob Storage through Node; BC holds metadata)

1. **Upload.** The browser sends the file to Node (contract change C4: multipart, or a new `upload-url` operation returning a short write SAS). Node checks capability, case state and size (8 MB, `UPLOAD_MAX_BYTES`) before it accepts bytes.
2. **Store.** Node writes to a per-tenant container, `onboarding/{companyId}/{employeeNo}/{docTypeId}/{uuid}` (policies: `policies/{companyId}/{policyId}/{uuid}`), computes SHA-256 and makes the image preview (560 px, quality 0.7) as a second blob.
3. **Record.** `onboardingCases(id)/uploadDocument` (or `onboardingPolicies(id)/attachFile`) with name, size, type, keys and hash; BC sets Scan State pending. If BC refuses, Node deletes the blobs.
4. **Scan.** Defender for Storage scans on upload; Node gets the result (Event Grid) and calls `recordScan`. Infected blobs are deleted.
5. **Read.** The contract has no download operation (contract change C4). Node checks capability and scope, gets the key through `fileKey`, and returns a 5-minute read SAS or streams the file. Only clean files are served.
6. **Replace and remove.** An old blob is deleted after the retention period (GB-Q20). BC never stores file bytes, and no file content or answer reaches the audit.

## 7. Background jobs (Job Queue)

Created per company by 70703162 `SIR_WF Install` and 70703163 `SIR_WF Upgrade`.

| Codeunit | Recurrence | Category | Max. attempts / rerun delay | What it does |
|---|---|---|---|---|
| 70703159 `SIR_WF Session Cleanup` | Hourly | — | 3 / 600 s | Ends sessions of blocked or removed accounts; deletes ended sessions older than `Session Retention (Days)`. |
| 70703160 `SIR_WF Idempotency Cleanup` | Hourly | — | 3 / 600 s | Deletes 70703165 rows past Expires At. |
| 70703161 `SIR_WF Audit Archive` | Yearly | — | 3 / 3600 s | Retention policy on 70703159 `SIR_WF Audit Event`. |
| 70703222 `SIR_WF Posting Dispatcher` | Every day, `No. of Minutes between Runs` = 1 | `SIR_WF-POST` | 3 / 60 s (the job itself; line retries below) | Steps below. `On Hold` until `SIR_WF Setup."Posting Enabled"` is switched on, then `Ready`. |
| 70703225 `SIR_WF Posting Reconcile` | Every day from 02:00 tenant time, 1440 minutes between runs | `SIR_WF-POST` | 3 / 600 s | Reconciliation states below. Also mirrors each day's Posting State. |

The two posting jobs share Job Queue Category `SIR_WF-POST`, so they never run at the same time (GB-D69). Notice expiry and leave escalation wait for their modules.

**Dispatcher steps.**

1. Exit if `Posting Enabled` is off.
2. Read up to 500 lines on key `Dispatch` with State queued and Next Attempt At ≤ `CurrentDateTime`. Stop after about 50 seconds so runs do not overlap.
3. For each line: `Commit`; lock it (`ReadIsolation := UpdLock`, `Get`); re-check State queued (problem D); `ClearLastError`; `if Codeunit.Run(Codeunit::"SIR_WF Post Line", PostingLine)` (70703223: pre-checks, insert and line update in one transaction, doc 12 §6.2–6.3) the line is posted.
4. On a false return: if `GetLastErrorText` starts with a known data code (doc 12 §6.2) → failed, Error Kind data. Otherwise transient: Attempt += 1; after the 4th try → failed, Error Kind transient; else Next Attempt At = now + 1, 5, 15 or 60 minutes (GB-D65). Write the 70703204 row, mirror the day's Posting State, notify `integration` holders on failed, `Commit`.

**Reconciliation states** (set by 70703224 `SIR_WF Posting Landed` and the nightly reconcile, GB-D68):

| Situation | Found by | Line result | Reconcile Issue | Notify |
|---|---|---|---|---|
| Landed, stamped, landed period = expected period, period posted | reconcile | reconciled, Reconciled At | none | — |
| Landed in another frequency or period (problem G before the Base fix) | subscriber at landing | stays posted | wrong-period | `integration` holders and payroll |
| Row still waiting (`Is Timesheet Created = false`) after the expected period's end + `Late Line Alert (days)`, or the period has posted | reconcile | stays posted | late | `integration` holders and payroll |
| Consumed but never stamped (Daily mode, problem B) | reconcile, by `SIR_WF Posting Line Id` in 70702614 and 70702661 | reconciled when the expected period is posted | none (log note "not traced") | — |
| No interface row in either table, never stamped (deleted by a payroll user) | reconcile | failed, Error Code `ROW_REMOVED`, Error Kind data | missing | `integration` holders; retry allowed |
| Stamped timesheet header reopened (`Status` <> Released, `Cod70702589:91-117`) | reconcile | stays posted | reopened | payroll |

## 8. Permission sets

| Permission set | ID | For | Contents |
|---|---|---|---|
| `SIR_WF Connector` | 70703150 | The Node connector's app registration | Execute on pages 70703150–70703217 and query 70703150 (no GB `dogma/payroll` page). RIMD on the `SIR_WF` tables written by commands; R on 70703156 `SIR_WF Capability`, 70703157 `SIR_WF Capability Group`; RI only on 70703159 `SIR_WF Audit Event`; R on the three posting tables. RIM on `SIR Notification Entry`, `SIR Feature Register` (Workforce rows only, enforced in code), Company Information, Base Calendar Change, Employee, Employee Relative, Employee Qualification, Default Dimension, Dimension Value, Job, Job Task, `SIR Work Sites`, `SIR Employee Sites`, `SIR Employee Bank Account` (written only by a profile-change approval), `SIR TIme Sheet Elements`, Document Attachment (R). R on `SIR Fiscal Year`, `SIR Pay Frequency`, `SIR Payroll Setup`, `SIR Timesheet Setup`, `SIR Payroll Element`, `SIR Pay Grade`, `SIR Pay Level` (the page never exposes `Basic Salary`), Qualification, Human Resources Setup. **No** permission on `SIR Payroll Ledger Entry` or any amount table (`SIR Pay Period.Posted` is read through 70703192 `SIR_WF Pay Period Lock`), and none on `SIR Timesheet Interface` (the dispatcher writes it). Never `SIR_GB Emp Bank Account API` (page 70702712) or `SIR_GB Employee API` (70702750). |
| `SIR_WF Admin` | 70703151 | Payroll and HR staff editing Workforce configuration in the BC client (B7) | The setup pages (from the reserved 70703218–70703267) and RIMD on the configuration tables. |
| `SIR_WF Posting` | 70703152 | The Job Queue user | RM on 70703203 `SIR_WF Posting Line` and 70703180 `SIR_WF Timesheet Day`; RI on 70703204 `SIR_WF Posting Attempt` and `SIR Notification Entry`; R on 70703202 `SIR_WF Posting Batch` and 70703150 `SIR_WF Setup`; RI on `SIR Timesheet Interface` (insert only); R on `SIR Posted Timesheet Interface`, `SIR Timesheet Header`, `SIR Timesheet Line`, Employee, `SIR Pay Period`, `SIR TIme Sheet Elements`, `SIR Work Sites`, `SIR Employee Sites`, `SIR Employee Site Pay Elements` (key only), `SIR Payroll Setup`, `SIR Timesheet Setup`, Dimension Value. **No insert** on Dimension Value, `SIR Work Sites`, `SIR Employee Sites` or Default Dimension, on purpose: if a pre-check ever misses, `Validate("Site Code")` fails on permission instead of creating master data (problem F). `SIR Payroll Ledger Entry` only indirectly (problem O). |

Also: the three Base sets 70702575 `SIR Full Setup`, 70702576 `SIR Full User` and 70702577 `SIR Full Read` list every Base object and need the new objects added. Payroll users running Create Time Sheets need nothing new: 70703224 `SIR_WF Posting Landed` uses `InherentPermissions` (RM) on 70703203. The GB start writes (`SIR_GB Starter Checklist`, `SIR_GB Student Loan Detail`) run inside the connector's start command, and a Base permission set cannot name GB tables, so 70703099 `SIR_GB WF Onboarding CS` declares `InherentPermissions` for them rather than adding a GB permission set extension (GB-D22). Removed from 03 §7: `SIR Approval Session`, `SIR Posted Payroll Header`.

## 9. Existing `dogma/payroll` GB pages

### 9.1 What QniConnect's `/bc` calls use

QniConnect's `/bc` calls go through its own backend to these GB pages (all in Qnipay-GB, `dogma/payroll`). The match is by the fields each call reads (`backend-inputs.md`, "/bc, /session and /auth").

| `/bc` call | GB page | Entity set or bound action | Evidence |
|---|---|---|---|
| `GET /bc/fiscalyears` (DOCS.C1) | 70702745 `SIR_GB Fiscal Year API` | `fiscalyears` | Reads `fiscalYear`, `active`, `allowP60Print` (`G/API Pages/Pag70702745.SIRGBFiscalYear.al:38,43,55`). |
| `POST /bc/employees/:employeeId/p60`, `/p11d`, `/p45` (DOCS.C2–C4) | 70702750 `SIR_GB Employee API` | `[ServiceEnabled]` `GetP45`, `GetP60`, `GetFiscalYearWiseP60`, `GetP11D`, `GetFiscalYearWiseP11D` | `G/API Pages/Pag70702750.SIRGBEmployee.al:396-442`. |
| `GET /bc/notifications`, `PATCH /bc/notifications/:systemId` (BELL.C1, C2) | 70702825 `SIR_GB Notification API` (`v1.0`) | `notifications` | Reads `message`, `seen`, `createdDate`, `createdTime`, `systemId` (`Pag70702825.SIRGBNotificationAPI.al:27-43`). No type filter, so Workforce rows would show (GB-Q11). |
| `GET /bc/employees/current` (HOME.C2) | 70702750 `SIR_GB Employee API` | `employees` | Reads `addressLine3`, `bankAccountNo`, `nationalInsuranceNumber`, `weeklyHoursWorked`, `hmrcTaxCode`, `pensionSet`, `validP11D` (`Pag70702750:71,146,206,216,251,266,389`), and `annualSalary`. |
| `GET /bc/payslips` (HOME.C3) | 70702818 `SIR_GB Payslip API` (`v1.0`) | `payslips` | Reads `period`, `expectedPaymentDate`, `grossPay`, `taxAmount`, `netPay` (`Pag70702818.SIRGBPayslipAPI.al:29-49`). |
| `POST /bc/payslips/:systemId/pdf` (HOME.C4) | 70702818 | `[ServiceEnabled] GetPayslip(systemId)` | `Pag70702818:108-117`. |
| `/bc/portalUsers*`, `/bc/portalRegistrations`, `/bc/environments`, `/bc/client-tenant/companies` | none in the GB repos | — | Held by QniConnect's own backend (GB-Q10). |

### 9.2 Why Workforce does not reuse them

Workforce calls no `dogma/payroll` page (GB-D15):

- **Base cannot depend on GB.** The Workforce pages are in Qnipay-base so that W1 tenants have them too; GB pages do not exist there.
- **No money.** `employees` (70702750) exposes `previousEmploymentPay`, `previousEmploymentTax`, `amountOfOccPension` (`Pag70702750.SIRGBEmployee.al:296,301,336`), unmasked bank and IBAN (`:141-160`); `payslips` exposes `grossPay`, `taxAmount`, `netPay`; `timesheetlines` (70702757) carries `workedHours_0…19` beside rates; `SIR_GB Emp Bank Account API` exposes unmasked account, IBAN and currency.
- **No Workforce rules.** The pages are writable without the session gates, If-Match on `version`, audit or the usage checks (`worksites` 70702759 has no Blocked and no in-use check; `baseCalenderChanges` 70702764 lacks the 80-character holiday name).
- **Wrong shape.** `timesheetheaders`, `timesheetlines`, `timesheetemployees` (70702756–70702758) are payroll documents, not the Workforce day; `fieldconfigurations` (70702767) names payroll's custom hour columns; `payperiods` (70702744) has no `posted`; `activeemployees` (70702766) hides candidates.

Two file-and-ID mismatches to report to the GB team: `Pag70702782.SIRGBEmployeeBankAccount.al` declares page **70702712**, and `Pag70702771.SIRGBNationalInsuranceClassCode.al` declares page **70702779**.

## 10. Trial subset

The throwaway trial (GB-D23) needs five pages and two calls, plus one bound action.

| Page | Entity set | Trial scope |
|---|---|---|
| 70703150 `SIR_WF API Commands` | `commands` | Command `timesheetDaySaves` only. |
| 70703190 `SIR_WF API Timesheet Weeks` | `timesheetWeeks` | R. |
| 70703191 `SIR_WF API Timesheet Days` | `timesheetDays` | R; bound action `transition` (minimal: state change and version check). |
| 70703192 `SIR_WF API Timesheet Entries` | `timesheetEntries` | R, part of days. |
| 70703193 `SIR_WF API Timesheet Breaks` | `timesheetBreaks` | R, part of entries. |

Calls to prove:

1. **Week read**: one `$batch` of `timesheetDays?$filter=employeeNo eq '{E}' and date ge {WS} and date le {WS+6}&$expand=entries($expand=breaks)` and `timesheetWeeks('{E}','{WS}')`. Measure p95 against 300 ms (O3).
2. **Save day**: `POST commands {command: "timesheetDaySaves", sessionId, correlationId, version, payload}` writes the day, entries, breaks and the week's aggregate version in one transaction, refuses `stale` on an old version and returns the refusal format of §1.8.
3. **Bound action**: `POST timesheetDays({id})/Microsoft.NAV.transition` with the five parameters, under the connector's service-to-service token, returns the JSON text of §1.5. This confirms the GB pattern at `Pag70702818.SIRGBPayslipAPI.al:108-117` with parameters beyond one Text.

Not in the trial: sessions (a stub resolves `sessionId` to a fixed employee), audit, idempotency, config, clocking, queue, posting.
