# Qnipay Workforce on GB Qnipay: new objects and tables

2026-10-26 · Status: draft for review

This document lists every object Workforce adds to the GB codebase, with real IDs, and specifies the new tables, the fields added to existing tables, the enums and the events. It merges the five reviewers' table files (foundation, people, timesheet, onboarding, posting). Decisions and questions are in [`10-gb-gap-analysis.md`](10-gb-gap-analysis.md) (GB-D*n*, GB-Q*n*); the field mapping is in [`12-gb-field-mapping.md`](12-gb-field-mapping.md); the API is in [`13-gb-api-endpoints.md`](13-gb-api-endpoints.md).

Paths: `B/` = `C:\dev\Qnipay GB BC\Qnipay-base\SourceCode\`, `G/` = `C:\dev\Qnipay GB BC\Qnipay-GB\SourceCode\`. "MS" = the Microsoft Base Application 29.0.54011.56136 symbols in `.alpackages`.

Rules that hold for every object below:

- **App.** Qnipay-base ("Qnipay Base"), unless the register says Qnipay-GB. There is no separate Workforce app (GB-D1).
- **IDs.** Workforce objects in Qnipay-base take 70703150–70703299 for every object type. 70703115–70703149 stays free for Qnipay's own growth (GB-D8). Every ID below was checked against the free-ID list taken from the source. GB-only objects take the top of Qnipay-GB's free range (70703097–70703099), to be confirmed by the GB team.
- **Names.** AL object names are at most 30 characters; every name below fits.
- **No money.** No new field holds a rate, an amount or a currency. `Quantity` and `Value` fields are hours, days, units or multipliers.
- **Standard fields.** 9900 `Public Id` Text[50] (unique key `PublicId`, filled on insert by `70703152 SIR_WF Public Id`) and 9901 `Version` Integer (1 on insert, +1 on every modify) follow 01 §4.2. Each table says which of them it carries; the rule is GB-D11.
- **Reused coded tables** (Employee, `SIR Work Sites`, Dimension Value, Job, Job Task, `SIR TIme Sheet Elements`) get no Public Id. Node derives the contract id as `<prefix>_<code>`. They get `SIR_WF Version`, bumped only when a contract-mapped field changes (GB-D3).
- **Field numbers.** New `SIR_WF` tables number their fields from 1, plus 9900 and 9901. Fields added to Base-owned tables, to Base's existing extensions of Employee, Employee Relative and Base Calendar Change, and to Base's new table extensions take free numbers from 70703150 upwards in that object. Each was checked free in the target (the highest field in use today is 70702624 on `Employee`, Tab-Ext70702579).

## 1. Object register

All object types, in module order: foundation, people, timesheet, onboarding, posting. "Old placeholder" is the `WF+n` the slice used. Offsets 1–56 are 01's shared numbering and mean the same object in every slice; the numbers above 56 were each slice's own and clash (onboarding and timesheet both used WF+57–68 for different tables; pages WF+257–271 clash the same way), so they are given here per slice.

Counts: 55 tables (53 stored, 2 temporary), 68 API pages, 77 codeunits, 41 enums, 1 query, 5 table extensions, 3 permission sets in Qnipay-base; 3 codeunits and 1 enum extension in Qnipay-GB. No page extensions or reports. The two interfaces, `SIR_WF Command Handler` and `SIR_WF Employee Localization`, have no object IDs in AL.

Reserved, not yet named: pages 70703218–70703267 for the Business Central client pages that B7 needs (setup cards and lists for the configuration tables), and 70703268–70703299 spare. No slice named the client pages; they are allocated from this reserve when they are designed (GB-D8).

| Type | ID | Name | App | Slice | Old placeholder |
|---|---|---|---|---|---|
| table | 70703150 | `SIR_WF Setup` | Qnipay-base | foundation | WF+1 |
| table | 70703151 | `SIR_WF Feature Flag` | Qnipay-base | foundation | WF+3 |
| table | 70703152 | `SIR_WF Account` | Qnipay-base | foundation | WF+4 |
| table | 70703153 | `SIR_WF Session` | Qnipay-base | foundation | WF+80 |
| table | 70703154 | `SIR_WF User Type` | Qnipay-base | foundation | WF+5 |
| table | 70703155 | `SIR_WF User Type Capability` | Qnipay-base | foundation | WF+6 |
| table | 70703156 | `SIR_WF Capability` | Qnipay-base | foundation | WF+7 |
| table | 70703157 | `SIR_WF Capability Group` | Qnipay-base | foundation | WF+8 |
| table | 70703158 | `SIR_WF Capability Exception` | Qnipay-base | foundation | WF+9 |
| table | 70703159 | `SIR_WF Audit Event` | Qnipay-base | foundation | WF+10 |
| table | 70703160 | `SIR_WF Template` | Qnipay-base | foundation | WF+11 |
| table | 70703161 | `SIR_WF Approval Chain` | Qnipay-base | foundation | WF+12 |
| table | 70703162 | `SIR_WF Approval Chain Step` | Qnipay-base | foundation | WF+13 |
| table | 70703163 | `SIR_WF Delegation` | Qnipay-base | foundation | WF+14 |
| table | 70703164 | `SIR_WF Notification Event` | Qnipay-base | foundation | WF+15 |
| table | 70703165 | `SIR_WF Idempotency Key` | Qnipay-base | foundation, posting | WF+56 (both) |
| table | 70703166 | `SIR_WF Command` | Qnipay-base | foundation | WF+81 |
| table | 70703167 | `SIR_WF Employee History` | Qnipay-base | people | WF+20 |
| table | 70703168 | `SIR_WF Job Profile` | Qnipay-base | people | WF+21 |
| table | 70703169 | `SIR_WF Employee Type` | Qnipay-base | people | WF+22 |
| table | 70703170 | `SIR_WF Profile Change` | Qnipay-base | people | WF+23 |
| table | 70703171 | `SIR_WF Profile Change Decision` | Qnipay-base | people | WF+70 |
| table | 70703172 | `SIR_WF Timesheet Config` | Qnipay-base | timesheet | WF+24 |
| table | 70703173 | `SIR_WF TS Field Default` | Qnipay-base | timesheet | WF+60 |
| table | 70703174 | `SIR_WF TS Allowance` | Qnipay-base | timesheet | WF+61 |
| table | 70703175 | `SIR_WF TS Type Capture` | Qnipay-base | timesheet | WF+65 |
| table | 70703176 | `SIR_WF TS Type Field` | Qnipay-base | timesheet | WF+62 |
| table | 70703177 | `SIR_WF TS Type Allowance` | Qnipay-base | timesheet | WF+63 |
| table | 70703178 | `SIR_WF TS Type Rule` | Qnipay-base | timesheet | WF+64 |
| table | 70703179 | `SIR_WF Timesheet Week` | Qnipay-base | timesheet | WF+66 |
| table | 70703180 | `SIR_WF Timesheet Day` | Qnipay-base | timesheet | WF+25 |
| table | 70703181 | `SIR_WF Timesheet Entry` | Qnipay-base | timesheet | WF+26 |
| table | 70703182 | `SIR_WF Timesheet Break` | Qnipay-base | timesheet | WF+27 |
| table | 70703183 | `SIR_WF TS Entry Field` | Qnipay-base | timesheet | WF+67 |
| table | 70703184 | `SIR_WF TS Day Allowance` | Qnipay-base | timesheet | WF+68 |
| table | 70703185 | `SIR_WF Timesheet Day Log` | Qnipay-base | timesheet | WF+28 |
| table | 70703186 | `SIR_WF Clock Record` | Qnipay-base | timesheet | WF+29 |
| table | 70703187 | `SIR_WF Clock Event` | Qnipay-base | timesheet | WF+30 |
| table | 70703188 | `SIR_WF Onboarding Config` | Qnipay-base | onboarding | WF+48 |
| table | 70703189 | `SIR_WF Onboarding Step` | Qnipay-base | onboarding | WF+62 |
| table | 70703190 | `SIR_WF Onboarding Doc. Type` | Qnipay-base | onboarding | WF+49 |
| table | 70703191 | `SIR_WF Onboarding Policy` | Qnipay-base | onboarding | WF+50 |
| table | 70703192 | `SIR_WF Onboarding Template` | Qnipay-base | onboarding | WF+57 |
| table | 70703193 | `SIR_WF Onb. Templ. Job Profile` | Qnipay-base | onboarding | WF+58 |
| table | 70703194 | `SIR_WF Onb. Template Step` | Qnipay-base | onboarding | WF+59 |
| table | 70703195 | `SIR_WF Onb. Template Document` | Qnipay-base | onboarding | WF+60 |
| table | 70703196 | `SIR_WF Onb. Template Policy` | Qnipay-base | onboarding | WF+61 |
| table | 70703197 | `SIR_WF Onboarding Case` | Qnipay-base | onboarding | WF+51 |
| table | 70703198 | `SIR_WF Onb. Case Step` | Qnipay-base | onboarding | WF+63 |
| table | 70703199 | `SIR_WF Onboarding Document` | Qnipay-base | onboarding | WF+52 |
| table | 70703200 | `SIR_WF Onb. Case Policy` | Qnipay-base | onboarding | WF+64 |
| table | 70703201 | `SIR_WF Onb. Starter Buffer` | Qnipay-base | onboarding | WF+65 |
| table | 70703202 | `SIR_WF Posting Batch` | Qnipay-base | posting | WF+53 |
| table | 70703203 | `SIR_WF Posting Line` | Qnipay-base | posting | WF+54 |
| table | 70703204 | `SIR_WF Posting Attempt` | Qnipay-base | posting | WF+55 |
| page | 70703150 | `SIR_WF API Commands` | Qnipay-base | foundation | — (replaces every command entity set) |
| page | 70703151 | `SIR_WF API Workforce Setup` | Qnipay-base | foundation | — |
| page | 70703152 | `SIR_WF API Company Info` | Qnipay-base | foundation | — |
| page | 70703153 | `SIR_WF API Modules` | Qnipay-base | foundation | — |
| page | 70703154 | `SIR_WF API Feature Flags` | Qnipay-base | foundation | — |
| page | 70703155 | `SIR_WF API Bank Holidays` | Qnipay-base | foundation | — |
| page | 70703156 | `SIR_WF API Accounts` | Qnipay-base | foundation | — |
| page | 70703157 | `SIR_WF API User Types` | Qnipay-base | foundation | — |
| page | 70703158 | `SIR_WF API User Type Caps` | Qnipay-base | foundation | — |
| page | 70703159 | `SIR_WF API Capabilities` | Qnipay-base | foundation | — |
| page | 70703160 | `SIR_WF API Capability Groups` | Qnipay-base | foundation | — |
| page | 70703161 | `SIR_WF API Cap. Exceptions` | Qnipay-base | foundation | — |
| page | 70703162 | `SIR_WF API Audit Events` | Qnipay-base | foundation | — |
| page | 70703163 | `SIR_WF API Templates` | Qnipay-base | foundation | — |
| page | 70703164 | `SIR_WF API Approval Chains` | Qnipay-base | foundation | — |
| page | 70703165 | `SIR_WF API Chain Steps` | Qnipay-base | foundation | — |
| page | 70703166 | `SIR_WF API Delegations` | Qnipay-base | foundation | — |
| page | 70703167 | `SIR_WF API Notif. Events` | Qnipay-base | foundation | — |
| page | 70703168 | `SIR_WF API Notifications` | Qnipay-base | foundation | — |
| page | 70703169 | `SIR_WF API Employee Documents` | Qnipay-base | foundation | — |
| page | 70703170 | `SIR_WF API Employees` | Qnipay-base | people | WF+127 |
| page | 70703171 | `SIR_WF API Employee History` | Qnipay-base | people | WF+128 |
| page | 70703172 | `SIR_WF API Work Sites` | Qnipay-base | people | WF+133 |
| page | 70703173 | `SIR_WF API Departments` | Qnipay-base | people | WF+134 |
| page | 70703174 | `SIR_WF API Cost Centres` | Qnipay-base | people | WF+135 |
| page | 70703175 | `SIR_WF API Job Profiles` | Qnipay-base | people | WF+136 |
| page | 70703176 | `SIR_WF API Projects` | Qnipay-base | people | WF+137 |
| page | 70703177 | `SIR_WF API Project Tasks` | Qnipay-base | people | WF+138 |
| page | 70703178 | `SIR_WF API Employee Types` | Qnipay-base | people | WF+139 |
| page | 70703179 | `SIR_WF API Profile Changes` | Qnipay-base | people | WF+140 |
| page | 70703180 | `SIR_WF API Profile Decisions` | Qnipay-base | people | WF+P1 |
| page | 70703181 | `SIR_WF API Pay Codes` | Qnipay-base | people, timesheet | WF+141 (people), WF+269 (timesheet) |
| page | 70703182 | `SIR_WF API Pay Elements` | Qnipay-base | people | WF+P2 |
| page | 70703183 | `SIR_WF API Timesheet Configs` | Qnipay-base | timesheet | WF+142 |
| page | 70703184 | `SIR_WF API TS Field Defaults` | Qnipay-base | timesheet | WF+260 |
| page | 70703185 | `SIR_WF API TS Allowances` | Qnipay-base | timesheet | WF+261 |
| page | 70703186 | `SIR_WF API TS Type Captures` | Qnipay-base | timesheet | WF+262 |
| page | 70703187 | `SIR_WF API TS Type Fields` | Qnipay-base | timesheet | WF+263 |
| page | 70703188 | `SIR_WF API TS Type Allowances` | Qnipay-base | timesheet | WF+264 |
| page | 70703189 | `SIR_WF API TS Type Rules` | Qnipay-base | timesheet | WF+265 |
| page | 70703190 | `SIR_WF API Timesheet Weeks` | Qnipay-base | timesheet | WF+268 |
| page | 70703191 | `SIR_WF API Timesheet Days` | Qnipay-base | timesheet | WF+143 |
| page | 70703192 | `SIR_WF API Timesheet Entries` | Qnipay-base | timesheet | WF+144 |
| page | 70703193 | `SIR_WF API Timesheet Breaks` | Qnipay-base | timesheet | WF+145 |
| page | 70703194 | `SIR_WF API TS Entry Fields` | Qnipay-base | timesheet | WF+266 |
| page | 70703195 | `SIR_WF API TS Day Allowances` | Qnipay-base | timesheet | WF+267 |
| page | 70703196 | `SIR_WF API TS Day Logs` | Qnipay-base | timesheet | WF+146 |
| page | 70703197 | `SIR_WF API Clock Records` | Qnipay-base | timesheet | WF+147 |
| page | 70703198 | `SIR_WF API Clock Events` | Qnipay-base | timesheet | WF+148 |
| page | 70703199 | `SIR_WF API Pay Periods` | Qnipay-base | timesheet, posting | WF+270 (timesheet `payPeriodLocks`), WF+107 (posting) |
| page | 70703200 | `SIR_WF API Onb. Config` | Qnipay-base | onboarding | WF+169 |
| page | 70703201 | `SIR_WF API Onb. Steps` | Qnipay-base | onboarding | WF+257 |
| page | 70703202 | `SIR_WF API Onb. Doc. Types` | Qnipay-base | onboarding | WF+170 |
| page | 70703203 | `SIR_WF API Onb. Policies` | Qnipay-base | onboarding | WF+171 |
| page | 70703204 | `SIR_WF API Onb. Templates` | Qnipay-base | onboarding | WF+258 |
| page | 70703205 | `SIR_WF API Onb. Tmpl. Profiles` | Qnipay-base | onboarding | WF+259 |
| page | 70703206 | `SIR_WF API Onb. Tmpl. Steps` | Qnipay-base | onboarding | WF+260 |
| page | 70703207 | `SIR_WF API Onb. Tmpl. Docs` | Qnipay-base | onboarding | WF+261 |
| page | 70703208 | `SIR_WF API Onb. Tmpl. Policies` | Qnipay-base | onboarding | WF+262 |
| page | 70703209 | `SIR_WF API Onb. Cases` | Qnipay-base | onboarding | WF+172 |
| page | 70703210 | `SIR_WF API Onb. Case Steps` | Qnipay-base | onboarding | WF+263 |
| page | 70703211 | `SIR_WF API Onb. Documents` | Qnipay-base | onboarding | WF+173 |
| page | 70703212 | `SIR_WF API Onb. Case Policies` | Qnipay-base | onboarding | WF+264 |
| page | 70703213 | `SIR_WF API Posting Batches` | Qnipay-base | posting | WF+175 |
| page | 70703214 | `SIR_WF API Posting Lines` | Qnipay-base | posting | WF+176 |
| page | 70703215 | `SIR_WF API Posting Attempts` | Qnipay-base | posting | WF+177 |
| page | 70703216 | `SIR_WF API Pay Grades` | Qnipay-base | people | — (read only over `SIR Pay Grade` 70702575) |
| page | 70703217 | `SIR_WF API Pay Levels` | Qnipay-base | people | — (read only over `SIR Pay Level` 70702576) |
| codeunit | 70703150 | `SIR_WF Command Dispatcher` | Qnipay-base | foundation | — |
| codeunit | 70703151 | `SIR_WF Session Mgt` | Qnipay-base | foundation | — |
| codeunit | 70703152 | `SIR_WF Public Id` | Qnipay-base | foundation | — |
| codeunit | 70703153 | `SIR_WF Audit Mgt` | Qnipay-base | foundation | — |
| codeunit | 70703154 | `SIR_WF Module Mgt` | Qnipay-base | foundation | — |
| codeunit | 70703155 | `SIR_WF Tenant Mgt` | Qnipay-base | foundation | — |
| codeunit | 70703156 | `SIR_WF Tenant Subscribers` | Qnipay-base | foundation | — |
| codeunit | 70703157 | `SIR_WF Notification Mgt` | Qnipay-base | foundation | — |
| codeunit | 70703158 | `SIR_WF Usage Check` | Qnipay-base | foundation, people | — |
| codeunit | 70703159 | `SIR_WF Session Cleanup` | Qnipay-base | foundation | — |
| codeunit | 70703160 | `SIR_WF Idempotency Cleanup` | Qnipay-base | foundation | — |
| codeunit | 70703161 | `SIR_WF Audit Archive` | Qnipay-base | foundation | — |
| codeunit | 70703162 | `SIR_WF Install` | Qnipay-base | all | — |
| codeunit | 70703163 | `SIR_WF Upgrade` | Qnipay-base | all | — |
| codeunit | 70703164 | `SIR_WF Cmd Session Open` | Qnipay-base | foundation | — |
| codeunit | 70703165 | `SIR_WF Cmd Session Resolve` | Qnipay-base | foundation | — |
| codeunit | 70703166 | `SIR_WF Cmd Session End` | Qnipay-base | foundation | — |
| codeunit | 70703167 | `SIR_WF Cmd View As Start` | Qnipay-base | foundation | — |
| codeunit | 70703168 | `SIR_WF Cmd View As End` | Qnipay-base | foundation | — |
| codeunit | 70703169 | `SIR_WF Cmd Template Save` | Qnipay-base | foundation | — |
| codeunit | 70703170 | `SIR_WF Cmd Template Import` | Qnipay-base | foundation | — |
| codeunit | 70703171 | `SIR_WF Cmd Notif. Read All` | Qnipay-base | foundation | — |
| codeunit | 70703172 | `SIR_WF Cmd Notif. Mark Read` | Qnipay-base | foundation | — |
| codeunit | 70703173 | `SIR_WF Cmd Set Capability` | Qnipay-base | foundation | — |
| codeunit | 70703174 | `SIR_WF Cmd Add Exception` | Qnipay-base | foundation | — |
| codeunit | 70703175 | `SIR_WF Cmd Remove Exception` | Qnipay-base | foundation | — |
| codeunit | 70703176 | `SIR_WF Cmd Update Settings` | Qnipay-base | foundation | — |
| codeunit | 70703177 | `SIR_WF Cmd Apply Template` | Qnipay-base | foundation | — |
| codeunit | 70703178 | `SIR_WF Cmd Notif. Matrix Save` | Qnipay-base | foundation | — |
| codeunit | 70703179 | `SIR_WF Cmd Switch Module` | Qnipay-base | foundation | — |
| codeunit | 70703180 | `SIR_WF Cmd Switch Flag` | Qnipay-base | foundation | — |
| codeunit | 70703181 | `SIR_WF Cmd Save Chain` | Qnipay-base | foundation | — |
| codeunit | 70703182 | `SIR_WF Cmd Record Remove` | Qnipay-base | foundation, people, onboarding | — (replaces entity DELETE; also WF+266 delete) |
| codeunit | 70703183 | `SIR_WF Employee Mgt` | Qnipay-base | people | — |
| codeunit | 70703184 | `SIR_WF Dimension Mgt` | Qnipay-base | people | — |
| codeunit | 70703185 | `SIR_WF Employee Loc. W1` | Qnipay-base | people | — |
| codeunit | 70703186 | `SIR_WF People Subscribers` | Qnipay-base | people | — |
| codeunit | 70703187 | `SIR_WF Cmd Employee Transition` | Qnipay-base | people | WF+207 |
| codeunit | 70703188 | `SIR_WF Cmd Profile Proposal` | Qnipay-base | people | WF+208 |
| codeunit | 70703189 | `SIR_WF Cmd Profile Decide` | Qnipay-base | people | WF+209 |
| codeunit | 70703190 | `SIR_WF Timesheet Mgt` | Qnipay-base | timesheet | — |
| codeunit | 70703191 | `SIR_WF TS Config Check` | Qnipay-base | timesheet | — |
| codeunit | 70703192 | `SIR_WF Pay Period Lock` | Qnipay-base | timesheet, posting | — |
| codeunit | 70703193 | `SIR_WF Pay Code Mgt` | Qnipay-base | timesheet, people | — |
| codeunit | 70703194 | `SIR_WF Cmd TS Day Save` | Qnipay-base | timesheet | WF+224 |
| codeunit | 70703195 | `SIR_WF Cmd TS Week Submit` | Qnipay-base | timesheet | WF+225 (absorbs WF+226) |
| codeunit | 70703196 | `SIR_WF Cmd TS Day Transition` | Qnipay-base | timesheet, posting | WF+227 (both) |
| codeunit | 70703197 | `SIR_WF Cmd TS Bulk Approve` | Qnipay-base | timesheet, posting | WF+228 (both) |
| codeunit | 70703198 | `SIR_WF Cmd Clock Move` | Qnipay-base | timesheet | WF+230 |
| codeunit | 70703199 | `SIR_WF Cmd Clock Close` | Qnipay-base | timesheet | WF+231 |
| codeunit | 70703200 | `SIR_WF Cmd TS Config Save` | Qnipay-base | timesheet | WF+271 |
| codeunit | 70703201 | `SIR_WF Onboarding Events` | Qnipay-base | onboarding | — |
| codeunit | 70703202 | `SIR_WF Onboarding Start` | Qnipay-base | onboarding | — |
| codeunit | 70703203 | `SIR_WF Cmd Onb. Policy Create` | Qnipay-base | onboarding | WF+249 (create) |
| codeunit | 70703204 | `SIR_WF Cmd Onb. Tmpl. Create` | Qnipay-base | onboarding | WF+266 (create) |
| codeunit | 70703205 | `SIR_WF Cmd Onb. Config Save` | Qnipay-base | onboarding | WF+248 |
| codeunit | 70703206 | `SIR_WF Cmd Onb. Doc. Type Save` | Qnipay-base | onboarding | WF+265 |
| codeunit | 70703207 | `SIR_WF Cmd Onb. Policy Update` | Qnipay-base | onboarding | WF+249 (edit) |
| codeunit | 70703208 | `SIR_WF Cmd Onb. Policy File` | Qnipay-base | onboarding | WF+250 |
| codeunit | 70703209 | `SIR_WF Cmd Onb. Policy Scan` | Qnipay-base | onboarding | WF+268 (policy scan) |
| codeunit | 70703210 | `SIR_WF Cmd Onb. Policy Key` | Qnipay-base | onboarding | WF+268 (policy keys) |
| codeunit | 70703211 | `SIR_WF Cmd Onb. Step Save` | Qnipay-base | onboarding | WF+251 |
| codeunit | 70703212 | `SIR_WF Cmd Onb. Doc. Upload` | Qnipay-base | onboarding | WF+252 |
| codeunit | 70703213 | `SIR_WF Cmd Onb. Policy Ack` | Qnipay-base | onboarding | WF+253 |
| codeunit | 70703214 | `SIR_WF Cmd Onb. Submit` | Qnipay-base | onboarding | WF+254 |
| codeunit | 70703215 | `SIR_WF Cmd Onb. Case Action` | Qnipay-base | onboarding | WF+255 |
| codeunit | 70703216 | `SIR_WF Cmd Onb. Read My Data` | Qnipay-base | onboarding | WF+267 (03's WF+174) |
| codeunit | 70703217 | `SIR_WF Cmd Onb. Doc. Check` | Qnipay-base | onboarding | WF+256 |
| codeunit | 70703218 | `SIR_WF Cmd Onb. Doc. Scan` | Qnipay-base | onboarding | WF+268 (document scan) |
| codeunit | 70703219 | `SIR_WF Cmd Onb. Doc. Key` | Qnipay-base | onboarding | WF+268 (document keys) |
| codeunit | 70703220 | `SIR_WF Cmd Onb. Tmpl. Save` | Qnipay-base | onboarding | WF+266 (save) |
| codeunit | 70703221 | `SIR_WF Posting Queue` | Qnipay-base | posting | — |
| codeunit | 70703222 | `SIR_WF Posting Dispatcher` | Qnipay-base | posting | — |
| codeunit | 70703223 | `SIR_WF Post Line` | Qnipay-base | posting | — |
| codeunit | 70703224 | `SIR_WF Posting Landed` | Qnipay-base | posting | — |
| codeunit | 70703225 | `SIR_WF Posting Reconcile` | Qnipay-base | posting | — |
| codeunit | 70703226 | `SIR_WF Cmd Posting Retry` | Qnipay-base | posting | WF+229 |
| enum | 70703150 | `SIR_WF Command Type` | Qnipay-base | foundation | — (ruling 3) |
| enum | 70703151 | `SIR_WF Date Format` | Qnipay-base | foundation | — |
| enum | 70703152 | `SIR_WF Clock Style` | Qnipay-base | foundation | — |
| enum | 70703153 | `SIR_WF Weekday` | Qnipay-base | foundation | — |
| enum | 70703154 | `SIR_WF Bank Holiday Region` | Qnipay-base | foundation | — |
| enum | 70703155 | `SIR_WF Session End Reason` | Qnipay-base | foundation | — |
| enum | 70703156 | `SIR_WF Exception Mode` | Qnipay-base | foundation | — |
| enum | 70703157 | `SIR_WF Audit Source` | Qnipay-base | foundation | — |
| enum | 70703158 | `SIR_WF Template Scope` | Qnipay-base | foundation | — |
| enum | 70703159 | `SIR_WF Template Source` | Qnipay-base | foundation | — |
| enum | 70703160 | `SIR_WF Chain Module` | Qnipay-base | foundation | — |
| enum | 70703161 | `SIR_WF Approver Role` | Qnipay-base | foundation | — |
| enum | 70703162 | `SIR_WF Notif. Channel` | Qnipay-base | foundation | — |
| enum | 70703163 | `SIR_WF Notif. Delivery` | Qnipay-base | foundation | — |
| enum | 70703164 | `SIR_WF Employee State` | Qnipay-base | people | — |
| enum | 70703165 | `SIR_WF Worker Category` | Qnipay-base | people | — |
| enum | 70703166 | `SIR_WF Entry Mode` | Qnipay-base | people | — |
| enum | 70703167 | `SIR_WF Pay Basis` | Qnipay-base | people | — |
| enum | 70703168 | `SIR_WF Self Field` | Qnipay-base | people | — |
| enum | 70703169 | `SIR_WF Change Status` | Qnipay-base | people | — |
| enum | 70703170 | `SIR_WF Change Stage` | Qnipay-base | people | — |
| enum | 70703171 | `SIR_WF Decision` | Qnipay-base | people | — |
| enum | 70703172 | `SIR_WF History Source` | Qnipay-base | people | — |
| enum | 70703173 | `SIR_WF TS State` | Qnipay-base | timesheet | — |
| enum | 70703174 | `SIR_WF Capture Source` | Qnipay-base | timesheet | — |
| enum | 70703175 | `SIR_WF Clock Kind` | Qnipay-base | timesheet | — |
| enum | 70703176 | `SIR_WF Time Format` | Qnipay-base | timesheet | — |
| enum | 70703177 | `SIR_WF Week Grid` | Qnipay-base | timesheet | — |
| enum | 70703178 | `SIR_WF Week Layout` | Qnipay-base | timesheet | — |
| enum | 70703179 | `SIR_WF Cutoff Day` | Qnipay-base | timesheet | — |
| enum | 70703180 | `SIR_WF Pay Code Basis` | Qnipay-base | timesheet | — |
| enum | 70703181 | `SIR_WF Onb. Step` | Qnipay-base | onboarding | — |
| enum | 70703182 | `SIR_WF Verifier` | Qnipay-base | onboarding | — |
| enum | 70703183 | `SIR_WF Task State` | Qnipay-base | onboarding | — |
| enum | 70703184 | `SIR_WF File Kind` | Qnipay-base | onboarding | — |
| enum | 70703185 | `SIR_WF Scan State` | Qnipay-base | onboarding | — |
| enum | 70703186 | `SIR_WF Posting Source` | Qnipay-base | posting | — |
| enum | 70703187 | `SIR_WF Posting State` | Qnipay-base | posting | — |
| enum | 70703188 | `SIR_WF Posting Error Kind` | Qnipay-base | posting | — |
| enum | 70703189 | `SIR_WF Posting Unit` | Qnipay-base | posting | — |
| enum | 70703190 | `SIR_WF Reconcile Issue` | Qnipay-base | posting | — |
| query | 70703150 | `SIR_WF TS Queue Counts` | Qnipay-base | timesheet | WF+Q1 |
| tableextension | 70703150 | `SIR_WF Document Attachment` | Qnipay-base | foundation | — (extends Document Attachment 1173) |
| tableextension | 70703151 | `SIR_WF Dimension Value` | Qnipay-base | people | — (extends Dimension Value 349) |
| tableextension | 70703152 | `SIR_WF Job` | Qnipay-base | people | — (extends Job 167) |
| tableextension | 70703153 | `SIR_WF Job Task` | Qnipay-base | people | — (extends Job Task 1001) |
| tableextension | 70703154 | `SIR_WF Employee Qualification` | Qnipay-base | onboarding | — (extends Employee Qualification 5203) |
| permissionset | 70703150 | `SIR_WF Connector` | Qnipay-base | foundation, posting | — |
| permissionset | 70703151 | `SIR_WF Admin` | Qnipay-base | foundation | — |
| permissionset | 70703152 | `SIR_WF Posting` | Qnipay-base | posting | — |
| codeunit | 70703097 | `SIR_GB WF Subscribers` | Qnipay-GB | foundation | — |
| codeunit | 70703098 | `SIR_GB WF Employee Loc.` | Qnipay-GB | people | — |
| codeunit | 70703099 | `SIR_GB WF Onboarding CS` | Qnipay-GB | onboarding | — |
| enumextension | 70703099 | `SIR_GB WF Bank Hol. Region` | Qnipay-GB | foundation | — (extends SIR_WF Bank Holiday Region) |

## 2. New tables: foundation, access and configuration

### 70703150 SIR_WF Setup

Singleton for Workforce-only organisation settings. Its Version is the tenant version that every module, flag and settings write checks (GB-D28). Standard fields: 9900, 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Primary Key | Code[10] | Blank. |
| 10 | Template Key | Text[100] | The template applied last (`tpl_…` or a shipped key). |
| 11 | Time Zone | Text[100] | IANA name. Validated in Node (`isTimeZone`) and, for BC page edits, by a list check. |
| 12 | Date Format | Enum 70703151 `SIR_WF Date Format` | |
| 13 | Clock Style | Enum 70703152 `SIR_WF Clock Style` | |
| 14 | Week Start | Enum 70703153 `SIR_WF Weekday` | Monday, Sunday, Saturday allowed. Refused with `week-start-in-use` while timesheet days are open. |
| 15 | Full-Time Weekly Hours | Decimal | 1 to 80. |
| 16 | NMW Check | Boolean | Base already has `SIR Minimum Wage` (70702634), so the concept is country-neutral. |
| 17 | Bank Holiday Region | Enum 70703154 `SIR_WF Bank Holiday Region` | Extensible. Base: None. GB adds the UK regions. |
| 18 | Week Ending | Enum 70703153 `SIR_WF Weekday` | Sunday, Saturday, Friday allowed. |
| 19 | First Pay Date | Date | Display only; payroll's real dates are `SIR Pay Period."Pay Date"`. |
| 20 | Breaks Max | Integer | Flag extra (BREAKS), 1 to 5. |
| 21 | Vehicles Max | Integer | Flag extra (VEHICLE), 1 to 4. |
| 30 | Department Dimension Code | Code[20] | TableRelation `Dimension`. People slice (GB-Q12). |
| 31 | Cost Centre Dimension Code | Code[20] | TableRelation `Dimension`. |
| 40 | Notification Matrix Version | Integer | The matrix's own version (02 §11 gap). 0 until first saved. |
| 50 | Posting Journal Delay (Min.) | Integer | 0 to 1440. Time between final approval and dispatch. |
| 51 | Idempotency Retention (Hours) | Integer | Default 24. |
| 52 | Session Retention (Days) | Integer | Ended sessions older than this are deleted. Default 30. |
| 53 | Posting Enabled | Boolean | OnValidate to true: `SIR Timesheet Setup."Enable Timesheet Interface"` (field 5007, `B/Table/Tab70702596.SIRTimesheetSetup.al:57`) must be on (problem N) and `Posting Batch Nos.` set. |
| 54 | Posting Batch Nos. | Code[20] | TableRelation `No. Series`. |
| 55 | Late Line Alert (days) | Integer | Default 3. |
| 56 | Hold Until Period Current | Boolean | Fallback GB-D67, only while the Base change for problem G is not in place. |
| 60 | Default Qualification Code | Code[10] | TableRelation `Qualification`. Onboarding (02 H5): needed before a start that has qualifications (refusal `invalid`, field `additional.quals`). |

Keys: PK (Primary Key). Moved out of 01's WF+1: Week Grid and Week Layout (to 70703172 `SIR_WF Timesheet Config`), Rota Horizon (Rota deferred).

### 70703151 SIR_WF Feature Flag

One row per feature flag (B10). A flag is live only while its module's `SIR Feature Register` row is enabled. Standard fields: none (versioned by 70703150 `SIR_WF Setup`; the code is the contract key).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Code | Code[20] | PK. The 22 flags in `src/domain/modules.ts:39-62` (AUTO_OT … GEOFENCE). |
| 10 | Module Code | Code[10] | CORE, TS, A, B, C or ON. Matches `SIR Feature Register."SIR_WF Module Code"`. |
| 11 | Name | Text[80] | |
| 12 | Description | Text[250] | |
| 13 | Enabled | Boolean | |
| 14 | Not Built | Boolean | GPS, GEOFENCE: cannot be switched on. |

Keys: PK (Code); (Module Code).

### 70703152 SIR_WF Account

The Workforce sign-in identity of one employee. Replaces W1's `SIR Approver Entra Object ID`, which GB does not have. Standard fields: 9901 only. The contract id `acc_<email>` can reach 84 characters, longer than Public Id, so it is derived from the key (GB-D11).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Email | Text[80] | PK. Lower case. Matches `Employee."Company E-Mail"` (Text[80]) at creation. |
| 10 | Entra Object ID | Guid | Set at first sign-in, when the token's email first matches. Unique key once set. |
| 11 | Employee No. | Code[20] | TableRelation `Employee`. Unique key. |
| 12 | Blocked | Boolean | A blocked account is signed out (`signed-out`). |
| 13 | Last Sign-in At | DateTime | |

Keys: PK (Email); (Entra Object ID); (Employee No.) unique. User type is on Employee (GB-D24). Version is bumped by every change to the account's capability exceptions.

### 70703153 SIR_WF Session

Replaces W1's `SIR Approval Session`, which GB does not have (GB-D6). One open row per account. Holds what the Microsoft token cannot: who the session is viewing as. Standard fields: none (never addressed by the contract).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Session Id | Guid | PK. Created by BC, held only by Node. Never sent to the browser, never in a URL or `$filter` (B13). |
| 10 | Account Email | Text[80] | TableRelation 70703152 `SIR_WF Account`. |
| 11 | Employee No. | Code[20] | Copied from the account at opening. |
| 12 | Viewing As Employee No. | Code[20] | Blank unless viewing as. While set, every write except view-as end and sign-out refuses `viewing-as`. |
| 13 | Opened At | DateTime | |
| 14 | Last Seen At | DateTime | Updated at most once a minute. |
| 15 | Ended At | DateTime | Blank while open. |
| 16 | End Reason | Enum 70703155 `SIR_WF Session End Reason` | |

Keys: PK (Session Id); (Account Email, Ended At).

### 70703154 SIR_WF User Type

The three user types and their display names (rename only; no insert or delete through the API). Standard fields: 9901 (the code is the contract id).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Code | Text[20] | PK. employee, manager, admin (lower case, B14). |
| 10 | Name | Text[24] | Required, unique ignoring case (checked in OnValidate; `NAME_TAKEN`). |
| 11 | Description | Text[250] | |

Keys: PK (Code).

### 70703155 SIR_WF User Type Capability

The matrix: one row per user type and capability. Standard fields: none (versioned by its user type).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | User Type Code | Text[20] | PK 1. |
| 2 | Capability Code | Text[30] | PK 2. TableRelation 70703156 `SIR_WF Capability`. |
| 10 | Granted | Boolean | |
| 11 | Default | Boolean | Seeded value (contract `defaults`). Set by install only. |
| 12 | Locked | Boolean | Cannot be removed from this user type (contract `lockedFor`). Replaces 01's comma list. |

Keys: PK (User Type Code, Capability Code); (Capability Code, Granted).

### 70703156 SIR_WF Capability

Reference data, seeded by install, read only through the API. Standard fields: 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Code | Text[30] | PK. The 18 capabilities (own_home … pay_appr). |
| 10 | Group Code | Text[10] | own, team, cfg. TableRelation 70703157 `SIR_WF Capability Group`. |
| 11 | Label | Text[100] | |
| 12 | Gate | Text[150] | The screen it opens; the seed reaches about 95 characters. |

Keys: PK (Code).

### 70703157 SIR_WF Capability Group

Standard fields: 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Code | Text[10] | PK. own, team, cfg. |
| 10 | Label | Text[60] | |
| 11 | Description | Text[250] | |
| 12 | Sort Order | Integer | |

Keys: PK (Code); (Sort Order).

### 70703158 SIR_WF Capability Exception

One grant or revocation for one account. A revocation always wins. Standard fields: none (the account's Version is the contract's If-Match).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Account Email | Text[80] | PK 1. TableRelation 70703152 `SIR_WF Account`. |
| 2 | Capability Code | Text[30] | PK 2. |
| 10 | Mode | Enum 70703156 `SIR_WF Exception Mode` | grant, revoke. |
| 11 | Reason | Text[250] | Required. |
| 12 | Added By | Code[20] | Employee No. of the real signed-in person. |
| 13 | Added At | DateTime | |

Keys: PK (Account Email, Capability Code).

### 70703159 SIR_WF Audit Event

Append-only (OnModify and OnDelete refuse). One row per change. Standard fields: none (contract id is the Entry No. as text).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Entry No. | BigInteger | PK, AutoIncrement. |
| 10 | At | DateTime | Server time. |
| 11 | Who Employee No. | Code[20] | The real signed-in person. |
| 12 | Viewing As Employee No. | Code[20] | |
| 13 | Act | Text[60] | |
| 14 | Entity | Text[60] | |
| 15 | Entity Id | Text[100] | Can be an email. |
| 16 | Before | Blob | JSON. Never personal data. |
| 17 | After | Blob | JSON. Never personal data. |
| 18 | Reason | Text[500] | |
| 19 | Source | Enum 70703157 `SIR_WF Audit Source` | api, bc-client, job, install. bc-client covers B7 edits in BC pages. |
| 20 | Correlation Id | Guid | From the Node request. |
| 21 | Posting Attempt Entry No. | BigInteger | Set by a posting retry (IC-07). |

Keys: PK (Entry No.); (Entity, At); (Who Employee No., At); (Correlation Id).

### 70703160 SIR_WF Template

Templates saved or imported here. Shipped templates stay in TypeScript. Standard fields: 9901 (the key is the contract id and can reach 100 characters).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Key | Text[100] | PK. `tpl_` plus the name made lower case. |
| 10 | Name | Text[80] | Unique ignoring case (`NAME_TAKEN`). |
| 11 | Description | Text[300] | |
| 12 | Scope | Enum 70703158 `SIR_WF Template Scope` | config, structure. |
| 13 | Source | Enum 70703159 `SIR_WF Template Source` | saved, imported. |
| 14 | Saved At | DateTime | |
| 15 | Saved By Employee No. | Code[20] | Contract `savedBy` is the name, derived. |
| 16 | From Name | Text[100] | Organisation name at save; blank for an import. |
| 17 | Body | Blob | The whole `Template` JSON. No money (checked in Node on save and import). |

Keys: PK (Key); (Name).

### 70703161 SIR_WF Approval Chain

One row per module, seeded unsaved by install so the save action has a record to bind to. Standard fields: 9900 (`chainId(module)`), 9901 (0 is read as "not saved").

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Module | Enum 70703160 `SIR_WF Chain Module` | PK. Timesheet, Profile. Extensible for Leave and Rota later. |
| 10 | Saved | Boolean | False until first saved; reads then return the TypeScript defaults at version 0. |

Keys: PK (Module).

### 70703162 SIR_WF Approval Chain Step

Standard fields: none (versioned by the chain).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Module | Enum 70703160 `SIR_WF Chain Module` | PK 1. |
| 2 | Step No. | Integer | PK 2. 1 to 12. |
| 10 | Role | Enum 70703161 `SIR_WF Approver Role` | An enum so BC pages can edit it (B7). |
| 11 | Scope | Text[60] | |
| 12 | When | Text[80] | |
| 13 | SLA | Text[40] | |
| 14 | Fixed | Boolean | The Business Central step, last in Timesheet. |

Keys: PK (Module, Step No.). The role-to-capability map stays in TypeScript (`CHAIN_ROLE_RULES`). AL repeats only the structural checks for BC page edits: at most 12 steps, the fixed step last in Timesheet, Profile limited to Line manager and Payroll.

### 70703163 SIR_WF Delegation

Standard fields: 9900 (`dlg_<n>`), 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Entry No. | Integer | PK, AutoIncrement. |
| 10 | From Employee No. | Code[20] | The approver whose queue is handed over. |
| 11 | To Employee No. | Code[20] | Cannot equal From (`LOOP`). |
| 12 | Date From | Date | |
| 13 | Date Until | Date | Both days included. |
| 14 | Timesheet | Boolean | |
| 15 | Profile | Boolean | |

Keys: PK (Entry No.); (From Employee No., Date From); (To Employee No., Date From).

### 70703164 SIR_WF Notification Event

The notification matrix: one row per catalogue event, seeded by install from the TypeScript catalogue. Standard fields: none (the matrix version is `SIR_WF Setup."Notification Matrix Version"`).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Code | Text[40] | PK. ts_submitted, ob_invited, pf_req, cfg … (lower case). |
| 10 | Module | Text[30] | Timesheet, Onboarding, Workforce. |
| 11 | Label | Text[100] | |
| 12 | Description | Text[250] | |
| 13 | Employee Channel | Enum 70703162 `SIR_WF Notif. Channel` | |
| 14 | Manager Channel | Enum 70703162 `SIR_WF Notif. Channel` | |
| 15 | Admin Channel | Enum 70703162 `SIR_WF Notif. Channel` | |
| 16 | Employee Applies | Boolean | False = the contract's null cell; the channel cannot be changed. |
| 17 | Manager Applies | Boolean | |
| 18 | Admin Applies | Boolean | |

Keys: PK (Code); (Module).

### 70703165 SIR_WF Idempotency Key

One table, merging the foundation and posting versions (GB-D5). Used for retries from Node to BC: the contract sends no Idempotency-Key header, so Node creates a key per create command and resends it on a retry after a timeout, a 429 or a 503. A second call with the same key and command returns the stored first result and writes nothing. The posting dispatcher does not use it: a posting line's own `SystemId` is its idempotency key (GB-D62). Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Key | Text[100] | PK 1. From the command's `idempotencyKey`. |
| 2 | Operation | Text[100] | PK 2. The command type name (for example `timesheetDaySaves`). |
| 10 | Employee No. | Code[20] | The acting employee from the session. A key is per person. |
| 11 | Result | Blob | JSON of the first response (`result`, `recordId`, `recordIds`, `auditId`, `summary`). |
| 12 | Expires At | DateTime | Now + `SIR_WF Setup."Idempotency Retention (Hours)"`. Deleted by 70703160 `SIR_WF Idempotency Cleanup`. |
| 13 | Created At | DateTime | Added in the merge. |
| 14 | Correlation Id | Guid | Added in the merge: the first call's correlation id, for support. |

Keys: PK (Key, Operation); (Expires At).

### 70703166 SIR_WF Command (TableType = Temporary)

The never-stored buffer behind the generic `commands` page (70703150 `SIR_WF API Commands`) and every bound action (GB-D4, GB-D12). Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Id | Guid | PK. |
| 2 | Command | Enum 70703150 `SIR_WF Command Type` | Input: the command name. |
| 10 | Session Id | Guid | Input. |
| 11 | Correlation Id | Guid | Input. |
| 12 | Idempotency Key | Text[100] | Input, on create commands. |
| 13 | Version | Integer | Input, on versioned commands. 0 = no record yet. |
| 14 | Payload | Blob | Input JSON (command-specific), exposed on the page as text `payload`. |
| 15 | Target System Id | Guid | Set by a bound action: the record it is bound to. Blank on the `commands` page. |
| 20 | Result | Text[20] | Output: ok, noop. |
| 21 | Record Id | Guid | Output. |
| 22 | Record Ids | Blob | Output JSON array (bulk commands). |
| 23 | Audit Id | Text[50] | Output. Blank on a no-op. |
| 24 | Warnings | Blob | Output JSON array. |
| 25 | Summary | Blob | Output JSON. |
| 26 | Message | Text[500] | Output. |

Keys: PK (Id).

## 3. New tables: people and dimensions

### 70703167 SIR_WF Employee History

Field-level history of an employee, newest first (`GET /employees/:id/history`). Append-only. Renamed from 01's `SIR_WF Person History` (GB-D41). Written by 70703183 `SIR_WF Employee Mgt` for API writes and by 70703186 `SIR_WF People Subscribers` on `Employee` OnAfterModify for BC-client edits (B7). Standard fields: none; the contract id `hist_<Entry No. padded to 12>` is derived in Node (mock format, `src/mocks/world.ts:49-53`).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Entry No. | BigInteger | PK, AutoIncrement. |
| 10 | Employee No. | Code[20] | TableRelation Employee. |
| 11 | At | DateTime | `CurrentDateTime`. |
| 12 | By Employee No. | Code[20] | The acting employee from the session; blank for a BC-client edit by a user with no employee. |
| 13 | By User ID | Code[50] | `UserId` of a BC-client edit. Node shows it as the name when By Employee No. is blank. |
| 14 | Source | Enum 70703172 `SIR_WF History Source` | |
| 15 | Field Name | Text[50] | Contract field key (`name`, `location`, `state`, `userType` …). |
| 16 | From Value | Text[250] | Bank values masked. |
| 17 | To Value | Text[250] | Bank values masked. |
| 18 | Reason | Text[500] | Transitions and profile changes. |

Keys: PK (Entry No.); `EmployeeAt` (Employee No., At).

### 70703168 SIR_WF Job Profile

Coded job profile (`/api/v1/job-profiles`). Standard fields: 9900 (filled with `job_<Code>`, the id Node would derive), 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Code | Code[20] | PK. Pattern `^[A-Z0-9][A-Z0-9_.-]{0,19}$` (`src/domain/codes.ts:6`). OnRename refuses `invalid` field `code`. |
| 10 | Name | Text[100] | Template allows 80. |
| 11 | Night | Boolean | |

Keys: PK (Code). OnDelete: 70703158 `SIR_WF Usage Check` (employees with this profile; 70703193 `SIR_WF Onb. Templ. Job Profile` rows).

### 70703169 SIR_WF Employee Type

What somebody is (`/api/v1/employee-types`). The timesheet type-capture tables relate to `Code`. Standard fields: 9900 (`typ_<code>`), 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Code | Code[32] | PK. Contract `^[a-z][a-z0-9_]{1,31}$`; stored upper case, read back lower case (lossless for this pattern). OnRename refuses. |
| 10 | Name | Text[60] | |
| 11 | Category | Enum 70703165 `SIR_WF Worker Category` | |
| 12 | Entry Mode | Enum 70703166 `SIR_WF Entry Mode` | |
| 13 | Pay Basis | Enum 70703167 `SIR_WF Pay Basis` | Contract `uom`. |
| 14 | Vehicle | Boolean | Capability. |
| 15 | Site | Boolean | Capability. |
| 16 | Project | Boolean | Capability. |
| 17 | Shift | Boolean | Capability. |
| 18 | Employment Type | Enum `SIR Employment Type` | Base enum 70702591. Set from Category on validate (02 §2.6): Salaried → Salary, Contracted → Hourly Contracted, Bank → Zero Hour, Agency → blank. Read only on the page. |

Keys: PK (Code). OnDelete refuses `in-use` while an Employee holds it, and `last-type` when it is the only row.

### 70703170 SIR_WF Profile Change

A self-service change to one of six fields, approved along its route (`/api/v1/profile-changes`). Standard fields: 9900 (`pfc_<Entry No.>`, mock format `src/mocks/profile.ts:44-48`), 9901 (the If-Match of a decision).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Entry No. | Integer | PK, AutoIncrement. |
| 10 | Employee No. | Code[20] | TableRelation Employee. |
| 11 | Field Key | Enum 70703168 `SIR_WF Self Field` | |
| 12 | From Value | Text[250] | Value on the record when raised; masked for bank fields. |
| 13 | To Value | Blob | Whole value until applied; cleared for bank fields once applied or declined. `DataClassification = EndUserIdentifiableInformation`. |
| 14 | To Value Masked | Text[50] | What every read returns for bank fields. |
| 15 | Note | Text[500] | |
| 16 | Raised At | DateTime | |
| 17 | Status | Enum 70703169 `SIR_WF Change Status` | |
| 18 | Stage | Enum 70703170 `SIR_WF Change Stage` | |
| 19 | Needs Manager | Boolean | Route, from the Profile approval chain at proposal time (`routeFor`). Replaces 01's Route Text[30]. |
| 20 | Needs Payroll | Boolean | Route. |
| 21 | From Value Hash | Text[64] | SHA-256 of the unmasked value when raised, for `changed-since` on bank fields without storing them twice. |
| 22 | Applied At | DateTime | Set when the last approval writes the record. |

Keys: PK (Entry No.); `EmployeeStatus` (Employee No., Status); `StatusStage` (Status, Stage).

### 70703171 SIR_WF Profile Change Decision

One decision on a profile change. Replaces 01's `Decisions` Blob JSON, so payroll can see in BC who verified a bank change. Standard fields: none (read with its parent; the parent's Version is bumped).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Change Entry No. | Integer | PK 1, TableRelation 70703170 `SIR_WF Profile Change`. |
| 2 | Line No. | Integer | PK 2. |
| 10 | Stage | Enum 70703170 `SIR_WF Change Stage` | manager or payroll. |
| 11 | Decision | Enum 70703171 `SIR_WF Decision` | |
| 12 | By Employee No. | Code[20] | |
| 13 | At | DateTime | |
| 14 | Reason | Text[500] | |

Keys: PK (Change Entry No., Line No.).

## 4. New tables: timesheet and clocking

### 70703172 SIR_WF Timesheet Config

The Timesheet setup singleton (`TimesheetConfig`, `timesheets.ts:64-68`), edited in React and on a BC page (B7). Changes from 01: `Variance Warn` and `Enforce Rest` dropped (not in `CaptureRules`); `Cutoff` split (GB-D51); `Week Grid` and `Week Layout` moved here (`tenant.ts:22-24`); the three Blobs become 70703173–70703178. Standard fields: 9900 (`timesheetConfig`), 9901, bumped when any child row changes (R7).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Primary Key | Code[10] | Blank. |
| 10 | Max Daily | Decimal (0:2) | Hours. AL check: > 0 and ≤ 24. |
| 11 | Warn Daily | Decimal (0:2) | > 0 and ≤ Max Daily. |
| 12 | Min Net | Decimal (0:2) | ≥ 0 and < Max Daily. |
| 14 | Block Future | Boolean | |
| 16 | Enforce Lock | Boolean | |
| 17 | OT Daily | Decimal (0:2) | > 0 and ≤ 24. |
| 18 | Night From | Text[5] | HH:MM, 24-hour. |
| 19 | Night To | Text[5] | HH:MM. |
| 20 | Cutoff Day | Enum 70703179 `SIR_WF Cutoff Day` | |
| 21 | Time Format | Enum 70703176 `SIR_WF Time Format` | |
| 22 | Return Reason Required | Boolean | |
| 24 | Cutoff Time | Text[5] | HH:MM. Node returns `cutoff` as "<Day> <Time>". |
| 25 | Week Grid | Enum 70703177 `SIR_WF Week Grid` | Also returned on `Tenant.extras.weekGrid`. |
| 26 | Week Layout | Enum 70703178 `SIR_WF Week Layout` | Also on `Tenant.extras.weekLayout`. |

Keys: PK (Primary Key). The AL port of `timesheetConfigProblem` (`domain/timesheet.ts:537-566`) lives in 70703191 `SIR_WF TS Config Check` and runs on React and BC-page edits alike.

### 70703173 SIR_WF TS Field Default

`TimesheetConfig.fieldDefaults` (`record<code, {vis, mand, label}>`). Standard fields: none (child of 70703172).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Field Code | Text[30] | PK. Lower-case catalogue codes (`break_s2`, `job_task`), so Text, not Code (R3). |
| 10 | Visible | Boolean | `vis` |
| 11 | Mandatory | Boolean | `mand` |
| 12 | Label | Text[60] | |

### 70703174 SIR_WF TS Allowance

`TimesheetConfig.allowances` (`AllowanceDef`, strict, never an amount). Standard fields: none (child of 70703172).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Code | Code[20] | PK. Must equal the record key (`timesheetConfigProblem`). |
| 10 | Label | Text[80] | AL refuses `£ $ €`. |
| 11 | Pay Code | Code[20] | TableRelation `"SIR TIme Sheet Elements".Code`. |
| 12 | Tier | Text[20] | |
| 13 | Element | Code[20] | Optional. TableRelation `"SIR Payroll Element"` (`B/Table/Tab70702581.SIRPayrollElement.al:1`). |
| 14 | Basis | Enum 70703180 `SIR_WF Pay Code Basis` | Optional (blank). |

Keys: PK (Code); `PayCode` (Pay Code) for the pay code in-use check.

### 70703175 SIR_WF TS Type Capture

Presence of `TimesheetConfig.types[code]` (a type can be present with empty lists; `CaptureSetup.type` is null when absent). Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee Type Code | Code[32] | PK. TableRelation 70703169 `SIR_WF Employee Type`. Returned lower case (02 G12). |

### 70703176 SIR_WF TS Type Field

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee Type Code | Code[32] | PK 1 → 70703175. |
| 2 | Field Code | Text[30] | PK 2. |
| 10 | Visible | Boolean | |
| 11 | Mandatory | Boolean | |

### 70703177 SIR_WF TS Type Allowance

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee Type Code | Code[32] | PK 1 → 70703175. |
| 2 | Line No. | Integer | PK 2. Keeps the contract's array order. |
| 10 | Allowance Code | Code[20] | A 70703174 code or a pay code (`payable`, `domain/timesheet.ts:553`). |

Keys: PK; `Allowance` (Allowance Code) for in-use.

### 70703178 SIR_WF TS Type Rule

`TypeCapture.rules[]` (`TypeRule`: trigger, when, code, value, how). `value` is a multiplier or a threshold, never money.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee Type Code | Code[32] | PK 1 → 70703175. |
| 2 | Line No. | Integer | PK 2. Order matters: `deriveWorkType` takes the first rule that fires. |
| 10 | Trigger | Text[40] | |
| 11 | When | Text[40] | A `RATE_TRIGGERS` key or blank. |
| 12 | Pay Code | Code[20] | `code`; a 70703174 code or pay code. |
| 13 | Value | Text[10] | "1.5", "8". AL refuses `£ $ €`. |
| 14 | How | Text[80] | |

Keys: PK; `PayCode` (Pay Code) for in-use. 70703176–70703178 carry no standard fields (children of 70703172).

### 70703179 SIR_WF Timesheet Week

One row per employee per week. Its Version is the aggregate version for every rule that reads more than one day (week submit, multi-week submit, earlier-weeks status) (R2, GB-D46). Created on the first write to any day of the week. Standard fields: 9901 only (Node addresses it by key).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. TableRelation `Employee`. |
| 2 | Week Start | Date | PK 2. The tenant's week start (`periodStart`, `domain/time.ts:137`), computed by Node. |
| 10 | Last Changed At | DateTime | `CurrentDateTime`. |
| 11 | Last Changed By | Code[20] | Acting employee. |

9901 Version: +1 in the same transaction as any insert, modify or delete of a 70703180, 70703181, 70703182, 70703183 or 70703184 row of that employee and week, by every command (save, submit, transition, bulk, clock out, clock close).

### 70703180 SIR_WF Timesheet Day

One row per employee per day (`TimesheetDay`). Written only by commands. Standard fields: 9900 (`tsd_<employee>_<yyyy-mm-dd>`, `mocks/timesheets.ts:40`), 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. TableRelation `Employee`. Contract `employeeCode`. |
| 2 | Date | Date | PK 2. |
| 3 | Week Start | Date | → 70703179. Set on insert. |
| 10 | State | Enum 70703173 `SIR_WF TS State` | AL enforces `TS_STATE.next` (`domain/timesheet.ts:21-28`), plus draft→draft and back→back for saves. |
| 11 | Work Type | Code[20] | Pay code from `deriveWorkType`, else `STD`. TableRelation `"SIR TIme Sheet Elements".Code` (`B/Table/Tab70702615.SIRTImeSheetElements.al:8`). |
| 14 | Non-Working Reason | Text[200] | Free text while Leave is off. |
| 15 | Capture Source | Enum 70703174 `SIR_WF Capture Source` | |
| 16 | Entered By | Code[20] | Acting employee (session). |
| 17 | Submitted At | DateTime | Blank until first submit. |
| 18 | Return Reason | Text[500] | |
| 19 | Warnings | Text[2048] | JSON array of strings, as Node computed them. |
| 20 | Minutes | Integer | Net minutes of the day, computed by Node (`dayMinutes`). AL checks it equals the sum of 70703181 `Net Minutes`. |
| 21 | Waiting Role | Text[40] | Role of the current chain layer (`Line manager`, `Payroll`) while State is pend, resub or mgrok; blank otherwise. Gives `waitingOn`. |
| 22 | Work Site Code | Code[20] | The employee's default site on save (`SIR Employee Sites."Is Default Site"`, `B/Table/Tab70702608.SIREmployeeSites.al:87`). TableRelation `"SIR Work Sites"`. |
| 23 | Posting State | Enum 70703187 `SIR_WF Posting State` | **Kept for posting** (GB-D17): none, queued, posted, failed, reconciled. Mirrors the latest posting line. |
| 24 | Last Posting Line No. | BigInteger | **Kept for posting** (GB-D17): Entry No. of the latest 70703203 `SIR_WF Posting Line`. Gives `integrationAttemptId`. |
| 25 | Line Manager No. | Code[20] | `Employee."Manager No."` copied on save and submit. The Line manager layer's decider. |
| 26 | Chain Roles | Text[100] | Comma list of the layers whose condition applies to this day (walk at submit). |

Keys:

| Key | Fields | Serves |
|---|---|---|
| PK | Employee No., Date | Week read, home month, earlier weeks, clock day, every write. |
| `PublicId` (unique) | Public Id | `timesheetDays(id)/transition`, bulk ids. |
| `QueueManager` | Line Manager No., State, Date | Line manager queue and tabs. |
| `QueueRole` | Waiting Role, State, Date | Payroll layer queue. |
| `QueueSite` | Work Site Code, State, Date | Location-scoped reads. |
| `Week` | Employee No., Week Start | Week aggregate checks. |

### 70703181 SIR_WF Timesheet Entry

`TimeEntry` (at most 6 per day). Standard fields: none (child of the day; the day's Version is bumped).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Date | Date | PK 2. |
| 3 | Line No. | Integer | PK 3. 1–6, the array position. |
| 10 | Start | Text[5] | HH:MM or blank. |
| 11 | Finish | Text[5] | HH:MM or blank. |
| 12 | Hours | Decimal (0:2) | 0–24. Hours-only capture. |
| 13 | Hours Given | Boolean | True when `hours` was sent (null and 0 differ, `mocks/timesheets.ts:133`). |
| 14 | Net Minutes | Integer | Node computes (`entryMinutes`). |
| 15 | Job No. | Code[20] | Resolved from `fields.project`. TableRelation `Job`; AL refuses unless `Job.Status` = Open. |
| 16 | Job Task No. | Code[20] | Resolved from `fields.job_task`. TableRelation `"Job Task"` where `Job No.` = field 15. |
| 17 | Work Site Code | Code[20] | Resolved from `fields.site`. TableRelation `"SIR Work Sites"`; AL refuses `Blocked` (`B/Table/Tab70702606.SIRWorkSites.al:65`). |
| 18 | Cost Centre Code | Code[20] | Resolved from `fields.cost_c`. Dimension value of `SIR_WF Setup."Cost Centre Dimension Code"`. |
| 19 | Department Code | Code[20] | Resolved from `fields.dept`. Dimension value of the department dimension. |

Keys: PK; `Job` (Job No., Job Task No.); `Site` (Work Site Code), both for in-use checks.

### 70703182 SIR_WF Timesheet Break

Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Date | Date | PK 2. |
| 3 | Entry Line No. | Integer | PK 3 → 70703181. |
| 4 | Line No. | Integer | PK 4. 1–5. |
| 10 | Start | Text[5] | HH:MM (may be blank while a break is half entered). |
| 11 | End | Text[5] | HH:MM or blank. |

### 70703183 SIR_WF TS Entry Field

`TimeEntry.fields`: every capture field the entry sends, by catalogue code, raw as sent (including the names behind 70703181 fields 15–19), so the read gives back exactly what was saved. Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Date | Date | PK 2. |
| 3 | Entry Line No. | Integer | PK 3 → 70703181. |
| 4 | Field Code | Text[30] | PK 4. Catalogue code (`travel`, `vehicle2`, `overtime`). |
| 10 | Is Boolean | Boolean | The value's type (`string ≤ 500` or `boolean`). |
| 11 | Text Value | Text[500] | |
| 12 | Boolean Value | Boolean | |

Keys: PK; `FieldCode` (Field Code).

### 70703184 SIR_WF TS Day Allowance

`TimesheetDay.allowances[]` (≤ 20). Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Date | Date | PK 2. |
| 3 | Line No. | Integer | PK 3. Array order. |
| 10 | Allowance Code | Code[20] | A 70703174 code or pay code. |

Keys: PK; `Allowance` (Allowance Code) for pay code `usedBy`.

### 70703185 SIR_WF Timesheet Day Log

Append-only: `TimesheetDay.history[]` (`TsHistory`). Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Entry No. | BigInteger | PK, AutoIncrement (R6). |
| 10 | Employee No. | Code[20] | |
| 11 | Date | Date | |
| 12 | From State | Enum 70703173 `SIR_WF TS State` | |
| 13 | To State | Enum 70703173 `SIR_WF TS State` | |
| 14 | By Employee No. | Code[20] | `by.employeeCode`. |
| 15 | At | DateTime | `CurrentDateTime`. |
| 16 | Reason | Text[500] | |
| 17 | Layer | Text[40] | Role signed as; blank except on approvals. |

Keys: PK; `Day` (Employee No., Date, Entry No.).

### 70703186 SIR_WF Clock Record

`ClockRecord`, one per employee per day. Changes from 01: `Late` dropped (not in the contract); `Is Open` added; `Written Breaks` as Text. Standard fields: 9900 (`clk_<employee>_<date>`), 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Date | Date | PK 2. Tenant-local day the clock started on. |
| 10 | Is Open | Boolean | True while running or on a break and not closed. |
| 11 | Closed Late Finish | Text[5] | `closedLate.finish`. |
| 12 | Closed Late At | DateTime | `closedLate.at`. |
| 13 | Has Written | Boolean | False means `written` is null. |
| 14 | Written Breaks | Text[250] | JSON `[{start,end}]`, at most 5 pairs. |
| 15 | Closed No Day Finish | Text[5] | `closedNoDay.finish`. |
| 16 | Closed No Day At | DateTime | `closedNoDay.at`. |

Keys: PK; `Open` (Employee No., Is Open, Date) for "a clock from an earlier day left open" and for the day save's `CLOCK_RUNNING` check.

### 70703187 SIR_WF Clock Event

Append-only. Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Date | Date | PK 2. |
| 3 | Seq | Integer | PK 3. 1, 2, 3 … per record (one writer per record). |
| 10 | Kind | Enum 70703175 `SIR_WF Clock Kind` | |
| 11 | At | DateTime | `CurrentDateTime` only, never from a caller. |

## 5. New tables: onboarding

### 70703188 SIR_WF Onboarding Config

The singleton that versions the shared setup (steps, document settings, default policy list). Saving any of them bumps this record's Version (contract If-Match "the config"). 01's `Steps` Blob is removed (B7): see 70703189; the default policy list is 70703196 with a blank `Template Id`. Standard fields: 9900, 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Primary Key | Code[10] | Blank. |

### 70703189 SIR_WF Onboarding Step

Replaces 01's config `Steps` Blob. Seeded with 7 rows; insert and delete refused (`FIXED`: steps are switched, never added). Standard fields: none (child of the config).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Step | Enum 70703181 `SIR_WF Onb. Step` | PK. |
| 10 | Label | Text[60] | |
| 11 | Description | Text[200] | |
| 12 | Fixed | Boolean | personal, contact, review. |
| 13 | On | Boolean | Default template's switch. |
| 14 | Sort Order | Integer | |

Keys: PK; `SortOrder`.

### 70703190 SIR_WF Onboarding Doc. Type

The shared document list, with the Default template's switches. Key changed from 01's `Code` Code[20] to `Id` Text[20] (GB-D25). Standard fields: none (the id is the contract id; versioned by the config).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Id | Text[20] | PK. Lower case (`rtw`, `addr`, `photo`, `licence`, `cert`, `dbs-check`). OnRename refuses. |
| 10 | Label | Text[60] | Domain refuses over 60 (`documentProblem`). |
| 11 | Required | Boolean | Default template's `req`. |
| 12 | Verifier | Enum 70703182 `SIR_WF Verifier` | hr, mgr, either, none. |
| 13 | Blocks Start | Boolean | Default template's `blocks`. |
| 14 | Has Expiry | Boolean | |
| 15 | Hint | Text[200] | |
| 16 | Sort Order | Integer | |
| 17 | On | Boolean | **New.** Default template asks for it. |
| 18 | Custom | Boolean | **New.** Added by this tenant: may be renamed and removed. Built-in rows refuse rename and delete (`built-in`). |

Keys: PK (Id); `SortOrder`. At most 20 rows. OnDelete: only `Custom`; refuses `in-use` with `usedBy` when any 70703199 row for it has a state other than todo, a file, or `Asked = true`; deletes its 70703195 rows.

### 70703191 SIR_WF Onboarding Policy

One policy a starter is asked to read and acknowledge. Standard fields: 9901 (the key is the contract id, up to 84 characters).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Id | Text[100] | PK. `pol_` + slug, at most 84 (`POLICY_ID_MAX`). Replaces Code[20]; 02 G11 withdrawn. |
| 10 | Label | Text[80] | Unique, case-insensitive (checked in AL). |
| 11 | Ver | Text[20] | The document's own version, `v1.0`. Upload bumps it. |
| 12 | Summary | Text[300] | |
| 13 | Body | Blob | Paragraphs, one per line. Seeded text; not editable through the contract. |
| 14 | Sort Order | Integer | |
| 15 | File Name | Text[255] | |
| 16 | File Size | Integer | Bytes, 8 MB max (`UPLOAD_MAX_BYTES`). |
| 17 | File Type | Text[120] | MIME type. |
| 18 | File At | DateTime | Server time. |
| 19 | File Storage Key | Text[250] | **New (P6).** Blob Storage path. |
| 20 | File Content Hash | Text[64] | **New.** SHA-256 hex. |
| 21 | File Scan State | Enum 70703185 `SIR_WF Scan State` | **New.** |

Keys: PK (Id); `SortOrder`. OnDelete deletes its 70703196 rows; 70703200 rows stay (past acknowledgements are kept).

### 70703192 SIR_WF Onboarding Template

A named set of switches for starters on its job profiles. Standard fields: 9901 (the key is the contract id, up to 68 characters).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Id | Text[80] | PK. `onbt-<slug>` (`onbTemplateId`, `src/domain/onboarding-templates.ts:83-89`). Lower case. |
| 10 | Name | Text[60] | Trimmed; unique case-insensitive; "Default" reserved (`onbTemplateNameProblem`). |

Keys: PK (Id). OnDelete deletes its 70703193–70703196 rows (its profiles fall back to Default).

### 70703193 SIR_WF Onb. Templ. Job Profile

Standard fields: none (children of the template, 70703193–70703196).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Template Id | Text[80] | PK 1. TableRelation 70703192. |
| 2 | Job Profile Code | Code[20] | PK 2. TableRelation 70703168 `SIR_WF Job Profile`. |

Keys: PK; `Profile` (Job Profile Code) **Unique = true**: one template per profile (`PROFILE_TAKEN`, `onboarding-templates.ts:118`). 70703158 `SIR_WF Usage Check` counts these rows when a job profile is deleted.

### 70703194 SIR_WF Onb. Template Step

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Template Id | Text[80] | PK 1. |
| 2 | Step | Enum 70703181 `SIR_WF Onb. Step` | PK 2. |
| 10 | On | Boolean | A fixed step is always on. |

Always 7 rows per template.

### 70703195 SIR_WF Onb. Template Document

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Template Id | Text[80] | PK 1. |
| 2 | Doc. Type Id | Text[20] | PK 2. TableRelation 70703190. |
| 10 | On | Boolean | |
| 11 | Required | Boolean | |
| 12 | Blocks Start | Boolean | |

A missing row reads as off (`normaliseTemplate`).

### 70703196 SIR_WF Onb. Template Policy

Which policies a template asks. **Blank `Template Id` = the Default template** (GB-D58).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Template Id | Text[80] | PK 1. Blank = Default. |
| 2 | Policy Id | Text[100] | PK 2. TableRelation 70703191. |

Keys: PK; `Policy` (Policy Id). At most 500 per template (`POLICY_LIST_MAX`). A new policy gets a Default row only.

### 70703197 SIR_WF Onboarding Case

One starter's onboarding. Steps, acknowledgements, read flags and the "asked" snapshot are child tables (70703198, 70703200, fields on 70703199). Standard fields: 9900 (`onb_<No.>`), 9901 (the If-Match of every case operation).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK. TableRelation `Employee`. |
| 13 | Data | Blob | JSON of `OnbDataRecord` (personal, contact, emergency, additional, documents). `DataClassification = EndUserIdentifiableInformation`. On no BC page; never in the audit; never on the `onboardingCases` page (GB-D57). |
| 14 | Signature | Text[120] | Typed name. |
| 15 | Consent | Boolean | |
| 16 | Submitted At | DateTime | |
| 17 | Ref | Code[20] | `ONB-1001`. Unique when not blank. |
| 18 | Invited At | DateTime | |
| 19 | Started At | DateTime | |
| 21 | Portal Invited At | DateTime | **New.** Contract `portalInvitedAt` (missed by 01/02). |
| 22 | Asked Recorded | Boolean | **New.** True once the submit has stored the "asked" snapshot. False = contract `asked` absent. |
| 23 | Country Data | Blob | **New.** JSON of the country starter section (GB: starter declaration, GB-Q1). EUII. Read only by the country subscriber at start. |

Keys: PK (Employee No.); `Ref`.

### 70703198 SIR_WF Onb. Case Step

Replaces 01's case `Steps` and `Asked.steps`. Standard fields: none (children of the case, 70703198–70703200).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Step | Enum 70703181 `SIR_WF Onb. Step` | PK 2. |
| 10 | State | Enum 70703183 `SIR_WF Task State` | |
| 11 | Asked | Boolean | In the asked snapshot at submit. |

### 70703199 SIR_WF Onboarding Document

One document on one case: its state, file metadata and the "asked" snapshot. P6: the file and its preview go to Azure Blob Storage (GB-D59).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Doc. Type Id | Text[20] | PK 2. No TableRelation: the type may be removed later only when unused. |
| 10 | State | Enum 70703183 `SIR_WF Task State` | todo, prog, done, verified, rejected. |
| 11 | File Name | Text[255] | |
| 12 | File Size | Integer | |
| 13 | File Type | Text[120] | |
| 14 | File Kind | Enum 70703184 `SIR_WF File Kind` | image, pdf, file. |
| 15 | File At | DateTime | |
| 17 | Rejection Reason | Text[300] | Cleared on replace. |
| 18 | Verified By | Code[20] | Employee No. Must not be the starter (`SELF_CHECK`). |
| 19 | Verified At | DateTime | **New.** |
| 20 | Storage Key | Text[250] | **New (P6).** |
| 21 | Preview Storage Key | Text[250] | **New (P6).** Replaces 01's `Preview` Blob. |
| 22 | Content Hash | Text[64] | **New.** SHA-256 hex. |
| 23 | Scan State | Enum 70703185 `SIR_WF Scan State` | **New.** Verify refuses unless clean. |
| 24 | Asked | Boolean | **New.** In the asked snapshot at submit. |
| 25 | Asked Required | Boolean | **New.** |
| 26 | Asked Blocks | Boolean | **New.** |

Keys: PK (Employee No., Doc. Type Id); `DocType` (Doc. Type Id) for the in-use check.

### 70703200 SIR_WF Onb. Case Policy

Replaces 01's `Policy Acks` and `Policies Read`.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK 1. |
| 2 | Policy Id | Text[100] | PK 2. No TableRelation (survives policy removal). |
| 10 | Acked Ver | Text[20] | The `ver` acknowledged; blank = not acknowledged. |
| 11 | Read | Boolean | Opened since the last upload. |
| 12 | Acked At | DateTime | |

Keys: PK; `Policy` (Policy Id, Acked Ver) for `ackCount`.

### 70703201 SIR_WF Onb. Starter Buffer (TableType = Temporary)

The typed start write-back, parsed from `Data` in memory and passed to the onboarding events. Never stored. Emergency contacts and qualifications are passed as `JsonArray` parameters.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Employee No. | Code[20] | PK. |
| 10 | Birth Date | Date | From `personal.dob`. |
| 11 | Gender | Enum `Employee Gender` | Mapped (doc 12 §5.4). |
| 12 | Gender Answer | Text[40] | As given. |
| 13 | Tax Number | Text[20] | `personal.ni`, trimmed, upper case. |
| 14 | Mobile Phone No. | Text[30] | |
| 15 | Phone No. | Text[30] | |
| 16 | Address | Text[200] | Full text; the writer cuts. |
| 17 | Address 2 | Text[200] | |
| 18 | City | Text[80] | |
| 19 | Post Code | Code[20] | |
| 20 | Signature | Text[120] | |
| 21 | Submitted At | DateTime | |
| 22 | Ref | Code[20] | |
| 23 | Has Country Data | Boolean | |

## 6. New tables: posting

Re-specifies 01 §6.7 for GB. Problem letters A–Q are in doc 10 §8. Nothing posting-related goes in Qnipay-GB.

### 70703202 SIR_WF Posting Batch

One per approval action: a single day's final approval, or one bulk approval. Standard fields: 9900 (`pb_<No.>`), 9901.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | No. | Code[20] | PK. From `SIR_WF Setup."Posting Batch Nos."` (No. Series). |
| 10 | Created At | DateTime | `CurrentDateTime`. |
| 11 | Created By | Code[20] | Acting approver's `Employee."No."` from the session. |
| 12 | Source | Enum 70703186 `SIR_WF Posting Source` | `timesheet` only in the first product. |
| 13 | Line Count | Integer | FlowField: count of 70703203 where `Batch No.` = `No.`. |
| 14 | Total Quantity | Decimal | FlowField: sum of `Quantity`. Hours and days mixed; display only. |
| 15 | Correlation Id | Guid | From the command (IC-15). |
| 16 | Audit Entry No. | BigInteger | The 70703159 `SIR_WF Audit Event` written by the approval. |

Keys: PK (No.); `CreatedAt` (Created At).

### 70703203 SIR_WF Posting Line

One per approved day, pay code and work site (GB-D63). The contract's `IntegrationAttempt`. Its `SystemId` is the posting idempotency key and is written to the interface row. Standard fields: 9900 (`ia_<Entry No.>`, the contract's `id`), 9901 (+1 on every modify, including dispatcher writes; `postingLines(id)/retry` compares it).

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Entry No. | BigInteger | PK, AutoIncrement. |
| 10 | Batch No. | Code[20] | TableRelation 70703202. |
| 11 | Source | Enum 70703186 `SIR_WF Posting Source` | `timesheet`. |
| 12 | Employee No. | Code[20] | TableRelation `Employee`. Becomes the interface `Payroll No.`. |
| 13 | Date | Date | The worked day. |
| 14 | — | — | Reserved (01: Date To, leave). |
| 15 | Pay Code | Code[20] | `SIR TIme Sheet Elements."External Field Mapping"` (`B/Table/Tab70702615.SIRTImeSheetElements.al:60`). Becomes `Interface Code`. |
| 16 | Work Site Code | Code[20] | TableRelation `SIR Work Sites`. Becomes `Site Code`. |
| 17 | Quantity | Decimal | `DecimalPlaces = 0:2`, > 0. In the element's unit (field 18). Becomes `No. Of Units`. |
| 18 | Unit | Enum 70703189 `SIR_WF Posting Unit` | Copied at approval from `SIR TIme Sheet Elements."Unit Of Measure"` (Option ` ,Hour,Day,Unit`, `Tab70702615:18-23`). |
| 19 | Start DateTime | DateTime | Day + first entry start. Becomes `Start Date`. |
| 20 | End DateTime | DateTime | Day + last entry finish. Becomes `End Date`. |
| 21 | — | — | Reserved (01: Leave Request Entry No.). |
| 22 | Timesheet Day Id | Guid | `SystemId` of the 70703180 `SIR_WF Timesheet Day`. |
| 23 | State | Enum 70703187 `SIR_WF Posting State` | queued, posted, failed, reconciled. |
| 24 | Attempt | Integer | Tries so far. |
| 25 | Last Error | Text[500] | Plain words. |
| 26 | Error Kind | Enum 70703188 `SIR_WF Posting Error Kind` | none, transient, data. |
| 27 | Target Entry No. | Integer | `SIR Timesheet Interface."Entry No."` at insert. Information only: archiving gives the row a new number (problem E). |
| 28 | Queued At | DateTime | Set at approval. |
| 29 | Posted At | DateTime | Interface row inserted. |
| 30 | Reconciled At | DateTime | Landed period found posted. |
| 31 | Description | Text[100] | Pay code label, date, `WORKFORCE`. Becomes `Classification`. |
| 32 | Error Code | Code[30] | The data error code (doc 12 §6.2), for example `PERIOD_POSTED`. |
| 33 | Next Attempt At | DateTime | Set to `Queued At` + `Posting Journal Delay (Min.)` at approval; pushed by the transient back-off (1, 5, 15, 60 minutes) and by the GB-D67 hold. |
| 34 | Pay Frequency | Code[10] | Resolved at dispatch from `Employee."SIR Pay Cycle Code"` (`B/Table Extensions/Tab-Ext70702579.SIREmployee.al:194`). |
| 35 | Fiscal Year | Code[10] | The `SIR Pay Period` row covering `Date` (`B/Table/Tab70702586.SIRPayPeriod.al:2`). |
| 36 | Pay Cycle Period | Integer | Same row, `Period`. |
| 37 | Pay Element | Code[20] | `SIR TIme Sheet Elements."Pay Element"` resolved at dispatch. Never a value. |
| 38 | Timesheet No. | Code[20] | `SIR Timesheet Header."No."` the row landed in. Stamped by 70703224 `SIR_WF Posting Landed`. |
| 39 | Landed Pay Frequency | Code[10] | From the timesheet line, same stamp. |
| 40 | Landed Fiscal Year | Code[10] | Same. |
| 41 | Landed Pay Cycle Period | Integer | Same. |
| 42 | Consumed At | DateTime | Same. |
| 43 | Reconcile Issue | Enum 70703190 `SIR_WF Reconcile Issue` | Set by the reconcile job. |
| 44 | Correlation Id | Guid | From the approval command; reused on retries. |

Keys: PK (Entry No.); `Dispatch` (State, Next Attempt At); `Batch` (Batch No.); `Day` (Timesheet Day Id); `EmpDate` (Employee No., Date); `Landed` (Timesheet No.); `PublicId` (Public Id, unique). The subscriber and reconcile find lines with `GetBySystemId`.

### 70703204 SIR_WF Posting Attempt

Append-only. One row per dispatcher try and per manual retry. Not exposed in the contract; read by support. Standard fields: none.

| No. | Field | Type | Notes |
|---|---|---|---|
| 1 | Entry No. | BigInteger | PK, AutoIncrement. |
| 10 | Posting Line Entry No. | BigInteger | TableRelation 70703203. |
| 11 | Attempt | Integer | The line's attempt number for this try. |
| 12 | At | DateTime | |
| 13 | Outcome | Enum 70703187 `SIR_WF Posting State` | posted, failed, or queued (transient, re-scheduled; or re-queued by a retry). |
| 14 | Error Code | Code[30] | |
| 15 | Message | Text[500] | |
| 16 | Duration (ms) | Integer | |
| 17 | Error Kind | Enum 70703188 `SIR_WF Posting Error Kind` | |
| 18 | Interface Entry No. | Integer | On a successful insert. |
| 19 | Retried By | Code[20] | Employee No. on a manual retry; blank for the dispatcher. |
| 20 | Correlation Id | Guid | |

Keys: PK (Entry No.); `Line` (Posting Line Entry No., Attempt).

## 7. Fields added to existing Base and GB objects

AL0334 decides the shape (GB-D7): fields go into Base's own tables, or into Base's existing extension of a standard table, or into a new `SIR_WF` table extension only where Base has none. `grep tableextension` over Qnipay-base finds nine: G/L Entry (70702575), Gen. Journal Line (70702576), Reversal Entry (70702577), Source Code Setup (70702578), Employee (70702579), Human Resources Setup (70702580), Base Calendar Change (70702581), Approval Entry (70702582), Employee Relative (70702583). None of Dimension Value, Job, Job Task, Employee Qualification or Document Attachment is among them, so new extensions are allowed. Keep this list of every `SIR_WF` field on a Base object: moving them to a separate app later needs a data move.

### 7.1 Employee: inside Base's existing `tableextension 70702579 "SIR Employee"`

`B/Table Extensions/Tab-Ext70702579.SIREmployee.al`. Fields in use today: 70702575–70702624. GB's own Employee extension uses GB's range (70702675–70702738, `G/Table Extensions/Tab-Ext70702675.SIRGBEmployee.al`), so 70703150 upwards is free on the table.

| No. | Field | Type | Slice (placeholder) | Notes |
|---|---|---|---|---|
| 70703150 | SIR_WF Version | Integer | people (WF+600) | Install sets 1 on existing rows. +1 in OnBeforeModify only when a contract-mapped field differs from the stored row (GB-D3). |
| 70703151 | SIR_WF State | Enum 70703164 `SIR_WF Employee State` | people (WF+601) | Install: Active → active, Inactive → suspended, Terminated → leaver. Changed only by `employees(id)/transition`. Drives base `Status` (GB-Q2). |
| 70703152 | SIR_WF Display Name | Text[100] | people (WF+602) | Name as typed. First/Middle/Last are written from it (02 §2.1). |
| 70703153 | SIR_WF Employee Type Code | Code[32] | people (WF+603) | TableRelation 70703169. On validate sets `SIR Employment Type` (70702621) from the type's category. |
| 70703154 | SIR_WF Job Profile Code | Code[20] | people (WF+604) | TableRelation 70703168. On validate copies the profile name to `Job Title` (first 30) (GB-D42). |
| 70703155 | SIR_WF Category | Enum 70703165 `SIR_WF Worker Category` | people (WF+605) | |
| 70703156 | SIR_WF Max Hours | Decimal | people (WF+606) | 0–80, DecimalPlaces 0:2. 0 = none set. Hours, not money. |
| 70703157 | SIR_WF Night Worker | Boolean | people (WF+607) | |
| 70703158 | SIR_WF CIS | Boolean | people (WF+608) | Neutral flag; no payroll effect (GB-D40). |
| 70703159 | SIR_WF User Type Code | Text[20] | foundation and people (WF+609) | B14 (GB-D24). TableRelation 70703154 `SIR_WF User Type`. Blank reads as employee. |
| 70703160 | SIR_WF Location Code | Code[20] | people (WF+610) | FlowField: `lookup("SIR Employee Sites"."Site Code" where("Employee Code" = field("No."), "Is Default Site" = const(true)))`. Read only; filterable for team scope (GB-D36). |

Keys added: `SIR_WF State`; `SIR_WF Type` (SIR_WF Employee Type Code); `SIR_WF Profile` (SIR_WF Job Profile Code). Reused, not added: `SIR Contracted Hours` 70702600, `SIR Preferred Bank Acc. Code` 70702607, `SIR Employment Type` 70702621.

### 7.2 Employee Relative: inside Base's existing `tableextension 70702583 "SIR Employee Relative"`

`B/Table Extensions/Tab-Ext70702583.SIREmployeeRelative.al`. Fields in use: 70702576–70702580.

| No. | Field | Type | Slice (placeholder) | Notes |
|---|---|---|---|---|
| 70703150 | SIR_WF Emergency Contact | Boolean | people (WF+620), onboarding (WF+n) | The first row with true is the contract's emergency contact. Same field in both slices. |
| 70703151 | SIR_WF Onboarding Ref. | Code[20] | onboarding (WF+n) | Traces rows written at start. |

Key added: (Employee No., SIR_WF Emergency Contact).

### 7.3 Base Calendar Change: inside Base's existing `tableextension 70702581 "SIR Base Calender Changes"`

`B/Table Extensions/Tab-Ext70702581.SIRBaseCanlenderChanges.al`. Field in use: 70702575 (`SIR Is Weekend`).

| No. | Field | Type | Notes |
|---|---|---|---|
| 70703150 | SIR_WF Holiday Name | Text[80] | Full bank holiday name (contract max 80). `Description` (Text[30]) gets the first 30 characters. |

### 7.4 SIR Feature Register (Base table 70702660): fields in the table

`B/Feature Management/Table/Tab70702660.SIRFeatureRegister.al`. Fields in use: 1–9. GB's extension (`G/Table Extensions/Tab-Ext70702830.SIRGBFeatureRegister.al`) uses GB's range.

| No. | Field | Type | Notes |
|---|---|---|---|
| 70703150 | SIR_WF Workforce | Boolean | True on the six Workforce rows; 70703153 `SIR_WF API Modules` filters on it. |
| 70703151 | SIR_WF Module Code | Code[10] | Contract code: CORE, TS, A, B, C, ON. Register IDs are `WF_CORE`, `WF_TS`, `WF_A`, `WF_B`, `WF_C`, `WF_ON`. |
| 70703152 | SIR_WF Parent Feature ID | Code[50] | WF_TS for A, B and C. |
| 70703153 | SIR_WF Locked | Boolean | WF_CORE: cannot be set to None (`LOCKED`). |
| 70703154 | SIR_WF Restore On Parent | Boolean | A, B, C: remembered on/off while TS is off (the contract's `restore`, without JSON). |
| 70703155 | SIR_WF Sort Order | Integer | |

Code changes in Base: register the six rows in `SIR Payroll Feature Mgt.RegisterFeatures()` (`B/Feature Management/Codeunit/Cod70702623.SIRPayrollFeatureMgt.al:28`); add a `case` branch for `WF_*` in `OnAfterUpdateFeatureAvailibility` (`:49`) that calls 70703154 `SIR_WF Module Mgt.OnModuleSwitched`. Workforce rows are never Non-Reversible, so the `Confirm` at `Tab70702660.SIRFeatureRegister.al:44` is never reached from the API (GB-D29).

### 7.5 SIR Notification Entry (Base table 70702657): fields in the table

`B/Table/Tab70702657.SIRNotificationEntry.al`. Fields in use: 1–15. One inbox for payslip and Workforce rows.

| No. | Field | Type | Notes |
|---|---|---|---|
| 70703150 | SIR_WF Area | Text[30] | Workforce, Timesheet, Onboarding; payroll for payslip rows (derived when blank). |
| 70703151 | SIR_WF Title | Text[100] | |
| 70703152 | SIR_WF Body | Text[2048] | Full body. `Message` (Text[250]) holds the first 250 characters for the payroll bell (GB-D30). |
| 70703153 | SIR_WF At | DateTime | Server time. `Created Date` and `Created Time` are also filled. |
| 70703154 | SIR_WF Event Code | Text[40] | TableRelation 70703164 `SIR_WF Notification Event`. |
| 70703155 | SIR_WF Channel | Enum 70703162 `SIR_WF Notif. Channel` | The channel the matrix gave. |
| 70703156 | SIR_WF Delivery | Enum 70703163 `SIR_WF Notif. Delivery` | Only In-app rows that were delivered reach the inbox. |
| 70703157 | SIR_WF Ref | Text[50] | The record the event is about. |

New key: (Employee No., SIR_WF At). Rows are written with `Notification Type = Workforce` and blank `Document No.`, so the payslip email (`B/Codeunit/Cod70702627.SIRPayslipEmailHelper.al:21`, filtered on Document No.) never picks them up.

### 7.6 SIR Notification Type (Base enum 70702594): value in the enum

`B/Enums/Enum70702594.SIRNotificationType.al:3-12` has values 0 (blank) and 1 (Payslip); Extensible = true.

| Value | Name | Notes |
|---|---|---|
| 70703150 | Workforce | Inside the enum (same app; an enum extension is not allowed). Numbered by the field rule so it stays movable (GB-D20). |

### 7.7 SIR Work Sites (Base table 70702606): fields in the table

`B/Table/Tab70702606.SIRWorkSites.al`. Fields in use: 1–3, 32–37.

| No. | Field | Type | Slice (placeholder) | Notes |
|---|---|---|---|---|
| 70703150 | SIR_WF Area | Text[80] | people (100) | Contract `area` (template max 80). |
| 70703151 | SIR_WF Version | Integer | people (9901) | Install sets 1. |

Reused: Code (1), Description (2) = `name`, Address (3), Site Manager (32) = `manager`, Blocked (37) = not `active`. Triggers added: OnRename refuses (`invalid`, field `code`); OnDelete calls 70703158 `SIR_WF Usage Check`. Department and cost centre are `Default Dimension` rows (Table ID 70702606) (GB-D33).

### 7.8 SIR TIme Sheet Elements (Base table 70702615): fields in the table

`B/Table/Tab70702615.SIRTImeSheetElements.al`. Fields in use: 1–6, 30. No Public Id: the timesheet slice's `SIR_WF Public Id` (9900) is dropped (GB-D3); the contract id is `pc_<Code>`, derived in Node.

| No. | Field | Type | Slice (placeholder) | Notes |
|---|---|---|---|---|
| 70703150 | SIR_WF Basis | Enum 70703180 `SIR_WF Pay Code Basis` | people, timesheet (100) | On validate sets `Unit Of Measure`: multiplier, hours → Hour; days → Day; units → Unit; flat → blank. |
| 70703151 | SIR_WF Value | Decimal | people, timesheet (101) | Multiplier or unit count, 0–99.99, DecimalPlaces 0:2. 0 for flat and units. Never money. |
| 70703152 | SIR_WF Work Type | Boolean | people, timesheet (102) | On validate sets `Field Type` Normal when true, Others when false, unless payroll set OT (GB-Q27). |
| 70703153 | SIR_WF Version | Integer | people, timesheet (9901) | Bumped only when a contract-mapped field changes. |

Keys added: `ExtMapping` (External Field Mapping); `PayElement` (Pay Element). OnInsert and OnModify refuse a duplicate External Field Mapping or Pay Element among rows with a non-blank External Field Mapping (`invalid`, field `code` or `element`). Workforce create sets `External Field Mapping` = `Code`. OnRename refuses. OnDelete calls 70703158 `SIR_WF Usage Check` (type allowances and rules, capture fields, timesheet days).

### 7.9 SIR Timesheet Interface (70702614) and SIR Posted Timesheet Interface (70702661): fields in the tables

`B/Table/Tab70702614.SIRTimesheetInterface.al` and `B/Table/Tab70702661.SIRPostedTimesheetInterface.al`. Fields in use: 1–18 on both.

Workforce change:

| No. | Field | Type | Notes |
|---|---|---|---|
| 70703150 | SIR_WF Posting Line Id | Guid | On **both** tables with the same number, so `TransferFields` in `ArchiveTimesheetInterface` (`B/Report/Rep70702584.SIRTimesheetCreation.al:494`) carries it into the archive (problem E). `SIR_WF Posting Line.SystemId`. `Editable = false`, `DataClassification = SystemMetadata`. Blank on imported and historical rows. |

Key `SIR_WF PostingLineId` on both tables: (SIR_WF Posting Line Id), **not unique** (problem D, GB-D62).

Base change for problem G (payroll owner, GB-Q22), ported from W1 fields 20–22 (`W1: SIRTimesheetInterface.Table.al:224-243`) with GB types. These are payroll's own fields, so they keep W1's numbers for parity (GB-D19). Same numbers on both tables.

| No. | Field | Type | Notes |
|---|---|---|---|
| 20 | Pay Frequency | Code[10] | TableRelation `SIR Pay Frequency` (Code[10]). |
| 21 | Fiscal Year | Code[10] | TableRelation `SIR Pay Fiscal Year."Fiscal Year"` where `Pay Frequency` = field 20 (as `Tab70702586:24`). |
| 22 | Pay Cycle Period | Integer | TableRelation `SIR Pay Period.Period` where `Pay Frequency` = 20, `Fiscal Year` = 21. |

Key on 70702614: `PeriodQueue` (Is Timesheet Created, Pay Frequency, Fiscal Year, Pay Cycle Period, Irregular). Report 70702584 then filters `CreateTSEmployees` (`:309-311`) and `ArchiveTimesheetInterface` (`:489`, `:501`) on the chosen period and `Irregular`, treating blank 20–22 as "any period" so existing imports keep working.

### 7.10 New Base table extensions

| Extension | Extends | Field | Type | Slice (placeholder) | Notes |
|---|---|---|---|---|---|
| 70703150 `SIR_WF Document Attachment` | Document Attachment (MS 1173) | 70703150 SIR_WF Show In Workforce | Boolean | foundation | Only these rows reach `/documents/mine`. HR attaches on the Employee card (Table ID 5200). |
| | | 70703151 SIR_WF Category | Text[50] | foundation | |
| | | 70703152 SIR_WF Owner | Text[50] | foundation | |
| | | 70703153 SIR_WF Source | Text[50] | foundation | |
| | | 70703154 SIR_WF Document Date | Date | foundation | Falls back to `Attached Date`. Contract id is `SystemId`. |
| 70703151 `SIR_WF Dimension Value` | Dimension Value (MS 349) | 70703150 SIR_WF Version | Integer | people (WF+630) | |
| | | 70703151 SIR_WF Manager No. | Code[20] | people (WF+631) | TableRelation Employee. Departments only. |
| 70703152 `SIR_WF Job` | Job (MS 167) | 70703150 SIR_WF Version | Integer | people (WF+632) | |
| | | 70703151 SIR_WF Client Name | Text[120] | people (WF+633) | `Bill-to Customer No.` not used. |
| | | 70703152 SIR_WF Budget Hours | Decimal | people (WF+634) | Hours. Contract sends text. |
| | | 70703153 SIR_WF Billable | Boolean | people (WF+635) | |
| | | 70703154 SIR_WF Work Site Code | Code[20] | people (WF+636) | TableRelation `SIR Work Sites` where Blocked = false. Key `SIR_WF Site`. |
| | | 70703155 SIR_WF Manager No. | Code[20] | people (WF+637) | TableRelation Employee. `Person Responsible` is a Resource and `Project Manager` a User Setup, so neither is used. |
| 70703153 `SIR_WF Job Task` | Job Task (MS 1001) | 70703150 SIR_WF Version | Integer | people (WF+638) | |
| | | 70703151 SIR_WF Task Group | Text[60] | people (WF+639) | |
| | | 70703152 SIR_WF Billable | Boolean | people (WF+640) | Task code `Job Task No.` generated `T0010`, `T0020`… by template apply. |
| 70703154 `SIR_WF Employee Qualification` | Employee Qualification (MS 5203) | 70703150 SIR_WF Onboarding Ref. | Code[20] | onboarding | Traces rows written at start. `Cost` is never written. |

Subscribers in 70703186 `SIR_WF People Subscribers`, not in the extensions: Dimension Value OnBeforeRename refuses for values of the two Workforce dimensions; OnBeforeDelete calls 70703158 `SIR_WF Usage Check`. Cost centre of a project is a `Default Dimension` row (Table ID 167).

### 7.11 Other existing Base objects changed

| Object | Change |
|---|---|
| Enum 70702578 `SIR Payroll Localization` (`B/Enums/Enum70702578…`) | Adds `implements "SIR_WF Employee Localization"` with `DefaultImplementation = "SIR_WF Employee Localization" = "SIR_WF Employee Loc. W1"` (70703185), so GB's value compiles before GB supplies its own. |
| Codeunit 70702623 `SIR Payroll Feature Mgt` | Registers the six `WF_*` rows; Workforce `case` branch (7.4). |
| Report 70702584 `SIR Timesheet Creation` | Payroll owner's changes for problems G, B and A (doc 10 §8). Workforce subscribes to its existing events `OnBeforeInsertTimeSheetLine` and `OnBeforeModifyTimeSheetLine` (`:261`, `:266`, `:517-525`). |
| Page 70702649 `SIR Timesheet Interface` | Optional column `SIR_WF Posting Line Id` for payroll (same app, edited in place, no page extension). |
| Permission sets 70702575 `SIR Full Setup`, 70702576 `SIR Full User`, 70702577 `SIR Full Read` | Add every new Base object; they list every Base object today. |

### 7.12 Qnipay-GB

| Object | Kind | Change |
|---|---|---|
| 70703097 `SIR_GB WF Subscribers` | codeunit (new) | Subscribes to `SIR_WF Tenant Mgt.OnGetFinancialYearLabel` (70703155) and returns `SIR_GB HMRC Tax Year Notation` (`G/Table Extensions/Tab-Ext70702686.SIRGBFiscalYear.al:5`) when it is filled. |
| 70703098 `SIR_GB WF Employee Loc.` | codeunit (new) | Implements `SIR_WF Employee Localization` for GB: address lines 3/4 (`SIR_GB Address Line 3/4`, 70702675/6), code and name character rules (as `G/Subscribers/Table Helpers/Cod70702733.SIRGBEmployeeHelpers.al`). No tax number method (GB-D21). |
| 70703099 `SIR_GB WF Onboarding CS` | codeunit (new) | Subscriber to the three onboarding events (§9.2). |
| 70703099 `SIR_GB WF Bank Hol. Region` | enumextension (new) | Extends 70703154 `SIR_WF Bank Holiday Region`: England & Wales, Scotland, Northern Ireland. |
| Enum-Ext70702675 `SIR_GB Payroll Localization` (`G/Enum Extensions/Enum-Ext70702675.SIRGBPayrollLocalization.al`) | existing enum extension | Its GB value adds `Implementation = "SIR_WF Employee Localization" = "SIR_GB WF Employee Loc."`. |
| Table 70702735 `SIR_GB Starter Checklist` (`G/Table/Tab70702735.SIRGBStarterChecklist.al`) | existing GB table | Field 300 `Onboarding Ref.` Code[20] and field 301 `Source` Option (Manual, Workforce); both free (fields in use run to 203). New `procedure ApplyToEmployee(var Employee: Record Employee)` holding lines 427–484 of `CreateEmployee`; `CreateEmployee` calls it and skips rows with `Employee No.` <> '' (GB-D55). |
| Page 70702825 `SIR_GB Notification API` | existing GB page | Optional `SourceTableView` filter `Notification Type = Payslip` so Workforce rows do not show twice (GB-Q11). |

## 8. New enums (Qnipay-base)

All are `Extensible = false` unless marked. Value names with a hyphen or space are quoted identifiers; captions follow the contract.

| ID | Enum | Values (ordinal name) | Notes |
|---|---|---|---|
| 70703150 | `SIR_WF Command Type` | See doc 13 §4.1: 48 values, each with `Implementation = "SIR_WF Command Handler" = <codeunit>` | Implements interface `SIR_WF Command Handler` (GB-D4). Extensible = false. |
| 70703151 | `SIR_WF Date Format` | 0 DMY ('dd/mm/yyyy'), 1 YMD ('yyyy-mm-dd'), 2 MDY ('mm/dd/yyyy') | |
| 70703152 | `SIR_WF Clock Style` | 0 H24 ('24h'), 1 H12 ('12h') | |
| 70703153 | `SIR_WF Weekday` | 0 Monday, 1 Tuesday, 2 Wednesday, 3 Thursday, 4 Friday, 5 Saturday, 6 Sunday | |
| 70703154 | `SIR_WF Bank Holiday Region` | 0 None | **Extensible.** GB adds EnglandWales, Scotland, NorthernIreland (70703099). |
| 70703155 | `SIR_WF Session End Reason` | 0 "signed-out", 1 "account-blocked", 2 "account-removed", 3 cleanup | |
| 70703156 | `SIR_WF Exception Mode` | 0 grant, 1 revoke | |
| 70703157 | `SIR_WF Audit Source` | 0 api, 1 "bc-client", 2 job, 3 install | |
| 70703158 | `SIR_WF Template Scope` | 0 config, 1 structure | |
| 70703159 | `SIR_WF Template Source` | 0 saved, 1 imported | |
| 70703160 | `SIR_WF Chain Module` | 0 Timesheet, 1 Profile | **Extensible** (Leave, Rota later). |
| 70703161 | `SIR_WF Approver Role` | 0 "Line manager", 1 "Service Manager", 2 Payroll, 3 "HR administrator", 4 "Business Central" | |
| 70703162 | `SIR_WF Notif. Channel` | 0 Off, 1 "In-app", 2 Email, 3 "In-app + email", 4 "In-app + email + SMS" | |
| 70703163 | `SIR_WF Notif. Delivery` | 0 delivered, 1 "not-connected" | |
| 70703164 | `SIR_WF Employee State` | 0 candidate, 1 preboard, 2 active, 3 suspended, 4 onleave, 5 leaver, 6 archived | `src/contract/employees.ts:5`. |
| 70703165 | `SIR_WF Worker Category` | 0 Contracted, 1 Bank, 2 Agency, 3 Salaried | `employee-types.ts:6`. |
| 70703166 | `SIR_WF Entry Mode` | 0 form, 1 grid, 2 clock | `employee-types.ts:7`. |
| 70703167 | `SIR_WF Pay Basis` | 0 hour, 1 day | Employee type `uom`. Not the pay code basis. |
| 70703168 | `SIR_WF Self Field` | 0 phone, 1 address, 2 emergencyFirstName, 3 emergencyLastName, 4 emergencyPhone, 5 bankAccount, 6 bankSortCode | `profile.ts:6`. |
| 70703169 | `SIR_WF Change Status` | 0 pending, 1 approved, 2 declined | |
| 70703170 | `SIR_WF Change Stage` | 0 manager, 1 payroll, 2 done | |
| 70703171 | `SIR_WF Decision` | 0 approve, 1 decline | |
| 70703172 | `SIR_WF History Source` | 0 created, 1 edited, 2 transition, 3 "profile-change" | |
| 70703173 | `SIR_WF TS State` | 0 draft, 1 pend, 2 back, 3 resub, 4 ok, 5 mgrok | Same names as the contract. |
| 70703174 | `SIR_WF Capture Source` | 0 self, 1 proxy, 2 clock | |
| 70703175 | `SIR_WF Clock Kind` | 0 in, 1 breakStart, 2 breakEnd, 3 out | |
| 70703176 | `SIR_WF Time Format` | 0 HHMM ('HH:MM'), 1 HM ('h m') | Node maps to the contract strings. |
| 70703177 | `SIR_WF Week Grid` | 0 hours, 1 times | |
| 70703178 | `SIR_WF Week Layout` | 0 classic, 1 grid, 2 days | |
| 70703179 | `SIR_WF Cutoff Day` | 0 Sunday, 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday | `CUTOFF_PATTERN`, `domain/timesheet.ts:536`. |
| 70703180 | `SIR_WF Pay Code Basis` | 0 " " (none), 1 multiplier, 2 flat, 3 hours, 4 days, 5 units | `PAY_CODE_BASES`, `domain/pay-codes.ts:11`. Blank only for an allowance with no basis. |
| 70703181 | `SIR_WF Onb. Step` | 0 personal, 1 contact, 2 emergency, 3 additional, 4 documents, 5 policies, 6 review | `OnbStepId`. |
| 70703182 | `SIR_WF Verifier` | 0 hr, 1 mgr, 2 either, 3 none | |
| 70703183 | `SIR_WF Task State` | 0 todo, 1 prog, 2 done, 3 verified, 4 rejected | |
| 70703184 | `SIR_WF File Kind` | 0 image, 1 pdf, 2 file | |
| 70703185 | `SIR_WF Scan State` | 0 pending, 1 clean, 2 infected, 3 failed | |
| 70703186 | `SIR_WF Posting Source` | 0 timesheet, 1 leave (reserved) | |
| 70703187 | `SIR_WF Posting State` | 0 none, 1 queued, 2 posted, 3 failed, 4 reconciled | `none` is used only by `SIR_WF Timesheet Day."Posting State"`. The contract shows `reconciled` as `posted`. |
| 70703188 | `SIR_WF Posting Error Kind` | 0 none, 1 transient, 2 data | |
| 70703189 | `SIR_WF Posting Unit` | 0 flat, 1 hour, 2 day, 3 unit | Ordinals match the element's `Unit Of Measure` option (` ,Hour,Day,Unit`), so `Unit := Enum::"SIR_WF Posting Unit".FromInteger(Element."Unit Of Measure")`. |
| 70703190 | `SIR_WF Reconcile Issue` | 0 none, 1 missing, 2 "wrong-period", 3 late, 4 reopened | |

Interfaces (no object IDs in AL):

| Interface | Methods | Implemented by |
|---|---|---|
| `SIR_WF Command Handler` | `Run(var Command: Record "SIR_WF Command" temporary)`; `NeedsIdempotencyKey(): Boolean`; `AllowedWhileViewingAs(): Boolean`; `AllowedWhileOnboarding(): Boolean` | One codeunit per value of 70703150 `SIR_WF Command Type` (doc 13 §4.1). |
| `SIR_WF Employee Localization` | `SplitAddress`, `JoinAddress`, `CheckEmployeeCode`, `CheckName` | 70703185 `SIR_WF Employee Loc. W1` (default); 70703098 `SIR_GB WF Employee Loc.` (GB). The people slice's `ApplyTaxNumber` moves to the onboarding events (GB-D21). |

## 9. Events and subscribers

### 9.1 Events published by Qnipay-base

| Publisher | Event | Raised by | Subscribers |
|---|---|---|---|
| 70703155 `SIR_WF Tenant Mgt` | `OnGetFinancialYearLabel(FiscalYear: Record "SIR Fiscal Year"; var Label: Text; var IsHandled: Boolean)` | The `workforceSetup` page building `financialYear.label` | 70703097 `SIR_GB WF Subscribers` (HMRC notation). Base default: the Fiscal Year code. |
| 70703154 `SIR_WF Module Mgt` | `OnAfterModuleSwitched(ModuleCode: Code[10]; Enabled: Boolean)` (optional integration event) | The Workforce branch of `OnAfterUpdateFeatureAvailibility` | None yet; lets GB react. |
| 70703201 `SIR_WF Onboarding Events` | `OnValidateTaxNumber(EmployeeNo: Code[20]; TaxNumber: Text[20]; var ErrorText: Text; var IsHandled: Boolean)` | `onboardingCases(id)/saveStep`, step personal, mode check. ErrorText <> '' refuses `invalid`, field `personal.ni`. | 70703099 `SIR_GB WF Onboarding CS` |
| 70703201 `SIR_WF Onboarding Events` | `OnBeforeStartStarter(EmployeeNo: Code[20]; CountryData: JsonObject; var ErrorText: Text; var ErrorField: Text)` | First in the start (`onboardingCases(id)/caseAction`, action start), before any write. | 70703099 |
| 70703201 `SIR_WF Onboarding Events` | `OnApplyStarterData(var Employee: Record Employee; var StarterBuffer: Record "SIR_WF Onb. Starter Buffer" temporary; CountryData: JsonObject; var TaxNumberHandled: Boolean)` | After Base has written Employee, Relatives and Qualifications, before `Employee.Modify(true)`. If no subscriber sets TaxNumberHandled, Base writes the tax number to `Employee."Social Security No."` (Text[30]). | 70703099 |

Start order in 70703202 `SIR_WF Onboarding Start`, one transaction (GB-D60): `OnBeforeStartStarter` → write `Employee` fields → insert `Employee Relative` rows (`SIR_WF Emergency Contact = true`) → insert `Employee Qualification` rows → `OnApplyStarterData` → `Employee.Modify(true)` → case `Started At` → person state `active` + history → 70703159 `SIR_WF Audit Event` (state change and `startedAt` only; no answers).

### 9.2 GB subscriber 70703099 SIR_GB WF Onboarding CS

**OnValidateTaxNumber.** Checks the format with the logic of `SIR_GB_Test2` (`G/Table Extensions/Tab-Ext70702675.SIRGBEmployee.al:913-946`), moved into a non-erroring `IsValidNINO(Text): Boolean`; then checks no active employee other than this one holds it, as `G/Table/Tab70702735.SIRGBStarterChecklist.al:399-406` does. Sets `IsHandled`.

**OnBeforeStartStarter.** Same NINO checks. If CountryData is present, requires `PayrollSetup."SIR_GB Starter Nos."` (`G/Table Extensions/Tab-Ext70702676.SIRGBPayrollSetup.al:192`), because checklist `InitInsert` does `TestField` on it (`Tab70702735:369-372`). Checks the answer combination is one `ApplyToEmployee` handles.

**OnApplyStarterData.**

1. `Employee.Validate("SIR_GB NINO", StarterBuffer."Tax Number")` (`Tab-Ext70702675:27`); `TaxNumberHandled := true`.
2. Overflow address: if `a2` is longer than 50, the rest goes in `SIR_GB Address Line 3` (Text[50], `:6`).
3. If CountryData is present, inserts `SIR_GB Starter Checklist`:

| Checklist field (no.) | Value |
|---|---|
| First Names (10), Middle Names (11), Last Name (15) | `Employee` First/Middle/Last Name, validated (recalculates Full Name) |
| Gender (18) | Male/Female from `Employee.Gender`, else blank |
| Date of Birth (17) | `StarterBuffer."Birth Date"` |
| Home Address (20), Home Address 2 (21), Home Address 3 (22) | `Address`, `Address 2`, `City` (the order `CreateEmployee` reads back, `:415-419`) |
| Post Code (26), Country (25) | `Employee."Post Code"`, `."Country/Region Code"` |
| National Insurance Number (30) | Tax number (Code[15]) |
| Employment Start Date (31) | `Employee."Employment Date"` |
| E-mail (100) | `Employee."E-Mail"` |
| Tax Area Code (203) | `Employee."SIR Tax Area Code"` (`B/Table Extensions/Tab-Ext70702579.SIREmployee.al:227`) |
| Employee Statements (39), Another Job (41), State or Private Pension (42), Received Payments Since (43), Student or Postgraduate Loan (44), Still Studying or Completed (45), Student Loan Plan (46), Postgraduate Loan (47) | From CountryData (doc 12 §5.3) |
| Full Name (53) | `StarterBuffer.Signature`, cut to 100, assigned **after** the names (commit c9338bd made it a free field) (GB-D56) |
| Declaration Date (52) | `DT2Date(StarterBuffer."Submitted At")` |
| Employee No. (201), Employee Created (200), Status (202) | Employee No., true, Released |
| Onboarding Ref. (300), Source (301) | `StarterBuffer.Ref`, Workforce |

   Then `StarterChecklist.ApplyToEmployee(Employee)`: sets `SIR_GB HMRC Tax Code`, `Tax Code Basis`, `Employee Setting Basis`, `Starting Declaration`, `Deduct Student loan` / `Deduct Postgrad. loan`, and inserts `SIR_GB Student Loan Detail` rows (`G/Table/Tab70702685.SIRGBStudentLoanDetail.al`).
4. If CountryData is absent: `Employee.Validate("SIR_GB Employee Setting Basis", "No Starter Checklist")`, which sets Starting Declaration "they have another job or pension" (`Tab-Ext70702675:188-190`). The tax code is left to payroll (GB-D61).

Risks in reused GB logic, not changed by this design: `ApplyToEmployee` sets nothing for some answer combinations (statement C only when another job or pension is Yes, `Tab70702735:427-428`; B only when payments since 6 April is Yes, `:438-439`; A only when it is No, `:453-454`); student loan `Plan Code` is filled from `SIR Payroll Element.Code` (`GetStLoanPlanCode`, `:510-531`) but relates to `SIR_GB Student Loan.Code` (`Tab70702685:18`) and is assigned without validation (GB-Q34); attachments on table 70702735 are probably saved without `No.` because GB has no subscriber to `OnAfterTableHasNumberFieldPrimaryKey` (MS `DocumentAttachmentMgmt.Codeunit.al:355-395`), unrelated to onboarding.

### 9.3 Workforce subscribers in Qnipay-base

| Subscriber | Subscribes to | Does |
|---|---|---|
| 70703156 `SIR_WF Tenant Subscribers` | OnAfterModify/Insert/Delete of `Company Information`, `Base Calendar Change` (timesheet calendar rows), `SIR Fiscal Year` (Active), 70703151 `SIR_WF Feature Flag`, `SIR Feature Register` (Workforce rows) | Bumps `SIR_WF Setup.Version`, so a change in the BC client also makes React's If-Match stale (GB-D28). Writes an audit row with Source bc-client when not called from the API. |
| 70703186 `SIR_WF People Subscribers` | `Employee` OnAfterModify; `Employee` OnBeforeModify; `SIR Work Sites`, `Dimension Value`, `Job`, `Job Task`, `SIR TIme Sheet Elements` OnBeforeModify; `Dimension Value` OnBeforeRename/OnBeforeDelete | History rows for BC-client edits; `SIR_WF Version` bump on contract-mapped fields only; rename and delete guards. |
| 70703224 `SIR_WF Posting Landed` | Report 70702584 `OnBeforeInsertTimeSheetLine`, `OnBeforeModifyTimeSheetLine` (`Rep70702584:261`, `:266`, `:517-525`) | Stamps the posting line with where it landed (doc 12 §6.4). `InherentPermissions` (RM) on 70703203, so payroll users need no Workforce permission set. Never raises an error. |

## 10. Trial subset

The throwaway trial comes first (GB-D23). It proves three things: the week read meets its latency target (O3) with `$expand=entries($expand=breaks)`; a command on the generic `commands` page commits a day, its children and the week's aggregate version in one transaction (R2, R7); and a bound action with parameters runs under service-to-service sign-in, as GB already does at `G/API Pages/Pag70702818.SIRGBPayslipAPI.al:108-117`.

| Object | ID | What the trial needs |
|---|---|---|
| Table `SIR_WF Timesheet Week` | 70703179 | Fields 1, 2, 10, 11, 9901. |
| Table `SIR_WF Timesheet Day` | 70703180 | Fields 1, 2, 3, 10, 11, 14, 15, 16, 19, 20, 22, 9900, 9901; keys PK and `PublicId`. |
| Table `SIR_WF Timesheet Entry` | 70703181 | Fields 1–14 and 17. |
| Table `SIR_WF Timesheet Break` | 70703182 | All. |
| Table `SIR_WF Command` (temporary) | 70703166 | All. |
| Enum `SIR_WF TS State`, `SIR_WF Capture Source` | 70703173, 70703174 | All values. |
| Enum `SIR_WF Command Type` | 70703150 | Values `timesheetDaySaves` (300) and `timesheetDayTransition` (320) only. |
| Interface `SIR_WF Command Handler` | — | As §8. |
| Codeunits `SIR_WF Command Dispatcher`, `SIR_WF Public Id`, `SIR_WF Timesheet Mgt`, `SIR_WF Cmd TS Day Save`, `SIR_WF Cmd TS Day Transition` | 70703150, 70703152, 70703190, 70703194, 70703196 | The dispatcher with the refusal format and version checks; no audit, no idempotency, no session table (a stub resolves `sessionId` to a fixed test employee). The transition handler is a minimal state change with a version check, to prove the bound action. |
| Pages | 70703150, 70703190–70703193 | See doc 13 §10. |
| Permission set `SIR_WF Connector` | 70703150 | Only the trial objects. |

Left out of the trial: 70703172–70703178 (config), 70703183–70703185 (entry fields, day allowances, log), clocking, the queue keys and query, the session, audit and idempotency tables.
