# Qnipay Workforce on GB Qnipay: field mapping

2026-10-26 · Status: draft for review

This document maps every contract field in scope to a Business Central table and field in the GB codebase. It merges the five reviewers' field files and replaces 02 for GB. The tables, their IDs and their fields are specified in [`11-gb-new-tables.md`](11-gb-new-tables.md); decisions (GB-D*n*) and questions (GB-Q*n*) are in [`10-gb-gap-analysis.md`](10-gb-gap-analysis.md); the calls that carry these fields are in [`13-gb-api-endpoints.md`](13-gb-api-endpoints.md).

## 1. Conventions

- **Contract.** `C:\dev\qniconnect-workforce\src\contract\*.ts` as of today (employees naming, `employeeCode`). A row reads `file.ts → Type.field`; inside one area the file name is often left out.
- **Tables.** A new `SIR_WF` table is named with its real ID, for example `70703180 SIR_WF Timesheet Day`. Existing Qnipay tables keep their names (`SIR TIme Sheet Elements` is 70702615, `SIR Work Sites` 70702606, `SIR Employee Sites` 70702608, `SIR Employee Bank Account` 70702643, `SIR Notification Entry` 70702657, `SIR Feature Register` 70702660, `SIR Timesheet Interface` 70702614). Standard tables are named as in the Microsoft base app (`Employee` 5200, `Employee Relative` 5205, `Employee Qualification` 5203, `Dimension Value` 349, `Default Dimension` 352, `Job` 167, `Job Task` 1001, `Company Information` 79, `Base Calendar Change` 7601, `Document Attachment` 1173).
- **Paths.** `B/` = `C:\dev\Qnipay GB BC\Qnipay-base\SourceCode\`, `G/` = `C:\dev\Qnipay GB BC\Qnipay-GB\SourceCode\`; a bare `Tab…`, `Cod…`, `Rep…` or `Pag…` file name is under one of them. "MS" = the Microsoft Base Application 29 symbols.
- **Read/Write.** **R** read through the API; **W** written by a command, bound action or entity write; **R/W** (or **RW**) both; **D** derived (Node computes it with `src/domain`, or BC computes it in the page); **N** reference data shipped in Node; **—** not stored.
- **Ids and versions** (GB-D3, GB-D11). `RecordMeta.id` is `Public Id` (9900) where the table carries it, otherwise the key (lower-case Text keys) or `<prefix>_<code>` derived by Node from a coded key (`emp_`, `loc_`, `dep_`, `cc_`, `job_`, `prj_`, `typ_`, `pc_`, `acc_`). `RecordMeta.version` is `Version` (9901) on new tables and `SIR_WF Version` on reused ones. `RecordMeta.updatedAt` is `SystemModifiedAt` (UTC). Rows below repeat these only where they differ.
- **Commands.** Writes go through bound actions (`entitySet(id)/action`) or command names on the `commands` page (doc 13 §3–4). Names in this document are the final ones; the slices' command entity sets that act on one record became bound actions (GB-D14).
- **Slices.** Where a row says "the people slice" or "foundation", it means the area in §3 or §2 of this document; "timesheet", "onboarding" and "posting" mean §4, §5 and §6. Onboarding rows also cite `GB …` (Qnipay-GB), `BASE …` (Qnipay-base), `MS …` (Microsoft base app) and `WF …` (`C:\dev\qniconnect-workforce\`) paths.
- **No money.** No contract field maps to a rate, an amount or a currency, and no Workforce page exposes one.

## 2. Foundation, access and configuration

### 2.1 Shared shapes (`common.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| common.ts → RecordMeta.id | each table | Public Id (9900) | Text[50] | R | Where the table carries it; otherwise the key or `SystemId`, stated per row (GB-D11). |
| common.ts → RecordMeta.version | each table | Version (9901) | Integer | R | 0 means "no record yet" (chains, matrix). BC also returns `@odata.etag`. |
| common.ts → RecordMeta.updatedAt | each table | SystemModifiedAt | DateTime | R | UTC. |
| common.ts → Refusal.code/message/field/usedBy | — | AL `Error('<code>: <message>\|<json>')` | — | D | Node parses; `next` comes from Node's lookup by code. |
| common.ts → mutation.auditId | 70703159 SIR_WF Audit Event | Entry No. | BigInteger | R | As text; null on a no-op. |

### 2.2 Session (`session.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| session.ts → SessionAccount.email | 70703152 SIR_WF Account | Email | Text[80] | R | Found from the Entra token: Object ID, else email on first sign-in. |
| session.ts → SessionAccount.userType | Employee | SIR_WF User Type Code | Text[20] | R | B14. Blank reads as employee. |
| session.ts → SessionAccount.employeeCode | 70703152 SIR_WF Account | Employee No. | Code[20] | R | |
| session.ts → SessionAccount.name | Employee | First Name, Middle Name, Last Name | Text[30] ×3 | D | Joined (people slice owns the name rule). |
| session.ts → SessionAccountView.roleName | 70703154 SIR_WF User Type | Name | Text[24] | R | |
| session.ts → SessionAccountView.roleDescription | 70703154 SIR_WF User Type | Description | Text[250] | R | |
| session.ts → SessionAccountView.locationName | SIR Work Sites (via default SIR Employee Sites) | Description | — | D | People slice owns locations. |
| session.ts → Session.capabilities[] | 70703155 SIR_WF User Type Capability + SIR_WF Capability Exception | Granted, Mode | — | D | User type's granted rows, plus grants, minus revocations (revocation wins). `resolveCapabilities` in Node; BC repeats it on commit. While viewing as: the viewed account's. |
| session.ts → Session.viewingAs.employeeCode | 70703153 SIR_WF Session | Viewing As Employee No. | Code[20] | W | Set by view-as start, cleared by view-as end and sign-out. |
| session.ts → Session.viewingAs.name, .userType, .roleName | Employee, SIR_WF User Type | as above | — | D | From the viewed employee. |
| session.ts → Session.onboarding | Employee + SIR Feature Register | employee state; WF_ON Enabled for | — | D | True when the eyes' employee is candidate or preboard and WF_ON is All Users. State field is the people slice's. |
| session.ts → ViewAsRequest.employeeCode | 70703153 SIR_WF Session | Viewing As Employee No. | Code[20] | W | Refused `invalid` for self, unknown, or no account. |
| session.ts → ViewAsEmployee.* | Employee, SIR_WF Account, SIR_WF User Type | — | — | D | At most five, one per role (Node, as the mock). |
| (no contract field) | 70703153 SIR_WF Session | Session Id, Opened At, Last Seen At, Ended At, End Reason | | W | Node and BC only. |
| (no contract field) | 70703152 SIR_WF Account | Entra Object ID, Last Sign-in At | Guid, DateTime | W | Set at sign-in. |

`DemoAccount` and `listAccounts` are development only: not mapped.

### 2.3 Access (`access.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| access.ts → Capability.id | 70703156 SIR_WF Capability | Code | Text[30] | R | The code is the id. |
| access.ts → Capability.group | 70703156 SIR_WF Capability | Group Code | Text[10] | R | own, team, cfg. |
| access.ts → Capability.label | 70703156 SIR_WF Capability | Label | Text[100] | R | |
| access.ts → Capability.gate | 70703156 SIR_WF Capability | Gate | Text[150] | R | |
| access.ts → Capability.lockedFor[] | 70703155 SIR_WF User Type Capability | User Type Code where Locked = true | Text[20] | D | Joined from rows. |
| access.ts → Capability.version/updatedAt | 70703156 SIR_WF Capability | Version, SystemModifiedAt | | R | |
| access.ts → CapabilityGroup.id/label/description/order | 70703157 SIR_WF Capability Group | Code, Label, Description, Sort Order | Text[10], Text[60], Text[250], Integer | R | |
| access.ts → UserType.id | 70703154 SIR_WF User Type | Code | Text[20] | R | |
| access.ts → UserType.name | 70703154 SIR_WF User Type | Name | Text[24] | W | Rename only. Unique ignoring case. |
| access.ts → UserType.description | 70703154 SIR_WF User Type | Description | Text[250] | R | |
| access.ts → UserType.capabilities[] | 70703155 SIR_WF User Type Capability | Capability Code where Granted | Text[30] | W | Through `setCapability`. |
| access.ts → UserType.defaults[] | 70703155 SIR_WF User Type Capability | Capability Code where Default | Text[30] | R | Seeded. |
| access.ts → UserAccess.id | 70703152 SIR_WF Account | Email (key) | Text[80] | D | `acc_<email>`, derived by Node: it can reach 84 characters, longer than Public Id (GB-D11). |
| access.ts → UserAccess.email | 70703152 SIR_WF Account | Email | Text[80] | R | |
| access.ts → UserAccess.name | Employee | name fields | | D | |
| access.ts → UserAccess.employeeCode | 70703152 SIR_WF Account | Employee No. | Code[20] | R | |
| access.ts → UserAccess.userType | Employee | SIR_WF User Type Code | Text[20] | R | Written by the people slice (employee create/edit). |
| access.ts → UserAccess.grants[] | 70703158 SIR_WF Capability Exception | Capability Code where Mode = grant | Text[30] | W | |
| access.ts → UserAccess.revocations[] | 70703158 SIR_WF Capability Exception | Capability Code where Mode = revoke | Text[30] | W | |
| access.ts → UserAccess.version | 70703152 SIR_WF Account | Version | Integer | R | Bumped by every exception change. |
| access.ts → SetTemplateCapability.granted | 70703155 SIR_WF User Type Capability | Granted | Boolean | W | |
| access.ts → RenameUserType.name | 70703154 SIR_WF User Type | Name | Text[24] | W | |
| access.ts → AddException.capability | 70703158 SIR_WF Capability Exception | Capability Code | Text[30] | W | |
| access.ts → AddException.mode | 70703158 SIR_WF Capability Exception | Mode | Enum | W | grant, revoke. |
| access.ts → AddException.reason | 70703158 SIR_WF Capability Exception | Reason | Text[250] | W | Required. Also copied to the audit row. |
| (no contract field) | 70703158 SIR_WF Capability Exception | Added By, Added At | Code[20], DateTime | W | Set by BC from the session. |

### 2.4 Audit (`audit.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| audit.ts → AuditEntry.id | 70703159 SIR_WF Audit Event | Entry No. | BigInteger | R | As text. |
| audit.ts → AuditEntry.at | 70703159 SIR_WF Audit Event | At | DateTime | R | |
| audit.ts → AuditEntry.who.employeeCode | 70703159 SIR_WF Audit Event | Who Employee No. | Code[20] | R | |
| audit.ts → AuditEntry.who.name | Employee | name | | D | |
| audit.ts → AuditEntry.who.viewingAs | 70703159 SIR_WF Audit Event | Viewing As Employee No. | Code[20] | R | Omitted when blank. |
| audit.ts → AuditEntry.act | 70703159 SIR_WF Audit Event | Act | Text[60] | R | |
| audit.ts → AuditEntry.entity | 70703159 SIR_WF Audit Event | Entity | Text[60] | R | |
| audit.ts → AuditEntry.entityId | 70703159 SIR_WF Audit Event | Entity Id | Text[100] | R | |
| audit.ts → AuditEntry.before / .after | 70703159 SIR_WF Audit Event | Before / After | Blob (JSON) | R | Exposed as text. |
| audit.ts → AuditEntry.reason | 70703159 SIR_WF Audit Event | Reason | Text[500] | R | |
| audit.ts → AuditPage.total | — | `@odata.count` | | D | |
| audit.ts → AuditQuery.entity / who / q / limit | 70703159 SIR_WF Audit Event | Entity, Who Employee No., Reason/Act (contains), `$top` | | — | Filters only. limit 1–1000. |
| (no contract field) | 70703159 SIR_WF Audit Event | Source, Correlation Id | | W | |

