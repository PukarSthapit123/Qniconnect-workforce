/* Registration (docs/superpowers/inventory/public.md, REG): QniConnect's
   EnhancedRegistration rules as pure functions. The form collects more than
   it sends (REG.R18); the billing choice is shown, never sent. Prices are
   domain/pricing's (Ruling Q23): one base price, no plan to choose. */
import { baseTotal, gbp, monthlyPrice, type Billing } from './pricing';
export type { Billing };

export interface RegistrationForm {
  companyName: string; companyEmail: string; companyWebsite: string; companyPhone: string; industry: string;
  tenantId: string; domainName: string; bcEnvironment: string; bcCompanyName: string; numberOfEmployees: string;
  paymentFrequency: Billing;
  contactName: string; contactEmail: string; contactPhone: string; agreeTerms: boolean; agreeDataProcessing: boolean;
}

/* REG.R1 */
export const INITIAL_REGISTRATION: RegistrationForm = {
  companyName: '', companyEmail: '', companyWebsite: '', companyPhone: '', industry: '',
  tenantId: '', domainName: '', bcEnvironment: '', bcCompanyName: '', numberOfEmployees: '',
  paymentFrequency: 'annual',
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
    case 3: return !!f.paymentFrequency;
    case 4: return !!(f.contactName && f.contactEmail && f.agreeTerms && f.agreeDataProcessing);
    default: return false;
  }
}

/* REG.R12: the step 3 total, per year when annual and per month when monthly */
export const stepTotal = (f: RegistrationForm) => gbp(baseTotal(f.paymentFrequency, f.numberOfEmployees));

/* REG.R13: the step 4 plan line, the base price for the billing chosen */
export const planLine = (f: RegistrationForm) => `QniConnect · ${gbp(monthlyPrice(f.paymentFrequency))}/user/mo`;

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
