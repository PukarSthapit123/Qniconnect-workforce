/* The fake QniConnect API's data (spec N20): one portal user per Workforce
   seed account in both seeds, with the same email and the Workforce employee
   code as employeeNo, so Business Central and Workforce line up by employee
   number in development; and the two environments QniConnect's own dev mocks
   had. Built from the Workforce seed files rather than copied, so the two can
   never drift. Shapes are the fields the auth inventory says QniConnect read
   (AUTH.C1, AUTH.C4). The seeds are read through the Workforce store's
   seededCollection, every tenant it knows, in its order. */
import { seededCollection, TENANTS } from '../store';
import { buildPayrollSeed, type FakeFiscalYear, type FakeNotification, type FakePayslip, type FakeProfile } from './payroll-seed';

export const REGISTRATION_ID = 'REG-DEMO-0001';
/* A portal user who has not signed in before: the first-login overlay's case (AUTH.R65). */
export const FIRST_LOGIN_EMAIL = 'firstlogin@brightpath.org';

export type PortalUserStatus = 'Active' | 'PendingFirstLogin' | 'Inactive';
export interface FakePortalUser {
  id: string; email: string; name: string; status: PortalUserStatus; isAdmin: boolean;
  registrationId: string; employeeNo: string; role: string;
  /* USERS.C1's "Last login"; null before their first (USERS.R15 "Never") */
  lastLogin: string | null;
}
export interface FakeEnvironment {
  id: string; name: string; type: string; url: string; status: string;
  companyName: string; company_Id: string; registrationId: string;
}
export interface FakeCompany { id: string; name: string; displayName: string; environmentId: string }
export interface BcDb {
  portalUsers: FakePortalUser[]; environments: FakeEnvironment[]; companies: FakeCompany[];
  /* the dashboard's (Task 16): payroll-seed.ts */
  profiles: FakeProfile[]; payslips: FakePayslip[];
  /* Documents' (Task 17): payroll-seed.ts */
  fiscalYears: FakeFiscalYear[];
  /* the bell's (Task 18): payroll-seed.ts */
  notifications: FakeNotification[];
  /* the admin pages' (Task 19): the Business Central authorization (AUTHZ.C1) and this organisation's registration (ADM.C4) */
  authorization: FakeAuthorization; registration: FakeRegistration;
  /* registration's (Task 21): organisations registered from the public form
     this page load, after the seed organisation's own (REG.C1) */
  registrations: FakeRegistrationRequest[];
}

/* AUTHZ.C1 as the authorization page reads it. The tokens are made up and
   say so; they open nothing. */
export interface FakeAuthorization {
  isAuthorized: boolean; status: string; clientId: string; tenantId: string; environment: string; scope: string;
  issuedAt: string; expiresAt: string; accessToken: string; refreshToken: string; registrationId: string;
  diagnostics: { hasAccessToken: boolean; hasRefreshToken: boolean; tokenStoredInBC: boolean };
}
export interface FakeRegistration { id: string; companyName: string; registrationDate: string }
/* REG.R17's payload as the backend kept it, with the id it gave */
export interface FakeRegistrationRequest { id: string; company_Name: string; tenantId: string; contactEmail: string; numberOfEmployees: number; status: string }

interface SeedAccount { email: string; employeeCode: string; userType: string }
interface SeedEmployee { code: string; name: string }

/* A fixed spread of mornings in the week before the Workforce seed's day
   (13 August 2026), so the list and its screenshots never move. */
const lastLoginFor = (i: number) => new Date(Date.UTC(2026, 7, 12 - (i % 7), 7 + (i % 5), 15 + (i % 4) * 10)).toISOString();