### 2.5 Tenant (`tenant.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| tenant.ts → Tenant.id | 70703150 SIR_WF Setup | Public Id | Text[50] | R | |
| tenant.ts → Tenant.version | 70703150 SIR_WF Setup | Version | Integer | R | Bumped by any tenant part (foundation-gap decision 7). |
| tenant.ts → Tenant.name | Company Information | Name | Text[100] | W | Contract max 80. Pending GB-Q7. |
| tenant.ts → Tenant.preset | 70703150 SIR_WF Setup | Template Key | Text[100] | W | Set by template apply. |
| tenant.ts → Tenant.modules{code: on} | SIR Feature Register | SIR_WF Module Code, Enabled for = All Users | Code[10], Enum | R (W pending GB-Q9) | Rows with SIR_WF Workforce = true. |
| tenant.ts → Tenant.flags{code: on} | 70703151 SIR_WF Feature Flag | Code, Enabled | Code[20], Boolean | W | |
| tenant.ts → Company.registration | Company Information | Registration No. | Text[20] | W | Contract max 20. |
| tenant.ts → Company.address | Company Information | Address, Address 2, City, County, Post Code | Text[100], Text[50], Text[30], Text[30], Code[20] | W | Split on commas in Node, joined on read. Contract max 200. |
| tenant.ts → Company.country | Company Information | Country/Region Code | Code[10] | W | United Kingdom → GB, Ireland → IE, Nepal → NP. |
| tenant.ts → Company.nmwCheck | 70703150 SIR_WF Setup | NMW Check | Boolean | W | |
| tenant.ts → Company.bankHolidayRegion | 70703150 SIR_WF Setup | Bank Holiday Region | Enum (GB values from GB app) | W | |
| tenant.ts → Company.payFrequency | SIR Payroll Setup → SIR Pay Frequency | Default Pay Frequency (Code[10]) → Frequency (Option) | | R | Weekly↔Weekly, Fortnightly↔BiWeekly, Four-weekly↔FourWeekly, Monthly↔Monthly. A write that differs refuses `invalid` (field company.payFrequency). |
| tenant.ts → Company.weekEnding | 70703150 SIR_WF Setup | Week Ending | Enum SIR_WF Weekday | W | |
| tenant.ts → Company.firstPayDate | 70703150 SIR_WF Setup | First Pay Date | Date | W | '' ↔ 0D. |
| tenant.ts → FinancialYear.start / .end | SIR Fiscal Year (Active = true) | Start Date, End Date | Date | R | Write that differs refuses `invalid` (field financialYear). |
| tenant.ts → FinancialYear.label | SIR Fiscal Year | Fiscal Year (Code[20]); GB: SIR_GB HMRC Tax Year Notation (Text[20]) | | R | Through `OnGetFinancialYearLabel`. |
| tenant.ts → Tenant.weekStart | 70703150 SIR_WF Setup | Week Start | Enum SIR_WF Weekday | W | |
| tenant.ts → BankHoliday.date | Base Calendar Change | Date | Date | W | Base Calendar Code = SIR Timesheet Setup."Base Calender" (Code[10]); Recurring System blank; Nonworking = true; SIR Is Weekend = false. |
| tenant.ts → BankHoliday.name | Base Calendar Change | SIR_WF Holiday Name (Text[80]); Description (Text[30]) | | W | Pending GB-Q8. |
| tenant.ts → Tenant.timezone | 70703150 SIR_WF Setup | Time Zone | Text[100] | W | |
| tenant.ts → Tenant.dateFormat | 70703150 SIR_WF Setup | Date Format | Enum | W | |
| tenant.ts → Tenant.clock | 70703150 SIR_WF Setup | Clock Style | Enum | W | |
| tenant.ts → Tenant.fullTimeWeeklyHours | 70703150 SIR_WF Setup | Full-Time Weekly Hours | Decimal | W | 1–80. |
| tenant.ts → FlagExtras.weekGrid / .weekLayout | 70703172 SIR_WF Timesheet Config | Week Grid / Week Layout | Enum | W | Timesheet slice owns the fields; the flag switch writes them. |
| tenant.ts → FlagExtras.breaksMax | 70703150 SIR_WF Setup | Breaks Max | Integer | W | |
| tenant.ts → FlagExtras.vehiclesMax | 70703150 SIR_WF Setup | Vehicles Max | Integer | W | |
| tenant.ts → Tenant.restore{TS: [codes]} | SIR Feature Register | SIR_WF Restore On Parent (rows whose parent is WF_TS) | Boolean | D | Built from rows, no JSON. |
| tenant.ts → ModuleEffect.* | — | Summary of the module switch | | D | `kept` counts read by BC in the switch; `message` from `moduleSwitchText` in Node. |
| tenant.ts → SetModule.on | SIR Feature Register | Enabled for | Enum | W | Pending GB-Q9. |
| tenant.ts → SetFlag.on / weekGrid / weekLayout / breaksMax / vehiclesMax | as above | | | W | |
| tenant.ts → UpdateTenantSettings.* | as the Tenant rows above | | | W | One bound action, one transaction, one audit row. |

### 2.6 Templates (`setup-presets.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| setup-presets.ts → PresetRow.key | 70703160 SIR_WF Template | Key | Text[100] | R | Shipped rows come from TypeScript. |
| setup-presets.ts → PresetRow.name | 70703160 SIR_WF Template | Name | Text[80] | W | |
| setup-presets.ts → PresetRow.description | 70703160 SIR_WF Template | Description | Text[300] | W | |
| setup-presets.ts → PresetRow.scope | 70703160 SIR_WF Template | Scope | Enum | W | config, structure. |
| setup-presets.ts → PresetRow.source | 70703160 SIR_WF Template | Source | Enum | W | saved, imported; shipped is not stored. |
| setup-presets.ts → PresetRow.inUse | 70703150 SIR_WF Setup | Template Key = Key | | D | |
| setup-presets.ts → PresetRow.types[] / .modules[] | 70703160 SIR_WF Template | Body | Blob | D | Read from the body in Node. |
| setup-presets.ts → PresetRow.savedAt | 70703160 SIR_WF Template | Saved At | DateTime | W | |
| setup-presets.ts → PresetRow.savedBy | 70703160 SIR_WF Template | Saved By Employee No. → Employee name | Code[20] | D | |
| setup-presets.ts → PresetRow.from | 70703160 SIR_WF Template | From Name | Text[100] | W | |
| setup-presets.ts → PresetRow.version | 70703160 SIR_WF Template | Version | Integer | R | null for shipped. |
| setup-presets.ts → PresetList.inUse | 70703150 SIR_WF Setup | Template Key | Text[100] | R | |
| setup-presets.ts → Template (whole), PresetFile.template | 70703160 SIR_WF Template | Body | Blob (JSON) | W | Node builds it from the tenant (`captureTemplate`), never people, never money. |
| setup-presets.ts → PresetFile.kind / v / key | — | | | D | |
| setup-presets.ts → PresetPlan.* | — | | | D | `planApply`, `planSummary` in Node. |
| setup-presets.ts → SavePreset.name / description / scope | 70703160 SIR_WF Template | Name, Description, Scope | | W | Name ≤ 200 in the request, stored ≤ 80 after Node's check. |
| setup-presets.ts → ImportPreset.text | — | | | — | Read by `readTemplateFile` in Node; the parsed body is stored. |
| setup-presets.ts → PresetImported.ignored[] | — | | | D | |

Applying a template writes: flags and modules (pending question 1), `SIR_WF Setup` settings, employee types and structure (people slice), user type names (`SIR_WF User Type.Name`), approval chains, onboarding config and templates (onboarding slice). Financial year in `tenantSettings` is left alone (payroll owns it). `labels` stay in the template body only.

### 2.7 Approvals (`approvals.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| approvals.ts → ApprovalChain.id | 70703161 SIR_WF Approval Chain | Public Id | Text[50] | R | `chainId(module)`. |
| approvals.ts → ApprovalChain.version | 70703161 SIR_WF Approval Chain | Version (0 while Saved = false) | Integer | R | |
| approvals.ts → ApprovalChain.module | 70703161 SIR_WF Approval Chain | Module | Enum SIR_WF Chain Module | R | Timesheet, Profile. |
| approvals.ts → ApprovalChain.steps[] | 70703162 SIR_WF Approval Chain Step | rows by Step No. | | W | Unsaved: `defaultChainFor` in Node. |
| approvals.ts → ChainLayer.role | 70703162 SIR_WF Approval Chain Step | Role | Enum SIR_WF Approver Role | W | Contract string ≤ 40 maps to enum captions. |
| approvals.ts → ChainLayer.scope | 70703162 SIR_WF Approval Chain Step | Scope | Text[60] | W | |
| approvals.ts → ChainLayer.when | 70703162 SIR_WF Approval Chain Step | When | Text[80] | W | |
| approvals.ts → ChainLayer.sla | 70703162 SIR_WF Approval Chain Step | SLA | Text[40] | W | |
| approvals.ts → ChainLayer.fixed | 70703162 SIR_WF Approval Chain Step | Fixed | Boolean | W | |
| approvals.ts → SignOff.emailApproval | 70703151 SIR_WF Feature Flag | Enabled (Code = EMAIL_APPROVAL) | Boolean | R | |
| approvals.ts → SignOff.cutoff / .enforceLock / .returnReasonRequired | 70703172 SIR_WF Timesheet Config | Cutoff, Enforce Lock, Return Reason Required | | R | Timesheet slice. |
| approvals.ts → SignOff.current / .previous (from, to, closed) | — | | | D | Node: `periodStart`, `periodLocked` from the timesheet config, as the mock does. Not from `SIR Pay Period`. |
| approvals.ts → Delegation.id | 70703163 SIR_WF Delegation | Public Id | Text[50] | R | `dlg_<n>`. |
| approvals.ts → Delegation.who | 70703163 SIR_WF Delegation | From Employee No. | Code[20] | W | |
| approvals.ts → Delegation.to | 70703163 SIR_WF Delegation | To Employee No. | Code[20] | W | |
| approvals.ts → Delegation.whoName / .toName | Employee | name | | D | |
| approvals.ts → Delegation.from / .until | 70703163 SIR_WF Delegation | Date From, Date Until | Date | W | |
| approvals.ts → Delegation.modules[] | 70703163 SIR_WF Delegation | Timesheet, Profile | Boolean ×2 | W | Split/join. |
| approvals.ts → Delegation.active | — | | | D | `delegationActive` in Node. |
| approvals.ts → Approver.code / .name | Employee + capabilities | | | D | Active employees holding team_ts, profile_appr, bank_verify or pay_appr. |
| approvals.ts → CreateDelegation.* | 70703163 SIR_WF Delegation | as above | | W | `delegationProblem` in Node; BC repeats self, loop and overlap. |

### 2.8 Notifications (`notifications.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| notifications.ts → NotificationItem.id | SIR Notification Entry | Entry No. | Integer | R | As text (≤ 40). |
| (addressee) | SIR Notification Entry | Employee No. | Code[20] | R | Only the eyes' employee's rows. |
| notifications.ts → NotificationItem.area | SIR Notification Entry | SIR_WF Area | Text[30] | R | `payroll` when blank (payslip rows). |
| notifications.ts → NotificationItem.title | SIR Notification Entry | SIR_WF Title | Text[100] | R | Payslip rows: "Payslip". |
| notifications.ts → NotificationItem.body | SIR Notification Entry | SIR_WF Body, else Message | Text[2048], Text[250] | R | |
| notifications.ts → NotificationItem.at | SIR Notification Entry | SIR_WF At, else Created Date + Created Time | DateTime | R | |
| notifications.ts → NotificationItem.read | SIR Notification Entry | Seen | Boolean | W | Through `notificationReads`. |
| notifications.ts → NotificationItem.ago | — | | | D | `ageText` in Node. |
| notifications.ts → NotificationItem.link | — | | | D | `linkFor(area, persona, nav)` in Node. No BC field. |
| notifications.ts → MyNotifications.unread | SIR Notification Entry | count where Seen = false | | D | Only In-app delivered rows from modules that are on. |
| notifications.ts → NotificationsRead.unread / .marked / .auditId | | | | D | Command summary. |
| (no contract field) | SIR Notification Entry | Notification Type = Workforce, SIR_WF Event Code, SIR_WF Channel, SIR_WF Delivery, SIR_WF Ref | | W | Written when an event is raised. |
| notifications.ts → NotificationMatrix.id | 70703150 SIR_WF Setup | Public Id + "notifMatrix" | | D | One matrix per company. |
| notifications.ts → NotificationMatrix.version | 70703150 SIR_WF Setup | Notification Matrix Version | Integer | R | |
| notifications.ts → MatrixEvent.code | 70703164 SIR_WF Notification Event | Code | Text[40] | R | |
| notifications.ts → MatrixEvent.module | 70703164 SIR_WF Notification Event | Module | Text[30] | R | |
| notifications.ts → MatrixEvent.label / .description | 70703164 SIR_WF Notification Event | Label, Description | Text[100], Text[250] | R | |
| notifications.ts → MatrixEvent.channels.employee | 70703164 SIR_WF Notification Event | Employee Channel; null when Employee Applies = false | Enum | W | |
| notifications.ts → MatrixEvent.channels.manager | 70703164 SIR_WF Notification Event | Manager Channel / Manager Applies | Enum | W | |
| notifications.ts → MatrixEvent.channels.admin | 70703164 SIR_WF Notification Event | Admin Channel / Admin Applies | Enum | W | |
| notifications.ts → UpdateMatrix.events{code: {persona: channel}} | 70703164 SIR_WF Notification Event | the channel fields | | W | `applyMatrixChange` in Node; BC refuses a cell that does not apply. Which events show (`eventShown`) is Node's. |

### 2.9 Home and documents (`home.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| home.ts → HomeMonth.* (month, label, bounds, greeting, who, leadingBlanks, totals, summary, key, week.text) | — | | | D | `src/domain/home.ts`. |
| home.ts → HomeMonth.employee.code / .name / .location | Employee, SIR Work Sites | | | D | People slice. |
| home.ts → HomeMonth.week.contracted | Employee | SIR Contracted Hours (Base, Tab-Ext70702579:258) | Decimal | R | |
| home.ts → HomeDay.ts.state / .minutes / .waitingOn | 70703180 SIR_WF Timesheet Day (+ entries) | | | D | Timesheet slice. |
| home.ts → HomeDay.bankHoliday | Base Calendar Change | SIR_WF Holiday Name, else Description | Text[80] | R | |
| home.ts → HomeDay.locked | 70703180 SIR_WF Timesheet Day, Timesheet Config | | | D | Approved, or period locked (`isLocked`). |
| home.ts → HomeMonth.sentBack | 70703180 SIR_WF Timesheet Day | latest back day, Return Reason | | D | Timesheet slice. |
| home.ts → HomeMonth.can.recordHours | SIR Feature Register, capabilities | WF_A or WF_B on, own_ts | | D | |
| home.ts → DocumentRow.id | Document Attachment | SystemId | Guid | R | |
| home.ts → DocumentRow.employeeCode | Document Attachment | No. (Table ID = 5200) | Code[20] | R | |
| home.ts → DocumentRow.name | Document Attachment | File Name + File Extension | Text[250], Text[30] | R | Joined. |
| home.ts → DocumentRow.category | Document Attachment | SIR_WF Category | Text[50] | R | |
| home.ts → DocumentRow.date | Document Attachment | SIR_WF Document Date, else Attached Date | Date | R | |
| home.ts → DocumentRow.owner | Document Attachment | SIR_WF Owner | Text[50] | R | |
| home.ts → DocumentRow.source | Document Attachment | SIR_WF Source | Text[50] | R | |
| home.ts → DocumentRow.version / updatedAt | Document Attachment | 1, SystemModifiedAt | | D | Read only; no Version field. |
| home.ts → MyDocuments.employee | Employee | | | D | |

