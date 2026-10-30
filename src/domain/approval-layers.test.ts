import {
  CONDITIONS, chainProblem, decisionBlock, defaultChainFor, newLayer, walkChain, walkProgress, whenOptions,
  type ChainItem, type ChainStep, type DeciderEmployee, type WalkInput,
} from './approvals';

/* Module 8 group 4B: the layer walker. It matches a signed role to the first
   unsigned layer of that role, keeps whoever signed one layer from the next,
   lets an escalation layer take over from the layers before it, and lets the
   employee's own line manager hold the Line manager layer. Walked here on the
   Timesheet chain. */
const step = (o: Partial<ChainStep> = {}): ChainStep => ({ module: 'Timesheet', role: 'Line manager', scope: 'Own department', when: 'Every timesheet', sla: '24 hours', fixed: false, ...o });
const employee = (code: string, o: Partial<DeciderEmployee> = {}): DeciderEmployee =>
  ({ code, location: 'WH', department: 'CARE', active: true, caps: ['team_ts', 'pay_appr'], allLocations: false, ...o });
/* M manages the team; S is a second approver at the location; A is an administrator elsewhere, and E's own line manager */
const employees = [employee('M'), employee('S'), employee('A', { location: 'FS', department: 'ADM', allLocations: true }), employee('E', { caps: [] })];
const item = (o: Partial<ChainItem> = {}): ChainItem => ({ employeeCode: 'E', location: 'WH', department: 'CARE', facts: {}, ...o });
const input = (o: Partial<WalkInput> = {}): WalkInput =>
  ({ module: 'Timesheet', steps: [step()], item: item(), signed: [], date: '2026-08-13', employees, delegations: [], ...o });
const twoLayers = [step(), step({ role: 'Payroll', scope: 'Own site' })];

describe('the conditions the Timesheet chain offers are the ones the server reads', () => {
  test('Timesheet: every timesheet, a premium, an absence, a proxy entry; the escalation is read too', () => {
    expect(whenOptions('Timesheet')).toEqual(['Every timesheet', 'Only above a premium threshold', 'Only for absence or non-working days', 'Only for proxy entries']);
    expect([CONDITIONS['Every timesheet']?.({}), CONDITIONS['Only when the SLA is breached']?.({})]).toEqual([true, false]);
    expect(newLayer('Timesheet')).toMatchObject({ role: 'Line manager', when: 'Every timesheet' });
  });
  test('the defaults stay valid, and a condition from elsewhere is refused', () => {
    expect(chainProblem('Timesheet', defaultChainFor('Timesheet'))).toBeNull();
    expect(chainProblem('Profile', [step({ module: 'Profile', when: 'Only for proxy entries' })])).toMatchObject({ field: 'steps.0.when' });
  });
});

describe('walking a chain', () => {
  test('two layers of the same role are signed one at a time', () => {
    const walk = (signed: string[]) => walkChain(input({ steps: [step({ role: 'Payroll' }), step({ role: 'Payroll', scope: 'All departments' })], signed }));
    expect([walk([]).current?.step.scope, walk([]).final]).toEqual(['Own department', false]);
    expect([walk(['Payroll']).current?.step.scope, walk(['Payroll']).final]).toEqual(['All departments', true]);
  });
  test('whoever signed a layer decides no later one, and is told so', () => {
    const i = input({ steps: twoLayers, signed: ['Line manager'], signers: ['M'] });
    const w = walkChain(i);
    expect([w.current?.step.role, w.current?.deciders]).toEqual(['Payroll', ['S']]);
    expect([decisionBlock(w, i, 'M'), decisionBlock(w, i, 'S'), decisionBlock(w, i, 'E')]).toEqual(['signed', null, 'self']);
    expect(walkProgress(i).signed.map(l => l.step.role)).toEqual(['Line manager']);
  });
  test('the escalation layer applies once the SLA is breached and takes over from the unsigned layer before it', () => {
    const steps = [step(), step({ role: 'Payroll', scope: 'Own site', when: 'Only when the SLA is breached' })];
    expect(walkChain(input({ steps })).layers.map(l => l.step.role)).toEqual(['Line manager']);
    const breached = input({ steps, item: item({ facts: { slaBreached: true } }) });
    expect([walkChain(breached).current?.step.role, walkChain(breached).final]).toEqual(['Payroll', true]);
    expect(walkProgress(breached).passed.map(l => l.step.role)).toEqual(['Line manager']);
    /* the line manager signed within the SLA: the escalation does not apply */
    expect(walkChain(input({ steps, signed: ['Line manager'] })).final).toBe(true);
  });
  test("the employee's own line manager holds the Line manager layer whatever their department, given the capability and the access", () => {
    expect(walkChain(input({ item: item({ manager: 'A' }) })).current?.holders).toEqual(['M', 'S', 'A']);
    expect(walkChain(input({ item: item({ manager: 'A' }), employees: employees.map(p => (p.code === 'A' ? { ...p, caps: [] } : p)) })).current?.holders).toEqual(['M', 'S']);
  });
});
