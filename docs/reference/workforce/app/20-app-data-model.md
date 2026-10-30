# QniConnect Workforce: app data model

2026-10-29 · Status: draft for review

This document lists every entity and field the React app sends or receives, taken from the zod schemas in `src/contract`. It is written for two readers: first, reviewers checking that the app's data is complete and sensible; then the backend and API developers who build it in Business Central "GB", reached through the Node API layer.

Sources: the contract in `src/contract/*.ts` and `src/contract/bc/*.ts` (the truth for types, required and optional, lengths, patterns, enums and defaults); the operation list in [`docs/superpowers/handoff/backend-inputs.md`](../../../superpowers/handoff/backend-inputs.md) (124 `/api/v1` operations: Core 83, Timesheet 14, Onboarding 27; plus 26 `/bc`, `/session` and `/auth` calls); the fake server in `src/mocks/*.ts` and its seed `src/mocks/seed/*.json`, which shows what is stored and what is computed per request; and the rules in `src/domain/*.ts`. Where the code and a comment or document disagree, this document states what the code does and lists the mismatch in section 14.

Business Central is the only system of record. A field marked **stored** is one the fake server keeps in its store, so Business Central must hold it. A field marked **derived** is computed per request from stored data; Node computes it with the `src/domain` function named, or Business Central computes it in its page. Nothing is kept in Node.

No money: no `/api/v1` field carries a rate, an amount or a currency (`src/contract/contract.test.ts:10` lints every `/api/v1` schema for them). The `/bc` payroll calls do carry money; see section 13 and the gaps.

Related: the BC field for each contract field in [`../backend/gb/12-gb-field-mapping.md`](../backend/gb/12-gb-field-mapping.md) (cited here as "12 §n"); the BC calls in [`../backend/gb/13-gb-api-endpoints.md`](../backend/gb/13-gb-api-endpoints.md); the rules and workflows in [`21-rules-and-workflows.md`](21-rules-and-workflows.md).

## Contents

1. How to read this document
2. Shared enums
3. Foundation: common shapes, session, tenant, access, setup presets
4. People: employees, dimensions, pay grades
5. Work patterns and pay codes
6. Timesheets and clocking
7. Approvals: chains, delegations and the timesheet queue
8. Profile changes
9. Onboarding
10. Notifications
11. Home and documents
12. Audit
13. The `/bc`, `/session` and `/auth` calls (QniConnect payroll)
14. Gaps

## 1. How to read this document

### 1.1 Columns

Each entity has a one-line description, the operations that read (R) and write (W) it, and a table:

| Column | Meaning |
|---|---|
| Field | The JSON key. `a.b` is a nested key; `a[]` is an array of; `{k: v}` is a record keyed by `k`. |
| Type | `string`, `int` (`z.number().int()`), `number`, `bool`, `date` (`IsoDate`), `datetime` (`IsoDateTime`), `date\|''` (`DateOrBlank`), an enum name from section 2, or another entity. |
| Req | **Y** required; **opt** the key may be absent; **null** required but may be `null`. |
| Limits | Lengths, ranges, patterns and array sizes from the schema. "(domain)" means the server rule in `src/domain` enforces it, not the schema. **—** none in the code. |
| Allowed values | An enum, a literal or a fixed list. **—** any value. |
| Editable / Derived | **Edit** written by a request body; **Create** set on create, refused or ignored after; **Server** set by the server on a write (ids, times, states); **Derived** computed on every read. |
| Stored or derived | **Stored** with the fake store's collection, which stands in for a BC table; or **Derived** with the function (file:line) that computes it. |
| BC mapping | The section of doc 12 that maps it, and the BC table named there. **none** when doc 12 has no row. |

### 1.2 Conventions in the code

- **Record meta.** Every stored record extends `RecordMeta` (`src/contract/common.ts:4`): `id` (string), `version` (int, 0 or more) and `updatedAt` (datetime). The tables below leave these three out unless they behave differently. A write sets `version` to the old one plus 1 and `updatedAt` to the server's now (`src/mocks/http.ts:82-84`). A record that has never been saved (an approval chain, the notification matrix, an onboarding case, a timesheet day) reads at `version` 0. In BC: 12 §2.1 and §3.1 (`Public Id`, `Version`, `SystemModifiedAt`).
- **Ids.** Strings. The fake server builds them from a prefix and the code: `emp_`, `acc_`, `loc_`, `dep_`, `cc_`, `job_`, `prj_`, `typ_`, `pc_`, `pg_`, `pl_`, `tsk_`, `tsd_<employee>_<date>`, `clk_<employee>_<date>`, `onb_<employee>`, `pol_`, `pfc_<n>`, `ntf_`, `dlg_`, `aud_<12 digits>`, `hist_<12 digits>` (seed files and `src/mocks/audit.ts:9`, `src/mocks/world.ts:49`). Paths take either the record `id` or a code, as each operation names.
- **If-Match.** A write marked versioned carries `If-Match: <version>` as a bare whole number, no quotes and no `W/` (`src/contract/endpoints.ts:10-12`). Missing or empty is 428 `version-required`; not a whole number is 412 `version-unreadable`; a different version is 412 `stale` (`src/mocks/http.ts:76-80`). A new record (a timesheet day, a clock record) is written with `If-Match: 0`. The week and bulk writes carry a version per day in the body instead (`src/contract/timesheets.ts:138-142`, `:191`).
- **Mutation wrapper.** Most writes answer `{ record, auditId }` (`mutation()`, `src/contract/common.ts:15`). `auditId` is the audit row's id, or `null` when the write changed nothing. Edits add `changed: string[]`, the fields that changed. Removes answer `{ auditId }`.
- **Refusal.** Every refusal is `{ code, message, next, field?, usedBy? }` (`src/contract/common.ts:7-10`); `usedBy[]` is `{ kind, count, examples[] }`. Statuses are in the handoff (401, 403, 404, 409, 412, 422, 428).
- **Dates.** `IsoDate` is `YYYY-MM-DD` (`z.iso.date()`, `src/contract/employees.ts:6`). `DateOrBlank` also allows `''` for "none" (`:7`). A month is `YYYY-MM` (`src/contract/home.ts:19`). A week is named by its first day (`weekStart`, an `IsoDate`).
- **Date-times.** `IsoDateTime` is `z.iso.datetime()` (`src/contract/common.ts:3`): ISO 8601 with a trailing `Z` and no offset (the zod default). Some fields allow `''` for "not yet" (`submittedAt`, onboarding `invitedAt`). The server's clock is the source; the browser's clock is never used for a stamp (`src/contract/clock.ts:1-4`).
- **Times of day.** Strings `HH:MM`, at most 5 characters in the schema (`src/contract/timesheets.ts:16`, `:21`); the domain reads `H:MM` or `HH:MM` (`src/domain/time.ts:56`). A cut-off is a day and a time, such as `Monday 12:00` (`src/domain/timesheet.ts:563`). `Clock` is `{ date, time }` (`src/contract/timesheets.ts:84`).
- **Durations.** Time worked is whole **minutes** (`minutes`, `weekMinutes`) or, on the clock, whole **seconds** (`elapsedSeconds`). Hours are decimal numbers (`contractedHours`, `maxHours`, `fullTimeWeeklyHours`, `TimeEntry.hours`, `CaptureRules.*`). An SLA is text such as `24 hours` or `3 days` (`src/domain/approvals.ts:112`). Display text such as `7h 30m` comes with the number, never instead of it.
- **Codes.** Employee ID `^[A-Z][A-Z0-9_-]{1,15}$`; dimension code `^[A-Z0-9][A-Z0-9_.-]{0,19}$`; work-pattern code `^[a-z][a-z0-9_]{1,31}$` (`src/domain/codes.ts:5-7`). These are domain rules: the `/api/v1` schemas type codes as plain strings.
- **Flags on operations.** Capability, If-Match, `allowedWhileViewing` and `allowedWhileOnboarding` are listed per operation in the handoff; this document names the operation only.

## 2. Shared enums

Enums used in more than one place. Other tables name the enum and refer here. The value is what goes on the wire; the label the screen shows comes from `src/domain`.

| Enum | Values | Defined at | Used by |
|---|---|---|---|
| `UserTypeKey` | `employee`, `manager`, `admin` | `employees.ts:8`; same list `session.ts:4`, `notifications.ts:14` (`NotifPersona`) | Employee, SessionAccount, ViewAsEmployee, DemoAccount, CreateEmployee, matrix columns |
| `EmployeeState` | `candidate`, `preboard`, `active`, `suspended`, `onleave`, `leaver`, `archived` | `employees.ts:5` | Employee, OnbEmployee, EmployeesQuery |
| `STARTING_STATE` | `candidate`, `preboard`, `active` | `employees.ts:27` | CreateEmployee |
| `EmploymentType` | `Contracted`, `Bank`, `Agency`, `Salaried` | `work-patterns.ts:7` | WorkPattern, PresetType. Not Employee (a plain string there; gap G7) |
| `EntryMode` | `form`, `grid`, `clock` | `work-patterns.ts:8`; repeated inline `timesheets.ts:100`, `clock.ts:39` | WorkPattern, Archetype, PresetType, CaptureSetup.mode, ClockGates.mode |
| `PayBasis` | `hour`, `day` | `work-patterns.ts:9` | WorkPattern.uom, Archetype, PresetType |
| `PatternFieldGroup` | `vehicle`, `site`, `project`, `shift` | `work-patterns.ts:10` | WorkPattern.fieldGroups, PatternLibrary, PresetType |
| `PayCodeBasis` | `multiplier`, `flat`, `hours`, `days`, `units` | `pay-codes.ts:17` from `src/domain/pay-codes.ts:11` | PayCodeRecord, PayCodeRow, CreatePayCode |
| `TsState` | `draft`, `pend`, `back`, `resub`, `ok`, `mgrok` | `timesheets.ts:14` | TimesheetDay, TsHistory, WeekDay (adds `none`), HomeDay.ts |
| `QueueStatus` | `pend`, `all`, `resub`, `ok`, `back`, `mgrok` | `timesheets.ts:164` | QueueQuery.status |
| `WeekGrid` | `hours`, `times` | `timesheets.ts:61` | TimesheetConfig, CaptureSetup, FlagExtras, SetFlag, SetupPreset.extras |
| `WeekLayout` | `classic`, `grid`, `days` | `timesheets.ts:62` | as `WeekGrid` |
| `TimeFormat` | `HH:MM`, `h m` | `timesheets.ts:63` | TimesheetConfig, CaptureSetup |
| `ClockKind` | `in`, `breakStart`, `breakEnd`, `out` | `clock.ts:16` | ClockEvent |
| `ClockStateKey` | `idle`, `running`, `onBreak`, `clockedOut` | `clock.ts:18` | ClockRecord.state |
| `ChainModule` | `Timesheet`, `Profile` | `approvals.ts:14` | ApprovalChain, Delegation, CreateDelegation |
| `SelfFieldKey` | `phone`, `address`, `emergencyFirstName`, `emergencyLastName`, `emergencyPhone`, `bankAccount`, `bankSortCode` | `profile.ts:6` | ProfileChange.field, SelfField.key, ProposeChanges |
| `ApprovalStage` | `manager`, `payroll` | `profile.ts:7` | ProfileChange.route, .decisions[].stage |
| `NotifChannel` | `Off`, `In-app`, `Email`, `In-app + email`, `In-app + email + SMS` | `notifications.ts:12` | MatrixEvent.channels, UpdateMatrix |
| `OnbStepId` | `personal`, `contact`, `emergency`, `additional`, `documents`, `policies`, `review` | `onboarding.ts:19` | onboarding config, templates, case, views, SetupPreset.onboarding |
| `TaskState` | `todo`, `prog`, `done`, `verified`, `rejected` | `onboarding.ts:20` | OnboardingCaseRecord.steps/.docs, step and document views |
| `Verifier` | `hr`, `mgr`, `either`, `none` | `onboarding.ts:21` | OnbDocumentRecord.verify, SetupPreset.onboarding |
| `Tone` | `neu`, `info`, `warn`, `ok`, `err` | `onboarding.ts:17` (not exported) | onboarding views |
| `GlyphKey` | `ok`, `pend`, `resub`, `back`, `draft` | `home.ts:16` | HomeDay.glyph, MonthKey |
| `GlyphTone` | `ok`, `pend`, `att`, `draft` | `home.ts:18` | MonthKey |
| `PresetScope` | `config`, `structure` | `setup-presets.ts:21` | SetupPreset, PresetRow, SavePreset |
| `DATE_FORMATS` | `dd/mm/yyyy`, `yyyy-mm-dd`, `mm/dd/yyyy` | `tenant.ts:8` | Tenant.dateFormat, UpdateTenantSettings, SetupPreset.tenantSettings |
| `CLOCK_STYLES` | `24h`, `12h` | `tenant.ts:9` | Tenant.clock, as above |
| `WEEK_STARTS` | `Monday`, `Sunday`, `Saturday` | `tenant.ts:10` | Tenant.weekStart, as above |
| Capability group | `own`, `team`, `cfg` | `access.ts:5` (inline) | Capability.group |

Module codes (`CORE`, `TS`, `ON`, and the Timesheet methods `A`, `B`, `C`) and feature flag codes (`AUTO_OT`, `LATE_FINISH`, `UNSOCIAL`, `EMAIL_APPROVAL`, `SHOW_PAY`, `VEHICLE`, `PROJECT`, `BREAKS`, `ONB_RTW`, `ONB_CONV`, `ONB_WTD`, `ONB_QUAL`, `ONB_POL`, `ONB_SIGN`, `ONB_VERIFY`, `ONB_PORTAL`, `DOCS`, `SELF_EDIT`, `DAILY`, `WEEKLY`, `MULTIWEEK`, `GPS`, `GEOFENCE`) are not zod enums: the contract types them as record keys (`tenant.ts:27`). The list is the domain catalogue, `src/domain/modules.ts:29-62`.

## 3. Foundation: common shapes, session, tenant, access, setup presets

### 3.1 Common shapes (`common.ts`)

**RecordMeta** (`common.ts:4`). The three fields every stored record carries. R and W: every versioned operation.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| id | string | Y | — | — | Server | Stored (record key) | 12 §2.1, §3.1: `Public Id`, else the key |
| version | int | Y | ≥ 0 | — | Server | Stored; 0 = never saved | 12 §2.1: `Version` |
| updatedAt | datetime | Y | ISO, `Z` | — | Server | Stored | 12 §2.1: `SystemModifiedAt` |

**Refusal** (`common.ts:7-10`). The body of every 4xx. Server only.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | — | shared codes in the handoff | Derived | Derived: the domain rule that refused | 12 §2.1: AL `Error('<code>: …')` |
| message | string | Y | — | — | Derived | Derived | 12 §2.1 |
| next | string | Y | — | — | Derived | Derived (Node looks it up by code) | 12 §2.1 |
| field | string | opt | — | a request key | Derived | Derived | 12 §2.1 |
| usedBy[] | object | opt | — | — | Derived | Derived: `usageOf` (`src/domain/usage.ts`) | 12 §2.1 |
| usedBy[].kind | string | Y | — | — | Derived | Derived | 12 §2.1 |
| usedBy[].count | int | Y | — | — | Derived | Derived | 12 §2.1 |
| usedBy[].examples[] | string | Y | — | — | Derived | Derived | 12 §2.1 |

**Mutation** (`common.ts:15`). `{ record, auditId }`: `record` is the saved entity; `auditId` (string, null) is the audit row written, null when nothing changed. BC: 12 §2.1 (`SIR_WF Audit Event."Entry No."`).

### 3.2 Session (`session.ts`)

**Session** (`session.ts:11-19`). Who is signed in and what they may do. R: `GET /session`, `POST /session/view-as`, `DELETE /session/view-as`. W: view-as start and end; `DELETE /session` ends it. There is no token of the app's own: every call carries the Microsoft one.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| account | SessionAccountView | Y | — | — | Derived | Derived: `sessionView` (`src/mocks/auth.ts:49-68`) | 12 §2.2 |
| capabilities[] | string | Y | — | capability ids | Derived | Derived: `resolveCapabilities`, the user type's plus grants minus revocations; the viewed account's while viewing as (`src/mocks/auth.ts:44`) | 12 §2.2: User Type Capability + Capability Exception |
| viewingAs | object | opt | — | — | Server | Stored: `sessions[email].viewingAs` (employee code); the rest derived | 12 §2.2: `SIR_WF Session."Viewing As Employee No."` |
| viewingAs.employeeCode | string | Y | — | another employee with an account | Server | Stored | 12 §2.2 |
| viewingAs.name | string | Y | — | — | Derived | Derived from Employee | 12 §2.2 |
| viewingAs.userType | UserTypeKey | Y | — | §2 | Derived | Derived from the viewed account | 12 §2.2 |
| viewingAs.roleName | string | Y | — | — | Derived | Derived from UserType.name | 12 §2.2 |
| onboarding | bool | Y | — | — | Derived | Derived: candidate or preboard while module `ON` is on (`src/mocks/auth.ts:40-43`) | 12 §2.2 |

