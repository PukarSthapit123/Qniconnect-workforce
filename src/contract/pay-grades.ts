/* Payroll's Pay Grade and Pay Level lists, which an employee's grade and level
   are chosen from. Payroll owns them, so Workforce only reads them, and never
   a level's salary. */
import { z } from 'zod';
import { defineEndpoint } from './endpoints';

export const PayGrade = z.object({ code: z.string(), name: z.string() });
export type PayGrade = z.infer<typeof PayGrade>;
export const PayLevel = z.object({ code: z.string(), name: z.string(), rank: z.number().int() });
export type PayLevel = z.infer<typeof PayLevel>;

/* needs a session only: the employee form reads both */
export const listPayGrades = defineEndpoint({ method: 'GET', path: '/api/v1/pay-grades', response: z.array(PayGrade),
  summary: 'Payroll\'s pay grades, by code. Read only.' });
export const listPayLevels = defineEndpoint({ method: 'GET', path: '/api/v1/pay-levels', response: z.array(PayLevel),
  summary: 'Payroll\'s pay levels, by code, in rank order. Read only; never the salary.' });
