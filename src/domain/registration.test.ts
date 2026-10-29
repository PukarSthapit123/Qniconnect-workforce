/* Registration's rules (docs/superpowers/inventory/public.md, REG), as pure
   functions: the form's start, each step's gate, the plan prices and totals,
   the exact payload REG.C1 sends, and the message a refusal shows. */
import { INITIAL_REGISTRATION, isStepValid, planLine, pricing, registrationErrorMessage, registrationPayload, stepTotal, planName,
  REGISTRATION_DEFAULT_ERROR, type RegistrationForm } from './registration';

const filled = (over: Partial<RegistrationForm> = {}): RegistrationForm => ({
  ...INITIAL_REGISTRATION, companyName: 'Acme Ltd', companyEmail: 'info@acme.test', companyWebsite: 'https://acme.test', companyPhone: '+44 20 1',
  industry: 'Retail', tenantId: 't-1', domainName: 'acme.onmicrosoft.com', bcEnvironment: 'Production', bcCompanyName: 'CRONUS UK Ltd.',
  numberOfEmployees: '25', contactName: 'Jo Smith', contactEmail: 'jo@acme.test', contactPhone: '+44 7', agreeTerms: true, agreeDataProcessing: true, ...over });

test('REG.R1: the form starts empty, unticked, on Essential billed annually', () => {
  expect(INITIAL_REGISTRATION).toEqual({
    companyName: '', companyEmail: '', companyWebsite: '', companyPhone: '', industry: '',
    tenantId: '', domainName: '', bcEnvironment: '', bcCompanyName: '', numberOfEmployees: '',
    selectedPlan: 'essential', paymentFrequency: 'annual',
    contactName: '', contactEmail: '', contactPhone: '', agreeTerms: false, agreeDataProcessing: false,
  });
});

test('REG.R5: each step is gated by a truthiness test of its required fields only', () => {
  const f = filled();
  for (const s of [1, 2, 3, 4]) expect(isStepValid(s, f), `step ${s}`).toBe(true);
  expect(isStepValid(1, { ...f, companyName: '' })).toBe(false);
  expect(isStepValid(1, { ...f, companyEmail: '' })).toBe(false);
  /* website, phone and industry never gate step 1 */
  expect(isStepValid(1, { ...f, companyWebsite: '', companyPhone: '', industry: '' })).toBe(true);
  for (const k of ['tenantId', 'domainName', 'bcEnvironment', 'bcCompanyName', 'numberOfEmployees'] as const)
    expect(isStepValid(2, { ...f, [k]: '' }), k).toBe(false);
  expect(isStepValid(3, INITIAL_REGISTRATION)).toBe(true);
  for (const k of ['contactName', 'contactEmail'] as const) expect(isStepValid(4, { ...f, [k]: '' }), k).toBe(false);
  expect(isStepValid(4, { ...f, agreeTerms: false })).toBe(false);
  expect(isStepValid(4, { ...f, agreeDataProcessing: false })).toBe(false);
  expect(isStepValid(4, { ...f, contactPhone: '' })).toBe(true);
  expect(isStepValid(0, f)).toBe(false);
  expect(isStepValid(5, f)).toBe(false);
});

test('REG.R7: no trimming and no format check: spaces, "0" and "-5" pass, and a company email that is not one passes', () => {
  expect(isStepValid(1, { ...filled(), companyName: '   ', companyEmail: 'not an email' })).toBe(true);
  expect(isStepValid(2, { ...filled(), numberOfEmployees: '0' })).toBe(true);
  expect(isStepValid(2, { ...filled(), numberOfEmployees: '-5' })).toBe(true);
});

test('REG.R11: annual is 20% off, as two-decimal text; monthly is the plain price', () => {
  expect(pricing('basic', 'annual')).toEqual({ monthlyPrice: '0.40', annualPrice: '4.80' });
  expect(pricing('essential', 'annual')).toEqual({ monthlyPrice: '4.00', annualPrice: '48.00' });
  expect(pricing('premium', 'annual')).toEqual({ monthlyPrice: '5.60', annualPrice: '67.20' });
  expect(pricing('basic', 'monthly')).toEqual({ monthlyPrice: 0.5, annualPrice: '6.00' });
  expect(pricing('essential', 'monthly')).toEqual({ monthlyPrice: 5, annualPrice: '60.00' });
  expect(pricing('premium', 'monthly')).toEqual({ monthlyPrice: 7, annualPrice: '84.00' });
});

test('REG.R12: the step 3 total is the yearly price times employees when annual, the monthly price times employees when monthly', () => {
  const ten = (selectedPlan: RegistrationForm['selectedPlan'], paymentFrequency: RegistrationForm['paymentFrequency']) =>
    stepTotal({ ...INITIAL_REGISTRATION, selectedPlan, paymentFrequency, numberOfEmployees: '10' });
  expect(ten('essential', 'annual')).toBe('480.00');
  expect(ten('basic', 'annual')).toBe('48.00');
  expect(ten('premium', 'annual')).toBe('672.00');
  expect(ten('essential', 'monthly')).toBe('50.00');
  expect(ten('basic', 'monthly')).toBe('5.00');
  expect(ten('premium', 'monthly')).toBe('70.00');
  /* no employees yet counts as none */
  expect(stepTotal(INITIAL_REGISTRATION)).toBe('0.00');
});