**SessionAccountView** (`session.ts:4`, `:7`). The signed-in account as the account menu shows it.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| email | string | Y | — | — | Read | Stored: `accounts` | 12 §2.2: `SIR_WF Account.Email` |
| userType | UserTypeKey | Y | — | §2 | Read | Stored: `accounts` | 12 §2.2: `Employee."SIR_WF User Type Code"` |
| employeeCode | string | Y | — | — | Read | Stored: `accounts` | 12 §2.2: `SIR_WF Account."Employee No."` |
| name | string | Y | — | — | Derived | Derived: Employee.name, else the email | 12 §2.2 |
| roleName | string | Y | — | — | Derived | Derived: UserType.name | 12 §2.2 |
| roleDescription | string | Y | — | — | Derived | Derived: UserType.description | 12 §2.2 |
| locationName | string | Y | — | — | Derived | Derived: Location.name of the employee's site | 12 §2.2 |

**ViewAsRequest** (`session.ts:21`). W: `POST /session/view-as`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| employeeCode | string | Y | — | another employee with an account | Edit | Stored on the session | 12 §2.2 |

**ViewAsEmployee** (`session.ts:25-26`). One person the menu offers to view as: at most five, one per role. R: `GET /session/view-as/employees`. All derived (`src/mocks/session.ts:44-56`); BC 12 §2.2.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| employeeCode, name | string | Y | — | — | Derived | Derived from Employee | 12 §2.2 |
| userType | UserTypeKey | Y | — | §2 | Derived | Derived from the account | 12 §2.2 |
| roleName, locationName | string | Y | — | — | Derived | Derived | 12 §2.2 |
| onboarding | bool | Y | — | — | Derived | Derived | 12 §2.2 |

`DemoAccount` (`session.ts:28`, `GET /session/accounts`) is development only (`devOnly`), left out of the production contract, and not mapped.

### 3.3 Tenant (`tenant.ts`)

**Tenant** (`tenant.ts:26-34`). The organisation's one settings record. R: `GET /tenant`. W: `PATCH /tenant/modules/:code`, `PATCH /tenant/flags/:code`, `PATCH /tenant/settings`, `POST /setup-presets/:key/apply`, each with If-Match on the tenant's version.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| name | string | Y | trimmed 1–80 on write (`:62`) | — | Edit | Stored: `tenant` | 12 §2.5: Company Information |
| preset | string | Y | — | a preset key | Server (apply) | Stored | 12 §2.5: `SIR_WF Setup` |
| modules | {code: bool} | Y | — | `CORE`, `TS`, `ON`, `A`, `B`, `C` (domain) | Edit (setModule) | Stored | 12 §2.5: SIR Feature Register |
| flags | {code: bool} | Y | — | flag codes in §2 (domain) | Edit (setFlag) | Stored; read through `Boolean()` (`src/mocks/tenant.ts:55`) | 12 §2.5: `SIR_WF Feature Flag` |
| company | Company | Y | — | — | Edit | Stored | 12 §2.5 |
| financialYear | FinancialYear | Y | — | — | Edit | Stored | 12 §2.5: SIR Fiscal Year |
| weekStart | enum | Y | — | `WEEK_STARTS` | Edit; refused while days are open (`src/mocks/tenant.ts:40-49`) | Stored | 12 §2.5: `SIR_WF Setup` |
| bankHolidays[] | BankHoliday | Y | ≤ 200 on write, one per date (`:67-68`) | — | Edit | Stored | 12 §2.5: Base Calendar Change |
| timezone | string | Y | trimmed 1–100 (`:11`) | an IANA zone, `isTimeZone` (`src/domain/time.ts:40`) | Edit | Stored | 12 §2.5: `SIR_WF Setup` |
| dateFormat | enum | Y | — | `DATE_FORMATS` | Edit | Stored | 12 §2.5 |
| clock | enum | Y | — | `CLOCK_STYLES` | Edit | Stored | 12 §2.5 |
| fullTimeWeeklyHours | number | Y | 1–80 on write (`:64`) | — | Edit | Stored | 12 §2.5 |
| extras | FlagExtras | Y | — | — | Edit (setFlag) | Stored in part: see FlagExtras | 12 §2.5 |
| restore | {module: string[]} | Y | — | capture method codes | Server | Stored; `{}` when absent | 12 §2.5: SIR Feature Register |

**Company** (`tenant.ts:14-18`; write shape `:69-75`, every key optional). No currency: money stays in BC.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| registration | string | Y | trimmed ≤ 20 on write | — | Edit | Stored | 12 §2.5: Company Information |
| address | string | Y | trimmed ≤ 200 on write | — | Edit | Stored | 12 §2.5: Company Information |
| country | string | Y | — | write: `United Kingdom`, `Ireland`, `Nepal`; read: any string | Edit | Stored | 12 §2.5 |
| nmwCheck | bool | Y | — | — | Edit | Stored | 12 §2.5: `SIR_WF Setup` |
| bankHolidayRegion | enum | Y | — | `England & Wales`, `Scotland`, `Northern Ireland`, `None` | Edit | Stored | 12 §2.5 |
| payFrequency | string | Y | — | write: `Weekly`, `Fortnightly`, `Four-weekly`, `Monthly`; read: any | Edit | Stored | 12 §2.5: SIR Pay Frequency |
| weekEnding | string | Y | — | write: `Sunday`, `Saturday`, `Friday`; read: any | Edit | Stored | 12 §2.5 |
| firstPayDate | date\|'' | Y | — | — | Edit | Stored | 12 §2.5 |

