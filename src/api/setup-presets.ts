/* Setup presets (D1-D4) on the Organisation page. Writes go through
   useRecordMutation, so nothing changes on screen until the server has
   answered and what it changed has been read again. Applying a template can
   change any module's settings, work patterns, role names and structure, so
   it reads everything again, the session included (a role name is in the
   role pill). */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useRecordMutation } from './mutation';
import {
  applyPreset, exportPreset, getPresetPlan, importPreset, listPresets, removePreset, savePreset,
  type SavePreset, type PresetApplied, type PresetFile, type PresetImported, type PresetList, type PresetPlan, type PresetRow,
} from '@/contract/setup-presets';

export const presetKeys = { all: ['setup-presets'] as const, plan: (key: string) => ['setup-presets', key, 'plan'] as const };
export const usePresets = (enabled = true) => useQuery({ queryKey: presetKeys.all, queryFn: () => api(listPresets), enabled });
/* The preview an apply asks for first; read fresh each time it is opened. */
export const usePresetPlan = (key: string | null) => useQuery({
  queryKey: presetKeys.plan(key ?? ''), queryFn: () => api(getPresetPlan, { params: { key: key ?? '' } }), enabled: key !== null, staleTime: 0, gcTime: 0,
});

export function useSavePreset() {
  return useRecordMutation<SavePreset, { record: PresetRow; auditId: string }>({
    mutationFn: body => api(savePreset, { body }), recordKey: () => 'setup-presets', invalidates: [presetKeys.all],
  });
}
const EVERYTHING = [[]] as const;
export function useApplyPreset() {
  return useRecordMutation<{ key: string; ifMatch: number }, PresetApplied>({
    mutationFn: v => api(applyPreset, { params: { key: v.key }, ifMatch: v.ifMatch }),
    recordKey: () => 'tenant', invalidates: EVERYTHING, refreshesSession: true,
  });
}
export function useImportPreset() {
  return useRecordMutation<{ text: string }, PresetImported>({
    mutationFn: body => api(importPreset, { body }), recordKey: () => 'setup-presets', invalidates: [presetKeys.all],
  });
}
export function useRemovePreset() {
  return useRecordMutation<{ key: string; ifMatch: number }, { auditId: string }>({
    mutationFn: v => api(removePreset, { params: { key: v.key }, ifMatch: v.ifMatch }), recordKey: v => v.key, invalidates: [presetKeys.all],
  });
}
/* The export is a read on demand: fetched when asked for and not kept. */
export function useExportPreset() {
  const [pending, setPending] = useState<string | null>(null);
  const run = async (key: string): Promise<PresetFile> => {
    setPending(key);
    try { return await api(exportPreset, { params: { key } }); } finally { setPending(null); }
  };
  return { run, pending };
}
export type { PresetList, PresetPlan, PresetRow, PresetApplied, PresetImported, PresetFile, SavePreset };
