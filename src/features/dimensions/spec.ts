/* Ported from the prototype's DIMS and DIM_GROUPS
   (qnipay-workforce-v15.html:9110-9227, IMP-019): one form renderer and one
   save path for every dimension, so no dimension behaves differently from
   another. */
import type { DimensionKind, DimensionRow } from '@/contract/dimensions';

export interface DimCtx { departments: DimensionRow[]; costCentres: DimensionRow[]; locations: DimensionRow[] }
export interface DimField {
  key: string; label: string; kind: 'text' | 'number' | 'bool' | 'select' | 'date';
  required?: boolean; code?: boolean; optional?: boolean; hint?: string; wide?: boolean;
  options?: (ctx: DimCtx) => { value: string; label: string }[];
}
export interface DimSpec { kind: DimensionKind; label: string; singular: string; desc: string; usedAs: string; icon: string; fields: DimField[] }
const rows = (list: DimensionRow[], withCode = false) => list.map(r => ({ value: r.code, label: withCode ? `${r.code} · ${r.name}` : r.name }));

export const DIM_SPECS: Record<DimensionKind, DimSpec> = {
  locations: { kind: 'locations', label: 'Sites', singular: 'site', icon: 'building', usedAs: 'the employees and projects at each site',
    desc: 'Where the work happens.',
    fields: [
      { key: 'code', label: 'Code', kind: 'text', required: true, code: true, hint: 'Short and stable. Timesheets reference it.' },
      { key: 'name', label: 'Site name', kind: 'text', required: true },
      { key: 'area', label: 'Area', kind: 'text' },
      { key: 'department', label: 'Department', kind: 'select', optional: true, options: c => rows(c.departments) },
      { key: 'costCentre', label: 'Cost centre', kind: 'select', optional: true, options: c => rows(c.costCentres, true) },
      { key: 'manager', label: 'Manager', kind: 'text' },
      { key: 'address', label: 'Address', kind: 'text', wide: true },
    ] },
  departments: { kind: 'departments', label: 'Departments', singular: 'department', icon: 'shield', usedAs: 'the sites and employees in each department',
    desc: 'Who owns the work. Approval scope and manager visibility follow it.',
    fields: [
      { key: 'code', label: 'Code', kind: 'text', required: true, code: true },
      { key: 'name', label: 'Department name', kind: 'text', required: true },
      { key: 'manager', label: 'Manager', kind: 'text' },
    ] },
  'cost-centres': { kind: 'cost-centres', label: 'Cost centres', singular: 'cost centre', icon: 'money', usedAs: 'the sites and projects costed to each one',
    desc: 'What the work is costed to, and what crosses to Business Central.',
    fields: [
      { key: 'code', label: 'Code', kind: 'text', required: true, code: true, hint: 'Business Central matches on this.' },
      { key: 'name', label: 'Cost centre name', kind: 'text', required: true },
    ] },
  'positions': { kind: 'positions', label: 'Positions', singular: 'position', icon: 'users', usedAs: 'the employees holding each profile',
    desc: 'The canonical role list. Timesheet reports on it, approval scope follows it.',
    fields: [
      { key: 'code', label: 'Code', kind: 'text', required: true, code: true },
      { key: 'name', label: 'Position', kind: 'text', required: true },
      { key: 'night', label: 'Night-capable', kind: 'bool', hint: 'Only night-capable profiles are offered a night shift.' },
    ] },
  projects: { kind: 'projects', label: 'Projects', singular: 'project', icon: 'folder', usedAs: 'timesheet lines, which arrive with the Timesheet module',
    desc: 'What the time is charged to. Appears on every timesheet line that captures allocation.',
    fields: [
      { key: 'code', label: 'Project code', kind: 'text', required: true, code: true },
      { key: 'name', label: 'Project name', kind: 'text', required: true },
      { key: 'client', label: 'Client', kind: 'text' },
      { key: 'costCentre', label: 'Cost centre', kind: 'select', optional: true, options: c => rows(c.costCentres, true) },
      { key: 'manager', label: 'Project manager', kind: 'text' },
      { key: 'status', label: 'Status', kind: 'select', options: () => ['Active', 'Open', 'Always open', 'Closed'].map(s => ({ value: s, label: s })) },
      { key: 'start', label: 'Starts', kind: 'date' },
      { key: 'end', label: 'Ends', kind: 'date' },
      { key: 'budgetHours', label: 'Budget (hours)', kind: 'text' },
      { key: 'billable', label: 'Billable', kind: 'bool' },
      { key: 'location', label: 'Site', kind: 'select', optional: true, options: c => rows(c.locations) },
    ] },
};
/* The prototype's grouping: three questions, in the order a reader asks them. */
/* Master data (user ruling 2026-10-27): three kinds of thing, not one list of
   five dimensions. Sites, departments and cost centres are the dimensions
   Business Central analyses a posted line by; a position is a job title on
   the employee; a project is what time is charged to, with its own tasks. */
export const DIM_GROUPS: { key: string; label: string; note: string; kinds: DimensionKind[] }[] = [
  { key: 'dimensions', label: 'Dimensions', note: 'What Business Central analyses every posted line by. Manager scope follows sites and departments.', kinds: ['locations', 'departments', 'cost-centres'] },
  { key: 'positions', label: 'Positions', note: 'The job titles employees hold. Timesheet reports on them; they are not a ledger dimension.', kinds: ['positions'] },
  { key: 'projects', label: 'Projects', note: 'What time is charged to. Each project has its own tasks, as a Business Central job has job tasks.', kinds: ['projects'] },
];
