/* Payroll's Pay Grade and Pay Level lists, read only: the `payGrades` and
   `payLevels` collections stand in for Business Central's tables. */
import { store } from './store';
import { serve } from './serve';
import { listPayGrades, listPayLevels, type PayGrade, type PayLevel } from '@/contract/pay-grades';

export const payGradeHandlers = [
  serve(listPayGrades, () => Object.values(store.coll<PayGrade>('payGrades')).map(({ code, name }) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code))),
  serve(listPayLevels, () => Object.values(store.coll<PayLevel>('payLevels')).map(({ code, name, rank }) => ({ code, name, rank }))
    .sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code))),
];