Payroll documents are not mapped: `/api/v1/documents/mine` no longer carries them (Task 25); they come from `/bc` (GB payslip API 70702818, P60, P45, P11D).

## 3. People and dimensions

### 3.1 Meta fields (every record, `common.ts:4` `RecordMeta`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| common.ts → RecordMeta.id | (each table) | code or Entry No. | — | R | Node: `<prefix>_<code>` (`emp_`, `loc_`, `dep_`, `cc_`, `job_`, `prj_`, `typ_`, `pc_`) on the reused coded tables, which have no Public Id (GB-D3); `hist_<Entry No.>` derived on 70703167. 70703168, 70703169 and 70703170 carry Public Id filled with the same value (`job_`, `typ_`, `pfc_`) (GB-D11). |
| common.ts → RecordMeta.version | (each table) | `SIR_WF Version` (reused tables) / `Version` 9901 (new tables) | Integer | R | If-Match. Bumped by AL. Install sets 1 on existing rows. |
| common.ts → RecordMeta.updatedAt | (each table) | `SystemModifiedAt` | DateTime | R | UTC. |
| common.ts → mutation.auditId | 70703159 `SIR_WF Audit Event` | Entry No. | — | R | Null for a no-op. |

### 3.2 Employee (`employees.ts:16-19` `Employee`, editable fields `:10-14`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| employees.ts → Employee.code | Employee 5200 | `No.` (1) | Code[20] | R, W on create | Immutable (OnRename refuses). Contract pattern `^[A-Z][A-Z0-9_-]{1,15}$` (`domain/codes.ts:5`); GB also refuses `_` (`Cod70702733.SIRGBEmployeeHelpers.al:196-210`). |
| employees.ts → Employee.name | Employee | `First Name`, `Middle Name`, `Last Name`, `SIR_WF Known As` | — | D | Read only, made in Node (`domain/employees.ts` `displayName`): known-as and last name, else every part in order. Never written. |
| employees.ts → Employee.firstName | Employee | `First Name` (2) | Text[30] | R/W | Required. Over 30 refused (`NAME_PART_MAX`). GB rule when field validation is on: letters, `'`, `-`, space only (`Cod70702733:51-88`). No part is split from a full name any more (replaces 02 §2.1). |
| employees.ts → Employee.middleName | Employee | `Middle Name` (3) | Text[30] | R/W | Optional. |
| employees.ts → Employee.lastName | Employee | `Last Name` (4) | Text[30] | R/W | Required on create; an existing blank (BC records with one name) stays editable, but a last name cannot be blanked. Sent to HMRC by payroll. |
| employees.ts → Employee.knownAs | Employee | `SIR_WF Known As` (replaces the planned `SIR_WF Display Name`) | Text[30] | R/W | Optional. Display only; payroll keeps the legal name. |
| employees.ts → Employee.email | Employee | `Company E-Mail` (50) | Text[80] | R/W | Lower case. Also keys `SIR_WF Account` (foundation); a change re-keys the account. |
| employees.ts → Employee.phone | Employee | `Mobile Phone No.` (14) | Text[30] | R/W | Self-field `phone`. |
| employees.ts → Employee.address | Employee | `Address` (8), `Address 2` (9), `City` (10), `Post Code` (11); GB: `SIR_GB Address Line 3` 70702675, `SIR_GB Address Line 4` 70702676 | Text[100], Text[50], Text[30], Code[20]; Text[50] ×2 | R/W | Split/join on commas through `SIR_WF Employee Localization` (GB adds lines 3/4). Written only by profile change or onboarding (not in `editable`). |
| employees.ts → Employee.emergencyFirstName, .emergencyLastName | Employee Relative 5205 | `First Name` (4), `Last Name` (6), row with `SIR_WF Emergency Contact` | Text[30] ×2 | R, W by profile change | Direct, one field each (was one name split at the first word). Row created if missing. |
| employees.ts → Employee.emergencyPhone | Employee Relative | `Phone No.` (8) | Text[30] | R, W by profile change | Same row. |
| employees.ts → Employee.bankAccount | SIR Employee Bank Account 70702643 | `Bank Account No.` (14) of the row in `Employee."SIR Preferred Bank Acc. Code"` (70702607), else Active Primary row, else `Employee."Bank Account No."` | Text[30] | R masked, W by profile change | `****` + last 4 (`domain/selfService.ts:53`). After a write, re-validate 70702607 so the Employee copy BACS reads follows (`Tab-Ext70702579.SIREmployee.al:308-337`). |
| employees.ts → Employee.bankSortCode | SIR Employee Bank Account | `Bank Branch No.` (13), caption "Bank Sort Code" | Text[20] | R masked, W by profile change | Format check by `SIR Payroll Field Formats` (`Tab70702643:112-123`). |
| employees.ts → Employee.position | Employee | `SIR_WF Job Profile Code` | Code[20] | R/W | → `SIR_WF Job Profile`. Also sets `Job Title` (6, Text[30]). |
| employees.ts → Employee.workPattern | Employee | `SIR_WF Employee Type Code` | Code[32] | R/W | → `SIR_WF Employee Type` (proposed rename `SIR_WF Work Pattern`, pending the table review); read lower case. Required. No longer sets `SIR Employment Type`: the employee's own `employmentType` does. |
| employees.ts → Employee.employmentType | Employee | `SIR_WF Employment Type` (was `SIR_WF Category`); on validate sets payroll's `SIR Employment Type` 70702621 | Enum `SIR_WF Worker Category` | R/W | Contracted → Hourly Contracted, Salaried → Salary, Bank → Zero Hour, Agency → blank (agency workers are not paid through payroll; payroll owner to confirm). Fixes the gap where changing one employee's basis left payroll's employment type unchanged. |
| employees.ts → Employee.grade | Employee | `SIR Pay Grade` 70702585 | Code[20] | R/W | Optional. TableRelation `SIR Pay Grade` 70702575; refused when not there. |
| employees.ts → Employee.level | Employee | `SIR Pay Level` 70702584 (caption "Salary Level") | Code[20] | R/W | Optional. TableRelation `SIR Pay Level` 70702576. |
| employees.ts → Employee.location | SIR Employee Sites 70702608 | `Site Code` (10) where `Is Default Site` (50); read via `Employee."SIR_WF Location Code"` FlowField | Code[20] | R/W | Write: insert row if missing, clear old default, set new default; never delete. Blocked site refused (`Tab70702608:27-29`). Required. |
| employees.ts → Employee.department | Default Dimension 352 | `Dimension Value Code` (4) where Table ID 5200, No. = code, Dimension Code = `SIR_WF Setup."Department Dimension Code"` | Code[20] | R/W | Page variable. Insert/modify with Validate. |
| employees.ts → Employee.manager | Employee | `Manager No.` (26) | Code[20] | R/W | Employee code only (B15); a free-text name is refused. |
| employees.ts → Employee.contractedHours | Employee | `SIR Contracted Hours` 70702600 | Decimal | R/W | 0–80 (`domain/employees.ts:25-30`). GB sets the RTI band `SIR_GB weekly hours worked` (`Tab-Ext70702675:733-752`). |
| employees.ts → Employee.maxHours | Employee | `SIR_WF Max Hours` | Decimal | R/W | 0–80; 0 = none. |
| employees.ts → Employee.night | Employee | `SIR_WF Night Worker` | Boolean | R/W | |
| employees.ts → Employee.resource | Employee | `Resource No.` (38) | Code[20] | R/W | Upper case; must exist (TableRelation Resource, Type = Person). |
| employees.ts → Employee.cis | Employee | `SIR_WF CIS` | Boolean | R/W | |
| employees.ts → Employee.start | Employee | `Employment Date` (29) | Date | R/W | `''` = 0D. Validate: GB sets pension assessment date (`Cod70702733:168-191`) and checks Birth Date. |
| employees.ts → Employee.end | Employee | `Termination Date` (34) | Date | R, W by transition | Leaver without an end gets today. |
| employees.ts → Employee.state | Employee | `SIR_WF State`; base `Status` (31), `Inactive Date` (32) | Enum `SIR_WF Employee State`; Enum `Employee Status` | R, W by transition | Mapping 02 §2.2, pending GB-Q2 (Inactive stops GB pay). |
| employees.ts → Employee.userType | Employee | `SIR_WF User Type Code` | Text[20] | R/W | Null when no `SIR_WF Account` (foundation). Change needs `perm_cfg`; `locked` guards in Node and AL. |
| employees.ts → CreateEmployee.state | Employee | `SIR_WF State` | Enum | W on create | candidate, preboard or active only (`:23-24`). Candidate/preboard also opens the onboarding case (onboarding slice). |
| employees.ts → UpdateEmployee.code / .state | — | — | — | refused | `z.never()` (`:28-31`): Node refuses `invalid` naming the field; AL refuses too. |
| employees.ts → HistoryEntry.id | 70703167 SIR_WF Employee History | `Entry No.` | BigInteger | R | `hist_` + 12 digits. |
| employees.ts → HistoryEntry.employeeCode | 70703167 SIR_WF Employee History | `Employee No.` | Code[20] | R | |
| employees.ts → HistoryEntry.at | 70703167 SIR_WF Employee History | `At` | DateTime | R | |
| employees.ts → HistoryEntry.by.employeeCode | 70703167 SIR_WF Employee History | `By Employee No.` | Code[20] | R | Blank for a BC user: Node shows `By User ID`. |
| employees.ts → HistoryEntry.by.name | Employee | Display Name of By Employee No. | — | R | Node join. |
| employees.ts → HistoryEntry.source / field / from / to / reason | 70703167 SIR_WF Employee History | `Source`, `Field Name`, `From Value`, `To Value`, `Reason` | Enum; Text[50]; Text[250] ×2; Text[500] | R | Bank values masked. |
| employees.ts → NextCode.code | Employee | `No.` of all rows | — | R | Node (`nextEmployeeCode`, `domain/codes.ts`). |
| employees.ts → Transition.to | Employee | `SIR_WF State` | Enum | W | Rules in Node (`domain/lifecycle.ts`); AL checks the enum and Version. |
| employees.ts → Transition.reason | 70703167 SIR_WF Employee History, SIR_WF Audit Event | `Reason` | Text[500] | W | Required. |
| employees.ts → EmployeesQuery.state / q | Employee | `SIR_WF State`; name, code, job profile | — | — | Node: `$filter` on state; `q` filtered in Node. Scope via `SIR_WF Location Code`. |

### 3.3 Locations (`dimensions.ts:9-10` `Location`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| dimensions.ts → Location.code | SIR Work Sites 70702606 | `Code` (1) | Code[20] | R, W on create | `^[A-Z0-9][A-Z0-9_.-]{0,19}$`. Immutable. |
| dimensions.ts → Location.name | SIR Work Sites | `Description` (2) | Text[100] | R/W | Also the name of the work-site Dimension Value (Text[50]: first 50). |
| dimensions.ts → Location.area | SIR Work Sites | `SIR_WF Area` (70703150) | Text[80] | R/W | |
| dimensions.ts → Location.department | Default Dimension | Table ID 70702606, No. = code, Department Dimension | Code[20] | R/W | Page variable. |
| dimensions.ts → Location.costCentre | Default Dimension | Table ID 70702606, Cost Centre Dimension | Code[20] | R/W | Page variable. |
| dimensions.ts → Location.manager | SIR Work Sites | `Site Manager` (32) | Code[20] | R/W | Employee code. `Approver` (35) is left to payroll. |
| dimensions.ts → Location.address | SIR Work Sites | `Address` (3) | Text[100] | R/W | Over 100 refused (GB-Q14). |
| dimensions.ts → Location.active | SIR Work Sites | `Blocked` (37) | Boolean | R/W | `active = not Blocked`. |
| dimensions.ts → (list) inUse | — | — | — | R | Node (`domain/usage.ts:19-31`): employees, projects. |
| dimensions.ts → LocationOption.code / name | SIR Work Sites | `Code`, `Description` | — | R | Picker. |

### 3.4 Departments and cost centres (`dimensions.ts:13-14`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| dimensions.ts → Department.code / CostCentre.code | Dimension Value 349 | `Code` (2) where `Dimension Code` (1) = Setup's dimension | Code[20] | R, W on create | Immutable. |
| dimensions.ts → Department.name / CostCentre.name | Dimension Value | `Name` (3) | Text[50] | R/W | Over 50 refused (template allows 80). |
| dimensions.ts → Department.manager | Dimension Value | `SIR_WF Manager No.` | Code[20] | R/W | Employee code. |
| dimensions.ts → (list) inUse | — | — | — | R | Node: locations and employees (department); locations and projects (cost centre). |

### 3.5 Job profiles (`dimensions.ts:15`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| dimensions.ts → Position.code | 70703168 SIR_WF Job Profile | `Code` | Code[20] | R, W on create | Immutable. |
| dimensions.ts → Position.name | 70703168 SIR_WF Job Profile | `Name` | Text[100] | R/W | |
| dimensions.ts → Position.night | 70703168 SIR_WF Job Profile | `Night` | Boolean | R/W | |
| dimensions.ts → (list) inUse | — | — | — | R | Node: employees, onboarding templates. |

