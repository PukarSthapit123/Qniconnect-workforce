import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { listAudit, type AuditEntry } from '@/contract/audit';

export function useAudit(filters: { entity?: string; who?: string; q?: string }) {
  return useQuery({
    queryKey: ['audit', filters.entity, filters.who, filters.q],
    queryFn: () => api(listAudit, { query: { entity: filters.entity, who: filters.who, q: filters.q } }),
    /* the rows already on screen stay while a new filter is read, so typing does not blank the table */
    placeholderData: keepPreviousData,
  });
}

export type { AuditEntry };
