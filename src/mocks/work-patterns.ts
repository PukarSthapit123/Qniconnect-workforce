import { store } from './store';
import { bump, refuse } from './http';
import { serve } from './serve';
import { actor } from './auth';
import { writeAudit } from './audit';
import { invalid } from './employees';
import { recordAt, usageWorld } from './world';
import meta from './seed/meta.json';
import {
  listWorkPatterns, getTypeLibrary, createWorkPattern, updateWorkPattern, removeWorkPattern,
  type WorkPattern, type PatternLibrary,
} from '@/contract/work-patterns';
import { typeCodeProblem } from '@/domain/codes';
import { inUseRefusal, totalUses, usageOf } from '@/domain/usage';
import { diffFields } from '@/domain/history';

const types = () => store.coll<WorkPattern>('workPatterns');
const byId = (id: string) => recordAt(types(), id) ?? refuse(404, { code: 'not-found', message: 'That work pattern no longer exists.', next: 'Reload the page.' });
const FIELDS = ['name', 'employmentType', 'mode', 'uom', 'fieldGroups'] as const;
const body = (t: WorkPattern) => ({ code: t.code, name: t.name, employmentType: t.employmentType, mode: t.mode, uom: t.uom, fieldGroups: t.fieldGroups });
/* serve() checks the response against the contract, so the seed's JSON types need not match exactly */
const LIBRARY = { archetypes: meta.typeArchetypes, fieldGroups: meta.patternFieldGroups } as PatternLibrary;

export const workPatternHandlers = [
  /* before /work-patterns/:id, so MSW matches it first */
  serve(getTypeLibrary, () => LIBRARY),
  serve(listWorkPatterns, () => {
    const w = usageWorld();
    return Object.values(types()).sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({ ...t, inUse: totalUses(usageOf('work-patterns', t.code, w)) }));
  }),
  serve(createWorkPattern, ({ session, body: { startedFrom, ...b } }) => {
    const code = b.code.trim();
    const problem = (b.name.trim() ? null : { field: 'name', message: 'A name is required.' })
      ?? typeCodeProblem(code, Object.values(types()).map(t => t.code));
    if (problem) return invalid(problem);
    const rec: WorkPattern = { ...b, code, name: b.name.trim(), id: `typ_${code}`, version: 1, updatedAt: store.now() };
    types()[rec.id] = rec;
    const auditId = writeAudit({ who: actor(session), act: 'Work pattern created', entity: 'workPattern', entityId: code, before: null,
      after: { ...body(rec), startedFrom } });
    return { record: rec, auditId };
  }),
  serve(updateWorkPattern, ({ session, params, body: patch, checkVersion }) => {
    const t = byId(params.id);
    checkVersion(t);
    if (patch.name !== undefined) {
      if (!patch.name.trim()) return invalid({ field: 'name', message: 'A name is required.' });
      patch.name = patch.name.trim();
    }
    const changes = diffFields(t, { ...t, ...patch }, FIELDS);
    if (!changes.length) return { record: t, auditId: null, changed: [] };
    const saved = bump(t, patch);
    types()[t.id] = saved;
    const auditId = writeAudit({ who: actor(session), act: 'Work pattern edited', entity: 'workPattern', entityId: t.code,
      before: Object.fromEntries(changes.map(c => [c.field, c.from])), after: Object.fromEntries(changes.map(c => [c.field, c.to])) });
    return { record: saved, auditId, changed: changes.map(c => c.field) };
  }),
  serve(removeWorkPattern, ({ session, params, checkVersion }) => {
    const t = byId(params.id);
    checkVersion(t);
    /* D12: employees are never moved to another type behind anyone's back */
    const usedBy = usageOf('work-patterns', t.code, usageWorld());
    if (usedBy.length) return refuse(409, { code: 'in-use', ...inUseRefusal(t.code, usedBy), usedBy });
    if (Object.keys(types()).length < 2)
      return refuse(409, { code: 'last-type', message: 'A tenant needs at least one work pattern.', next: 'Create another type before removing this one.' });
    Reflect.deleteProperty(types(), t.id);
    const auditId = writeAudit({ who: actor(session), act: 'Work pattern removed', entity: 'workPattern', entityId: t.code, before: body(t), after: null });
    return { auditId };
  }),
];