### 3.6 Projects and tasks (`dimensions.ts:16-17`; tasks `timesheets.ts:88`, `setup-presets.ts:35`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| dimensions.ts → Project.code | Job 167 | `No.` (1) | Code[20] | R, W on create | Immutable. |
| dimensions.ts → Project.name | Job | `Description` (3) | Text[100] | R/W | Over 100 refused (template 120). |
| dimensions.ts → Project.client | Job | `SIR_WF Client Name` | Text[120] | R/W | |
| dimensions.ts → Project.costCentre | Default Dimension | Table ID 167, Cost Centre Dimension | Code[20] | R/W | Page variable. |
| dimensions.ts → Project.manager | Job | `SIR_WF Manager No.` | Code[20] | R/W | Employee code. |
| dimensions.ts → Project.status | Job | `Status` (19) | Enum `Job Status` | R/W | Active → Open, Planned/Planning → Planning, Quote → Quote, Closed/Completed → Completed; other text refused. |
| dimensions.ts → Project.start / end | Job | `Starting Date` (13), `Ending Date` (14) | Date | R/W | `''` = 0D. |
| dimensions.ts → Project.budgetHours | Job | `SIR_WF Budget Hours` | Decimal | R/W | Contract text; Node parses, blank = 0. |
| dimensions.ts → Project.billable | Job | `SIR_WF Billable` | Boolean | R/W | |
| dimensions.ts → Project.location | Job | `SIR_WF Work Site Code` | Code[20] | R/W | → SIR Work Sites. |
| dimensions.ts → (list) inUse | — | — | — | R | Node: 0 today (`domain/usage.ts:30`); timesheet entries later. |
| timesheets.ts → OpenProject.tasks[] | Job Task 1001 | `Description` (3) where `Job Task Type` = Posting | Text[100] | R | Timesheet slice reads it. |
| timesheets.ts → OpenProject.costCentre | Default Dimension 352 | `Dimension Value Code` where Table ID = 167 (Job), No. = Job, Dimension Code = cost centre | Code[20] | R | The row default for the week grid; the person may change it. |
| setup-presets.ts → contracts[].tasks[].name / group / billable | Job Task | `Description`, `SIR_WF Task Group`, `SIR_WF Billable`; `Job Task No.` generated `T0010`… | Text[100], Text[60], Boolean | W by template apply | Templates slice. |

### 3.7 Work patterns (`work-patterns.ts:10-21`; were employee types)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| work-patterns.ts → WorkPattern.code | 70703169 SIR_WF Employee Type | `Code` | Code[32] | R, W on create | Lower case on read. Immutable. |
| work-patterns.ts → WorkPattern.name | 70703169 SIR_WF Employee Type | `Name` | Text[60] | R/W | |
| work-patterns.ts → WorkPattern.employmentType | 70703169 SIR_WF Employee Type | `Category` | Enum | R/W | The usual employment type a new employee on the pattern starts with. It no longer sets anyone's `SIR Employment Type`: each employee's own `employmentType` does. |
| work-patterns.ts → WorkPattern.mode | 70703169 SIR_WF Employee Type | `Entry Mode` | Enum | R/W | |
| work-patterns.ts → WorkPattern.uom | 70703169 SIR_WF Employee Type | `Pay Basis` | Enum `SIR_WF Pay Basis` | R/W | |
| work-patterns.ts → WorkPattern.fieldGroups[] | 70703169 SIR_WF Employee Type | `Vehicle`, `Site`, `Project`, `Shift` | Boolean ×4 | R/W | Split/join. |
| work-patterns.ts → WorkPatternRow.inUse | — | — | — | R | Node: employees with the type. |
| work-patterns.ts → CreateEmployeeType.startedFrom | 70703159 SIR_WF Audit Event | reason | — | W | Not stored on the type. |
| work-patterns.ts → Archetype, PatternLibrary | — | — | — | R | Shipped in Node. |

### 3.7a Pay grades and levels (`pay-grades.ts`, read only)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| pay-grades.ts → PayGrade.code / .name | SIR Pay Grade 70702575 | `Code` (1), `Description` (2) | Code[10], Text[50] | R | Payroll's list, through page 70703216 `payGrades`, sorted by code. |
| pay-grades.ts → PayLevel.code / .name / .rank | SIR Pay Level 70702576 | `Code` (1), `Description` (2), `Rank` (3) | Code[10], Text[50], Integer | R | Through page 70703217 `payLevels`, sorted by rank. Never `Basic Salary` (4): no money leaves payroll. |

### 3.8 Profile changes (`profile.ts:8-23`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| profile.ts → ProfileChange.id | 70703170 SIR_WF Profile Change | `Entry No.` | Integer | R | `pfc_<n>`. |
| profile.ts → ProfileChange.employeeCode | 70703170 SIR_WF Profile Change | `Employee No.` | Code[20] | R, W on propose | Own record (or viewing-as refused). |
| profile.ts → ProfileChange.employeeName | Employee | Display Name | — | R | Node join. |
| profile.ts → ProfileChange.field | 70703170 SIR_WF Profile Change | `Field Key` | Enum `SIR_WF Self Field` | R/W | |
| profile.ts → ProfileChange.from | 70703170 SIR_WF Profile Change | `From Value` | Text[250] | R | Masked for bank fields. |
| profile.ts → ProfileChange.to | 70703170 SIR_WF Profile Change | `To Value` (Blob) / `To Value Masked` | Blob / Text[50] | R masked, W on propose | Bank values never returned whole. |
| profile.ts → ProfileChange.note | 70703170 SIR_WF Profile Change | `Note` | Text[500] | R/W | |
| profile.ts → ProfileChange.raisedAt | 70703170 SIR_WF Profile Change | `Raised At` | DateTime | R | Server time. |
| profile.ts → ProfileChange.status / stage | 70703170 SIR_WF Profile Change | `Status`, `Stage` | Enum ×2 | R | Moved by the decision action. |
| profile.ts → ProfileChange.route[] | 70703170 SIR_WF Profile Change | `Needs Manager`, `Needs Payroll` | Boolean ×2 | R, W on propose | Node computes the route from the Profile chain (`routeFor`). |
| profile.ts → ProfileChange.decisions[].stage / decision / at / reason | 70703171 SIR_WF Profile Change Decision | `Stage`, `Decision`, `At`, `Reason` | Enum, Enum, DateTime, Text[500] | R, W by decision | |
| profile.ts → ProfileChange.decisions[].by.employeeCode / name | 70703171 SIR_WF Profile Change Decision | `By Employee No.` (+ Employee name) | Code[20] | R | Name joined in Node. |
| profile.ts → Profile.employee | Employee | as Employee above | — | R | Own record. |
| profile.ts → Profile.fields[] (SelfField) | — | — | — | R | Node (`SELF_FIELDS`, `domain/selfService.ts`). |
| profile.ts → Profile.pending[] | 70703170 SIR_WF Profile Change | Status = pending, own Employee No. | — | R | |
| profile.ts → Profile.selfEdit | 70703151 SIR_WF Feature Flag | `SELF_EDIT` | — | R | Foundation slice. |
| profile.ts → ProposeChanges.changes[].field / to, .note | 70703170 SIR_WF Profile Change | one row per change | — | W | `pending` refused when a change to that field is open; `unchanged` when nothing differs. |
| profile.ts → Decision.decision / reason | 70703171 SIR_WF Profile Change Decision | `Decision`, `Reason` | — | W | Last approval writes the record (see Employee rows above) and a history row (source profile-change). |

### 3.9 Pay codes (`pay-codes.ts:22-60`)

The people and timesheet slices both mapped pay codes; this table merges them (GB-D18). The timesheet slice put `SIR_WF Public Id` (9900) on `SIR TIme Sheet Elements`; it is dropped (GB-D3).

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| pay-codes.ts → PayCodeRecord.id | SIR TIme Sheet Elements 70702615 | `Code` (1) | Code[20] | D | `pc_<Code>`, derived by Node. No Public Id. |
| pay-codes.ts → PayCodeRecord.version | SIR TIme Sheet Elements | `SIR_WF Version` (70703153) | Integer | R | If-Match. Bumped only when a contract-mapped field changes. |
| pay-codes.ts → PayCodeRecord.code | SIR TIme Sheet Elements 70702615 | `Code` (1) = `External Field Mapping` (6) | Code[20] | R, W on create | Domain pattern ≤12 (`domain/pay-codes.ts:18`); contract `max(40)` but BC 20 (GB-Q16). Existing rows: code = External Field Mapping; rows with it blank are not listed. |
| pay-codes.ts → PayCodeRecord.label | SIR TIme Sheet Elements | `Description` (2) | Text[100] | R/W | Contract max 80. |
| pay-codes.ts → PayCodeRecord.basis | SIR TIme Sheet Elements | `SIR_WF Basis` (70703150); sets `Unit Of Measure` (3) | Enum `SIR_WF Pay Code Basis`; Option | R/W | |
| pay-codes.ts → PayCodeRecord.value | SIR TIme Sheet Elements | `SIR_WF Value` (70703151) | Decimal | R/W | Text in the contract ("1.5"); blank for flat/units. Never money. |
| pay-codes.ts → PayCodeRecord.element | SIR TIme Sheet Elements | `Pay Element` (5) → SIR Payroll Element 70702581 | Code[20] | R/W | One element, one code (AL check). Over 20 refused. |
| pay-codes.ts → PayCodeRecord.workType | SIR TIme Sheet Elements | `SIR_WF Work Type` (70703152); sets `Field Type` (4) | Boolean; Enum | R/W | Field Type drives payroll's normal hours (`Tab70702583.SIRPayrollLine.al:2303-2306`). |
| pay-codes.ts → PayCodeRow.claimedBy[] | 70703177 SIR_WF TS Type Allowance, 70703178 SIR_WF TS Type Rule | — | — | R | Node (`claimedBy`, `domain/pay-codes.ts:86-89`). |
| pay-codes.ts → PayCodeRow.usedBy[] (kind, count, examples) | 70703180 SIR_WF Timesheet Day (Work Type), 70703184, 70703174, 70703177, 70703178 | counts | — | R | Node (`payCodeUsage`); 70703158 `SIR_WF Usage Check` repeats it on delete, so the same counts back the 409. |
| pay-codes.ts → AllowanceCodeRow.* | 70703174 `SIR_WF TS Allowance` | Code, Label, Element | — | R | Read only here; `claimedBy` from 70703177. |
| (not in contract) Pay Unit, Unit Of Measure | SIR TIme Sheet Elements | `Pay Unit` (30), `Unit Of Measure` (3) | Option | — | Set by AL from basis; never exposed. |

## 4. Timesheet and clocking

### 4.1 Timesheet day (`timesheets.ts`)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| timesheets.ts → TimesheetDay.id | 70703180 SIR_WF Timesheet Day | Public Id | Text[50] | RW | `tsd_<employee>_<yyyy-mm-dd>` (`mocks/timesheets.ts:40`). Set on insert. |
| TimesheetDay.version | 70703180 SIR_WF Timesheet Day | Version | Integer | R | Day If-Match. 0 in `WeekDay.version` when no row. |
| TimesheetDay.updatedAt | 70703180 SIR_WF Timesheet Day | SystemModifiedAt | DateTime | R | |
| TimesheetDay.employeeCode | 70703180 SIR_WF Timesheet Day | Employee No. | Code[20] | RW | Was `personCode` in 02. |
| TimesheetDay.date | 70703180 SIR_WF Timesheet Day | Date | Date | RW | |
| TimesheetDay.state | 70703180 SIR_WF Timesheet Day | State | Enum SIR_WF TS State | RW | Same names. |
| TimesheetDay.entries[] | 70703181 SIR_WF Timesheet Entry | (rows) | | RW | ≤ 6. Replaced whole on each save. |
| TimesheetDay.workType | 70703180 SIR_WF Timesheet Day | Work Type | Code[20] | RW | Node `deriveWorkType`, else `STD`. Must exist in `SIR TIme Sheet Elements.Code`. |
| TimesheetDay.allowances[] | 70703184 SIR_WF TS Day Allowance | Allowance Code | Code[20] | RW | ≤ 20 rows, `Line No.` keeps order. |
| TimesheetDay.nonWorkingReason | 70703180 SIR_WF Timesheet Day | Non-Working Reason | Text[200] | RW | |
| TimesheetDay.captureSource | 70703180 SIR_WF Timesheet Day | Capture Source | Enum SIR_WF Capture Source | RW | Kept as stored when a week submit sends a day unchanged (`mocks/timesheets.ts:362`). |
| TimesheetDay.enteredBy | 70703180 SIR_WF Timesheet Day | Entered By | Code[20] | RW | Acting employee from the session. |
| TimesheetDay.enteredByName | — | — | | D | Name from the people cache. |
| TimesheetDay.submittedAt | 70703180 SIR_WF Timesheet Day | Submitted At | DateTime | RW | `''` when blank. |
| TimesheetDay.returnReason | 70703180 SIR_WF Timesheet Day | Return Reason | Text[500] | RW | Set on `back`. |
| TimesheetDay.warnings[] | 70703180 SIR_WF Timesheet Day | Warnings | Text[2048] | RW | JSON array. |
| TimesheetDay.history[] | 70703185 SIR_WF Timesheet Day Log | (rows) | | R (inserted by commands) | Ordered by Entry No. |
| TimesheetDay.minutes | 70703180 SIR_WF Timesheet Day | Minutes | Integer | RW | Node computes; BC stores and checks it equals the entries' sum. |
| TimesheetDay.waitingOn | 70703180 SIR_WF Timesheet Day | Waiting Role | Text[40] | RW | Returned only when state = mgrok (`timesheets.ts:37-38`). |
| (not in contract) | 70703180 SIR_WF Timesheet Day | Week Start, Work Site Code, Line Manager No., Chain Roles | | W | Keys and queue filters. |
| timesheets.ts → TimeEntry.start | 70703181 SIR_WF Timesheet Entry | Start | Text[5] | RW | HH:MM or blank. |
| TimeEntry.finish | 70703181 SIR_WF Timesheet Entry | Finish | Text[5] | RW | |
| TimeEntry.breaks[] | 70703182 SIR_WF Timesheet Break | (rows) | | RW | ≤ 5 per entry. |
| TimeEntry.hours | 70703181 SIR_WF Timesheet Entry | Hours, Hours Given | Decimal, Boolean | RW | 0–24; null when Hours Given = false. Optional key omitted when Hours Given = false. |
| TimeEntry.fields (record) | 70703183 SIR_WF TS Entry Field | Field Code, Is Boolean, Text Value, Boolean Value | Text[30], Boolean, Text[500], Boolean | RW | Every key as sent. |
| TimeEntry.fields.project | 70703181 SIR_WF Timesheet Entry | Job No. | Code[20] | W | Node resolves the project name (`domain/timesheet.ts:279`) to `Job."No."`; raw name stays in Entry Field. |
| TimeEntry.fields.job_task | 70703181 SIR_WF Timesheet Entry | Job Task No. | Code[20] | W | Resolved within the job. |
| TimeEntry.fields.site | 70703181 SIR_WF Timesheet Entry | Work Site Code | Code[20] | W | Resolved from the location name. BC refuses a `Blocked` site. |
| TimeEntry.fields.cost_c | 70703181 SIR_WF Timesheet Entry | Cost Centre Code | Code[20] | W | |
| TimeEntry.fields.dept | 70703181 SIR_WF Timesheet Entry | Department Code | Code[20] | W | |
| (net per entry) | 70703181 SIR_WF Timesheet Entry | Net Minutes | Integer | W | Node `entryMinutes(e, date)`. |
| timesheets.ts → BreakInput.start | 70703182 SIR_WF Timesheet Break | Start | Text[5] | RW | Also used inside `ClockRecord.written.breaks`. |
| BreakInput.end | 70703182 SIR_WF Timesheet Break | End | Text[5] | RW | |
| timesheets.ts → TsHistory.from | 70703185 SIR_WF Timesheet Day Log | From State | Enum | R | |
| TsHistory.to | 70703185 SIR_WF Timesheet Day Log | To State | Enum | R | |
| TsHistory.by.employeeCode | 70703185 SIR_WF Timesheet Day Log | By Employee No. | Code[20] | R | |
| TsHistory.by.name | — | — | | D | People cache. |
| TsHistory.at | 70703185 SIR_WF Timesheet Day Log | At | DateTime | R | |
| TsHistory.reason | 70703185 SIR_WF Timesheet Day Log | Reason | Text[500] | R | |
| TsHistory.layer | 70703185 SIR_WF Timesheet Day Log | Layer | Text[40] | R | Omitted when blank. |

