/* The work pattern record: what somebody is. Which timesheet fields a type
   captures belongs to Timesheet setup. */
import { z } from 'zod';
import { defineEndpoint } from './endpoints';
import { RecordMeta, mutation } from './common';

export const EmploymentType = z.enum(['Contracted', 'Bank', 'Agency', 'Salaried']);
export const EntryMode = z.enum(['form', 'grid', 'clock']);
export const PayBasis = z.enum(['hour', 'day']);
export const PatternFieldGroup = z.enum(['vehicle', 'site', 'project', 'shift']);
export const WorkPattern = RecordMeta.extend({ code: z.string(), name: z.string(), employmentType: EmploymentType, mode: EntryMode,
  uom: PayBasis, fieldGroups: z.array(PatternFieldGroup) });
export type WorkPattern = z.infer<typeof WorkPattern>;
export const WorkPatternRow = WorkPattern.extend({ inUse: z.number().int().nonnegative() });
export type WorkPatternRow = z.infer<typeof WorkPatternRow>;
const META = { id: true, version: true, updatedAt: true } as const;
export const CreateWorkPattern = WorkPattern.omit(META).extend({ startedFrom: z.string() });
export type CreateWorkPattern = z.infer<typeof CreateWorkPattern>;
/* The code is immutable, so an edit that carries one is refused naming it. */
export const UpdateWorkPattern = WorkPattern.omit({ ...META, code: true }).partial().extend({
  code: z.never({ error: 'A type code cannot change once it exists. Existing records reference it.' }).optional(),
});
export type UpdateWorkPattern = z.infer<typeof UpdateWorkPattern>;
export const Archetype = z.object({ key: z.string(), name: z.string(), mode: EntryMode, uom: PayBasis, fieldGroups: z.array(PatternFieldGroup) });
export type Archetype = z.infer<typeof Archetype>;
export const PatternLibrary = z.object({ archetypes: z.array(Archetype),
  fieldGroups: z.array(z.object({ code: PatternFieldGroup, label: z.string(), desc: z.string() })) });
export type PatternLibrary = z.infer<typeof PatternLibrary>;

const cap = 'type_cfg';
const TypeParams = z.object({ id: z.string().min(1) });
export const listWorkPatterns = defineEndpoint({ method: 'GET', path: '/api/v1/work-patterns', response: z.array(WorkPatternRow),
  summary: 'Work patterns, each with how many employees hold it' });
export const getTypeLibrary = defineEndpoint({ method: 'GET', path: '/api/v1/work-patterns/library', response: PatternLibrary, capability: cap,
  summary: 'The archetypes a new type can start from, and the capabilities a type can have' });
export const createWorkPattern = defineEndpoint({ method: 'POST', path: '/api/v1/work-patterns', request: CreateWorkPattern,
  response: mutation(WorkPattern), capability: cap, summary: 'Create a work pattern. The code is unique.' });
export const updateWorkPattern = defineEndpoint({ method: 'PATCH', path: '/api/v1/work-patterns/:id', params: TypeParams, request: UpdateWorkPattern,
  response: z.object({ record: WorkPattern, auditId: z.string().nullable(), changed: z.array(z.string()) }), capability: cap, versioned: true, errors: [404],
  summary: 'Edit a work pattern (If-Match). The code is immutable.' });
export const removeWorkPattern = defineEndpoint({ method: 'DELETE', path: '/api/v1/work-patterns/:id', params: TypeParams, response: z.object({ auditId: z.string() }),
  capability: cap, versioned: true, errors: [404, 409], summary: 'Remove a work pattern nobody holds (If-Match). 409 with usedBy otherwise.' });
