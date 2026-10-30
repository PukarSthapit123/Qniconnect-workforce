/* Reference data every employees screen shows by name: the dimensions and the work patterns. */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { DIMENSIONS, type DimensionKind, type DimensionRow } from '@/contract/dimensions';
import { listWorkPatterns } from '@/contract/work-patterns';
import { listPayGrades, listPayLevels } from '@/contract/pay-grades';
import { managerName } from '@/domain/manager';
import { useEmployees } from './employees';

export type InUseRow = DimensionRow & { inUse: number };
export const dimensionKey = (kind: DimensionKind) => ['dims', kind] as const;
export const typesKey = ['work-patterns'] as const;
export const useDimension = (kind: DimensionKind) =>
  useQuery({ queryKey: dimensionKey(kind), queryFn: async (): Promise<InUseRow[]> => (await api(DIMENSIONS[kind].api.list)) as InUseRow[] });
export const useWorkPatterns = () => useQuery({ queryKey: typesKey, queryFn: () => api(listWorkPatterns) });

/* Each lookup turns a code into its display name, the code itself when it
   is not (or not yet) known, and a dash when there is none. */
export function useNames() {
  const loc = useDimension('locations'), dep = useDimension('departments'), job = useDimension('positions'), types = useWorkPatterns();
  const by = (rows: readonly { code: string; name: string }[] | undefined) =>
    (code: string) => (code ? rows?.find(r => r.code === code)?.name ?? code : '—');
  /* a line manager is stored by employee code; this shows their name (an outside manager shows as written) */
  const everyone = useEmployees('all', '').data;
  const manager = (stored: string, selfCode: string) => (stored ? managerName(stored, selfCode, everyone ?? []) : '—');
  return { location: by(loc.data), department: by(dep.data), job: by(job.data), type: by(types.data), manager };
}

/* payroll's lists an employee's grade and level come from; payroll owns them, so they change rarely */
export const usePayGrades = () => useQuery({ queryKey: ['pay-grades'], queryFn: () => api(listPayGrades) });
export const usePayLevels = () => useQuery({ queryKey: ['pay-levels'], queryFn: () => api(listPayLevels) });