function portalUsers(): FakePortalUser[] {
  const users = new Map<string, FakePortalUser>();
  for (const tenant of TENANTS) {
    const employees = Object.values(seededCollection(tenant, 'employees')) as unknown as SeedEmployee[];
    const accounts = Object.values(seededCollection(tenant, 'accounts')) as unknown as SeedAccount[];
    const names = new Map(employees.map(e => [e.code, e.name]));
    for (const a of accounts) {
      const key = a.email.toLowerCase();
      if (users.has(key)) continue;
      const isAdmin = a.userType === 'admin';
      users.set(key, {
        id: `pu-${a.employeeCode}`, email: a.email, name: names.get(a.employeeCode) ?? a.email,
        status: key === FIRST_LOGIN_EMAIL ? 'PendingFirstLogin' : 'Active', isAdmin,
        registrationId: REGISTRATION_ID, employeeNo: a.employeeCode, role: isAdmin ? 'Admin' : 'Employee',
        lastLogin: key === FIRST_LOGIN_EMAIL ? null : lastLoginFor(users.size),
      });
    }
  }
  return [...users.values()];
}

/* Production already has its company; Sandbox has none until environment
   selection looks it up (AUTH.C5), as a newly provisioned environment would. */
const environments = (): FakeEnvironment[] => [
  { id: 'env-production-01', name: 'Production', type: 'Production', url: 'https://businesscentral.dynamics.com/production', status: 'Active',
    companyName: 'BrightPath Care Ltd', company_Id: '6f1c2a9e-4b7d-4e2a-9c31-0d8e5b7a1f01', registrationId: REGISTRATION_ID },
  { id: 'env-sandbox-01', name: 'Sandbox', type: 'Sandbox', url: 'https://businesscentral.dynamics.com/sandbox', status: 'Active',
    companyName: '', company_Id: '', registrationId: REGISTRATION_ID },
];
const companies = (): FakeCompany[] => [
  { id: '6f1c2a9e-4b7d-4e2a-9c31-0d8e5b7a1f01', name: 'BrightPath Care Ltd', displayName: 'BrightPath Care Ltd', environmentId: 'env-production-01' },
  { id: '2b8d4e6f-1a3c-4d5e-8f70-9a1b2c3d4e02', name: 'BrightPath Care (Sandbox)', displayName: 'BrightPath Care (Sandbox)', environmentId: 'env-sandbox-01' },
];

const DAY_MS = 86_400_000;
/* Issued 23 days ago, expiring in 67 (QniConnect's own dev mock), from the
   moment the fake starts: the pages count days from the real clock. */
export function freshAuthorization(now = Date.now(), issuedDaysAgo = 23, expiresInDays = 67): FakeAuthorization {
  const stamp = Math.floor(now / 1000).toString(36);
  return {
    isAuthorized: true, status: 'active', clientId: '0b6f3c1e-5a2d-4c8e-9f10-2a7b4d6e8c01', tenantId: '7d2e9a4b-1c3f-4e5a-8b6d-0f9e8d7c6b02',
    environment: 'Production', scope: 'https://api.businesscentral.dynamics.com/.default',
    issuedAt: new Date(now - issuedDaysAgo * DAY_MS).toISOString(), expiresAt: new Date(now + expiresInDays * DAY_MS).toISOString(),
    accessToken: `fake-access-token-${stamp}-not-a-real-token`, refreshToken: `fake-refresh-token-${stamp}-not-a-real-token`,
    registrationId: REGISTRATION_ID,
    diagnostics: { hasAccessToken: true, hasRefreshToken: true, tokenStoredInBC: true },
  };
}
const registration = (): FakeRegistration => ({ id: REGISTRATION_ID, companyName: 'BrightPath Care Ltd', registrationDate: '2025-03-14' });

/* The seed organisation's own registration, on its authorization's tenant. */
const registrations = (): FakeRegistrationRequest[] => [{ id: REGISTRATION_ID, company_Name: 'BrightPath Care Ltd',
  tenantId: freshAuthorization().tenantId, contactEmail: 'dee.fitzgerald@brightpath.org', numberOfEmployees: 120, status: 'Active' }];

export const buildBcSeed = (): BcDb => ({ portalUsers: portalUsers(), environments: environments(), companies: companies(), ...buildPayrollSeed(),
  authorization: freshAuthorization(), registration: registration(), registrations: registrations() });

/* In memory, per page load (and per test file: src/test/setup.ts resets it). */
export const bcStore = {
  db: buildBcSeed(),
  reset() { bcStore.db = buildBcSeed(); },
  userByEmail: (email: string) => bcStore.db.portalUsers.find(u => u.email.toLowerCase() === email.toLowerCase()),
};
