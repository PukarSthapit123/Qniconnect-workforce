import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useRecordMutation } from './mutation';
import { employeesKeys } from './employees';
import { typesKey } from './reference';
import {
  createWorkPattern, getTypeLibrary, removeWorkPattern, updateWorkPattern,
  type CreateWorkPattern, type WorkPattern, type UpdateWorkPattern,
} from '@/contract/work-patterns';

export const useTypeLibrary = () => useQuery({ queryKey: ['work-patterns', 'library'], queryFn: () => api(getTypeLibrary), staleTime: Infinity });
/* the employees screens show a type by name */
const AFTER = [typesKey, employeesKeys.all] as const;
export const useCreateType = () => useRecordMutation({
  mutationFn: (body: CreateWorkPattern) => api(createWorkPattern, { body }),
  recordKey: () => 'new-type',
  invalidates: AFTER,
});
export const useUpdateType = () => useRecordMutation({
  mutationFn: (v: { type: WorkPattern; body: UpdateWorkPattern }) => api(updateWorkPattern, { params: { id: v.type.id }, body: v.body, ifMatch: v.type.version }),
  recordKey: v => v.type.id,
  invalidates: AFTER,
});
export const useRemoveType = () => useRecordMutation({
  mutationFn: (t: WorkPattern) => api(removeWorkPattern, { params: { id: t.id }, ifMatch: t.version }),
  recordKey: t => t.id,
  invalidates: AFTER,
});
