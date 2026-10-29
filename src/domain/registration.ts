/* Registration (docs/superpowers/inventory/public.md, REG): QniConnect's
   EnhancedRegistration rules as pure functions. The form collects more than
   it sends (REG.R18); the plan and billing choice are shown, never sent. */

export type Plan = 'basic' | 'essential' | 'premium';
export type Billing = 'monthly' | 'annual';

export interface RegistrationForm {
  companyName: string; companyEmail: string; companyWebsite: string; companyPhone: string; industry: string;
  tenantId: string; domainName: string; bcEnvironment: string; bcCompanyName: string; numberOfEmployees: string;
  selectedPlan: Plan; paymentFrequency: Billing;
  contactName: string; contactEmail: string; contactPhone: string; agreeTerms: boolean; agreeDataProcessing: boolean;
}

/* REG.R1 */
export const INITIAL_REGISTRATION: RegistrationForm = {
  companyName: '', companyEmail: '', companyWebsite: '', companyPhone: '', industry: '',
  tenantId: '', domainName: '', bcEnvironment: '', bcCompanyName: '', numberOfEmployees: '',
  selectedPlan: 'essential', paymentFrequency: 'annual',
  contactName: '', contactEmail: '', contactPhone: '', agreeTerms: false, agreeDataProcessing: false,
};

/* EnhancedRegistration.js:63-74, in its order */
export const INDUSTRIES = ['Accounting & Finance', 'Construction', 'Consulting', 'Education', 'Healthcare', 'Information Technology',
  'Manufacturing', 'Retail', 'Transportation', 'Other'] as const;

/* REG.R5: a truthiness test, with no trimming and no format check (REG.R7). */
export function isStepValid(step: number, f: RegistrationForm): boolean {
  switch (step) {
    case 1: return !!(f.companyName && f.companyEmail);
    case 2: return !!(f.tenantId && f.domainName && f.bcEnvironment && f.bcCompanyName && f.numberOfEmployees);
    case 3: return !!(f.selectedPlan && f.paymentFrequency);
    case 4: return !!(f.contactName && f.contactEmail && f.agreeTerms && f.agreeDataProcessing);
    default: return false;
  }
}

/* REG.R11 and R15: hard-coded per user per month, 20% off when annual. */
export const BASE_PRICE: Record<Plan, number> = { basic: 0.5, essential: 5, premium: 7 };
export function pricing(plan: Plan, billing: Billing): { monthlyPrice: string | number; annualPrice: string } {
  const price = BASE_PRICE[plan];
  return billing === 'annual'
    ? { monthlyPrice: (price * 0.8).toFixed(2), annualPrice: (price * 0.8 * 12).toFixed(2) }
    : { monthlyPrice: price, annualPrice: (price * 12).toFixed(2) };
}

/* REG.R14 */
export const planName = (plan: Plan) => plan.charAt(0).toUpperCase() + plan.slice(1);

/* REG.R12: JavaScript's own coercion, as QniConnect multiplied the text. */
export function stepTotal(f: RegistrationForm): string {
  const { monthlyPrice, annualPrice } = pricing(f.selectedPlan, f.paymentFrequency);
  const each = Number(f.paymentFrequency === 'annual' ? annualPrice : monthlyPrice);
  return (each * Number(f.numberOfEmployees || 0)).toFixed(2);
}

/* REG.R13 */
export const planLine = (f: RegistrationForm) => `${planName(f.selectedPlan)} · £${pricing(f.selectedPlan, f.paymentFrequency).monthlyPrice}/user/mo`;

/* REG.R17: exactly what POST /bc/portalRegistrations carries. The address
   keys never existed in the form, so they are always blank. */
export function registrationPayload(f: RegistrationForm) {
  return {
    company_Name: f.companyName,
    contactEmail: f.contactEmail || f.companyEmail,
    contactName: f.contactName,
    tenantId: f.tenantId,
    primaryEnvironment: f.bcEnvironment,
    primaryCompanyName: f.bcCompanyName,
    numberOfEmployees: parseInt(f.numberOfEmployees, 10) || 1,
    industry: f.industry,
    registrationSource: 'Portal',
    vatRegistrationNo: '',
    companyRegistrationNo: '',
    primaryContactLanguage: 'EN',
    address: '', city: '', county: '', postCode: '', countryRegionCode: '',
  };
}
export type RegistrationPayload = ReturnType<typeof registrationPayload>;

export const REGISTRATION_DEFAULT_ERROR = 'An error occurred during registration. Please try again.';

/* REG.R23 and R24: the message for whatever was thrown. */
export function messageOfThrown(thrown: unknown): string {
  let m: unknown = REGISTRATION_DEFAULT_ERROR;
  if (typeof thrown === 'string') m = thrown;
  else if (thrown instanceof Error) m = thrown.message;
  else if (thrown && typeof thrown === 'object') {
    const o = thrown as { message?: unknown; error?: unknown };
    const inner = o.error && typeof o.error === 'object' ? (o.error as { message?: unknown }).message : undefined;
    if (o.message) m = o.message;
    else if (o.error && typeof o.error === 'string') m = o.error;
    else if (inner) m = inner;
    else {
      try { m = JSON.stringify(thrown); } catch { m = 'Unknown error format received from server'; }
    }
  }
  if (typeof m === 'string' && m.includes('CorrelationId:')) m = (m.split('CorrelationId:')[0] ?? '').trim();
  return typeof m === 'string' ? m : String(m);
}

/* REG.R20 and R21: what a refusal's body throws, then its message. */
export function registrationErrorMessage(status: number, body: string): string {
  let result: unknown;
  try { result = JSON.parse(body); } catch { result = { message: body }; }
  let thrown: unknown;
  if (result && typeof result === 'object') {
    const r = result as { error?: unknown; message?: unknown };
    thrown = r.error ? r.error : r.message ? r.message : JSON.stringify(result);
  } else thrown = new Error(`API Error: ${status}`);
  return messageOfThrown(thrown);
}