test('REG.R13: the step 4 plan line uses the monthly price as it is', () => {
  const line = (selectedPlan: RegistrationForm['selectedPlan'], paymentFrequency: RegistrationForm['paymentFrequency']) =>
    planLine({ ...INITIAL_REGISTRATION, selectedPlan, paymentFrequency });
  expect(line('essential', 'annual')).toBe('Essential · £4.00/user/mo');
  expect(line('basic', 'annual')).toBe('Basic · £0.40/user/mo');
  expect(line('premium', 'annual')).toBe('Premium · £5.60/user/mo');
  expect(line('basic', 'monthly')).toBe('Basic · £0.5/user/mo');
  expect(line('essential', 'monthly')).toBe('Essential · £5/user/mo');
  expect(line('premium', 'monthly')).toBe('Premium · £7/user/mo');
});

test('REG.R14: a plan is named by its key with the first letter upper-cased', () => {
  expect(['basic', 'essential', 'premium'].map(p => planName(p as RegistrationForm['selectedPlan']))).toEqual(['Basic', 'Essential', 'Premium']);
});

test('REG.R17: the payload has exactly these keys and values', () => {
  expect(registrationPayload(filled())).toEqual({
    company_Name: 'Acme Ltd', contactEmail: 'jo@acme.test', contactName: 'Jo Smith', tenantId: 't-1',
    primaryEnvironment: 'Production', primaryCompanyName: 'CRONUS UK Ltd.', numberOfEmployees: 25, industry: 'Retail',
    registrationSource: 'Portal', vatRegistrationNo: '', companyRegistrationNo: '', primaryContactLanguage: 'EN',
    address: '', city: '', county: '', postCode: '', countryRegionCode: '',
  });
  expect(Object.keys(registrationPayload(filled()))).toEqual(['company_Name', 'contactEmail', 'contactName', 'tenantId', 'primaryEnvironment',
    'primaryCompanyName', 'numberOfEmployees', 'industry', 'registrationSource', 'vatRegistrationNo', 'companyRegistrationNo',
    'primaryContactLanguage', 'address', 'city', 'county', 'postCode', 'countryRegionCode']);
});

test('REG.R17: no contact email falls back to the company email; employees parse as a whole number, 1 when there is none', () => {
  expect(registrationPayload(filled({ contactEmail: '' })).contactEmail).toBe('info@acme.test');
  const n = (numberOfEmployees: string) => registrationPayload(filled({ numberOfEmployees })).numberOfEmployees;
  expect(n('0')).toBe(1);
  expect(n('')).toBe(1);
  expect(n('abc')).toBe(1);
  expect(n('-5')).toBe(-5);
  expect(n('2.5')).toBe(2);
  expect(registrationPayload(filled({ industry: '' })).industry).toBe('');
});

test('REG.R18: website, phones, domain, plan, billing and the two agreements are never sent', () => {
  const sent = JSON.stringify(registrationPayload(filled({ companyWebsite: 'https://w.example', companyPhone: 'P1', contactPhone: 'P2', domainName: 'dn.example' })));
  for (const v of ['w.example', 'P1', 'P2', 'dn.example', 'essential', 'annual', 'agree', 'selectedPlan', 'paymentFrequency', 'companyEmail', 'info@acme.test'])
    expect(sent, v).not.toContain(v);
});

describe('REG.R21, R23 and R24: the message a refusal shows', () => {
  test('REG.R21: a JSON object body: its error, else its message, else the whole object as text', () => {
    expect(registrationErrorMessage(400, JSON.stringify({ error: 'Tenant not valid', message: 'ignored' }))).toBe('Tenant not valid');
    expect(registrationErrorMessage(400, JSON.stringify({ message: 'Company exists' }))).toBe('Company exists');
    expect(registrationErrorMessage(400, JSON.stringify({ code: 7 }))).toBe('{"code":7}');
    expect(registrationErrorMessage(400, '{}')).toBe('{}');
  });
  test('REG.R20 and R21: a body that is not JSON is its own message; an empty one shows as {"message":""}', () => {
    expect(registrationErrorMessage(502, 'Bad gateway from upstream')).toBe('Bad gateway from upstream');
    expect(registrationErrorMessage(500, '')).toBe('{"message":""}');
  });
  test('REG.R21: a JSON body that is not an object is "API Error: <status>"', () => {
    for (const body of ['"text"', '42', 'true', 'null']) expect(registrationErrorMessage(503, body), body).toBe('API Error: 503');
  });
  test('REG.R23: an error that is an object gives its message, else its error text, else its error\'s message, else itself as text', () => {
    expect(registrationErrorMessage(400, JSON.stringify({ error: { message: 'Nested', code: 'X' } }))).toBe('Nested');
    expect(registrationErrorMessage(400, JSON.stringify({ error: { error: 'Inner text' } }))).toBe('Inner text');
    expect(registrationErrorMessage(400, JSON.stringify({ error: { error: { message: 'Deep' } } }))).toBe('Deep');
    expect(registrationErrorMessage(400, JSON.stringify({ error: { code: 'X' } }))).toBe('{"code":"X"}');
    /* an error that is not text, an Error or an object keeps the default */
    expect(registrationErrorMessage(400, JSON.stringify({ error: 42 }))).toBe(REGISTRATION_DEFAULT_ERROR);
    expect(REGISTRATION_DEFAULT_ERROR).toBe('An error occurred during registration. Please try again.');
  });
  test('REG.R24: everything from CorrelationId: on is cut, and the rest trimmed', () => {
    expect(registrationErrorMessage(400, JSON.stringify({ error: 'The tenant is already registered.  CorrelationId: 4f2c-91aa' }))).toBe('The tenant is already registered.');
    expect(registrationErrorMessage(400, 'Plain failure CorrelationId: x')).toBe('Plain failure');
  });
});