### 4.2 Writes (`timesheets.ts`)

| Contract field | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| DayInput.entries | command `timesheetDaySaves` | `day.entries` | JSON | W | → 70703181 SIR_WF Timesheet Entry, 70703182 SIR_WF Timesheet Break, 70703183 SIR_WF TS Entry Field. |
| DayInput.allowances | command | `day.allowances` | JSON | W | → 70703184 SIR_WF TS Day Allowance. |
| DayInput.nonWorkingReason | command | `day.nonWorkingReason` | Text[200] | W | |
| (If-Match) | command | `version` | Integer | W | Day version; 0 creates. |
| DaySaved.record | 70703180 SIR_WF Timesheet Day (+children) | | | R | Re-read after the command. |
| DaySaved.warnings | command output | `warnings` | Text (JSON) | R | Node's warnings, echoed. |
| DaySaved.auditId | command output | `auditId` | Text[50] | R | Audit row (foundation). |
| WeekSubmitDay.date / .version | command `timesheetWeekSubmits` | `weeks[].days[].date`, `.version` | Date, Integer | W | Per-day stale check. |
| WeekSubmitDay.entries (optional) | command | `weeks[].days[].day` or `unchanged: true` | JSON | W | No entries = submit as stored, keep `captureSource` and `enteredBy`. |
| (week aggregate) | 70703179 SIR_WF Timesheet Week | Version | Integer | W | `weeks[].weekVersion`, required (R2). |
| WeekSubmitted.submitted[] | 70703180 SIR_WF Timesheet Day | | | R | |
| WeekSubmitted.held[] (date, reason) | — | — | | D | Node's `planWeekSubmit`; held days are not written. |
| WeekSubmitted.flagged[], .warnings[], .weekMinutes | — | — | | D | |
| MultiweekSubmit.weeks[] | command `timesheetWeekSubmits` | `weeks[].weekStart` | Date | W | 1–8 weeks, each with its `weekVersion`. |
| MultiweekSubmitted.weeks[].outcome, .reason, .label, .held | — | — | | D | |
| DayTransition.to | command `timesheetDays(id)/transition` | `to` | Enum (ok, back, mgrok) | W | Node turns `ok` into `mgrok` when a later layer remains. |
| DayTransition.reason | command | `reason` | Text[500] | W | → Return Reason and Log Reason on back. |
| DayDecided.record | 70703180 SIR_WF Timesheet Day | | | R | |
| BulkApprove.ids[] | command `timesheetBulkApprovals` | `items[].id` | Text[50] | W | Public Ids, ≤ 500. |
| BulkApprove.checksum | — | — | | D | Node recomputes `queueChecksum` from a fresh read; mismatch = `QUEUE_CHANGED` before calling BC. BC then checks `items[].version`. |
| BulkApproved.approved[] | 70703180 SIR_WF Timesheet Day | | | R | |
| BulkApproved.held[] (id, code, reason) | — | — | | D | Days Node did not send (wrong layer, self, scope). |
| BulkApproved.employees, .minutes | — | — | | D | |

### 4.3 Week, queue and setup views (`timesheets.ts`)

| Contract field | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| TimesheetWeek.employee.code | Employee, through 70703170 `SIR_WF API Employees` | No. | Code[20] | R | Never the GB `employees` page 70702750 (it exposes pay amounts, GB-D15). |
| TimesheetEmployee.name | Employee | First/Last Name | | R | |
| TimesheetEmployee.workPattern, .typeName | 70703169 SIR_WF Employee Type (foundation) | | | R | |
| TimesheetEmployee.location | SIR Employee Sites | Site Code where Is Default Site | Code[20] | R | `B/Table/Tab70702608.SIREmployeeSites.al:87`. |
| TimesheetEmployee.manager | Employee | Manager No. | Code[20] | R | B15: a code; Node returns the name. |
| TimesheetEmployee.contractedHours | Employee | SIR Contracted Hours | Decimal | R | `B/Table Extensions/Tab-Ext70702579.SIREmployee.al:258`. 0 for bank and zero-hours. |
| TimesheetWeek.weekStart, .label, .now | — | — | | D | `now` in the tenant zone. |
| TimesheetWeek.days[] (WeekDay) | 70703180 SIR_WF Timesheet Day | | | R/D | |
| WeekDay.record | 70703180 SIR_WF Timesheet Day (+children) | | | R | null when no row. |
| WeekDay.state | 70703180 SIR_WF Timesheet Day | State | | R | `none` when no row. |
| WeekDay.version | 70703180 SIR_WF Timesheet Day | Version | | R | 0 when no row. |
| WeekDay.minutes | 70703180 SIR_WF Timesheet Day | Minutes | | R | |
| WeekDay.future | — | — | | D | |
| WeekDay.locked, .lockNote | 70703172 SIR_WF Timesheet Config + `payPeriods` | Enforce Lock, Cutoff Day/Time; posted flag | | D | Cut-off rule in Node; a posted GB pay period also locks (GB-Q3). |
| WeekDay.flags[] | — | — | | D | `advisoryFlags` (long, proxy, resub, locked). |
| WeekDay.clock.closedLate | 70703186 SIR_WF Clock Record | Closed Late Finish ≠ '' | | R | Present only when a clock record exists. |
| TimesheetWeek.weekMinutes, .byAllocation | — | — | | D | `weekTotals` over entries and their allocation fields. |
| TimesheetWeek.earlierWeeks[] (EarlierWeek) | 70703180 SIR_WF Timesheet Day | State, Minutes, Week Start | | R/D | Days before the week, state ≠ ok; Node groups by Week Start, newest 8. |
| CaptureSetup.rules, .cutoff, .timeFormat, .returnReasonRequired, .weekGrid, .weekLayout | 70703172 SIR_WF Timesheet Config | see §4 | | R | |
| CaptureSetup.fields | — | — | | N | The field catalogue (`seed/meta.json` `timesheetFields`). |
| CaptureSetup.type | 70703175 SIR_WF TS Type Capture + children | | | R | null when no 70703175 SIR_WF TS Type Capture row for the employee's type. |
| CaptureSetup.modules, .flags | SIR Feature Register / SIR_WF Feature Flag (foundation) | | | R | |
| CaptureSetup.capabilities | foundation | | | R | The employee type's capabilities. |
| CaptureSetup.fieldDefaults | 70703173 SIR_WF TS Field Default | | | R | |
| CaptureSetup.allowances[] | 70703174 SIR_WF TS Allowance | | | R/D | The type's allowance codes; a pay code without a 70703174 SIR_WF TS Allowance row becomes `{code, label, payCode: code, tier: 'core'}` (`mocks/timesheets.ts:293-294`). |
| CaptureSetup.payCodes[] | SIR TIme Sheet Elements | see §6 | | R | |
| CaptureSetup.mode | 70703169 SIR_WF Employee Type (foundation) | Mode | | R | form, grid, clock. |
| CaptureSetup.projects[] (code, name, tasks, costCentre) | Job, Job Task | No., Description, Status = Open | | R | Task names from `Job Task.Description`. |
| QueueRow (TimesheetDay fields) | 70703180 SIR_WF Timesheet Day | as §1 | | R | |
| QueueRow.employeeName | Employee | | | D | People cache. |
| QueueRow.location | 70703180 SIR_WF Timesheet Day | Work Site Code | Code[20] | R | Was the employee's location in the mock; the day's copy is the same on the day. |
| QueueRow.locationName | SIR Work Sites | Description | Text[100] | R | Cached. |
| QueueRow.flags, .decide | — | — | | D | `decide` from Node's chain walk. |
| QueueRow.clock | 70703186 SIR_WF Clock Record | Closed Late Finish | | R | |
| ApprovalQueue.rows, .nextCursor | 70703180 SIR_WF Timesheet Day | | | R/D | Cursor = numeric offset (`$skip`). |
| ApprovalQueue.counts (pend … all) | query `SIR_WF TS Queue Counts` | State, Count | | R | `pend` = Node's decidable count. |
| ApprovalQueue.oldestPending | 70703180 SIR_WF Timesheet Day | Submitted At (min) | | R | Of the decidable set. |
| ApprovalQueue.bulk (ids, checksum, employees, minutes, flagged, outside) | 70703180 SIR_WF Timesheet Day | Public Id, State, Version, Minutes, Date, Capture Source, Employee No. | | R/D | Lean read of the whole decidable set. |
| ApprovalQueue.now, .sla | — / foundation chain | | | D | |
| ApprovalQueue.returnReasonRequired | 70703172 SIR_WF Timesheet Config | Return Reason Required | Boolean | R | |
| QueueQuery.status, .q, .cursor, .weekStart | — | — | | D | Become `$filter`, `$skip`, date range. |
| TimesheetSetup.config | 70703172 SIR_WF Timesheet Config + 70703173–70703178 | | | R | |
| TimesheetSetup.fields | — | — | | N | |
| TimesheetSetup.payCodes | SIR TIme Sheet Elements | | | R | |

### 4.4 Timesheet config (`timesheets.ts` → TimesheetConfig, UpdateTimesheetConfig)

| Contract field | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| TimesheetConfig.id | 70703172 SIR_WF Timesheet Config | Public Id | Text[50] | R | `timesheetConfig`. |
| TimesheetConfig.version | 70703172 SIR_WF Timesheet Config | Version | Integer | RW | Bumped by any child change. |
| CaptureRules.maxDaily | 70703172 SIR_WF Timesheet Config | Max Daily | Decimal | RW | AL repeats `timesheetConfigProblem` (B7). |
| CaptureRules.warnDaily | 70703172 SIR_WF Timesheet Config | Warn Daily | Decimal | RW | |
| CaptureRules.minNet | 70703172 SIR_WF Timesheet Config | Min Net | Decimal | RW | |
| CaptureRules.blockFuture | 70703172 SIR_WF Timesheet Config | Block Future | Boolean | RW | |
| CaptureRules.enforceLock | 70703172 SIR_WF Timesheet Config | Enforce Lock | Boolean | RW | Also `SignOff.enforceLock` (`approvals.ts:96`). |
| CaptureRules.otDaily | 70703172 SIR_WF Timesheet Config | OT Daily | Decimal | RW | |
| CaptureRules.nightFrom | 70703172 SIR_WF Timesheet Config | Night From | Text[5] | RW | |
| CaptureRules.nightTo | 70703172 SIR_WF Timesheet Config | Night To | Text[5] | RW | |
| TimesheetConfig.cutoff | 70703172 SIR_WF Timesheet Config | Cutoff Day + Cutoff Time | Enum + Text[5] | RW | "Monday 12:00". Also `SignOff.cutoff`. |
| TimesheetConfig.timeFormat | 70703172 SIR_WF Timesheet Config | Time Format | Enum | RW | HHMM ↔ 'HH:MM', HM ↔ 'h m'. |
| TimesheetConfig.returnReasonRequired | 70703172 SIR_WF Timesheet Config | Return Reason Required | Boolean | RW | Also `SignOff.returnReasonRequired`. |
| TimesheetConfig.weekGrid | 70703172 SIR_WF Timesheet Config | Week Grid | Enum | RW | Also `Tenant.extras.weekGrid`. |
| TimesheetConfig.weekLayout | 70703172 SIR_WF Timesheet Config | Week Layout | Enum | RW | Also `Tenant.extras.weekLayout`. |
| TimesheetConfig.fieldDefaults[code].vis / .mand / .label | 70703173 SIR_WF TS Field Default | Visible / Mandatory / Label | Boolean / Boolean / Text[60] | RW | Key = Field Code. Replaced whole on PATCH. |
| TimesheetConfig.allowances[code].code | 70703174 SIR_WF TS Allowance | Code | Code[20] | RW | Replaced whole on PATCH. |
| AllowanceDef.label | 70703174 SIR_WF TS Allowance | Label | Text[80] | RW | No currency symbol. |
| AllowanceDef.payCode | 70703174 SIR_WF TS Allowance | Pay Code | Code[20] | RW | Must exist in `SIR TIme Sheet Elements`. |
| AllowanceDef.tier | 70703174 SIR_WF TS Allowance | Tier | Text[20] | RW | |
| AllowanceDef.element | 70703174 SIR_WF TS Allowance | Element | Code[20] | RW | Optional; `SIR Payroll Element`. |
| AllowanceDef.basis | 70703174 SIR_WF TS Allowance | Basis | Enum SIR_WF Pay Code Basis | RW | Optional (blank). Strict object: an amount key is refused by zod and never reaches BC. |
| TimesheetConfig.types[code] | 70703175 SIR_WF TS Type Capture | Employee Type Code | Code[32] | RW | Merged by type code on PATCH. |
| TypeCapture.fields[code].vis / .mand | 70703176 SIR_WF TS Type Field | Visible / Mandatory | Boolean | RW | |
| TypeCapture.allowances[] | 70703177 SIR_WF TS Type Allowance | Allowance Code | Code[20] | RW | |
| TypeRule.trigger | 70703178 SIR_WF TS Type Rule | Trigger | Text[40] | RW | |
| TypeRule.when | 70703178 SIR_WF TS Type Rule | When | Text[40] | RW | |
| TypeRule.code | 70703178 SIR_WF TS Type Rule | Pay Code | Code[20] | RW | |
| TypeRule.value | 70703178 SIR_WF TS Type Rule | Value | Text[10] | RW | Multiplier or threshold; currency refused. |
| TypeRule.how | 70703178 SIR_WF TS Type Rule | How | Text[80] | RW | |
| UpdateTimesheetConfig (all keys) | command `timesheetConfigs(id)/save` | `patch` | JSON | W | rules merged, types merged by code, others replaced. |
| TimesheetField.* (c, tier, label, cat, input, grp, …) | — | — | | N | Catalogue shipped in Node, not stored. |

