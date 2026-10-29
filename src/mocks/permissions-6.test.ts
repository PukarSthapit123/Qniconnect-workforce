import { server } from './node';
import { Refusal } from '@/contract/common';
import { caller, resetTo, snapshot, tokenFor, type Persona } from '@/test/api-helpers';

/* The permission sweep for pay codes: a persona without Master data is
   refused the write with 403 capability, and nothing is written. Creating and
   removing a pay code is refused in pay-codes.test.ts. Every gated endpoint is
   also checked against the one capability its contract names in
   src/contract/capability.test.ts. */
beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); afterAll(() => server.close());
beforeEach(() => resetTo('social'));

const as = async (p: Persona) => caller(await tokenFor(p));
const refused = (r: { status: number; body: unknown }) => [r.status, Refusal.parse(r.body).code];
const WRITES = ['payCodes', 'timesheetDays', 'audit'];

test('without Master data, the manager and the employee cannot edit a pay code', async () => {
  const calls = { manager: await as('manager'), employee: await as('employee') }, before = snapshot(...WRITES);
  for (const p of ['manager', 'employee'] as const)
    expect([p, ...refused(await calls[p]('PATCH', '/api/v1/pay-codes/pc_OT20', { value: '3' }, 1))]).toEqual([p, 403, 'capability']);
  expect(snapshot(...WRITES)).toEqual(before);
});
