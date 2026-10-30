/* What QniConnect costs (Ruling Q23, 2026-10-27): one base price per
   employee per month, and add-on modules that are priced separately. This
   replaces QniConnect's Basic, Essential and Premium tiers (PRICE.R5,
   REG.R11 to R15). The prices will change as the system grows: change them
   here, and Pricing and Registration follow. */

export type Billing = 'monthly' | 'annual';

/* £ per employee per month, billed monthly */
export const BASE_PRICE = 0.5;
/* REG.R11: billed annually is 20% off */
export const ANNUAL_DISCOUNT = 0.2;

/* What the base price includes, in the order Pricing lists it */
export const BASE_INCLUDES = [
  'Each employee’s own profile',
  'Payslips to view, with a detailed preview',
  'Payslips to download as secure PDFs',
  'Sign-in with your Microsoft 365 accounts',
  'Payroll read from your Business Central',
] as const;

/* An add-on's price is per employee per month; null means not set yet. */
export interface AddOn { code: 'TS' | 'ON'; name: string; summary: string; price: number | null } // the codes in domain/modules.ts
export const ADD_ONS: readonly AddOn[] = [
  { code: 'TS', name: 'Timesheet', price: null,
    summary: 'Employees record their hours or clock in and out, and managers approve them before they reach payroll.' },
  { code: 'ON', name: 'Onboarding', price: null,
    summary: 'New starters complete their forms and checks before their first day, and you see what is still missing.' },
];
export const TO_BE_CONFIRMED = 'Price to be confirmed';

/* Money always shows pence in two places: £0.50, £4.80 (Ruling Q22). */
export const gbp = (n: number) => `£${n.toFixed(2)}`;

/* The base price per employee per month for a billing choice */
export const monthlyPrice = (billing: Billing) => billing === 'annual' ? BASE_PRICE * (1 - ANNUAL_DISCOUNT) : BASE_PRICE;

/* REG.R12: what the base costs for this many employees, per year when
   annual and per month when monthly. No employees yet counts as none. */
export function baseTotal(billing: Billing, employees: string | number): number {
  const each = monthlyPrice(billing) * (billing === 'annual' ? 12 : 1);
  return each * (Number(employees) || 0);
}

export const addOnPrice = (a: AddOn) => a.price === null ? TO_BE_CONFIRMED : `${gbp(a.price)} per employee/month`;