### 4.5 Clock (`clock.ts`)

| Contract field | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| ClockRecord.id | 70703186 SIR_WF Clock Record | Public Id | Text[50] | R | `clk_<employee>_<date>`. |
| ClockRecord.version | 70703186 SIR_WF Clock Record | Version | Integer | R | If-Match of every clock write; 0 = none. |
| ClockRecord.employeeCode | 70703186 SIR_WF Clock Record | Employee No. | Code[20] | R | Always the caller. |
| ClockRecord.date | 70703186 SIR_WF Clock Record | Date | Date | R | Tenant-local, from Node. |
| ClockRecord.events[].kind | 70703187 SIR_WF Clock Event | Kind | Enum SIR_WF Clock Kind | R | |
| ClockRecord.events[].at | 70703187 SIR_WF Clock Event | At | DateTime | R | `CurrentDateTime` only. |
| ClockRecord.closedLate.finish / .at | 70703186 SIR_WF Clock Record | Closed Late Finish / Closed Late At | Text[5] / DateTime | R | null when blank. |
| ClockRecord.written.breaks[] | 70703186 SIR_WF Clock Record | Has Written, Written Breaks | Boolean, Text[250] JSON | R | null when Has Written = false. |
| ClockRecord.closedNoDay.finish / .at | 70703186 SIR_WF Clock Record | Closed No Day Finish / At | Text[5] / DateTime | R | |
| ClockRecord.state, .elapsedSeconds, .label | — | — | | D | `clockState`, `elapsedSeconds` against BC's time. |
| (open marker) | 70703186 SIR_WF Clock Record | Is Open | Boolean | W | Set by the clock commands; serves `MyClock.open` and `CLOCK_RUNNING`. |
| MyClock.serverNow | — | — | | D | The `Date` header of the BC `$batch` response. |
| MyClock.now, .date, .version, .targetHours, .status | — | — | | D | |
| MyClock.current, .open | 70703186 SIR_WF Clock Record (+events) | | | R | `open` = Is Open record older than today and past `maxDaily`. |
| MyClock.openBlocked | — | — | | D | Day-save checks run read-only in Node. |
| ClockGates.live | SIR Feature Register (foundation) | modules TS and B | | R | |
| ClockGates.mode | 70703169 SIR_WF Employee Type (foundation) | Mode | | R | |
| ClockGates.breaks | 70703151 SIR_WF Feature Flag (foundation) | BREAKS | | R | |
| ClockGates.breaksMax | foundation flag extras | breaksMax | Integer | R | `tenant.ts:25`; not stored in this slice. |
| ClockGates.blocked, .show | — | — | | D | |
| ClockMoved.record | 70703186 SIR_WF Clock Record | | | R | |
| ClockMoved.day | 70703180 SIR_WF Timesheet Day | | | R | The draft clock out or close wrote; null otherwise. |
| ClockMoved.warnings, .toast | — | — | | D | |
| ClockMoved.auditId | command output | auditId | Text[50] | R | |
| CloseClock.finish | command `clockRecords(id)/close` | `finish` | Text[5] | W | → Closed Late Finish or Closed No Day Finish, and the entry's Finish. |

### 4.6 Home and sign-off (timesheet parts only; ops are Core)

| Contract field | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| home.ts → HomeDay.ts.state | 70703180 SIR_WF Timesheet Day | State | Enum | R | Month range on PK. |
| HomeDay.ts.minutes | 70703180 SIR_WF Timesheet Day | Minutes | Integer | R | No entry read needed. |
| HomeDay.ts.waitingOn | 70703180 SIR_WF Timesheet Day | Waiting Role | Text[40] | R | |
| HomeDay.ts.text, .glyph, .today, .future | — | — | | D | |
| HomeDay.bankHoliday | Base Calendar Change, through 70703155 `SIR_WF API Bank Holidays` | `SIR_WF Holiday Name` (70703150), else Description, where SIR Is Weekend = false | Text[80] | R | Not the GB `baseCalenderChanges` page (GB-D15). Calendar = `SIR Timesheet Setup."Base Calender"` (`B/Table/Tab70702596.SIRTimesheetSetup.al:14`); `B/Table Extensions/Tab-Ext70702581.SIRBaseCanlenderChanges.al:5`. Annual recurring rows match on day and month (`Cod70702589…:206-211`). |
| HomeDay.locked | 70703180 SIR_WF Timesheet Day + config | State = ok, or cut-off/pay period | | D | |
| HomeMonth.week.contracted | Employee | SIR Contracted Hours | Decimal | R | |
| HomeMonth.sentBack (date, reason) | 70703180 SIR_WF Timesheet Day | Date, Return Reason where State = back | | R | Latest. |
| approvals.ts → SignOff.cutoff, .enforceLock, .returnReasonRequired | 70703172 SIR_WF Timesheet Config | Cutoff Day/Time, Enforce Lock, Return Reason Required | | R | Read by `GET /approvals/chains` (foundation op). |
| SignOff.current, .previous (from, to, closed) | — / `payPeriods` | | | D/R | Node from week start and cut-off; `closed` may also use a posted GB pay period (GB-Q3). |

## 5. Onboarding

### 5.1 Setup, templates and policies

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| onboarding.ts → OnboardingConfigRecord.id, .version | 70703188 SIR_WF Onboarding Config | Public Id, Version | Text[50], Integer | R | Version bumps on any step, document or default-policy save. |
| OnboardingConfigRecord.steps[].id | 70703189 SIR_WF Onboarding Step | Step | Enum `SIR_WF Onb. Step` | R | 7 values (`OnbStepId`). |
| .steps[].label | 70703189 SIR_WF Onboarding Step | Label | Text[60] | R | |
| .steps[].desc | 70703189 SIR_WF Onboarding Step | Description | Text[200] | R | |
| .steps[].fixed | 70703189 SIR_WF Onboarding Step | Fixed | Boolean | R | |
| .steps[].on | 70703189 SIR_WF Onboarding Step | On | Boolean | R/W | Default template's switch. |
| .documents[].id | 70703190 SIR_WF Onboarding Doc. Type | Id | Text[20] | R | Lower case. |
| .documents[].label | 70703190 SIR_WF Onboarding Doc. Type | Label | Text[60] | R/W | W only through add/rename (custom). |
| .documents[].req | 70703190 SIR_WF Onboarding Doc. Type | Required | Boolean | R/W | |
| .documents[].verify | 70703190 SIR_WF Onboarding Doc. Type | Verifier | Enum `SIR_WF Verifier` | R/W | |
| .documents[].blocks | 70703190 SIR_WF Onboarding Doc. Type | Blocks Start | Boolean | R/W | |
| .documents[].expiry | 70703190 SIR_WF Onboarding Doc. Type | Has Expiry | Boolean | R/W | |
| .documents[].hint | 70703190 SIR_WF Onboarding Doc. Type | Hint | Text[200] | R/W | |
| .documents[].on | 70703190 SIR_WF Onboarding Doc. Type | On | Boolean | R/W | New vs 01. |
| .documents[].custom | 70703190 SIR_WF Onboarding Doc. Type | Custom | Boolean | R | New vs 01. Set true on add. |
| (document order) | 70703190 SIR_WF Onboarding Doc. Type | Sort Order | Integer | R | |
| .policies[] | 70703196 SIR_WF Onb. Template Policy | Policy Id where Template Id = '' | Text[100] | R/W | Default policy list. |
| UpdateOnboardingConfig.steps/.documents/.policies | (as above) | | | W | Labels, descriptions and fixed are ignored on save (mock keeps stored ones). |
| DocumentDraft.label | 70703190 SIR_WF Onboarding Doc. Type | Label | Text[60] | W | Wire allows 80; domain refuses over 60 after trim. |
| DocumentDraft.hint | 70703190 SIR_WF Onboarding Doc. Type | Hint | Text[200] | W | Wire 300; domain refuses over 200. |
| OnbPolicyRecord.id | 70703191 SIR_WF Onboarding Policy | Id | Text[100] | R | `pol_` + slug ≤ 84. |
| OnbPolicyRecord.label | 70703191 SIR_WF Onboarding Policy | Label | Text[80] | R/W | |
| OnbPolicyRecord.ver | 70703191 SIR_WF Onboarding Policy | Ver | Text[20] | R/W | Upload bumps it (`nextPolVer`). |
| OnbPolicyRecord.sum | 70703191 SIR_WF Onboarding Policy | Summary | Text[300] | R/W | |
| OnbPolicyRecord.body[] | 70703191 SIR_WF Onboarding Policy | Body | Blob (text, one paragraph per line) | R | Not writable by the contract. |
| OnbPolicyRecord.order | 70703191 SIR_WF Onboarding Policy | Sort Order | Integer | R | |
| OnbPolicyRecord.file.name / .size / .type / .at | 70703191 SIR_WF Onboarding Policy | File Name / File Size / File Type / File At | Text[255] / Integer / Text[120] / DateTime | R/W | |
| OnbPolicyRecord.file.kind | — | — | — | D | From type (`fileKind`). |
| OnbPolicyRecord.file.preview | — | — | — | — | Not stored (02 H2). |
| (policy file content) | Azure Blob Storage | File Storage Key, File Content Hash, File Scan State | Text[250], Text[64], Enum | W | P6. |
| PolicyDraft.label / .ver / .sum | 70703191 SIR_WF Onboarding Policy | Label / Ver / Summary | | W | ver blank → `v1.0`. |
| OnbPolicySetupView.ackCount | 70703200 SIR_WF Onb. Case Policy | count where Acked Ver = policy Ver | | D (BC) | FlowField or query. |
| OnbPolicySetupView.removeText, PolicyUploaded.asked | — | — | — | D | Node. `asked` = cases still onboarding whose ack was cleared. |
| onboarding.ts → OnbTemplateRecord.id | 70703192 SIR_WF Onboarding Template | Id | Text[80] | R | Key and public id. |
| OnbTemplateRecord.version | 70703192 SIR_WF Onboarding Template | Version | Integer | R | |
| OnbTemplateRecord.name | 70703192 SIR_WF Onboarding Template | Name | Text[60] | R/W | Wire 80; domain refuses over 60. |
| OnbTemplateRecord.positions[] | SIR_WF Onb. Template Job Profile | Job Profile Code | Code[20] | R/W | Unique across templates. ≤ 1000. |
| OnbTemplateRecord.steps[].id / .on | 70703194 SIR_WF Onb. Template Step | Step / On | Enum / Boolean | R/W | Always all 7, in order. |
| OnbTemplateRecord.documents[].id / .on / .req / .blocks | 70703195 SIR_WF Onb. Template Document | Doc. Type Id / On / Required / Blocks Start | Text[20] / Boolean ×3 | R/W | ≤ 20; shared-list order on read. |
| OnbTemplateRecord.policies[] | 70703196 SIR_WF Onb. Template Policy | Policy Id | Text[100] | R/W | ≤ 500. |
| CreateOnbTemplate.name / .copyFrom | 70703192 SIR_WF Onboarding Template (+ children) | Name; copy of source rows | | W | copyFrom blank = copy the Default. New template has no job profiles. |
| OnbTemplateSummary.starters, .positions[].name | — / SIR_WF Job Profile | — / Name | | D | Node resolves starters per template. |
| OnboardingSetup.features, OnbFeatures.* | 70703151 SIR_WF Feature Flag (core) | ONB_RTW, ONB_CONV, ONB_WTD, ONB_QUAL, ONB_POL, ONB_SIGN, ONB_VERIFY | | D | `onbFeatures`. Module ON from `SIR Feature Register` (BASE `Feature Management\Table\Tab70702660.SIRFeatureRegister.al`). |
| OnboardingSetup.steps[] (available, needs), .verifiers, .inProgress, .positions | — | — | | D | Node. |