**FinancialYear** (`tenant.ts:19`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| start | date | Y | — | — | Edit (opt on write) | Stored | 12 §2.5: SIR Fiscal Year |
| end | date | Y | — | — | Edit (opt on write) | Stored | 12 §2.5 |
| label | string | Y | — | e.g. `2026/27` | Server | Stored (seed) | 12 §2.5 |

**BankHoliday** (`tenant.ts:20`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| date | date | Y | unique in the list | — | Edit | Stored on `tenant.bankHolidays` | 12 §2.5: Base Calendar Change |
| name | string | Y | trimmed 1–80 | — | Edit | Stored | 12 §2.5 |

**FlagExtras** (`tenant.ts:25`). Settings that hang off a feature.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| weekGrid | WeekGrid | Y | — | §2 | Edit (flag `WEEKLY`) | Stored on `timesheetConfig`, not on the tenant (`src/mocks/tenant.ts:24-26`, `:57`) | 12 §2.5: `SIR_WF Timesheet Config` |
| weekLayout | WeekLayout | Y | — | §2 | Edit | as weekGrid | 12 §2.5 |
| breaksMax | int | Y | 1–5 (domain, `src/domain/modules.ts:138`) | — | Edit (flag `BREAKS`) | Stored: `tenant.extras` | 12 §2.5: `SIR_WF Setup` |
| vehiclesMax | int | Y | 1–4 (domain) | — | Edit (flag `VEHICLE`) | Stored: `tenant.extras` | 12 §2.5 |

**SetModule** (`tenant.ts:55`, strict). W: `PATCH /tenant/modules/:code`. One field, `on` (bool, Y). Answers `ModuleSwitched` (`:50`): the mutation plus `effect`.

**ModuleEffect** (`tenant.ts:40-48`). What a module switch did, in the server's words. All derived per request and not stored (12 §2.5 "—").

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| message | string | Y | — | — | Derived | Derived: `moduleSwitchText` (`src/domain/modules.ts`) | 12 §2.5 (—) |
| kept[] | {what, count} | Y | count ≥ 0 | — | Derived | Derived: counts from the store | 12 §2.5 (—) |
| capturesRestored[], capturesRemembered[] | string | Y | — | method codes | Derived | Derived | 12 §2.5 (—) |
| siteRemovedFrom[] | string | Y | — | work-pattern names | Derived | Derived: `sitesOff` (`src/mocks/tenant.ts:65-74`) | 12 §2.5 (—) |

**SetFlag** (`tenant.ts:56-59`, strict). W: `PATCH /tenant/flags/:code`. Answers `FlagChanged` (`:52`): the mutation plus `message`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| on | bool | opt | — | — | Edit | Stored: `tenant.flags` | 12 §2.5 |
| weekGrid, weekLayout | enum | opt | only with `WEEKLY` (domain) | §2 | Edit | as FlagExtras | 12 §2.5 |
| breaksMax | number | opt | schema none; whole 1–5 (domain) | — | Edit | as FlagExtras | 12 §2.5 |
| vehiclesMax | number | opt | schema none; whole 1–4 (domain) | — | Edit | as FlagExtras | 12 §2.5 |

**UpdateTenantSettings** (`tenant.ts:61-76`, strict). W: `PATCH /tenant/settings`. Every key is optional and has the Tenant row's limits above. `financialYear` takes only `start` and `end` (`:66`).

### 3.4 Access (`access.ts`)

**Capability** (`access.ts:5`). One permission the matrix controls. R: `GET /capabilities`. The app never writes it.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| id | string | Y | — | e.g. `own_home`, `perm_cfg` | Read | Stored: `capabilities` (18 in each seed) | 12 §2.3: `SIR_WF Capability.Code` |
| group | enum | Y | — | `own`, `team`, `cfg` | Read | Stored | 12 §2.3 |
| label | string | Y | — | — | Read | Stored | 12 §2.3 |
| gate | string | Y | — | — | Read | Stored | 12 §2.3 |
| lockedFor[] | string | Y | — | user type ids | Read | Stored | 12 §2.3: User Type Capability where Locked |

**CapabilityGroup** (`access.ts:7`). A row group of the matrix. R: `GET /capability-groups`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| label, description | string | Y | — | — | Read | Stored: `capabilityGroups` | 12 §2.3: `SIR_WF Capability Group` |
| order | int | Y | — | — | Read | Stored | 12 §2.3 |

**UserType** (`access.ts:10`). An access role template. R: `GET /user-types`. W: `PUT /user-types/:id/capabilities/:capability` (`SetTemplateCapability`, `:12`: `granted` bool), `PATCH /user-types/:id` (`RenameUserType`, `:16`, strict: `name`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| id | string | Y | — | UserTypeKey | Read | Stored: `userTypes` | 12 §2.3 |
| name | string | Y | schema none; trimmed 1–24, unique ignoring case (domain, `src/domain/modules.ts:255-269`) | — | Edit (rename) | Stored | 12 §2.3: `SIR_WF User Type.Name` |
| description | string | Y | — | — | Read | Stored | 12 §2.3 |
| capabilities[] | string | Y | — | capability ids | Edit (set template capability) | Stored | 12 §2.3: User Type Capability |
| defaults[] | string | Y | — | capability ids | Derived | Derived: the seed's list for this type (`src/mocks/access.ts:37-40`) | 12 §2.3 |

**UserAccess** (`access.ts:11`). One sign-in account with its template and exceptions. R: `GET /users`. W: `POST /users/:email/exceptions`, `DELETE /users/:email/exceptions/:capability`; created by `POST /employees` when a work email is given.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| email | string | Y | — | — | Server (follows Employee.email) | Stored: `accounts`, key `acc_<lower-case email>` | 12 §2.3: `SIR_WF Account` |
| name | string | Y | — | — | Derived | Derived: Employee.name (`src/mocks/access.ts:26-29`) | 12 §2.3 |
| employeeCode | string | Y | — | — | Create | Stored | 12 §2.3 |
| userType | string | Y | — | UserTypeKey (as stored) | Edit (through `PATCH /employees/:id`) | Stored | 12 §2.3 |
| grants[], revocations[] | string | Y | — | capability ids | Edit (exceptions) | Stored | 12 §2.3: `SIR_WF Capability Exception` |

**AddException** (`access.ts:17`). W: `POST /users/:email/exceptions`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| capability | string | Y | — | a capability id | Edit | Stored in grants or revocations | 12 §2.3 |
| mode | enum | Y | — | `grant`, `revoke` | Edit | Stored (which list) | 12 §2.3 |
| reason | string | Y | trimmed min 1; no max | — | Edit | Stored on the audit row only (`src/mocks/access.ts:118-121`) | 12 §2.3: `SIR_WF Capability Exception` (gap G17) |

### 3.5 Setup presets (`setup-presets.ts`)

A preset is a template of configuration and, optionally, structure: never employees and never money (`setup-presets.ts:1-6`). The shipped presets are code (`src/domain/setup-presets.ts`); saved and imported ones are stored in `setupPresets` (`src/mocks/setup-presets.ts:40`).

**PresetRow** (`setup-presets.ts:72-81`). One preset as the Organisation page lists it. R: `GET /setup-presets` (inside `PresetList`, `:83`, with `inUse`, the tenant's preset key). W: `POST /setup-presets`, `POST /setup-presets/import`, `DELETE /setup-presets/:key`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| key | string | Y | ≤ 120 in the path (`:107`) | — | Server | Stored | 12 §2.6: `SIR_WF Template` |
| name | string | Y | ≤ 200 on save (`:98`); trimmed 1–80 in the preset (`:58`) | — | Create | Stored (in the preset) | 12 §2.6 |
| description | string | Y | ≤ 300 | — | Create | Stored | 12 §2.6 |
| scope | PresetScope | Y | — | §2 | Create | Stored | 12 §2.6 |
| source | enum | Y | — | `shipped`, `saved`, `imported` | Server | Stored; `shipped` when not stored | 12 §2.6 |
| inUse | bool | Y | — | — | Derived | Derived: key = Tenant.preset (`src/mocks/setup-presets.ts:67-70`) | 12 §2.6 |
| types[], modules[] | string | Y | — | names | Derived | Derived from the preset | 12 §2.6 |
| savedAt | datetime | null | — | — | Server | Stored; null for shipped | 12 §2.6 |
| savedBy, from | string | null | — | — | Server | Stored; null for shipped | 12 §2.6 |
| version | int | null | ≥ 0 | — | Server | Stored; null for shipped | 12 §2.6 |

**SetupPreset** (`setup-presets.ts:57-65`). The preset's content, stored whole as one body. R: `GET /setup-presets/:key/export` (inside `PresetFile`). W: save and import.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| name | string | Y | trimmed 1–80 | — | Create | Stored | 12 §2.6, as "Template (whole)" (gap G3) |
| description | string | Y | trimmed ≤ 300 | — | Create | Stored | 12 §2.6 |
| scope | PresetScope | Y | — | §2 | Create | Stored | 12 §2.6 |
| modules, flags | {code: bool} | Y | — | — | Create | Stored | 12 §2.6 |
| extras | object | Y | each key opt; breaksMax whole 1–5, vehiclesMax whole 1–4 (`:60`) | weekGrid, weekLayout (§2) | Create | Stored | 12 §2.6 |
| labels | {key: string} | Y | each trimmed 1–60 | — | Create | Stored | 12 §2.6 |
| workPatterns[] | PresetType | Y | ≤ 50 | — | Create | Stored | 12 §2.6 |
| roleNames | {employee, manager, admin} | opt | each trimmed 1–24 (`:51`) | — | Create | Stored | 12 §2.6 |
| approvalChain[] | ChainStep | opt | ≤ 40 | — | Create | Stored | 12 §2.6 |
| structure | Structure | opt | — | — | Create | Stored | 12 §2.6 |
| onboarding | Onboarding (preset) | opt | — | — | Create | Stored | 12 §2.6 |
| tenantSettings | TenantSettings (preset) | opt | — | — | Create | Stored | 12 §2.6 |

**PresetType** (`setup-presets.ts:22-25`): `code` (`^[a-z][a-z0-9_]{1,31}$`), `name` (trimmed 1–60), `employmentType` (EmploymentType), `mode` (EntryMode), `uom` (PayBasis), `fieldGroups[]` (PatternFieldGroup, ≤ 4). All required.

**ChainStep** (`setup-presets.ts:26`): `module` (≤ 40), `role` (≤ 40), `scope` (≤ 60), `when` (≤ 80), `sla` (≤ 40), all trimmed strings; `fixed` (bool). All required.

**Structure** (`setup-presets.ts:27-36`). Every list optional. `Code` is trimmed `^[A-Z0-9][A-Z0-9_.-]{0,19}$` (`:20`). Names are trimmed and required (min 1).

| List | Max rows | Row fields and limits |
|---|---|---|
| departments[] | 200 | code (Code), name (1–80), manager (≤ 80) |
| costCentres[] | 200 | code (Code), name (1–80) |
| locations[] | 200 | code (Code), name (1–80), area (≤ 80), department (≤ 20), costCentre (≤ 20), manager (≤ 80), address (≤ 200), active (bool) |
| positions[] | 200 | code (Code), name (1–80), night (bool) |
| projects[] | 500 | code (Code), name (1–120), client (≤ 120), costCentre (≤ 20), manager (≤ 80), status (≤ 40), start and end (date\|''), billable (bool), location (≤ 20), tasks[] (≤ 200: name 1–120, group ≤ 60, billable bool). No `budgetHours`. |

**Onboarding (preset)** (`setup-presets.ts:38-50`): `steps[]` (≤ 10: `id` OnbStepId, `on`); `documents[]` (≤ 20: `id` ≤ 20, `req`, `verify` Verifier, `blocks`, `expiry`, and optional `on`, `custom`, `label` ≤ 60, `hint` ≤ 200); `policies[]` (≤ 500: `id` ≤ 84 matching `^[a-z0-9_]+$`, `label` 1–80, `ver` ≤ 20, `sum` ≤ 300, `body[]` ≤ 40 paragraphs of ≤ 2000); `templates[]` opt (≤ 200: `name` 1–60, `positions[]` ≤ 1000 codes of ≤ 20, `steps[]`, `documents[]`, `policies[]` by name ≤ 80); `defaultPolicies[]` opt. A policy's file never travels. 84 and 500 are `POLICY_ID_MAX` and `POLICY_LIST_MAX` (`src/domain/onboarding.ts:553-555`).

**TenantSettings (preset)** (`setup-presets.ts:52-56`): `timezone` (IANA), `dateFormat`, `clock`, `weekStart` (§2), `fullTimeWeeklyHours` (1–80), `financialYear` `{start, end}` with start ≤ end.

**PresetFile** (`setup-presets.ts:67`). The export file: `kind` (literal `qnipay.setup-preset`), `v` (literal 1), `key` (string), `preset` (SetupPreset). Built per request; not stored as such (12 §2.6 "—").

**SavePreset** (`setup-presets.ts:98`, strict). W: `POST /setup-presets`: `name` (≤ 200), `description` (≤ 300), `scope` (PresetScope). **ImportPreset** (`:101`, strict): `text` (≤ 2,000,000 characters). They answer `PresetSaved` (`record` PresetRow, `auditId`) and `PresetImported` (adds `ignored[]`, the keys left out, money among them).

**PresetPlan** (`setup-presets.ts:91-93`). What an apply would do. R: `GET /setup-presets/:key/plan`; also inside `PresetApplied` (`:95`) with the new Tenant and a `message`. All derived (`src/domain/setup-presets.ts`); 12 §2.6 "—".

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| key, name, summary | string | Y | — | — | Derived | Derived | 12 §2.6 (—) |
| changes[], added[], leftAlone[] | PlanLine | Y | — | — | Derived | Derived | 12 §2.6 (—) |
| PlanLine.area | enum | Y | — | `modules`, `features`, `labels`, `types`, `roles`, `chain`, `structure`, `employees`, `organisation`, `onboarding` (`:87`) | Derived | Derived | 12 §2.6 (—) |
| PlanLine.text | string | Y | — | — | Derived | Derived | 12 §2.6 (—) |

### 3.6 Saved data (`saved-data.ts`, development only)

`SavedData` and `SavedDataExport` (`saved-data.ts:8-25`) describe the fake server's own browser store. All four operations are `devOnly`, so they are not part of the production contract and have no BC mapping.

## 4. People: employees, dimensions, pay grades

### 4.1 Employee (`employees.ts`)

**Employee** (`employees.ts:22-25`, editable keys `:13-18`). One record per employee, read by every module. R: `GET /employees`, `GET /employees/:id`, and inside Profile, StarterMoved and the decided profile change. W: `POST /employees`, `PATCH /employees/:id`, `POST /employees/:id/transitions` (If-Match on the last two), an approved profile change (§8), and onboarding invite and start (§9).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | `^[A-Z][A-Z0-9_-]{1,15}$`, unique (domain, `src/domain/codes.ts:5`); trimmed and upper-cased | — | Create; an edit carrying it is refused (`:35`) | Stored: `employees`, id `emp_<code>` | 12 §3.2: `Employee."No."` Code[20] |
| name | string | Y | — | — | Derived | Derived: `displayName` (`src/domain/employees.ts:11-14`), known-as or first and middle, then last; the fake caches it on write (`src/mocks/employees.ts:84`, `:134`) | 12 §3.2 (joined) |
| firstName | string | Y | trimmed 1–30 (domain, `src/domain/employees.ts:8`, `:71`) | — | Edit | Stored | 12 §3.2: `First Name` Text[30] |
| middleName | string | Y | ≤ 30 (domain) | — | Edit | Stored | 12 §3.2: `Middle Name` |
| lastName | string | Y | 1–30 on create; may not be emptied once set (domain, `:72`, `:90`) | — | Edit | Stored | 12 §3.2: `Last Name` |
| knownAs | string | Y | ≤ 30 (domain) | — | Edit | Stored | 12 §3.2: `SIR_WF Known As` |
| email | string | Y | schema none; required on create, `^[^\s@]+@[^\s@]+\.[^\s@]+$`, unique ignoring case (domain, `:37-45`); lower-cased | — | Edit; re-keys the account | Stored | 12 §3.2: `Company E-Mail` Text[80] |
| phone | string | Y | — | — | Edit; also by profile change | Stored | 12 §3.2: `Mobile Phone No.` Text[30] |
| position | string | Y | an existing position code if set (domain) | Position.code | Edit | Stored | 12 §3.2: `SIR_WF Job Profile Code` |
| workPattern | string | Y | required; an existing code (domain) | WorkPattern.code | Edit | Stored | 12 §3.2: `SIR_WF Employee Type Code` |
| employmentType | string | Y | — | — (gap G7) | Edit | Stored | 12 §3.2: Enum `SIR_WF Worker Category` |
| location | string | Y | required; an existing code; in the caller's scope (domain) | Location.code | Edit | Stored | 12 §3.2: SIR Employee Sites (default site) |
| department | string | Y | an existing code if set (domain) | Department.code | Edit | Stored | 12 §3.2: Default Dimension |
| grade | string | Y | an existing code if set (domain) | PayGrade.code | Edit | Stored | 12 §3.2: `SIR Pay Grade` |
| level | string | Y | an existing code if set (domain) | PayLevel.code | Edit | Stored | 12 §3.2: `SIR Pay Level` |
| manager | string | Y | if shaped like an employee ID it must exist; otherwise any name (domain, `:64-66`) | — | Edit | Stored | 12 §3.2: `Manager No.` Code[20] (gap G5) |
| contractedHours | number | Y | 0–80, not above maxHours when maxHours > 0 (domain, `:47-52`) | — | Edit | Stored | 12 §3.2: `SIR Contracted Hours` |
| maxHours | number | Y | 0–80; 0 = none (domain) | — | Edit | Stored | 12 §3.2: `SIR_WF Max Hours` |
| night | bool | Y | — | — | Edit | Stored | 12 §3.2: `SIR_WF Night Worker` |
| resource | string | Y | — ; trimmed and upper-cased | — | Edit | Stored | 12 §3.2: `Resource No.` Code[20] |
| cis | bool | Y | — | — | Edit | Stored | 12 §3.2: `SIR_WF CIS` |
| start | date\|'' | Y | — | — | Edit | Stored | 12 §3.2: `Employment Date` |
| address | string | Y | — | — | Profile change only; `''` on create (`src/mocks/employees.ts:91`) | Stored | 12 §3.2: `Address`…`Post Code` (gap G8) |
| emergencyFirstName, emergencyLastName | string | Y | — | — | Profile change only | Stored | 12 §3.2: Employee Relative |
| emergencyPhone | string | Y | — | — | Profile change only | Stored | 12 §3.2: Employee Relative `Phone No.` |
| bankAccount | string | Y | — | — | Profile change only; always masked `****1234` on read (`src/mocks/world.ts:32-33`, `src/domain/selfService.ts:54`) | Stored (real number); masked view derived | 12 §3.2: SIR Employee Bank Account |
| bankSortCode | string | Y | — | — | Profile change only | Stored | 12 §3.2: `Bank Branch No.` Text[20] |
| state | EmployeeState | Y | moves only by transition (`:36`) | §2 | Server (transition) | Stored | 12 §3.2: `SIR_WF State` |
| end | date\|'' | Y | — | — | Server: set to today on a move to `leaver` when blank (`src/mocks/transitions.ts:26`) | Stored | 12 §3.2: `Termination Date` |
| userType | UserTypeKey | null | — | §2; null without an account | Edit (needs `perm_cfg`) | Derived from the account (`src/mocks/world.ts:33`); stored on `accounts` | 12 §3.2: `SIR_WF User Type Code` |

**CreateEmployee** (`employees.ts:29`). W: `POST /employees`. The editable keys above (all required), plus `code` (string, Y), `state` (`STARTING_STATE`, Y) and `userType` (UserTypeKey, Y). A work email creates the account (`src/mocks/employees.ts:94`); a candidate or preboard gets an empty onboarding case (`:96`). Answers the mutation.

**UpdateEmployee** (`employees.ts:33-37`). W: `PATCH /employees/:id` (If-Match). Every editable key optional, plus `userType`. `code` and `state` are typed `never`, so sending either is refused naming the field. Answers `EmployeeUpdated` (`:47`): `record`, `auditId` (null), `changed[]`.

**Transition** (`employees.ts:72`). W: `POST /employees/:id/transitions` (If-Match).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| to | string | Y | must be a next state (`src/domain/lifecycle.ts:28-29`) | EmployeeState values | Edit | Stored as Employee.state | 12 §3.2 |
| reason | string | Y | trimmed min 1 (`src/mocks/transitions.ts:18-19`); no max | — | Edit | Stored on HistoryEntry and the audit row | 12 §3.2: Employee History, Audit Event |

**HistoryEntry** (`employees.ts:39-43`). One field change on one employee. R: `GET /employees/:id/history`, newest first. Written by create, edit, transition and an approved profile change (`src/mocks/world.ts:55-61`); never by the client.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| id | string | Y | `hist_` + 12 digits | — | Server | Stored: `employeeHistory` | 12 §3.2: `SIR_WF Employee History` |
| employeeCode | string | Y | — | — | Server | Stored | 12 §3.2 |
| at | datetime | Y | — | — | Server | Stored | 12 §3.2 |
| by.employeeCode | string | Y | — | — | Server | Stored | 12 §3.2 |
| by.name | string | Y | — | — | Server | Stored (name at the time) | 12 §3.2: from Employee |
| source | enum | Y | — | `created`, `edited`, `transition`, `profile-change` | Server | Stored | 12 §3.2 |
| field, from, to | string | Y | — | bank numbers masked (`src/mocks/profile.ts:124`) | Server | Stored | 12 §3.2 |
| reason | string | opt | — | — | Server | Stored | 12 §3.2 |

**NextCode** (`employees.ts:45`): `code` (string, Y), derived by `nextEmployeeCode` (`src/domain/codes.ts`). R: `GET /employees/next-code`. BC 12 §3.2.

**EmployeesQuery** (`employees.ts:51-54`): `state` (opt; `here`, `all` or an EmployeeState; default `here`), `q` (opt string, no max; matches name, code or position name, `src/mocks/employees.ts:66-67`).

### 4.2 Dimensions (`dimensions.ts`)

Five lists with one API shape each (`dimensions.ts:30-41`): `GET` the list (any session), `POST` create, `PATCH /:id` edit and `DELETE /:id` remove (`master_data`; the last two If-Match). The create body is the record without meta; the edit body is the same, partial. The code is immutable after create. The list adds `inUse` (int ≥ 0, derived: `usageOf` and `totalUses`, `src/mocks/dimensions.ts:49-55`, 12 §3.3 "—"). A remove answers 409 with `usedBy` while anything uses the record. For every dimension: `code` is `^[A-Z0-9][A-Z0-9_.-]{0,19}$`, unique, trimmed and upper-cased (domain, `src/domain/codes.ts:6`); `name` is required, trimmed (`src/mocks/dimensions.ts:46-47`); references must name an existing code (`:39-45`). The schemas set no other limits (gap G10).

**Location** (`dimensions.ts:10-11`). A site. Stored: `locations`, id `loc_<code>`. Paths `/locations`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | dimension code | — | Create | Stored | 12 §3.3: SIR Work Sites `Code` |
| name | string | Y | required | — | Edit | Stored | 12 §3.3: `Description` Text[100] |
| area | string | Y | — | — | Edit | Stored | 12 §3.3: `SIR_WF Area` Text[80] |
| department | string | Y | existing code if set | Department.code | Edit | Stored | 12 §3.3: Default Dimension |
| costCentre | string | Y | existing code if set | CostCentre.code | Edit | Stored | 12 §3.3: Default Dimension |
| manager | string | Y | — | — | Edit | Stored | 12 §3.3: `Site Manager` Code[20] (gap G5) |
| address | string | Y | — | — | Edit | Stored | 12 §3.3: `Address` Text[100] |
| active | bool | Y | — | — | Edit | Stored | 12 §3.3: `Blocked` (inverted) |

`LocationOption` (`dimensions.ts:13`, `{code, name}`) is defined but no endpoint uses it (gap G15).

**Department** (`dimensions.ts:14`). Stored: `departments`, id `dep_<code>`. Paths `/departments`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | dimension code | — | Create | Stored | 12 §3.4: Dimension Value `Code` |
| name | string | Y | required | — | Edit | Stored | 12 §3.4: `Name` Text[50] |
| manager | string | Y | — | — | Edit | Stored | 12 §3.4: `SIR_WF Manager No.` Code[20] |

**CostCentre** (`dimensions.ts:15`). Stored: `costCentres`, id `cc_<code>`. Paths `/cost-centres`. `code` (Create) and `name` (Edit, required), as Department. BC 12 §3.4.

**Position** (`dimensions.ts:16`). A job profile. Stored: `positions`, id `job_<code>`. Paths `/positions`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | dimension code | — | Create | Stored | 12 §3.5: `SIR_WF Job Profile` |
| name | string | Y | required | — | Edit | Stored | 12 §3.5: `Name` Text[100] |
| night | bool | Y | — | — | Edit | Stored | 12 §3.5 |

**Project** (`dimensions.ts:17-18`). A costing project, a BC job. Stored: `projects`, id `prj_<code>`; its tasks in `projectTasks`. Paths `/projects`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | dimension code | — | Create | Stored | 12 §3.6: `Job."No."` |
| name | string | Y | required | — | Edit | Stored | 12 §3.6: `Description` Text[100] |
| client | string | Y | — | — | Edit | Stored | 12 §3.6: `SIR_WF Client Name` |
| costCentre | string | Y | existing code if set | CostCentre.code | Edit | Stored | 12 §3.6: Default Dimension |
| manager | string | Y | — | — | Edit | Stored | 12 §3.6: `SIR_WF Manager No.` Code[20] |
| status | string | Y | — | — (seed: `Active`, `Always open`) | Edit | Stored | 12 §3.6: Enum `Job Status` (gap G6) |
| start, end | date\|'' | Y | — | — | Edit | Stored | 12 §3.6 |
| budgetHours | string | Y | — | — (seed: `1,240 h`) | Edit | Stored | 12 §3.6: `SIR_WF Budget Hours` Decimal (gap G6) |
| billable | bool | Y | — | — | Edit | Stored | 12 §3.6 |
| location | string | Y | existing code if set | Location.code | Edit | Stored | 12 §3.6: `SIR_WF Work Site Code` |
| tasks[] | string | Y (list only) | — | — | Derived (read only) | Derived: names from `projectTasks` (`src/mocks/dimensions.ts:51-54`); tasks are stored with `projectCode`, `name`, `group`, `billable` | 12 §3.6: Job Task (gap G19) |

### 4.3 Pay grades and levels (`pay-grades.ts`)

Payroll's own lists, read only; never a level's salary. R: `GET /pay-grades`, `GET /pay-levels` (any session). Stored in `payGrades` and `payLevels`, which stand in for BC's tables (`src/mocks/pay-grades.ts:1-11`).

| Entity.field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| PayGrade.code, .name (`:7`) | string | Y | — | — | Read | Stored; sorted by code | 12 §3.7a: SIR Pay Grade |
| PayLevel.code, .name (`:9`) | string | Y | — | — | Read | Stored | 12 §3.7a: SIR Pay Level |
| PayLevel.rank | int | Y | — | — | Read | Stored; sorted by rank | 12 §3.7a: `Rank` |

## 5. Work patterns and pay codes

### 5.1 Work pattern (`work-patterns.ts`)

**WorkPattern** (`work-patterns.ts:11-12`). What somebody is: how they enter time and what they are paid by. Which timesheet fields a pattern captures is Timesheet setup's (§6.4). R: `GET /work-patterns` (as `WorkPatternRow`, `:14`, with `inUse`). W: `POST /work-patterns`, `PATCH /work-patterns/:id`, `DELETE /work-patterns/:id` (`type_cfg`; the last two If-Match); turning module `C` (Sites) off takes `site` from every pattern (`src/mocks/tenant.ts:65-74`). Stored: `workPatterns`, id `typ_<code>`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | `^[a-z][a-z0-9_]{1,31}$`, unique (domain, `src/domain/codes.ts:7`) | — | Create; an edit carrying it is refused (`:20-22`) | Stored | 12 §3.7: `SIR_WF Employee Type` |
| name | string | Y | trimmed min 1 (`src/mocks/work-patterns.ts:34`, `:47`); no max | — | Edit | Stored | 12 §3.7 |
| employmentType | EmploymentType | Y | — | §2 | Edit | Stored | 12 §3.7 |
| mode | EntryMode | Y | — | §2 | Edit | Stored | 12 §3.7 |
| uom | PayBasis | Y | — | §2 | Edit | Stored | 12 §3.7 |
| fieldGroups[] | PatternFieldGroup | Y | — | §2 | Edit | Stored | 12 §3.7 |
| inUse (list only) | int | Y | ≥ 0 | — | Derived | Derived: `usageOf('work-patterns')` (`src/mocks/work-patterns.ts:30`) | 12 §3.7 (—) |

**CreateWorkPattern** (`work-patterns.ts:17`): the fields above without meta, plus `startedFrom` (string, Y, no limit), the archetype it began from. `startedFrom` is kept on the audit row only (`src/mocks/work-patterns.ts:40`); 12 §3.7 maps it under the old name `CreateEmployeeType.startedFrom` (gap G3). **UpdateWorkPattern** (`:20-22`): every field optional; `code` refused.

**PatternLibrary** (`work-patterns.ts:24-27`). R: `GET /work-patterns/library`. Reference data shipped with the app (`src/mocks/seed/meta.json`, read at `src/mocks/work-patterns.ts:22`), not tenant data; 12 §3.7 "—".

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| archetypes[].key, .name | string | Y | — | — | Read | Shipped reference data | 12 §3.7 (—) |
| archetypes[].mode, .uom, .fieldGroups[] | enums | Y | — | §2 | Read | Shipped | 12 §3.7 (—) |
| fieldGroups[].code | PatternFieldGroup | Y | — | §2 | Read | Shipped | 12 §3.7 (—) |
| fieldGroups[].label, .desc | string | Y | — | — | Read | Shipped | 12 §3.7 (—) |

### 5.2 Pay codes (`pay-codes.ts`)

A pay code is what BC matches a posted line on. Its value is a multiplier (1.5) or a unit count, never an amount; a flat code's amount is set in BC (`pay-codes.ts:1-11`). Reads need `mod_cfg`, writes `master_data`.

**PayCodeRecord** (`pay-codes.ts:22-24`, `:30`). One base pay code. R: `GET /pay-codes` (as `PayCodeRow` inside `PayCodeList`, `:35-47`); also `CaptureSetup.payCodes` and `TimesheetSetup.payCodes` (`PayCode`, `timesheets.ts:79`, the same fields without meta). W: `POST /pay-codes` (`CreatePayCode`, `:50-52`, strict, so a body with an amount, rate or currency is refused), `PATCH /pay-codes/:id` (`UpdatePayCode`, `:55`, partial, If-Match), `DELETE /pay-codes/:id` (If-Match; 409 with `usedBy`). Stored: `payCodes`, id `pc_<code>`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | ≤ 40 on write; `^[A-Z][A-Z0-9_-]{1,11}$` after trim, upper-case and spaces to dashes; unique among pay and allowance codes (domain, `src/domain/pay-codes.ts:18`, `:22`, `:47-48`) | — | Create; a different code on edit is refused (`:54`) | Stored | 12 §3.9: SIR TIme Sheet Elements |
| label | string | Y | ≤ 80 on write; trimmed min 1 (domain) | — | Edit | Stored | 12 §3.9 |
| basis | PayCodeBasis | Y | — | §2 | Edit | Stored | 12 §3.9 |
| value | string | Y | ≤ 5; `''` or `^\d{1,2}(\.\d{1,2})?$` (`:20-21`); above 0; required for `multiplier`, `hours`, `days` and `''` for `flat`, `units` (`:26-28`) | — | Edit | Stored | 12 §3.9 |
| element | string | Y | ≤ 40 on write; `^[A-Z0-9][A-Z0-9_.-]{0,19}$`, upper-cased; one element maps to one code (domain, `src/domain/pay-codes.ts:19`, `:49-50`) | — | Edit | Stored | 12 §3.9 |
| workType | bool | Y | — | — | Edit | Stored | 12 §3.9 |
| claimedBy[] (row) | {code, name} | Y | — | work patterns | Derived | Derived: `claimedBy` (`src/domain/pay-codes.ts:86`), the patterns whose allowances or rules name it | 12 §3.9: TS Type Allowance, TS Type Rule |
| usedBy[] (row) | {kind, count, examples[]} | Y | count ≥ 0 | — | Derived | Derived: `payCodeUsage` (`:94`); empty when removable | 12 §3.9 |

**AllowanceCodeRow** (`pay-codes.ts:44`). An allowance code, read only here, flat with no value; kept with the allowances in Timesheet setup (§6.4). All fields derived from `TimesheetConfig.allowances` (`src/mocks/pay-codes.ts:49-51`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code, label | string | Y | — | — | Read | Stored on `timesheetConfig.allowances` | 12 §3.9: `SIR_WF TS Allowance` |
| element | string | Y | — | — | Derived | Derived: `payElement` | 12 §3.9 |
| claimedBy[] | {code, name} | Y | — | — | Derived | Derived: `claimedBy` | 12 §3.9 |

## 6. Timesheets and clocking

### 6.1 Timesheet day (`timesheets.ts`)

**TimesheetDay** (`timesheets.ts:29-39`). One record per employee per day, with its own state and version. R: inside `TimesheetWeek`, `DaySaved`, `WeekSubmitted`, `MultiweekSubmitted`, `DayDecided`, `BulkApproved`, `ClockMoved` and `QueueRow` (§7.3). W: `PUT /timesheets/:employeeId/days/:date` (save), `POST …/days/:date/submit`, `POST …/weeks/:weekStart/submit`, `POST …/multiweek/submit`, `POST /timesheet-days/:id/transition`, `POST /approvals/timesheets/bulk`, and clock out or close (§6.5). `:employeeId` is the employee code. Stored: `timesheetDays`, id `tsd_<employee>_<date>` (`src/mocks/timesheets.ts:36-42`); a day with no record reads as version 0.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| employeeCode | string | Y | — | — | Create (from the path) | Stored | 12 §4.1: `SIR_WF Timesheet Day` |
| date | date | Y | not in the future while `blockFuture` (domain) | — | Create (from the path) | Stored | 12 §4.1 |
| state | TsState | Y | moves by save, submit and decide only | §2 | Server | Stored | 12 §4.1 |
| entries[] | TimeEntry | Y | ≤ 6 on write (`:155`) | — | Edit | Stored | 12 §4.1: `SIR_WF Timesheet Entry` |
| workType | string | Y | — | a pay code; `STD` when no rule applies | Server | Stored; derived on each write by `deriveWorkType` (`src/domain/timesheet.ts:374`, `src/mocks/timesheets.ts:203-211`) | 12 §4.1 |
| allowances[] | string | Y | ≤ 20 on write | allowance or pay codes | Edit | Stored | 12 §4.1: `SIR_WF TS Day Allowance` |
| nonWorkingReason | string | Y | ≤ 200 on write; trimmed | — | Edit | Stored | 12 §4.1 |
| captureSource | enum | Y | — | `self`, `proxy`, `clock` | Server | Stored | 12 §4.1 |
| enteredBy | string | Y | — | an employee code | Server (who saved it) | Stored | 12 §4.1 |
| enteredByName | string | Y | — | — | Derived | Derived: Employee.name of `enteredBy` (`src/mocks/timesheets.ts:85-88`) | 12 §4.1 (—) |
| submittedAt | datetime\|'' | Y | — | — | Server | Stored | 12 §4.1 |
| returnReason | string | Y | — | — | Server (from DayTransition.reason) | Stored | 12 §4.1 |
| warnings[] | string | Y | — | — | Server | Stored: the capture check's warnings at the last write | 12 §4.1 |
| history[] | TsHistory | Y | — | — | Server | Stored | 12 §4.1: `SIR_WF Timesheet Day Log` |
| minutes | int | Y | ≥ 0 | — | Derived | Derived on every read: `dayMinutes` (`src/domain/timesheet.ts`), never stored (`:35`) | 12 §4.1: mapped to `SIR_WF Timesheet Day` |
| waitingOn | string | opt | — | a chain role, `mgrok` only | Derived | Derived: `waitingOnOf` (`src/mocks/timesheets.ts:81-84`) | 12 §4.1 |

**TimeEntry** (`timesheets.ts:20-23`). One worked span of a day.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| start | string | Y | ≤ 5; `H:MM` or `HH:MM` (domain, `src/domain/time.ts:56`); trimmed | — | Edit | Stored | 12 §4.1: Timesheet Entry |
| finish | string | Y | ≤ 5; as start | — | Edit | Stored | 12 §4.1 |
| breaks[] | BreakInput | Y | ≤ 5 | — | Edit | Stored | 12 §4.1: `SIR_WF Timesheet Break` |
| hours | number | opt, null | 0–24 | — | Edit (hours-only capture, read only when there are no times) | Stored | 12 §4.1 |
| fields | {code: string\|bool} | opt | each string ≤ 500 (`:17`) | codes from the field catalogue (TimesheetField.c) | Edit | Stored; `{}` when absent | 12 §4.1: `SIR_WF TS Entry Field`; `project`, `job_task`, `site`, `cost_c`, `dept` also on Timesheet Entry |

**BreakInput** (`timesheets.ts:16`): `start`, `end` (string, Y, ≤ 5 each). BC 12 §4.1.

**TsHistory** (`timesheets.ts:27`). One state change of a day.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| from, to | TsState | Y | — | §2 | Server | Stored | 12 §4.1: Day Log |
| by.employeeCode | string | Y | — | — | Server | Stored | 12 §4.1 |
| by.name | string | Y | — | — | Server | Stored (name at the time) | 12 §4.1 (—, read from Employee) |
| at | datetime | Y | — | — | Server | Stored | 12 §4.1 |
| reason | string | Y | — | — | Server | Stored | 12 §4.1 |
| layer | string | opt | — | the chain role signed as | Server | Stored on an approval | 12 §4.1 |

### 6.2 Day and week writes (`timesheets.ts`)

**DayInput** (`timesheets.ts:130-133`). One day as the form sends it. W: save and submit one day (If-Match: the day's version, 0 for a new day). No entries and a reason is a non-working day.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| entries[] | TimeEntry | Y | ≤ 6 | — | Edit | Stored on the day | 12 §4.2: command `timesheetDaySaves` |
| allowances[] | string | opt | ≤ 20 | — | Edit | Stored; `[]` when absent | 12 §4.2 |
| nonWorkingReason | string | opt | ≤ 200 | — | Edit | Stored; `''` when absent | 12 §4.2 |

**DaySaved** (`timesheets.ts:135`): `record` (TimesheetDay), `warnings[]` (string, derived by the capture check), `auditId` (null). 12 §4.2.

**WeekSubmit** (`timesheets.ts:142-143`). W: `POST /timesheets/:employeeId/weeks/:weekStart/submit`. `days[]` (≤ 7) of **WeekSubmitDay**: DayInput plus `date` (date, Y) and `version` (int ≥ 0, Y: the If-Match for that day), with `entries` optional. A day sent without entries is submitted as it was read. Answers **WeekSubmitted** (`:145-149`): `submitted[]` (TimesheetDay), `held[]` (**HeldDay**, `:137`: `date`, `reason`), `flagged[]` (string), `warnings[]` (`{date, warnings[]}`), `weekMinutes` (int ≥ 0), `auditId`. Only the days are stored; the rest is derived (12 §4.2).

**MultiweekSubmit** (`timesheets.ts:151`). W: `POST /timesheets/:employeeId/multiweek/submit`. `weeks[]` (date, 1–8). Answers **MultiweekSubmitted** (`:152-157`): `weeks[]` of `{weekStart, label, outcome (submitted, held), reason, submitted[], held[]}` and `auditId` (null when every week was held). Derived except the days (12 §4.2).

### 6.3 Week view (`timesheets.ts`)

**TimesheetWeek** (`timesheets.ts:121-125`). One employee's week in one call. R: `GET /timesheets/:employeeId/weeks/:weekStart`. Assembled per request from stored days, the employee, the tenant and Timesheet setup; only the days are stored (12 §4.3).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| employee | TimesheetEmployee | Y | — | — | Derived | Derived from Employee and WorkPattern | 12 §4.3 |
| weekStart | date | Y | — | — | Derived (from the path) | — | 12 §4.3 (—) |
| label | string | Y | — | — | Derived | Derived | 12 §4.3 (—) |
| now | Clock | Y | — | — | Derived | The server's clock | 12 §4.3 (—) |
| days[] | WeekDay | Y | 7 | — | Derived | Derived around stored days | 12 §4.3 |
| weekMinutes | int | Y | ≥ 0 | — | Derived | Derived | 12 §4.3 (—) |
| byAllocation | {key: number} | Y | — | — | Derived | Derived: `weekModel` (`src/mocks/timesheets.ts:426`) | 12 §4.3 (—) |
| capture | CaptureSetup | Y | — | — | Derived | Derived from setup, read for the target employee | 12 §4.3 |
| earlierWeeks[] | EarlierWeek | Y | — | — | Derived | Derived | 12 §4.3 |

**TimesheetEmployee** (`timesheets.ts:118-120`): `code`, `name`, `workPattern`, `typeName`, `location`, `manager` (string), `contractedHours` (number ≥ 0; 0 for bank and zero-hours). All derived from Employee and WorkPattern. 12 §4.3.

**WeekDay** (`timesheets.ts:105-112`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| date | date | Y | — | — | Derived | — | 12 §4.3 |
| record | TimesheetDay | null | — | — | Read | Stored day, or null | 12 §4.3 |
| state | TsState or `none` | Y | — | §2 plus `none` | Derived | Derived from the record | 12 §4.3 |
| version | int | Y | ≥ 0 | — | Derived | The record's version, or 0 (the If-Match to send) | 12 §4.3 |
| minutes | int | Y | ≥ 0 | — | Derived | Derived | 12 §4.3 |
| future | bool | Y | — | — | Derived | Derived from the server's date | 12 §4.3 (—) |
| locked, lockNote | bool, string | Y | — | — | Derived | Derived: `periodLocked` from cutoff and enforceLock | 12 §4.3: Timesheet Config + `payPeriods` |
| flags[] | AdvisoryFlag | Y | — | — | Derived | Derived | 12 §4.3 (—) |
| clock | ClockMark | opt | — | — | Derived | Derived from the clock record | 12 §4.3: `SIR_WF Clock Record` |

**AdvisoryFlag** (`timesheets.ts:83`): `code` (`long`, `proxy`, `resub`, `locked`), `text` (string). Derived. **ClockMark** (`:86`): `closedLate` (bool). **Clock** (`:84`): `date` (date), `time` (string). **EarlierWeek** (`:114-117`): `weekStart` (date), `label` (string), `minutes` (int ≥ 0), `status` (`ready`, `submitted`), `locked` (bool), `lockNote` (string); derived from stored days.

**CaptureSetup** (`timesheets.ts:94-103`). Everything the form needs to render the target employee's capture and run the server's checks early. Derived per request, read from the target employee, never the manager (12 §4.3).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| rules, cutoff, timeFormat, returnReasonRequired, weekGrid, weekLayout | as TimesheetConfig | Y | — | — | Derived | Copied from TimesheetConfig | 12 §4.3: Timesheet Config |
| fields[] | TimesheetField | Y | — | — | Read | Shipped catalogue (`src/mocks/timesheets.ts:40`, from `seed/meta.json`) | 12 §4.3 (—) |
| type | TypeCapture | null | — | — | Derived | TimesheetConfig.types of the employee's pattern | 12 §4.3 |
| modules | {code: bool} | Y | — | — | Derived | Tenant.modules | 12 §4.3 |
| flags[] | string | Y | — | flag codes that are on | Derived | Derived from Tenant.flags | 12 §4.3 |
| capabilities[] | string | Y | — | — | Derived | The caller's | 12 §4.3 |
| fieldDefaults | {code: FieldDefault} | Y | — | — | Derived | Copied | 12 §4.3 |
| allowances[] | AllowanceDef | Y | — | — | Derived | Copied | 12 §4.3 |
| payCodes[] | PayCode | Y | — | — | Derived | Stored pay codes | 12 §4.3 |
| mode | EntryMode | Y | — | §2 | Derived | WorkPattern.mode | 12 §4.3 |
| projects[] | OpenProject | Y | — | — | Derived | Open projects with their tasks | 12 §4.3: Job, Job Task |

**OpenProject** (`timesheets.ts:89`): `code`, `name` (string), `tasks[]` (string), `costCentre` (string; `''` for none). Derived from Project and its tasks. A Project or Job task value outside them is refused `TS_INVALID` (`:101`).

### 6.4 Timesheet setup (`timesheets.ts`)

**TimesheetConfig** (`timesheets.ts:64-68`). The tenant's one Timesheet setup record. R: `GET /timesheet-config` (inside `TimesheetSetup`, `:199`, with `fields[]` and `payCodes[]`). W: `PATCH /timesheet-config` (`UpdateTimesheetConfig`, `:202-207`, strict, If-Match: each key replaces the stored one, except `rules`, merged, and `types`, merged by pattern code); `PATCH /tenant/flags/WEEKLY` writes weekGrid and weekLayout. Stored: `timesheetConfig`, id `timesheetConfig`. Every save is checked by `timesheetConfigProblem` (`src/domain/timesheet.ts:564-593`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| rules | CaptureRules | Y | — | — | Edit | Stored | 12 §4.4: `SIR_WF Timesheet Config` |
| cutoff | string | Y | schema none; `^(Sunday\|Monday\|Tuesday\|Wednesday\|Thursday) (\d{2}:\d{2})$` (domain, `:563`) | — | Edit | Stored | 12 §4.4 |
| timeFormat | TimeFormat | Y | — | §2 | Edit | Stored | 12 §4.4 |
| returnReasonRequired | bool | Y | — | — | Edit | Stored | 12 §4.4 |
| weekGrid, weekLayout | enums | Y | — | §2 | Edit | Stored | 12 §4.4 |
| fieldDefaults | {code: FieldDefault} | Y | — | field codes | Edit | Stored | 12 §4.4: `SIR_WF TS Field Default` |
| allowances | {code: AllowanceDef} | Y | key = AllowanceDef.code (domain) | — | Edit | Stored | 12 §4.4: `SIR_WF TS Allowance` |
| types | {patternCode: TypeCapture} | Y | key must be a work-pattern code (domain) | — | Edit | Stored | 12 §4.4: `SIR_WF TS Type Capture` |

**CaptureRules** (`timesheets.ts:43-47`). Hours are decimal; the ranges are the domain's (`src/domain/timesheet.ts:566-571`), not the schema's.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| maxDaily | number | Y | > 0 and ≤ 24 | — | Edit | Stored | 12 §4.4 |
| warnDaily | number | Y | > 0 and ≤ maxDaily | — | Edit | Stored | 12 §4.4 |
| minNet | number | Y | ≥ 0 and < maxDaily | — | Edit | Stored | 12 §4.4 |
| blockFuture | bool | Y | — | — | Edit | Stored | 12 §4.4 |
| enforceLock | bool | Y | — | — | Edit | Stored | 12 §4.4 |
| otDaily | number | Y | > 0 and ≤ 24 | — | Edit | Stored | 12 §4.4 |
| nightFrom, nightTo | string | Y | a 24-hour `HH:MM` | — | Edit | Stored | 12 §4.4 |

**FieldSetting** (`timesheets.ts:49`): `vis`, `mand` (bool, Y). **FieldDefault** (`:50`): adds `label` (string, Y, no limit). BC 12 §4.4: `SIR_WF TS Field Default` and `SIR_WF TS Type Field`.

**AllowanceDef** (`timesheets.ts:58-60`, strict, so an allowance with an amount is refused).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| code | string | Y | equals its key (domain) | — | Edit | Stored | 12 §4.4: `SIR_WF TS Allowance` |
| label | string | Y | trimmed min 1, no `£ $ €` (domain, `:576-578`); no max | — | Edit | Stored | 12 §4.4 |
| payCode | string | Y | — | — | Edit | Stored | 12 §4.4 |
| tier | string | Y | — | — (seed: `core`) | Edit | Stored | 12 §4.4 |
| element | string | opt | — | — | Edit | Stored | 12 §4.4 |
| basis | string | opt | — | — (seed: `flat`) | Edit | Stored | 12 §4.4 |

**TypeCapture** (`timesheets.ts:53-55`). What one work pattern captures: `fields` ({code: FieldSetting}), `allowances[]` (string: each an allowance or a pay code, domain), `rules[]` (TypeRule). BC 12 §4.4: TS Type Capture, Type Field, Type Allowance, Type Rule.

**TypeRule** (`timesheets.ts:52`). How a pattern's day picks its work type. First match wins (`src/domain/timesheet.ts:372-375`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| trigger | string | Y | — | — (the sentence an employee reads) | Edit | Stored | 12 §4.4: `SIR_WF TS Type Rule` |
| when | string | Y | — | `''` or `sat`, `sun`, `night`, `travel`, `over_daily`, `bh`, `else` (domain, `src/domain/timesheet.ts:361-371`) | Edit | Stored | 12 §4.4 |
| code | string | Y | an allowance or pay code (domain) | — | Edit | Stored | 12 §4.4 |
| value | string | Y | no `£ $ €` (domain) | — (a multiplier or threshold, such as `1.5×`) | Edit | Stored | 12 §4.4 |
| how | string | Y | — | — | Edit | Stored | 12 §4.4 |

**TimesheetField** (`timesheets.ts:71-76`). One entry of the capture field catalogue: `c`, `tier`, `label`, `cat`, `input`, `grp` (string, Y); `t`, `val`, `src`, `flag`, `mod`, `req`, `repeat`, `pay` (string, opt); `opts[]` (string, opt); `driverOnly` (bool, opt); `seq` (number, opt). Shipped reference data (`src/mocks/timesheets.ts:40`), not tenant data. 12 §4.4 "—".

### 6.5 Clocking (`clock.ts`)

Own clock only: no employee in any path, and every call needs `own_ts`. The server stamps every event; the browser's time is never used (`clock.ts:1-9`).

**ClockRecord** (`clock.ts:20-32`). One clock record per employee per day. R: `GET /clock/me` (as `current` and `open`), and every `ClockMoved`. W: `POST /clock/in`, `/clock/break/start`, `/clock/break/end`, `/clock/out`, `/clock/:date/close` (If-Match: the record's version, 0 for none). Stored: `clockRecords`, id `clk_<employee>_<date>` (`src/mocks/clock.ts:29-41`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| employeeCode | string | Y | — | the caller | Server | Stored | 12 §4.5: `SIR_WF Clock Record` |
| date | date | Y | — | — | Server | Stored | 12 §4.5 |
| events[] | ClockEvent | Y | breaks up to FlagExtras.breaksMax (domain) | — | Server (one per call) | Stored | 12 §4.5: `SIR_WF Clock Event` |
| closedLate | {finish, at} | null | finish ≤ 5 (CloseClock) | — | Server (close) | Stored | 12 §4.5 |
| written | {breaks[]: BreakInput} | null | — | — | Server | Stored; null until the clock first writes the day | 12 §4.5 |
| closedNoDay | {finish, at} | null | — | — | Server | Stored | 12 §4.5 |
| state | ClockStateKey | Y | — | §2 | Derived | Derived: `clockState` (`src/mocks/clock.ts:52-55`) | 12 §4.5 (—) |
| elapsedSeconds | int | Y | ≥ 0 | — | Derived | Derived: `elapsedSeconds`, breaks paused, up to the server's now | 12 §4.5 (—) |
| label | string | Y | — | e.g. `Thu 13 Aug` | Derived | Derived: `formatDay` | 12 §4.5 (—) |

**ClockEvent** (`clock.ts:17`): `kind` (ClockKind), `at` (datetime, the server's). Stored.

**MyClock** (`clock.ts:43-60`). R: `GET /clock/me`. Derived per request around the stored records (12 §4.5).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| serverNow | datetime | Y | — | — | Derived | The server's clock | 12 §4.5 (—) |
| now | Clock | Y | — | — | Derived | The server's clock | 12 §4.5 (—) |
| date | date | Y | — | — | Derived | The current clock's day, else today | 12 §4.5 (—) |
| current | ClockRecord | null | — | — | Read | Stored | 12 §4.5 |
| version | int | Y | ≥ 0 | — | Derived | current's version, or 0 | 12 §4.5 (—) |
| targetHours | number | Y | > 0 | — | Derived | Constant `RING_TARGET_HOURS` = 8 (`src/domain/clock.ts:240`) | 12 §4.5 (—) |
| open | ClockRecord | null | — | — | Read | Stored: an earlier day never clocked out | 12 §4.5 |
| openBlocked | Blocked | null | — | — | Derived | Derived | 12 §4.5 (—) |
| gates | ClockGates | Y | — | — | Derived | Derived | 12 §4.5 |
| status | string | Y | — | — | Derived | Derived: `CLOCK_STATUS` (`src/domain/clock.ts:228`) | 12 §4.5 (—) |

**ClockGates** (`clock.ts:38-42`): `live` (bool: modules `TS` and `B` on), `mode` (EntryMode), `blocked` (Blocked, null), `show` (bool), `breaks` (bool: flag `BREAKS`), `breaksMax` (int > 0). **Blocked** (`:34`): `code`, `message`, `next` (string). All derived; 12 §4.5.

**ClockMoved** (`clock.ts:62-67`): `record` (ClockRecord), `day` (TimesheetDay, null: the draft day clock out or close wrote, through the day save), `warnings[]`, `toast` (string), `auditId` (string). **CloseClock** (`:69`): `finish` (string, Y, ≤ 5). BC 12 §4.5.

## 7. Approvals: chains, delegations and the timesheet queue

### 7.1 Approval chains and sign-off (`approvals.ts`)

**ApprovalChain** (`approvals.ts:20`). One module's chain of approval layers. R: `GET /approvals/chains` (inside `ApprovalSetup`, `:31`, with `signOff`). W: `PUT /approvals/chains/:module` (`SaveChain`, `:33`, strict: `steps[]` ≤ 12; If-Match). Answers `ChainSaved` (`:35`): `record`, `auditId` (null), `message`. Stored: `approvalChains`, id `chain_<module>` (`src/domain/approvals.ts:31`); until first saved it reads as the prototype's defaults at version 0 (`src/mocks/approvals.ts:37-38`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| module | ChainModule | Y | path ≤ 20 | §2 | Create (from the path) | Stored | 12 §2.7: `SIR_WF Approval Chain` |
| steps[] | ChainLayer | Y | ≤ 12 | — | Edit (saved whole) | Stored; each stored step also carries `module` (`src/mocks/approvals.ts:42-47`) | 12 §2.7: `SIR_WF Approval Chain Step` |

**ChainLayer** (`approvals.ts:18`, strict). One layer as sent and read. Lists from `src/domain/approvals.ts:34-57`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| role | string | Y | ≤ 40 | `Line manager`, `Service Manager`, `Payroll`, `HR administrator`; `Business Central` on the fixed posting step only; the Profile chain takes only `Line manager` and `Payroll` | Edit | Stored | 12 §2.7 |
| scope | string | Y | ≤ 60 | `Own department`, `Own site`, `All departments`, `Named employees`; `—` on the posting step | Edit | Stored | 12 §2.7 |
| when | string | Y | ≤ 80 | Timesheet: `Every timesheet`, `Only above a premium threshold`, `Only for absence or non-working days`, `Only for proxy entries`, `Only when the SLA is breached`; Profile: `Every contact detail change`, `Only bank details`; posting: `Posts on final approval` | Edit | Stored | 12 §2.7 |
| sla | string | Y | ≤ 40; `<n> hours` 1–168 or `<n> days` 1–30 (domain, `:110-118`) | — | Edit | Stored | 12 §2.7 |
| fixed | bool | Y | the posting step stays last in the Timesheet chain | — | Server | Stored | 12 §2.7 |

**SignOff** (`approvals.ts:26-29`). Sign-off settings, read here and changed where they live. All derived per request (`src/mocks/approvals.ts:51-61`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| emailApproval | bool | Y | — | — | Derived | Tenant.flags.EMAIL_APPROVAL | 12 §2.7: `SIR_WF Feature Flag` |
| cutoff, enforceLock, returnReasonRequired | string, bool, bool | Y | — | — | Derived | Copied from TimesheetConfig | 12 §2.7: Timesheet Config |
| current | {from, to} | Y | dates | — | Derived | The pay period of today | 12 §2.7 (—) |
| previous | {from, to, closed} | Y | dates, bool | — | Derived | `periodLocked` | 12 §2.7 (—) |

### 7.2 Delegations (`approvals.ts`)

**Delegation** (`approvals.ts:38-42`). One approver's queue handed to another for a date range, both days included. R: `GET /approvals/delegations` (inside `Delegations`, `:46`, with `approvers[]` of **Approver**, `:45`: `code`, `name`, derived), `GET /approvals/delegations/mine`. W: `POST /approvals/delegations` (`CreateDelegation`), `DELETE /approvals/delegations/:id` (If-Match). Answers `DelegationSaved` (`:55`): `record`, `auditId`, `message`. Stored: `delegations`, id `dlg_<n>`. Rules: `delegationProblem` (`src/domain/approvals.ts:211`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| who | string | Y | ≤ 20 on create | an employee code that approves | Create | Stored | 12 §2.7: `SIR_WF Delegation` |
| whoName | string | Y | — | — | Derived | Derived: Employee.name (`src/mocks/approvals.ts:161-162`) | 12 §2.7 |
| to | string | Y | ≤ 20; not `who`, no loop (`LOOP`) | an employee code that approves | Create | Stored | 12 §2.7 |
| toName | string | Y | — | — | Derived | Derived | 12 §2.7 |
| from | date | Y | required (`''` refused, `:50`) | — | Create | Stored | 12 §2.7 |
| until | date | Y | required; ≥ from; ≥ today (domain) | — | Create | Stored | 12 §2.7 |
| modules[] | ChainModule | Y | ≤ 4; at least 1 (domain); no overlap for the same approver and days (`OVERLAP`) | §2 | Create | Stored | 12 §2.7 |
| active | bool | Y | — | — | Derived | Derived: in force today (`delegationActive`) | 12 §2.7 (—) |

### 7.3 Timesheet approval queue (`timesheets.ts`)

The queue reads timesheet days (§6.1) for the approver; only the days are stored. Each layer of the Timesheet chain is decided by its role's capability (`team_ts` for the line manager, `pay_appr` for payroll) or a delegate (`timesheets.ts:232-236`).

**ApprovalQueue** (`timesheets.ts:177-185`). R: `GET /approvals/timesheets` (`QueueQuery`). 50 rows a page (`src/mocks/timesheets.ts:393`); a `weekStart` read returns the whole week. All derived except the rows' days (12 §4.3).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| rows[] | QueueRow | Y | ≤ 50 a page | — | Derived | Stored days plus derived keys | 12 §4.3 |
| nextCursor | string | null | digits | — | Derived | Derived: the next offset | 12 §4.3 |
| counts | {pend, resub, ok, back, mgrok, all} | Y | ints | — | Derived | Derived | 12 §4.3: query `SIR_WF TS Queue Counts` |
| oldestPending | date | null | — | — | Derived | Derived | 12 §4.3 |
| bulk | BulkSet | Y | — | — | Derived | Derived | 12 §4.3 |
| now | Clock | Y | — | — | Derived | The server's clock | 12 §4.3 (—) |
| returnReasonRequired | bool | Y | — | — | Derived | TimesheetConfig | 12 §4.3 |
| sla | string | Y | — | `''` when the reader decides no layer | Derived | The SLA of the first layer the reader decides | 12 §4.3 |

**QueueRow** (`timesheets.ts:167-168`). A TimesheetDay plus: `employeeName`, `location` (code), `locationName` (string), `flags[]` (AdvisoryFlag), `clock` (ClockMark, opt), `decide` (bool: the reader may decide its current layer now). All added keys derived (`src/mocks/timesheets.ts:411-412`). 12 §4.3.

**BulkSet** (`timesheets.ts:172-176`). What "approve all" would do, computed over every pending day the approver may decide.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| ids[] | string | Y | — | day ids | Derived | Derived | 12 §4.3 |
| checksum | string | Y | — | 16 hex characters | Derived | Derived: `queueChecksum` of id, state and version (`src/domain/timesheet.ts:544`) | 12 §4.3 |
| employees, minutes, outside | int | Y | ≥ 0 | — | Derived | Derived | 12 §4.3 |
| flagged[] | {id, employeeName, date, why[]} | Y | — | — | Derived | Derived | 12 §4.3 |

**QueueQuery** (`timesheets.ts:187-190`): `status` (QueueStatus, opt), `q` (≤ 100, opt), `cursor` (`^\d+$`, opt), `weekStart` (date, opt). Not stored.

**BulkApprove** (`timesheets.ts:191`). W: `POST /approvals/timesheets/bulk`. `ids[]` (1–500, each min 1), `checksum` (min 1). A changed queue refuses the whole batch (`QUEUE_CHANGED`). Answers **BulkApproved** (`:192-195`): `approved[]` (TimesheetDay), `held[]` (`{id, code, reason}`), `employees`, `minutes` (int ≥ 0), `auditId` (null). 12 §4.2.

**DayTransition** (`timesheets.ts:159`). W: `POST /timesheet-days/:id/transition` (If-Match). `to` (`ok` or `back`, Y), `reason` (string, Y, ≤ 500; required on a return while `returnReasonRequired`). Answers **DayDecided** (`:160`): `record`, `auditId`. Approval with a later layer to come moves the day to `mgrok`. 12 §4.2.

## 8. Profile changes (`profile.ts`)

An employee proposes changes to their own contact, emergency or bank details. Nothing changes until the last layer of the change's route approves it; that approval writes the value to Employee and to HistoryEntry (`src/mocks/profile.ts:120-125`).

**ProfileChange** (`profile.ts:8-14`). One proposed change to one field. R: `GET /profile` (as `pending[]`), `GET /profile-changes` (the caller's queue: manager stage with `profile_appr`, payroll stage with `bank_verify`). W: `POST /profile-changes` (`ProposeChanges`), `POST /profile-changes/:id/decision` (`Decision`, If-Match). Stored: `profileChanges`, id `pfc_<n>`, without `employeeName` (`src/mocks/profile.ts:16`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| employeeCode | string | Y | — | the proposer | Server | Stored | 12 §3.8: `SIR_WF Profile Change` |
| employeeName | string | Y | — | — | Derived | Derived: Employee.name (`src/mocks/profile.ts:19-20`) | 12 §3.8 |
| field | SelfFieldKey | Y | one pending change per field (409 `pending`) | §2 | Create | Stored | 12 §3.8 |
| from | string | Y | — | — | Server: the value when proposed | Stored raw; bank account masked on read (`:18-20`) | 12 §3.8 |
| to | string | Y | — ; trimmed; must differ from the current value (`:62-72`) | — | Create | Stored raw; masked on read | 12 §3.8 |
| note | string | Y | — ; trimmed | — | Create | Stored | 12 §3.8 |
| raisedAt | datetime | Y | — | — | Server | Stored | 12 §3.8 |
| status | enum | Y | — | `pending`, `approved`, `declined` | Server | Stored | 12 §3.8 |
| stage | enum | Y | — | `manager`, `payroll`, `done` | Server | Stored | 12 §3.8 |
| route[] | ApprovalStage | Y | — | §2 | Server: `routeFor` from the Profile chain when proposed (`src/domain/selfService.ts:36`) | Stored | 12 §3.8 |
| decisions[] | object | Y | — | — | Server | Stored | 12 §3.8: `SIR_WF Profile Change Decision` |
| decisions[].stage | ApprovalStage | Y | — | §2 | Server | Stored | 12 §3.8 |
| decisions[].decision | enum | Y | — | `approve`, `decline` | Edit (Decision) | Stored | 12 §3.8 |
| decisions[].by | {employeeCode, name} | Y | — | — | Server | Stored | 12 §3.8 |
| decisions[].at | datetime | Y | — | — | Server | Stored | 12 §3.8 |
| decisions[].reason | string | opt | — | — | Edit (Decision) | Stored | 12 §3.8 |

**ProposeChanges** (`profile.ts:20`). `changes[]` of `{field (SelfFieldKey), to (string)}` and `note` (string), all required, no lengths. Refused while the `SELF_EDIT` flag is off. Answers `{records[], auditId}`.

**Decision** (`profile.ts:22`). `decision` (`approve`, `decline`) and `reason` (string, Y, no max; required when declining, `src/mocks/profile.ts:110`). Answers `{record, employee (Employee, null until the last approval), auditId}`. Nobody decides their own change (409 `own-change`).

**Profile** (`profile.ts:18`). R: `GET /profile`. `employee` (Employee; here `manager` is the manager's name, not a code: `src/mocks/profile.ts:27`, `:54`), `fields[]` (SelfField), `pending[]` (ProfileChange), `selfEdit` (bool, the `SELF_EDIT` flag). Derived per request; 12 §3.8.

**SelfField** (`profile.ts:16`): `key` (SelfFieldKey), `label`, `hint` (string), `sensitive` (bool), `inputType` (`tel`, `text`). Shipped reference data, `SELF_FIELDS` (`src/domain/selfService.ts:12-20`); 12 §3.8 "—".

## 9. Onboarding (`onboarding.ts`)

Module `ON`. With it off every operation refuses (`module-off`). Uploads are simulated: the server keeps a file's name, size, type, time and, for an image, a small preview, nothing else (`onboarding.ts:1-10`). The rules are `src/domain/onboarding.ts` and `src/domain/onboarding-templates.ts`.

### 9.1 Setup: steps and documents

**OnboardingConfigRecord** (`onboarding.ts:39-43`). The tenant's one onboarding setup: step switches and document settings. R: `GET /onboarding/config` (inside `OnboardingSetup`). W: `PUT /onboarding/config` (`UpdateOnboardingConfig`, `:213-215`, strict: `steps[]` ≤ 10, `documents[]` ≤ 20, `policies[]` opt; the same steps and documents in the same order, only switches and settings change, `configProblem`, `src/domain/onboarding.ts:592`), `POST /onboarding/documents`, `PATCH /onboarding/documents/:doc`, `DELETE /onboarding/documents/:doc` (`DocumentDraft`); all If-Match on the config. Answers `OnboardingConfigSaved` (`:217`): `record`, `summary`, `auditId` (null). Stored: `onboardingConfig`, id `onboardingConfig`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| steps[] | OnbStepRecord | Y | ≤ 10 on write | — | Edit (switches only) | Stored | 12 §5.1: `SIR_WF Onboarding Step` |
| documents[] | OnbDocumentRecord | Y | ≤ 20 on write | — | Edit | Stored | 12 §5.1: `SIR_WF Onboarding Doc. Type` |
| policies[] | string | Y | ≤ 500 ids of ≤ 84 | OnbPolicyRecord ids | Edit | Stored: the Default template's policies | 12 §5.1: `SIR_WF Onb. Template Policy` |

**OnbStepRecord** (`onboarding.ts:30`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| id | OnbStepId | Y | — | §2 | Read | Stored | 12 §5.1 |
| label | string | Y | ≤ 60 | — | Read | Stored | 12 §5.1 |
| on | bool | Y | fixed steps stay on | — | Edit | Stored | 12 §5.1 |
| fixed | bool | Y | — | — | Read | Stored | 12 §5.1 |
| desc | string | Y | ≤ 200 | — | Read | Stored | 12 §5.1 |

**OnbDocumentRecord** (`onboarding.ts:32-36`). A document a starter can be asked for.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| id | string | Y | ≤ 20; a slug of the label for an added one (`src/domain/onboarding.ts:634`) | — | Server | Stored | 12 §5.1 |
| label | string | Y | ≤ 60; on add or rename trimmed ≤ 60 and unique (domain, `:638`; the wire allows 80, `onboarding.ts:220`) | — | Edit (added documents only) | Stored | 12 §5.1 |
| req | bool | Y | — | — | Edit | Stored | 12 §5.1 |
| verify | Verifier | Y | — | §2 | Edit | Stored | 12 §5.1 |
| blocks | bool | Y | — | — | Edit | Stored | 12 §5.1 |
| expiry | bool | Y | — | — | Edit | Stored | 12 §5.1 |
| hint | string | Y | ≤ 200 (record); ≤ 300 on the wire, ≤ 200 trimmed (domain, `:639`) | — | Edit | Stored | 12 §5.1 |
| on | bool | Y | — | — | Edit | Stored; `true` when absent on an old record (`src/mocks/onboarding-cases.ts`, `onbConfig`) | 12 §5.1 |
| custom | bool | Y | — | — | Server (true when added here) | Stored | 12 §5.1 |

**DocumentDraft** (`onboarding.ts:220`): `label` (≤ 80, Y), `hint` (≤ 300, opt). A built-in document cannot be renamed or removed; an added one is refused removal while anybody is onboarding with it.

### 9.2 Policies

**OnbPolicyRecord** (`onboarding.ts:46-48`). A policy starters are asked to read and acknowledge; a row of its own with its own version. R: `GET /onboarding/config` (as `OnbPolicySetupView`, `:194`, adding `ackCount` (int, derived) and `removeText` (string, derived)); `GET /onboarding/me` (as `OnbPolicyView`, `:96`, adding `acknowledged` and `read`, derived from the case). W: `POST /onboarding/policies` (`PolicyDraft`), `PATCH /onboarding/policies/:id` (If-Match), `POST /onboarding/policies/:id/file` (`UploadFile`, If-Match), `DELETE /onboarding/policies/:id` (If-Match). Answers `PolicySaved` (`:224`), `PolicyUploaded` (`:227`, adds `asked`, the people asked again) and `PolicyRemoved` (`:229`). Stored: `onboardingPolicies`, id `pol_<slug of the label>` (`src/domain/onboarding.ts:556`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| label | string | Y | ≤ 80 on the wire; trimmed min 1, unique by slug (domain, `:559-565`) | — | Edit | Stored | 12 §5.1: `SIR_WF Onboarding Policy` |
| ver | string | Y | ≤ 20 on the wire; goes up on each upload (`nextPolVer`, `:529`) | — (e.g. `v4.1`) | Edit | Stored | 12 §5.1 |
| sum | string | Y | ≤ 300 on the wire | — | Edit | Stored | 12 §5.1 |
| body[] | string | Y | — | — | Server | Stored; `[]` until set | 12 §5.1 |
| order | int | Y | — | — | Server | Stored | 12 §5.1 |
| file | OnbFileRecord | opt | — | — | Server (upload) | Stored | 12 §5.1 (content: Azure Blob, gap G20) |

**PolicyDraft** (`onboarding.ts:222`): `label` (≤ 80, Y), `ver` (≤ 20, opt), `sum` (≤ 300, opt).

**UploadFile** (`onboarding.ts:151-154`). A file as the browser read it. Used by the starter's document upload and the policy upload.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| name | string | Y | ≤ 255; trimmed min 1 (domain) | — | Edit | Stored as OnbFileRecord.name | 12 §5.2: `SIR_WF Onboarding Document` |
| size | int | Y | ≥ 0; ≤ 8 MB (domain `UPLOAD_MAX_BYTES`, `src/domain/onboarding.ts:466`) | — | Edit | Stored | 12 §5.2 |
| type | string | Y | ≤ 120 | a media type | Edit | Stored | 12 §5.2 |
| preview | string | opt | ≤ 1,500,000; `^data:image\/[a-z+]+;base64,` | — | Edit | Stored for an image only (`fileRecord`, `:482-485`) | 12 §5.2: Azure Blob (gap G20) |

**OnbFileRecord** (`onboarding.ts:25-28`): `name`, `size`, `type` as above; `at` (datetime, Server); `kind` (`image`, `pdf`, `file`; derived from `type` by `fileKind`, `src/domain/onboarding.ts:473`, then stored); `preview` (opt).

### 9.3 Templates

**OnbTemplateRecord** (`onboarding.ts:56-58`). The switches a starter on one of its positions is asked by; labels and checks stay on the shared config. A position on no template uses the Default (the config). R: `GET /onboarding/templates/:id`; listed in `OnboardingSetup.templates[]` as **OnbTemplateSummary** (`:199-201`: `id`, `name`, `version`, `positions[]` `{code, name}`, `starters` int, derived). W: `POST /onboarding/templates` (`CreateOnbTemplate`, `:233`, strict: `name` ≤ 80, `copyFrom` ≤ 80 opt), `PUT /onboarding/templates/:id` (`UpdateOnbTemplate`, `:235-237`, strict, whole, If-Match), `DELETE /onboarding/templates/:id` (If-Match). Answers `OnbTemplateSaved` (`:239`) and `OnbTemplateDeleted` (`:241`). Stored: `onboardingTemplates`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| name | string | Y | ≤ 60 (record); ≤ 80 on the wire, trimmed ≤ 60 and unique (domain, `src/domain/onboarding-templates.ts:12`, `:95`) | — | Edit | Stored | 12 §5.1: `SIR_WF Onboarding Template` |
| positions[] | string | Y | ≤ 1000 of ≤ 20; a position held by another template is refused | Position.code | Edit | Stored | 12 §5.1: `SIR_WF Onb. Template Job Profile` |
| steps[] | {id, on} | Y | ≤ 10 | OnbStepId | Edit | Stored | 12 §5.1: `SIR_WF Onb. Template Step` |
| documents[] | {id, on, req, blocks} | Y | ≤ 20; id ≤ 20 | — | Edit | Stored | 12 §5.1: `SIR_WF Onb. Template Document` |
| policies[] | string | Y | ≤ 500 of ≤ 84 | policy ids | Edit | Stored | 12 §5.1: `SIR_WF Onb. Template Policy` |

### 9.4 The case

**OnboardingCaseRecord** (`onboarding.ts:72-80`). One starter's onboarding, versioned on its own; every write carries If-Match on the case. R: inside `OnboardingDetail` (`GET /onboarding/me`) and every `CaseChanged`; the tracker reads only `caseRef` `{id, version}`. W: the starter's step save, upload, policy read and acknowledge, and submit; HR's verify and reject; invite, start and portal invite. Created empty when an employee is created or moved into `candidate` or `preboard` (`src/mocks/onboarding-cases.ts`, `ensureCase`). Stored: `onboardingCases`, id `onb_<employee>`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| employeeCode | string | Y | — | — | Server | Stored | 12 §5.2: `SIR_WF Onboarding Case` |
| steps | {stepId: TaskState} | Y | — | OnbStepId keys; §2 | Server (step save) | Stored | 12 §5.2: `SIR_WF Onb. Case Step` |
| docs | {docId: TaskState} | Y | — | §2 | Server (upload, verify, reject) | Stored | 12 §5.2: `SIR_WF Onboarding Document` |
| files | {docId: OnbFileRecord} | Y | — | — | Server (upload) | Stored | 12 §5.2 |
| rejections | {docId: string} | Y | reason ≤ 300 (`RejectDocument`, `:186`) | — | Server (reject) | Stored | 12 §5.2 |
| acks | {policyId: string} | Y | — | the policy version acknowledged | Server (ack) | Stored | 12 §5.2: `SIR_WF Onb. Case Policy` |
| read | {policyId: bool} | Y | — | — | Server (read) | Stored | 12 §5.2 |
| data | OnbDataRecord | Y | — | — | Edit (SaveStep) | Stored | 12 §5.2 (`.data.*`), §5.4 write-back |
| signature | string | Y | ≤ 120 on write | — | Edit | Stored | 12 §5.2 |
| consent | bool | Y | must be true to submit | — | Edit (submit) | Stored | 12 §5.2 |
| submittedAt | datetime\|'' | Y | — | — | Server | Stored | 12 §5.2 |
| ref | string | Y | `ONB-<n>`, from 1001 (`src/domain/onboarding.ts:448-451`) | — | Server (submit) | Stored | 12 §5.2 |
| invitedAt, startedAt | datetime\|'' | Y | — | — | Server (invite, start) | Stored | 12 §5.2 |
| asked | {steps[], documents[] {id, req, blocks}} | opt | — | — | Server (submit): what was asked, so the start is judged against it | Stored | 12 §5.2 |
| portalInvitedAt | datetime\|'' | opt | — | — | Server (`POST /onboarding/cases/:id/portal-invite`) | Stored | 12 §5.2 |

**OnbDataRecord** (`onboarding.ts:63-69`). The starter's answers. Every leaf is a required string in the record; the write is **SaveStep** (`:138-148`, strict), where every key is optional and only the section for the step is read. Domain field rules are in `src/domain/onboarding.ts:167-215` and are checked by `fieldProblem` (`:220-233`).

| Field | Type | Req | Limits (wire; domain) | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| personal.dob | string | Y | ≤ 10; a date not after today | — | Edit | Stored | 12 §5.4: Employee `Birth Date` |
| personal.gender | string | Y | ≤ 40 | `Female`, `Male`, `Prefer not to say`, `Other` | Edit | Stored | 12 §5.4: Employee |
| personal.nat | string | Y | ≤ 60 | — | Edit | Stored | 12 §5.4 (—: no BC field) |
| personal.ni | string | Y | ≤ 20; ≤ 13, upper-cased | — | Edit | Stored | 12 §5.4: Employee (GB) |
| contact.mob, contact.alt | string | Y | ≤ 30 | — | Edit | Stored | 12 §5.4: Employee |
| contact.a1, contact.a2 | string | Y | ≤ 200 | — | Edit | Stored | 12 §5.4: Employee |
| contact.city | string | Y | ≤ 80 | — | Edit | Stored | 12 §5.4: Employee |
| contact.post | string | Y | ≤ 12; ≤ 8, upper-cased | — | Edit | Stored | 12 §5.4: Employee |
| emergency[] | object | Y | ≤ 5 | — | Edit | Stored | 12 §5.4: Employee Relative |
| emergency[].fn, .ln | string | Y | ≤ 30 | — | Edit | Stored | 12 §5.4 |
| emergency[].rel | string | Y | ≤ 40 | `Partner`, `Parent`, `Sibling`, `Child`, `Friend`, `Other` | Edit | Stored | 12 §5.4 |
| emergency[].ph | string | Y | ≤ 30 | — | Edit | Stored | 12 §5.4 |
| additional.conv | string | Y | ≤ 10 | `No`, `Yes` | Edit | Stored | 12 §5.4 (—) |
| additional.convDetail | string | Y | ≤ 1000 | — | Edit | Stored | 12 §5.4 (—) |
| additional.wtd | string | Y | ≤ 60 | `No, I do not opt out`, `Yes, I opt out` | Edit | Stored | 12 §5.4 (—) |
| additional.quals[] | {nm, by, exp} | Y | ≤ 10; nm, by ≤ 120; exp ≤ 10, a date not before today or blank | — | Edit | Stored | 12 §5.4: Employee Qualification |
| documents.rtwType | string | Y | ≤ 60 | `Passport`, `Birth certificate`, `Visa or biometric residence permit`, `Share code` | Edit | Stored | 12 §5.4 (—) |

`SaveStep` also takes `mode` (`check`: judged, then marked done; `quiet`: saved without judging) and `signature` (≤ 120, opt). **SubmitOnboarding** (`:157`): `consent` (bool, Y), `signature` (≤ 120, opt; required while signing is on). **AckPolicy** (`:156`): `on` (bool). **RejectDocument** (`:186`): `reason` (≤ 300). **CaseChanged** (`:160`): `record`, `summary` (the toast), `auditId` (null); **CaseSubmitted** (`:162`) adds `ref`. **StarterMoved** (`:188`) adds `employee` (Employee): invite and start move the employee's state too. **StarterChased** (`:190`): `outstanding` (int), `summary`, `auditId`.

### 9.5 Views (all derived per request)

These are assembled from the stored case, config, policies, templates, employee and tenant; none is stored. 12 §5.2 maps them as "—" except where they repeat stored fields.

| Entity | Defined at | R | Fields |
|---|---|---|---|
| OnboardingDetail | `onboarding.ts:114-121` | `GET /onboarding/me` | `employee` (OnbEmployee), `template` (OnbTemplateRef), `case` (the stored record), `features`, `steps[]`, `documents[]`, `policies[]`, `progress`, `toSubmit[]` and `toStart[]` (Blocker), `open` (bool), `submitted` (string), `filesNote` (string), `today` (date) |
| StarterOnboarding | `:128-131`, strict | `GET /onboarding/team/:employeeCode` | `employee`, `template`, `caseRef` `{id, version}`, `steps[]`, `documents[]`, `progress`, `toStart[]`, `submittedAt`, `ref`. Strict, so none of the starter's answers, signature or consent reach a manager |
| TeamOnboarding | `:179-184` | `GET /onboarding/team` | `rows[]` (TrackerRow), `queue[]` (OnbQueueRow), `toVerify` (int), `verify`, `all` (bool), `locationName`, `location` (string) |
| TrackerRow | `:166-170` | inside TeamOnboarding | `employee`, `template`, `caseRef`, `progress`, `blockers[]`, `canInvite` (bool), `submittedAt`, `ref` |
| OnbQueueRow | `:173-176` | inside TeamOnboarding | `employee`, `caseRef`, `document` (OnbDocumentRecord), `file` (OnbFileRecord), `sizeText` |
| OnboardingSetup | `:203-210` | `GET /onboarding/config` | `config`, `policies[]` (OnbPolicySetupView), `features`, `steps[]` (OnbStepSetup `{id, available, needs}`, `:197`), `verifiers[]` `{value: Verifier, label}`, `inProgress` (int), `templates[]` (OnbTemplateSummary), `positions[]` `{code, name}` |
| OnbEmployee | `:103-106` | in every view | `code`, `id`, `name`, `first`, `email`, `start` (date\|''), `state` (EmployeeState), `stateLabel`, `stateTone` (Tone), `stateGlyph`, `location`, `locationName`, `workPattern`, `workPatternName`, `manager` (a name: `src/mocks/onboarding.ts:84-89`) |
| OnbTemplateRef | `:112` | in views | `id` (string, null = the Default), `name` |
| OnbFeatures | `:84-86` | in views | `rtw`, `conv`, `wtd`, `qual`, `pol`, `sign`, `verify` (bool): the `ONB_*` flags |
| OnbStepView | `:90` | in views | `id`, `label`, `desc`, `fixed`, `state` (TaskState), `stateLabel`, `tone`, `glyph` |
| OnbDocumentView | `:93` | in views | OnbDocumentRecord plus `state`, `stateLabel`, `tone`, `glyph`, `verifierLabel`, `file` (null), `sizeText`, `rejection` |
| Blocker | `:98` | in views | `kind` (`step`, `doc`), `id`, `why` |
| OnbProgress | `:101` | in views | `done`, `total`, `pc` (int), `text` (e.g. `3 of 7 done`) |

## 10. Notifications (`notifications.ts`)

Rows are addressed to one employee, and an employee reads only their own. Only In-app is delivered: Email and SMS are recorded as not connected. An item whose module is off is hidden, not deleted (`notifications.ts:1-6`). Every module raises its events through the catalogue `NOTIF_EVENTS` (`src/domain/notifications.ts:34`) and the matrix (`src/mocks/notify.ts:49-60`).

**NotificationItem** (`notifications.ts:17-23`). One row of the bell's inbox. R: `GET /notifications/me` (inside `MyNotifications`, `:25`, with `unread`, int ≥ 0, derived). W: `POST /notifications/:id/read`, `POST /notifications/read-all` (answers `NotificationsRead`, `:27`: `unread`, `marked`, `auditId`); the rows are written by the server when an event is raised. Stored: `notifications`, id `ntf_<n>`, with `employeeId` (the addressee's employee code), `event`, `channel`, `delivery` and `ref`, which the contract does not carry (`src/mocks/notify.ts:16-20`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| id | string | Y | path ≤ 40 | — | Server | Stored | 12 §2.8: SIR Notification Entry |
| area | string | Y | — | a module or area | Server | Stored | 12 §2.8: `SIR_WF Area` Text[30] |
| title | string | Y | — | — | Server | Stored | 12 §2.8 |
| body | string | Y | — | — | Server | Stored | 12 §2.8 |
| at | datetime | Y | — | — | Server | Stored | 12 §2.8 |
| read | bool | Y | — | — | Edit (mark read) | Stored | 12 §2.8 |
| ago | string | Y | — | `now`, `4h`, `2d`, `1w` style | Derived | Derived: `ageText` from the server's clock (`src/mocks/notifications.ts:31-32`) | 12 §2.8 (—) |
| link | NotifLink | null | — | — | Derived | Derived: `linkFor`, only when the page is on the reader's nav and built | 12 §2.8 (—) |
| link.view, .path, .label | string | Y | — | — | Derived | Derived | 12 §2.8 (—) |

**NotificationMatrix** (`notifications.ts:38`). Who is told of each event, per role and channel. One record for the tenant. R: `GET /notifications/matrix`, which lists only the events the tenant can raise. W: `PATCH /notifications/matrix` (`UpdateMatrix`, `:40-42`, strict, If-Match). Answers `MatrixSaved` (`:44`): `record`, `auditId` (null), `message`. Stored: `notifMatrix`, id `notifMatrix`, holding the channels by event; until first saved it reads as the catalogue's defaults at version 0 (`src/mocks/notifications.ts`, `matrixRecord`).

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| events[] | MatrixEvent | Y | — | — | Edit (channels only) | Channels stored; the rest from the catalogue | 12 §2.8 |
| events[].code | string | Y | ≤ 40 as an UpdateMatrix key | catalogue event codes | Read | Shipped catalogue | 12 §2.8: `SIR_WF Notification Event` |
| events[].module | string | Y | — | — | Read | Shipped catalogue | 12 §2.8 |
| events[].label, .description | string | Y | — | — | Read | Shipped catalogue | 12 §2.8 |
| events[].channels.employee, .manager, .admin | NotifChannel | null | — | §2; null when the event never applies to that role | Edit | Stored | 12 §2.8 |

**UpdateMatrix** (`notifications.ts:40-42`): `events` `{code (≤ 40): {employee?, manager?, admin?: NotifChannel}}`. An event that is switched off is `MODULE_OFF`; a role an event never applies to is refused.

## 11. Home and documents (`home.ts`)

### 11.1 My home

**HomeMonth** (`home.ts:37-56`). One employee's month as the server paints it: the one signed in, or the one viewed as. R: `GET /home?month=YYYY-MM`, from the month before this one to twelve months ahead (else 422). Entirely derived per request from stored timesheet days, the tenant's bank holidays, the employee and the tenant (`src/mocks/home.ts:58-82`); 12 §2.9 and §4.6.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| month, thisMonth | string | Y | `^\d{4}-(0[1-9]\|1[0-2])$` | — | Derived | — | 12 §2.9 (—) |
| label | string | Y | — | — | Derived | — | 12 §2.9 (—) |
| bounds | {min, max} | Y | months | — | Derived | `monthBounds` | 12 §2.9 (—) |
| today | date | Y | — | — | Derived | The server's date | 12 §2.9 (—) |
| employee | {code, name, location} | Y | — | `location` is the site's name, not its code (`src/mocks/home.ts:74`) | Derived | From Employee | 12 §2.9: Employee, SIR Work Sites |
| greeting, who | string | Y | — | — | Derived | — | 12 §2.9 (—) |
| leadingBlanks | int | Y | 0–6 | — | Derived | — | 12 §2.9 (—) |
| days[] | HomeDay | Y | — | — | Derived | — | 12 §2.9, §4.6 |
| totals.minutes | int | Y | — | — | Derived | — | 12 §2.9 (—) |
| summary | string | Y | — | e.g. `36.5h recorded`, or `''` | Derived | — | 12 §2.9 (—) |
| key.states[] | {key (GlyphKey), glyph, tone (GlyphTone), label, count (int)} | Y | — | §2 | Derived | — | 12 §2.9 (—) |
| todayDay | HomeDay | Y | — | — | Derived | — | 12 §2.9 (—) |
| week | {minutes (int), text, contracted (number ≥ 0)} | Y | — | — | Derived | `contracted` is Employee.contractedHours | 12 §2.9: Employee |
| sentBack | {date, reason} | null | — | — | Derived | The latest day in `back` | 12 §2.9: Timesheet Day |
| can.recordHours | bool | Y | — | — | Derived | Timesheet on and `own_ts` | 12 §2.9 |

**HomeDay** (`home.ts:21-32`): `date` (date); `ts` (null, or `{state (TsState), minutes (int ≥ 0), text, waitingOn (opt)}`); `glyph` (GlyphKey, null); `bankHoliday` (the holiday's name, or `''`); `today`, `future`, `locked` (bool; locked = approved or in a closed pay period). All derived; 12 §4.6.

### 11.2 My documents

**DocumentRow** (`home.ts:59-61`). One document filed against an employee, listed only: opening one is not built. Payroll documents (payslips, P60, P11D, P45) are not here: they come from `/bc` (§13). R: `GET /documents/mine` (inside `MyDocuments`, `:63-66`, with `employee` `{code, name}`), `GET /documents/:id` (someone else's is 404). Refused while the `DOCS` flag is off. Not written by the app. Stored: `documents`, id `doc_<employee>_<n>`.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| employeeCode | string | Y | — | — | Read | Stored | 12 §2.9: Document Attachment |
| name | string | Y | — | — | Read | Stored | 12 §2.9 |
| category | string | Y | — | — (seed: `Employment`, `Compliance`, `Leave`) | Read | Stored | 12 §2.9 |
| date | date | Y | — | — | Read | Stored | 12 §2.9 |
| owner | string | Y | — | — (seed: `HR`, `Learning`, `Workforce`) | Read | Stored | 12 §2.9 |
| source | string | Y | — | — (seed: `HRIS`, `LMS`, `Workforce`) | Read | Stored | 12 §2.9 |

## 12. Audit (`audit.ts`)

**AuditEntry** (`audit.ts:5-9`). One audited action. Every write writes one row, none when nothing changed; a refusal writes none. R: `GET /audit` (`AuditQuery`, `:14-17`; answers `AuditPage`, `:11`: `items[]` newest first and `total`). Written only by the server (`src/mocks/audit.ts:18-22`). Stored: `audit`, id `aud_` + 12 digits, a counter so rows sort in write order.

| Field | Type | Req | Limits | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|---|
| id | string | Y | `aud_` + 12 digits | — | Server | Stored | 12 §2.4: `SIR_WF Audit Event` |
| at | datetime | Y | — | — | Server | Stored | 12 §2.4 |
| who.employeeCode | string | Y | — | the real signed-in employee | Server | Stored | 12 §2.4 |
| who.name | string | Y | — | — | Server | Stored (name at the time) | 12 §2.4: from Employee |
| who.viewingAs | string | opt | — | the employee code viewed as | Server | Stored | 12 §2.4 |
| act | string | Y | — | — (e.g. `Employee created`) | Server | Stored | 12 §2.4 |
| entity | string | Y | — | — (e.g. `employee`, `userType`, `session`) | Server | Stored | 12 §2.4 |
| entityId | string | Y | — | — | Server | Stored | 12 §2.4 |
| before, after | any JSON | opt | — | — | Server | Stored | 12 §2.4 |
| reason | string | opt | — | — | Server | Stored | 12 §2.4 |

**AuditQuery** (`audit.ts:14-17`): `entity`, `who`, `q` (each min 1, opt); `limit` (whole 1–1000, opt; the fake defaults to 200, `src/mocks/audit-handlers.ts:8`). `who` matches the name, `q` the act, entity id and reason.

## 13. The `/bc`, `/session` and `/auth` calls (QniConnect payroll)

These 26 calls are QniConnect's existing API, kept unchanged on the wire (`src/contract/bc/endpoints.ts:1-27`). Their data is QniConnect's and payroll's, held in BC; the fake holds a copy in `src/mocks/bc/seed.ts` (`BcDb`, `:27-42`) and `src/mocks/bc/payroll-seed.ts`. Response schemas are lenient: unknown keys pass, and a key is optional wherever QniConnect's code guarded it. "opt" below means the app tolerates its absence; the handoff says the backend sends every field listed. Doc 12 does not map these calls (12 §2.9 notes only that payroll documents come from `/bc`; gap G22). Most fields are free strings: the code sets no lengths or enums, so the Limits column is left out of these tables.

### 13.1 Sign-in, session and portal users

**PortalUserVerifyRequest** (`bc/session.ts:33`). W: `POST /bc/portalUsers/verify` (AUTH.C1 and AUTH.C3). `email` (string, Y: the Microsoft account's username), `userId` (string, Y: its object id).

**PortalUserVerifyResponse** (`bc/session.ts:25-30`) and **PortalUserData** (`:14-23`).

| Field | Type | Req | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|
| exists, isActive | bool | opt | — | Derived | Derived by QniConnect from the portal user | none (QniConnect) |
| message | string | opt | — | Derived | — | none |
| userData.id, .email, .name, .registrationId, .employeeNo, .role | string | opt | — | Read | Held in BC: the portal user | none |
| userData.isAdmin | bool | opt | — | Read | Held in BC | none |
| userData.status | string | opt | fake: `Active`, `PendingFirstLogin`, `Inactive` (`src/mocks/bc/seed.ts:16`) | Read | Held in BC | none |

**SessionInitRequest** (`bc/session.ts:56`). W: `POST /session/init` (cookies only, no token). `registrationId`, `userEmail`, `employeeNo` (string, Y; `''` when unknown). Answers `{success?, message?}` (`:53`), only logged.

**portalUserUpdateStatus** (`bc/session.ts:69-76`). W: `POST /bc/portalUsers/:userId/updateStatus`, body `{status}` (string, Y). Answers `{success?, message?}`.

**BcPortalUser** (`bc/portal-users.ts:22-24`). R: `GET /bc/portalUsers` (`{value[]}`, `:26`). W: `POST /bc/portalUsers`, `PATCH /bc/portalUsers/:userId` with **PortalUserRequest** (`:44`): `name` (trimmed, tags stripped), `email` (trimmed, lower-cased), `role` (`User` or `Admin`, by the caller's rule), `isAdmin` (bool), all Y.

| Field | Type | Req | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|
| id, name, email, employeeNo, role | string, null | opt | — | Edit (name, email, role) | Held in BC | none |
| status | string, null | opt | as above | Edit (updateStatus) | Held in BC | none |
| isAdmin | bool, null | opt | — | Edit | Held in BC | none |
| lastLogin | string, null | opt | falsy = "Never" | Server | Held in BC | none |

### 13.2 Registration, environments and the BC authorization

**PortalRegistrationRequest** (`bc/registration.ts:9-14`). W: `POST /bc/portalRegistrations`, signed out. Every key sent: `company_Name`, `contactEmail`, `contactName`, `tenantId`, `primaryEnvironment`, `primaryCompanyName`, `industry`, `registrationSource`, `vatRegistrationNo`, `companyRegistrationNo`, `primaryContactLanguage`, `address`, `city`, `county`, `postCode`, `countryRegionCode` (string, Y, no limits) and `numberOfEmployees` (int, Y). The answer is never read. **PortalRegistration** (`bc/admin.ts:110`, R: `GET /bc/portalRegistrations`): `companyName`, `id`, `registrationDate` (string, opt, null).

**BcEnvironmentItem** (`bc/environments.ts:14-24`). R: `GET /bc/environments` (`{value[]}` or `{environments[]}`, `:27`). W: `POST /bc/environments` with **EnvironmentCreateRequest** (`bc/admin.ts:43-45`: `name`, `type`, `url`, `companyId`, `companyName`, string, Y, untrimmed; `companyId` may be `''`). Each pair of spellings is read with a fallback.

| Field | Type | Req | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|
| id / environmentId | string | opt | — | Server | Held in BC | none |
| name / environmentName | string | opt | — | Create | Held in BC | none |
| type / environmentType | string | opt | default `Production` | Create | Held in BC | none |
| url / environmentUrl | string | opt | — | Create | Held in BC | none |
| status | string | opt | default `Active` | Server | Held in BC | none |
| companyName / company_Name / company_name | string | opt | — | Create | Held in BC | none |
| company_Id / companyId | string | opt | — | Create | Held in BC | none |
| registrationId | string | opt | — | Server | Held in BC | none |

**ClientTenantCompaniesRequest** (`bc/environments.ts:51`): `environmentName`, `registrationId` (string, Y). W: `POST /bc/client-tenant/companies`. Answers **BcCompany** rows (`:43`: `id`, `name`, `displayName`, string, opt) under `value`, or a bare list, and `updateResult.success` (bool, opt).

**AuthStatus** (`bc/admin.ts:61-74`). The BC authorization. R: `GET /auth/status`; also the answer of `POST /auth/refresh` (body `{registrationId?}`). A JSON null is "not authorized".

| Field | Type | Req | Allowed values | Editable / Derived | Stored or derived | BC mapping |
|---|---|---|---|---|---|---|
| isAuthorized | any | opt | compared `=== true` | Derived | — | none |
| status, clientId, tenantId, environment, scope, registrationId | string, null | opt | — | Server | Held by the backend | none |
| issuedAt, expiresAt | string, null | opt | — | Server | Held by the backend | none |
| accessToken, refreshToken | string, null | opt | — | Server | Held by the backend (gap G21) | none |
| diagnostics.hasAccessToken, .hasRefreshToken, .tokenStoredInBC | any | opt | tested for truth | Derived | — | none |

**AuthUrlResponse** (`bc/admin.ts:88`). R: `GET /auth/bc-auth-url`. `authUrl`, `registrationId` (string, opt, null), `pkceEnabled` (any, opt, only logged).

### 13.3 Employee portal: profile, payslips, tax documents, bell

**EmployeeProfile** (`bc/payroll.ts:17-36`). The signed-in employee's payroll record. R: `GET /bc/employees/current` (query `registrationId`, `clientEnvironment`, `clientCompanyId`, `email`, each opt). Read only; held in BC payroll. Every key is opt and may be null.

| Field | Type | Allowed values | Notes |
|---|---|---|---|
| id, employeeNo | string | — | `id` is the GUID the tax documents take |
| firstName, middleName, lastName, jobTitle, email, employmentDate, manager | string | — | — |
| address, address2, addressLine3, addressLine4, city, postCode, county, country | string | — | — |
| birthDate, gender, maritalStatus, status, frequency | string | — | `maritalStatus` read but never shown |
| hmrcTaxCode, nationalInsuranceNumber, niClassCode, nationalInsuranceCode | string | — | — |
| weeklyHoursWorked | number or string | — | — |
| mobilePhoneNo | string | — | — |
| validP11D | bool | — | decides whether a P11D is offered |
| bankName, bankAccountName | string | — | — |
| bankAccountNo, bankBranchNo | string or number | — | masked or shown as text |
| annualSalary | number or string | — | **money**: read but never shown (gap G1) |
| pensionSet, pensionProvider | string | — | — |
| pensionContribution | string or number | — | **money or a rate** (fake: `5%`) (gap G1) |

**Payslip** (`bc/payroll.ts:61-67`). R: `GET /bc/payslips` (anything not a list reads as none). Read only; held in BC payroll. Every key opt, may be null.

| Field | Type | Notes |
|---|---|---|
| id | string or number | — |
| systemId | string | key for `POST /bc/payslips/:systemId/pdf` |
| period, payDate, expectedPaymentDate, fiscalYear | string | Documents reads `expectedPaymentDate` before `payDate` |
| grossPay, taxPaid, netPay, taxAmount | number | **money** (gap G1) |

**PayslipPdfResponse** (`bc/payroll.ts:86`) and **TaxDocumentResponse** (`bc/documents.ts:43`): `value` (string, opt): the PDF as base64 with no `data:` prefix. **TaxDocumentRequest** (`bc/documents.ts:46`): `employeeId` (string, Y, the employee's GUID), `taxYear` (string, opt; P45 takes `employeeId` only). W (reads by POST): `/bc/employees/:employeeId/p60`, `/p11d`, `/p45`, `/bc/payslips/:systemId/pdf`.

**FiscalYear** (`bc/documents.ts:19-25`). R: `GET /bc/fiscalyears`. `id` (string or number), `fiscalYear`, `startDate`, `endDate` (string), `active`, `allowP60Print` (bool); all opt, may be null. Held in BC (SIR Fiscal Year, which 12 §2.5 maps for `Tenant.financialYear`).

**BcNotification** (`bc/notifications.ts:18-24`). A payroll notification for the bell. R: `GET /bc/notifications` (query `registrationId`, `clientEnvironment`, `clientCompanyId`, `employeeNo`, each opt). W: `PATCH /bc/notifications/:systemId`, body `{seen: true}` (literal), answer ignored. `systemId`, `message`, `createdDate`, `createdTime` (string, opt, null), `seen` (any, tested for truth). Held in BC (SIR Notification Entry, the same table 12 §2.8 maps for the Workforce inbox).

## 14. Gaps

What this review found. Contract paths are under `src/contract/`; doc 12 is cited by section because it is being edited. "Domain only" means a rule the server applies but the schema does not state, so a backend built from the OpenAPI document alone would miss it.

### 14.1 No money

| # | Gap | Where | Note |
|---|---|---|---|
| G1 | The `/bc` payroll calls carry money: `Payslip.grossPay`, `.taxPaid`, `.netPay`, `.taxAmount`; `EmployeeProfile.annualSalary` and `.pensionContribution` (fake value `5%`). The money lint checks only `/api/v1` (`ENDPOINTS`), not `BC_ENDPOINTS`, so nothing flags them. The `SHOW_PAY` flag ("Show indicative pay to employees") exists with nothing behind it. | `bc/payroll.ts:61`, `:65-66`, `:34-35`; `contract.test.ts:67-69`; `src/domain/modules.ts:44` | These are QniConnect's existing reads and are shown to the employee themself. Decide whether they are an accepted exception to "No money"; if so, say so in the money lint (an allow list for `/bc`), and decide whether `annualSalary`, read but never shown, should be dropped from the schema. |

### 14.2 Doc 12 out of step with the contract

| # | Gap | Where | Note |
|---|---|---|---|
| G2 | Doc 12 maps fields the contract no longer has: `IntegrationAttempt` (`id`, `event`, `ref`, `summary`, `state`, `attempt`, `simulated`, `dayId`, `at`, `cause`, `reason`), the day's `posting` and `integrationAttemptId`, and `postingLines[]`. | 12 §6.1, §6.5; no such key in `timesheets.ts:29-39` or anywhere in `src/contract` | Either the posting read comes back into the contract, or 12 §6 marks these as BC and Node only. |
| G3 | Doc 12 uses old names: `CreateEmployeeType.startedFrom` (now `CreateWorkPattern.startedFrom`); `setup-presets.ts → contracts[].tasks[]` (now `SetupPreset.structure.projects[].tasks[]`); `Template (whole), PresetFile.template` (now `SetupPreset` and `PresetFile.preset`). | 12 §3.7, §3.6, §2.6; `work-patterns.ts:17`, `setup-presets.ts:35`, `:57`, `:67` | Rename in doc 12. |
| G4 | The contract says `TimesheetDay.minutes` is "derived on every read, never stored", but doc 12 stores it (`Minutes`) and `waitingOn` (`Waiting Role`) on the day. | `timesheets.ts:35-38`; 12 §4.1 | Fine if BC keeps them as checked copies; the contract comment and doc 12 should say the same thing. |

### 14.3 Contract fields that do not fit their BC field

| # | Gap | Where | Note |
|---|---|---|---|
| G5 | `Employee.manager` may be an employee code or "the name of a manager outside the company", but BC's `Manager No.` is Code[20]. `Location.manager` and `Department.manager` are free strings in the contract, Text(80) names in a preset, and Code[20] employee codes in BC. | `employees.ts:16`; `src/domain/employees.ts:28-29`, `:64-66`; `dimensions.ts:11`, `:14`; `setup-presets.ts:28`, `:30`; 12 §3.2, §3.3, §3.4 | Decide: a code only (then validate it), or add a name field in BC. |
| G6 | `Project.budgetHours` is a display string (seed `1,240 h`) mapped to a Decimal; `Project.status` is any string (seed `Active`, `Always open`) mapped to the Enum `Job Status`. | `dimensions.ts:18`; `src/mocks/seed/social.json` (projects); 12 §3.6 | Make `budgetHours` a number and `status` an enum in the contract. |
| G7 | `Employee.employmentType` is a plain string, while `WorkPattern.employmentType` is the enum `Contracted`, `Bank`, `Agency`, `Salaried` and BC holds an Enum. | `employees.ts:16`; `work-patterns.ts:7`; 12 §3.2 | Use `EmploymentType` on Employee. |
| G8 | `Employee.address` is one string; BC holds `Address`, `Address 2`, `City`, `Post Code` and GB lines 3 and 4, and onboarding captures `a1`, `a2`, `city`, `post` separately. No code says how one string splits into BC's fields. | `employees.ts:23`; `onboarding.ts:65`; 12 §3.2 | Split the contract field, or state the rule. |

### 14.4 Fields with no limit where one is needed

| # | Gap | Where | Note |
|---|---|---|---|
| G9 | Employee strings have no maximum in the schema: `email` (BC Text[80]), `phone`, `emergencyFirstName`, `emergencyLastName`, `emergencyPhone` (Text[30]), `bankSortCode` (Text[20]), `resource` and the reference codes (Code[20]), `address`. Only the name parts have a limit (30, domain only). Onboarding's `SaveStep` caps the same data; the employee API does not. | `employees.ts:13-18`, `:23-24`; `src/domain/employees.ts:8`; 12 §3.2 | Add `.max()` matching BC. |
| G10 | Dimension bodies have no maximum on any field, though a preset caps the same fields (80, 120, 200) and BC's are shorter in places (Department and Cost Centre `Name` is Text[50], below the preset's 80). | `dimensions.ts:10-22`; `setup-presets.ts:28-35`; 12 §3.4 | One set of limits, matching BC. |
| G11 | Free text with no maximum: `Transition.reason`, `AddException.reason`, `ProposeChanges.note` and `.changes[].to` (BC `From Value` Text[250]), `Decision.reason`, `RenameUserType.name` (24 in the domain only), `WorkPattern.name` (60 in a preset), `CreateWorkPattern.startedFrom`, `AllowanceDef.*`, `TypeRule.*`, `FieldDefault.label`, `EmployeesQuery.q`. | `employees.ts:53`, `:72`; `access.ts:16-17`; `profile.ts:20`, `:22`; `work-patterns.ts:11`, `:17`; `timesheets.ts:50`, `:52`, `:58-60`; 12 §3.8 | Add `.max()`. |
| G12 | Numbers whose range is in the domain only: `SetFlag.breaksMax` and `.vehiclesMax` (any number in the schema; 1–5 and 1–4 in the domain, and `.int().min().max()` in a preset), `CaptureRules.*`, `Employee.contractedHours` and `.maxHours` (0–80). `TimesheetConfig.cutoff` has its pattern in the domain only. | `tenant.ts:25`, `:58`; `setup-presets.ts:60`; `timesheets.ts:43-47`, `:65`; `employees.ts:17`; `src/domain/modules.ts:138`; `src/domain/timesheet.ts:563-571`; `src/domain/employees.ts:47-52` | Put the ranges in the schema, so the OpenAPI document carries them. |

### 14.5 Contract against the fake server

| # | Gap | Where | Note |
|---|---|---|---|
| G13 | `ChainModule`'s comment says "the same four" but the enum has two (`Timesheet`, `Profile`); `CreateDelegation.modules` allows up to 4. | `approvals.ts:13-14`, `:52` | Correct the comment and the max. |
| G14 | The contract says the bank account is masked in every response, which means it is stored whole. The `social` seed stores it already masked (`****8715`), while an approved profile change stores the whole number, and `ProfileChange.from` and `.to` hold whole numbers. | `employees.ts:19-20`; `src/mocks/seed/social.json` (employees); `src/mocks/world.ts:32-33`; `src/mocks/profile.ts:76`, `:121-122` | BC must hold the whole number securely (12 §3.2, §3.8 `To Value` Blob); the seed should not imply otherwise. |
| G15 | `LocationOption` is defined but no endpoint uses it; doc 12 still maps it. | `dimensions.ts:13`; 12 §3.3 | Remove it, or use it. |
| G16 | One key, two meanings: `manager` is an employee code on Employee but a person's name in `Profile.employee` and `OnbEmployee`; `location` is a code on Employee but a site name in `HomeMonth.employee`. | `src/mocks/profile.ts:27`, `:54`; `src/mocks/onboarding.ts:88`; `home.ts:39`, `src/mocks/home.ts:74` | Name the display value `managerName` and `locationName`, as `OnbEmployee` already does for location. |
| G17 | `AddException.reason` is kept on the audit row only; `UserAccess` has no reason. Doc 12 maps it to `SIR_WF Capability Exception`. | `access.ts:11`, `:17`; `src/mocks/access.ts:118-121`; 12 §2.3 | Decide where the reason lives; if on the exception row, the contract could return it. |
| G18 | `Company.country`, `.payFrequency` and `.weekEnding` are any string on read but enums on write, so a stored value outside the list reads but cannot be saved back. | `tenant.ts:15-17`, `:71-73` | Use the enums on read too. |

### 14.6 Ownership not clear

| # | Gap | Where | Note |
|---|---|---|---|
| G19 | Project tasks are stored with `projectCode`, `name`, `group` and `billable`, but the API exposes only task names, read only, and only a preset apply creates them. | `dimensions.ts:47-48`; `setup-presets.ts:35`; `src/mocks/dimensions.ts:51-54`; 12 §3.6 | Confirm tasks are maintained in BC (Job Task) only. |
| G20 | Doc 12 puts the policy file, the case's uploaded files and `files[doc].preview` in Azure Blob Storage. The contract keeps an image preview (a data URL up to 1,500,000 characters) on the case record and the policy. | `onboarding.ts:25-28`, `:153`; 12 §5.1, §5.2 | BC is the only system of record: decide whether files go to BC (for example Document Attachment) or are an agreed exception, and record it. |
| G21 | `GET /auth/status` and `POST /auth/refresh` return `accessToken` and `refreshToken` to the browser. | `bc/admin.ts:61-74` | QniConnect's existing shape; confirm the browser needs the tokens at all. |
| G22 | Doc 12 does not map any `/bc` field (`EmployeeProfile`, `Payslip`, `FiscalYear`, `BcNotification`, `BcPortalUser`, environments, registrations, `AuthStatus`). | `src/contract/bc/*.ts`; 12 §2.9 | They are QniConnect's existing API; a pointer to where they are specified would close the loop. |
| G23 | `DocumentRow.category`, `.owner` and `.source` are free strings, and no operation writes a document. Who files a document against an employee, and where, is not in the code. | `home.ts:59-61`; 12 §2.9 (Document Attachment) | Name the writer (BC, HRIS) and the allowed values. |