### 5.2 Case

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| OnboardingCaseRecord.id | 70703197 SIR_WF Onboarding Case | Public Id | Text[50] | R | `onb_<employeeCode>`. |
| .employeeCode | 70703197 SIR_WF Onboarding Case | Employee No. | Code[20] | R | |
| .steps (record step → TaskState) | 70703198 SIR_WF Onb. Case Step | Step, State | Enum, Enum `SIR_WF Task State` | R/W | One row per step touched. |
| .docs (record doc → TaskState) | 70703199 SIR_WF Onboarding Document | Doc. Type Id, State | Text[20], Enum | R/W | |
| .files[doc].name / .size / .type / .at / .kind | 70703199 SIR_WF Onboarding Document | File Name / File Size / File Type / File At / File Kind | Text[255] / Integer / Text[120] / DateTime / Enum | R/W | |
| .files[doc].preview | Azure Blob Storage | Preview Storage Key | Text[250] | R/W | Node inlines the data URL on read (or the contract moves to a URL). |
| (file content) | Azure Blob Storage | Storage Key, Content Hash, Scan State | Text[250], Text[64], Enum | W | Not in the contract. |
| .rejections[doc] | 70703199 SIR_WF Onboarding Document | Rejection Reason | Text[300] | R/W | `RejectDocument.reason` ≤ 300. |
| .acks[policy] | 70703200 SIR_WF Onb. Case Policy | Acked Ver | Text[20] | R/W | `AckPolicy.on` false clears it. |
| .read[policy] | 70703200 SIR_WF Onb. Case Policy | Read | Boolean | R/W | |
| .signature | 70703197 SIR_WF Onboarding Case | Signature | Text[120] | R/W | Also GB checklist `Full Name` (Text[100], cut). |
| .consent | 70703197 SIR_WF Onboarding Case | Consent | Boolean | R/W | |
| .submittedAt / .invitedAt / .startedAt | 70703197 SIR_WF Onboarding Case | Submitted At / Invited At / Started At | DateTime | R/W | '' = 0DT. |
| .portalInvitedAt | 70703197 SIR_WF Onboarding Case | Portal Invited At | DateTime | R/W | New vs 01/02. |
| .ref | 70703197 SIR_WF Onboarding Case | Ref | Code[20] | R/W | `ONB-1001`, next number by Node (`nextRef`), unique in BC. |
| .asked (absent / present) | 70703197 SIR_WF Onboarding Case | Asked Recorded | Boolean | R/W | |
| .asked.steps[] | 70703198 SIR_WF Onb. Case Step | Asked | Boolean | R/W | Set at submit. |
| .asked.documents[].id / .req / .blocks | 70703199 SIR_WF Onboarding Document | Asked / Asked Required / Asked Blocks | Boolean ×3 | R/W | Set at submit. |
| (verified by / at) | 70703199 SIR_WF Onboarding Document | Verified By / Verified At | Code[20] / DateTime | W | Not in the contract. |
| .data.* | 70703197 SIR_WF Onboarding Case | Data | Blob (JSON), EUII | R (self only) / W | Read only via `onboardingCases(id)/readMyData`. Mapping at start in §4. |
| SaveStep.mode | — | — | — | — | Not stored. |
| SaveStep.personal/.contact/.emergency/.additional/.documents | 70703197 SIR_WF Onboarding Case | Data (merged section) | Blob | W | Node merges (`mergeStep`) and sends the whole Data. |
| UploadFile.name / .size / .type / .preview | 70703199 SIR_WF Onboarding Document | File Name / File Size / File Type / Preview Storage Key | | W | Bytes go to Blob Storage (api §d). |
| SubmitOnboarding.consent / .signature | 70703197 SIR_WF Onboarding Case | Consent / Signature | | W | |
| OnboardingDetail.*, StarterOnboarding.*, TrackerRow.*, OnbQueueRow.*, TeamOnboarding.*, OnbStepView.*, OnbDocumentView.*, OnbPolicyView.*, Blocker, OnbProgress, OnbTemplateRef | — | — | — | D | Node from BC reads (`blockers`, `progress`, `templateFor`, labels, tones). |
| OnbEmployee.code / .name / .first / .email / .start / .state / .location / .workPattern / .manager | Employee (+ core extensions) | No. / names / E-Mail / Employment Date / SIR_WF State / … | | R | Core slice owns the mapping. `name` and `email` are the locked fields on the personal step. |
| StarterMoved.employee | Employee | | | R | Read after the command. |
| StarterChased.outstanding | — | — | — | D | Node. |

### 5.3 GB starter declaration (proposed contract addition, GB-Q1)

Stored in `SIR_WF Onboarding Case."Country Data"` as `{ "gb": { … } }`; applied by the GB subscriber into `SIR_GB Starter Checklist` (GB `Table\Tab70702735.SIRGBStarterChecklist.al`).

| Contract field (proposed: onboarding.ts → OnbDataRecord.gb.*) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| gb.statement ('A','B','C') | SIR_GB Starter Checklist | Employee Statements (39) | Option ` ,StatementA,StatementB,StatementC` | W at start | `:158` |
| gb.anotherJob (yes/no) | SIR_GB Starter Checklist | Another Job (41) | Option ` ,Yes,No` | W at start | `:174` |
| gb.pension (yes/no) | SIR_GB Starter Checklist | State or Private Pension (42) | Option | W at start | `:181` |
| gb.paidSince6April (yes/no) | SIR_GB Starter Checklist | Received Payments Since (43) | Option | W at start | `:188` |
| gb.studentLoan (yes/no) | SIR_GB Starter Checklist | Student or Postgraduate Loan (44) | Option | W at start | `:195`; No clears plan and postgrad. |
| gb.stillStudying (yes/no) | SIR_GB Starter Checklist | Still Studying or Completed (45) | Option | W at start | `:210` |
| gb.plan ('1','2','4','5','') | SIR_GB Starter Checklist | Student Loan Plan (46) | Option ` ,Plan1,Plan2,Plan4,Plan5` | W at start | `:217` |
| gb.postgrad (yes/no) | SIR_GB Starter Checklist | Postgraduate Loan (47) | Option | W at start | `:225` |
| (derived by GB) | Employee | SIR_GB Employee Setting Basis, SIR_GB Starting Declaration, SIR_GB HMRC Tax Code, SIR_GB Tax Code Basis, SIR_GB Deduct Student loan, SIR_GB Deduct Postgrad. loan | Option, Option, Code[20], Option, Boolean, Boolean | W at start | GB `Tab-Ext70702675.SIRGBEmployee.al:171,301,207,269,378,383`, via `ApplyToEmployee`. |
| (derived by GB) | SIR_GB Student Loan Detail | Employee Code, Plan Code | Code[20], Code[20] | W at start | GB `Table\Tab70702685.SIRGBStudentLoanDetail.al:10,15` |
| P45 (document `p45`) | 70703199 SIR_WF Onboarding Document | (file metadata) | | R/W | Amounts (`SIR_GB Previous Employment Pay`/`Tax`, Decimal, `Tab-Ext70702675.SIRGBEmployee.al:286,291`) are keyed by payroll. Never in Workforce. |

### 5.4 Write-back at start (Base unless marked GB)

| Contract field (file.ts → Type.field) | BC table | BC field | Type | Read/Write | Notes |
|---|---|---|---|---|---|
| OnbDataRecord.personal.dob | Employee | Birth Date | Date | W | "YYYY-MM-DD". GB refuses a date after `Employment Date` (`Tab-Ext70702675.SIRGBEmployee.al:712-722`). |
| personal.gender | Employee | Gender | Enum `Employee Gender` | W | Female→Female, Male→Male, Prefer not to say→"I don't wish to answer", Other→Self-Described, ''→" " (MS `EmployeeGender.Enum.al:12-31`). GB checklist keeps only Male/Female. |
| personal.nat | — | — | — | — | Stays in case (H1). No GB field. |
| personal.ni | Employee (GB) | SIR_GB NINO | Text[50] | W | GB `Tab-Ext70702675.SIRGBEmployee.al:27`. Format and duplicate checks. Contract ≤ 20, `NI_MAX` 13. |
| personal.ni | SIR_GB Starter Checklist (GB) | National Insurance Number (30) | Code[15] | W | Only when GB data present. |
| personal.ni | Employee (Base fallback) | Social Security No. | Text[30] | W | Only if no country subscriber handles it. Not written in GB. |
| contact.mob | Employee | Mobile Phone No. | Text[30] | W | |
| contact.alt | Employee | Phone No. | Text[30] | W | |
| contact.a1 | Employee | Address | Text[100] | W | Contract 200: cut; full text stays in case (G9). |
| contact.a2 | Employee | Address 2 | Text[50] | W | Contract 200. GB puts characters 51–100 in `SIR_GB Address Line 3` (Text[50]). |
| contact.city | Employee | City | Text[30] | W | **New mismatch**: contract 80. Assign after `Post Code` without validation. |
| contact.post | Employee | Post Code | Code[20] | W | Validate. GB strips special characters when its setup flag is on (`Tab-Ext70702675.SIRGBEmployee.al` modify "Post Code"). |
| emergency[].fn, .ln | Employee Relative | First Name, Last Name | Text[30] / Text[30] | W | Direct (02 G10, resolved 2026-10-27). MS `EmployeeRelative.Table.al:36,46`. |
| emergency[].rel | Employee Relative | SIR Relationship | Text[50] | W | Base field 70702576 (BASE `Tab-Ext70702583.SIREmployeeRelative.al:5`). `Relative Code` left blank. |
| emergency[].ph | Employee Relative | Phone No. | Text[30] | W | Captioned "Contact Number" by Base (`:30`). |
| (emergency flag) | Employee Relative | SIR_WF Emergency Contact | Boolean | W | true. |
| additional.quals[].nm | Employee Qualification | Description | Text[100] | W | **New mismatch**: contract 120. |
| additional.quals[].by | Employee Qualification | Institution/Company | Text[100] | W | **New mismatch**: contract 120. |
| additional.quals[].exp | Employee Qualification | Expiration Date | Date | W | |
| (qualification code) | Employee Qualification | Qualification Code | Code[10] | W | 70703150 `SIR_WF Setup."Default Qualification Code"`; validate runs `Qualification.Get` (MS `EmployeeQualification.Table.al:37-41`). `Cost` never written. |
| additional.conv, .convDetail, .wtd | — | — | — | — | Stay in case. |
| documents.rtwType | — | — | — | — | Stays in case. Passport number and expiry not captured (GB-Q6). |
| OnboardingCaseRecord.signature | SIR_GB Starter Checklist (GB) | Full Name (53) | Text[100] | W | After names (commit c9338bd). |
| OnboardingCaseRecord.submittedAt | SIR_GB Starter Checklist (GB) | Declaration Date (52) | Date | W | |
| OnboardingCaseRecord.ref | SIR_GB Starter Checklist (GB); Employee Relative; Employee Qualification | Onboarding Ref. | Code[20] | W | Traceability. |

## 6. Posting approved hours to payroll

### 6.1 Final approval → `SIR_WF Posting Line`

Written by `SIR_WF Posting Queue` inside the approval command (`timesheetDays(id)/transition` to `ok` at the last layer, or `timesheetBulkApprovals`), in the approval's transaction (IC-01).

Under B5 the Node layer decides the split of the day into pay codes (work type, overtime, allowances). The command carries it as `postingLines` (JSON array of `{payCode, workSiteCode, quantity, start, end, description}`). Business Central checks it structurally and stores it. Validation order is the order the command checks; the first failure refuses the whole approval.

| Workforce source | BC table | BC field | Type | Validation order | Notes |
|---|---|---|---|---|---|
| (new batch) | 70703202 `SIR_WF Posting Batch` | `No.` | Code[20] | 1 | From `SIR_WF Setup."Posting Batch Nos."`. Only when `Posting Enabled`; otherwise the day goes to `ok` with no lines and `Posting State = none`. |
| session acting person | 70703202 `SIR_WF Posting Batch` | `Created By` | Code[20] | 1 | |
| command `correlationId` | 70703202 `SIR_WF Posting Batch` / `Posting Line` | `Correlation Id` | Guid | 1 | |
| 70703180 `SIR_WF Timesheet Day."Employee No."` | 70703203 `SIR_WF Posting Line` | `Employee No.` | Code[20] | 2 | `Employee."SIR Pay Cycle Code"` blank → `MISSING_PAY_SETUP` (409, "no pay frequency"). |
| 70703180 `SIR_WF Timesheet Day.Date` | 70703203 `SIR_WF Posting Line` | `Date` | Date | 2 | |
| 70703180 `SIR_WF Timesheet Day.SystemId` | 70703203 `SIR_WF Posting Line` | `Timesheet Day Id` | Guid | 2 | The contract's `dayId` on read. |
| `postingLines[].payCode` | 70703203 `SIR_WF Posting Line` | `Pay Code` | Code[20] | 3 | Exactly one `SIR TIme Sheet Elements` with `External Field Mapping` = code (`Tab70702615:60`) and `Pay Element` <> ''. Else `MISSING_PAY_SETUP` ("pay code not mapped") (problem L). |
| element `Unit Of Measure` | 70703203 `SIR_WF Posting Line` | `Unit` | Enum `SIR_WF Posting Unit` | 3 | `FromInteger` of the option (0 flat, 1 Hour, 2 Day, 3 Unit). |
| `postingLines[].workSiteCode` (else `SIR_WF Timesheet Entry."Work Site Code"`, else the day's) | 70703203 `SIR_WF Posting Line` | `Work Site Code` | Code[20] | 4 | Blank, unknown or `SIR Work Sites.Blocked` (`Tab70702606:65`) → `MISSING_PAY_SETUP` ("no work site"). |
| `postingLines[].quantity` | 70703203 `SIR_WF Posting Line` | `Quantity` | Decimal | 5 | > 0. `Hour`: the hour lines of the day sum to at most the day's net hours plus allowance hours (from `SIR_WF Timesheet Entry."Net Minutes"`). `Day`: at most 1 per day. `Unit`: > 0. `flat`: a whole number, normally 1. Else `invalid`. |
| `postingLines[].start` / `end` (else the first `Start` and last `Finish`; hours-only: 00:00 and 00:00 + hours) | 70703203 `SIR_WF Posting Line` | `Start DateTime`, `End DateTime` | DateTime | 6 | Same day. |
| `postingLines[].description` | 70703203 `SIR_WF Posting Line` | `Description` | Text[100] | 6 | Node builds "<pay code label> · <date> · WORKFORCE". Truncated to 100. |
| — | 70703203 `SIR_WF Posting Line` | `State` = queued, `Attempt` = 0, `Queued At` = now, `Next Attempt At` = now + `Posting Journal Delay (Min.)` | | 7 | |
| (line) | 70703180 `SIR_WF Timesheet Day` | `Posting State` = queued, `Last Posting Line No.` | | 7 | Day mirrors its latest line. |

Job and job task stay on `SIR_WF Timesheet Entry`; GB's interface has no field for them.

### 6.2 Dispatch pre-checks (no writes)

Run by `SIR_WF Post Line` before the insert, in this order. Each failure is a **data** error: the line goes to `failed` at once with the code and a plain message (IC-06). These cover everything Create Time Sheets checks (`Rep70702584:438-475`, `:314`) and everything `Validate("Site Code")` could create (`Tab70702614:98-185`), so a Workforce row can neither stop the payroll run (H) nor create master data (F).

| Order | Check | Reads | Code |
|---|---|---|---|
| 1 | 70703150 `SIR_WF Setup."Posting Enabled"` and `SIR Timesheet Setup."Enable Timesheet Interface"` (field 5007, `Tab70702596:57`). | setup | `TS_INTERFACE_OFF` |
| 2 | An interface row with `SIR_WF Posting Line Id` = the line's `SystemId` already exists, in table 70702614 or 70702661. | both interface tables, key `SIR_WF PostingLineId` | not an error: mark `posted` with that `Entry No.` (IC-04) |
| 3 | `Employee.Get(Employee No.)`. | `Employee` | `EMPLOYEE_NOT_FOUND` |
| 4 | `Employee."Termination Date"` is blank or ≥ `Date`; `Status` is not `Inactive`. | `Employee` | `EMPLOYEE_TERMINATED` |
| 5 | `Employee."SIR Pay Cycle Code"` (Code[10], `Tab-Ext70702579:194`) is not blank. | `Employee` | `NO_PAY_CYCLE` |
| 6 | An `SIR Pay Period` with `Pay Frequency` = pay cycle and `Start Date` ≤ `Date` ≤ `End Date` (key SK1, `Tab70702586:134`). Store `Fiscal Year`, `Period` on the line. | `SIR Pay Period` | `NO_PAY_PERIOD` |
| 7 | That period's `Posted` (FlowField over `SIR Payroll Ledger Entry`, `Tab70702586:82-90`) is false. Read with indirect permission (problem O). | `SIR Pay Period`, `SIR Payroll Ledger Entry` (exists only) | `PERIOD_POSTED` (problem M) |
| 8 | Exactly one `SIR TIme Sheet Elements` row with `External Field Mapping` = `Pay Code`, `Pay Element` <> ''. Store `Pay Element` on the line. | `SIR TIme Sheet Elements` | `UNKNOWN_PAY_CODE`, `PAY_CODE_AMBIGUOUS` |
| 9 | `SIR Work Sites.Get(Work Site Code)` and not `Blocked`. | `SIR Work Sites` | `SITE_UNKNOWN`, `SITE_BLOCKED` |
| 10 | A `Dimension Value` exists with `Dimension Code` = `SIR Payroll Setup."Work Site Dimension"` (field 6027) if set, else `"Payroll Dimension 1 Code"` (field 6000), and `Code` = site (mirrors `Tab70702614:105-135`). | `SIR Payroll Setup`, `Dimension Value` | `SITE_DIMENSION_MISSING` |
| 11 | `SIR Employee Sites` row for employee and site (PK `Employee Code`, `Site Code`, `Tab70702608:9,15`). | `SIR Employee Sites` | `SITE_NOT_ASSIGNED` |
| 12 | `SIR Employee Site Pay Elements` row for employee, site, pay element (PK, `Tab70702609:95`), read with `SetLoadFields` on the key only. `Rate` is never read. | `SIR Employee Site Pay Elements` | `NO_SITE_PAY_ELEMENT` (problem A) |
| 13 | Fallback D7 only (`Hold Until Period Current`): the period from 6 is the earliest unposted period of that pay frequency. Otherwise push `Next Attempt At` to the next day and stay `queued`, no attempt counted. | `SIR Pay Period` | (hold, not an error) |

### 6.3 `SIR_WF Posting Line` → `SIR Timesheet Interface` (table 70702614)

Inserted by `SIR_WF Post Line` after §2 passes, in the dispatcher's per-line transaction. Fields are set in this order because the `OnValidate` triggers depend on earlier fields. "Validate" means `Rec.Validate(...)`; "assign" means a direct assignment with no trigger.

| Workforce source | BC table | BC field | Type | Validation order | Notes |
|---|---|---|---|---|---|
| — | `SIR Timesheet Interface` | 15 `Entry No.` | Integer | 1 (Init) | Left 0; AutoIncrement assigns it on insert (`Tab70702614:213-218`). |
| `Employee No.` | `SIR Timesheet Interface` | 2 `Payroll No.` | Code[20] | 2 Validate | Fills 3 `Employee Name` Text[100] from `Employee.FullName()` (`:19-25`). Existence checked in §2.3, because `ValidateTableRelation = false` (`:18`). |
| `Pay Code` | `SIR Timesheet Interface` | 4 `Interface Code` | Code[20] | 3 Validate | Clears and fills 18 `Pay Element` Code[50] from the first element with that mapping (`:38-47`). §2.8 guarantees there is exactly one. After the validate, `TestField("Pay Element")` as a guard. |
| `Work Site Code` | `SIR Timesheet Interface` | 9 `Site Code` | Code[20] | 4 Validate | Needs `Payroll No.` first (it creates or checks the employee site for that employee, `:166-184`). With §2.9-2.11 passed it finds the dimension value, work site and employee site and creates nothing. Fills 10 `Site Name` Text[100] from the dimension value's `Name` (`:118`, `:133`). |
| `Quantity` | `SIR Timesheet Interface` | 6 `No. Of Units` | Decimal | 5 assign | No trigger on the field. In the element's unit. |
| `Description` | `SIR Timesheet Interface` | 5 `Classification` | Text[100] | 6 assign | Information only. Carries "WORKFORCE" so payroll can filter the interface page. |
| `SIR Work Sites.Description` | `SIR Timesheet Interface` | 1 `Branch Name` | Text[50] | 7 assign | `CopyStr(..., 1, 50)`. Information only (imports put free text here, `Rep70702585:72`). |
| job queue user | `SIR Timesheet Interface` | 11 `User` | Code[50] | 8 assign | `CopyStr(UserId(), 1, 50)`. Has `TableRelation = User."User Name"` (`:196`), so a fixed `'WORKFORCE'` is not used; the marker is in `Classification`. |
| `CurrentDateTime` | `SIR Timesheet Interface` | 12 `DateTime Of Changes` | DateTime | 9 assign | |
| `Start DateTime` | `SIR Timesheet Interface` | 13 `Start Date` | DateTime | 10 assign | Ignored by GB today (§2.2 of the gap doc); needed by B's Base fix (one line on this day in Daily mode). |
| `End DateTime` | `SIR Timesheet Interface` | 14 `End Date` | DateTime | 10 assign | As above. |
| — | `SIR Timesheet Interface` | 16 `Is Timesheet Created` | Boolean | 11 assign | `false`. The report sets it (`Rep70702584:338-340`). |
| — | `SIR Timesheet Interface` | 17 `Irregular` | Boolean | 11 assign | `false` (GB-Q32). |
| — | `SIR Timesheet Interface` | 7 `Rate` | Decimal | never | **Never validated or assigned** (IC-08). Payroll fills it (A). |
| — | `SIR Timesheet Interface` | 8 `Gross Pay` | Decimal | never | **Never written.** |
| `SystemId` | `SIR Timesheet Interface` | 70703150 `SIR_WF Posting Line Id` | Guid | 12 assign | Idempotency link (D, E). |
| `Pay Frequency` | `SIR Timesheet Interface` | 20 `Pay Frequency` | Code[10] | 13 assign | **Only after the Base change for G.** From §2.6. |
| `Fiscal Year` | `SIR Timesheet Interface` | 21 `Fiscal Year` | Code[10] | 13 assign | As above. |
| `Pay Cycle Period` | `SIR Timesheet Interface` | 22 `Pay Cycle Period` | Integer | 13 assign | As above. |
| — | `SIR Timesheet Interface` | `Insert(true)` | | 14 | No `OnInsert` trigger on the table. |
| interface `Entry No.` | 70703203 `SIR_WF Posting Line` | `Target Entry No.` | Integer | 15 | Then `State` = posted, `Posted At` = now, `Error Kind` = none, `Attempt` += 1, attempt row written, day's `Posting State` = posted, `Commit`. |

Dimensions: the row has none; the report and payroll take them from the work site and employee site. Unit: the row has none; the timesheet line takes `Unit Of Measure` from the element (`Rep70702584:260`).

### 6.4 Where the row landed: timesheet line → `SIR_WF Posting Line`

`SIR_WF Posting Landed` subscribes to report 70702584's `OnBeforeInsertTimeSheetLine` (`:261`, `:517-520`) and `OnBeforeModifyTimeSheetLine` (`:266`, `:522-525`), both Period mode. It runs in the payroll user's Create Time Sheets transaction, so a rolled-back run also rolls back the stamp. If `TimeSheetInterface."SIR_WF Posting Line Id"` is blank or unknown it exits; it never raises an error.

| Workforce source | BC table | BC field | Type | Validation order | Notes |
|---|---|---|---|---|---|
| `TimeSheetLine."Document No."` | 70703203 `SIR_WF Posting Line` | `Timesheet No.` | Code[20] | 1 assign | Header `No.`. |
| `TimeSheetLine."Pay Frequency"` | 70703203 `SIR_WF Posting Line` | `Landed Pay Frequency` | Code[10] | 1 assign | Set from the header before the event (`Rep70702584:252`, `Tab70702621:50-55`). |
| `TimeSheetLine."Fiscal Year"` | 70703203 `SIR_WF Posting Line` | `Landed Fiscal Year` | Code[10] | 1 assign | `:253`. |
| `TimeSheetLine."Pay Cycle Period"` | 70703203 `SIR_WF Posting Line` | `Landed Pay Cycle Period` | Integer | 1 assign | `:254`. |
| `CurrentDateTime` | 70703203 `SIR_WF Posting Line` | `Consumed At` | DateTime | 1 assign | |
| comparison | 70703203 `SIR_WF Posting Line` | `Reconcile Issue` | Enum | 2 | `wrong-period` when the landed frequency, fiscal year or period differs from fields 34-36 (problem G before its fix). |

Daily mode raises no event (`Rep70702584:271-301`); such rows are found by reconcile through the archive only, with no landed period.

### 6.5 `SIR_WF Posting Line` → contract `IntegrationAttempt` (read)

Restates 02 §5.8 for the restored contract shape (doc 13 §5.6).

| Workforce source | BC table | BC field | Type | Validation order | Notes |
|---|---|---|---|---|---|
| `id` | 70703203 `SIR_WF Posting Line` | `Public Id` | Text[50] | read | `ia_<Entry No.>`. |
| `version` | 70703203 `SIR_WF Posting Line` | `Version` | Integer | read | Also `@odata.etag`. |
| `event` | 70703203 `SIR_WF Posting Line` | `Source` | Enum | read | timesheet → `timesheet.approved`. |
| `ref` | 70703203 `SIR_WF Posting Line` | `Batch No.` | Code[20] | read | |
| `summary` | 70703203 `SIR_WF Posting Line` | `Description` | Text[100] | read | Pay code label and quantity; never an amount. |
| `state` | 70703203 `SIR_WF Posting Line` | `State` | Enum | read | queued, posted, failed; `reconciled` → `posted`. |
| `attempt` | 70703203 `SIR_WF Posting Line` | `Attempt` | Integer | read | Shown as at least 1 (contract `positive()`): `max(Attempt, 1)`. |
| `simulated` | — | — | | read | Constant `false`. |
| `dayId` | 70703180 `SIR_WF Timesheet Day` (by `Timesheet Day Id`) | `Public Id` | Text[50] | read | `$expand` from the posting line. |
| `at` | 70703203 `SIR_WF Posting Line` | `Posted At`, else `Queued At` | DateTime | read | |
| `cause` | 70703203 `SIR_WF Posting Line` | `Error Kind` | Enum | read | Only when failed. |
| `reason` | 70703203 `SIR_WF Posting Line` | `Last Error` (prefixed by `Error Code`) | Text[500] | read | Only when failed, or when `Reconcile Issue` <> none. |
| day `posting` (derived) | 70703180 `SIR_WF Timesheet Day` | `Posting State` | Enum | read | none, queued, posted, failed (reconciled → posted). |
| day `integrationAttemptId` | 70703180 `SIR_WF Timesheet Day` | `Last Posting Line No.` → line `Public Id` | Text[50] | read | |

