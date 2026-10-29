import { managerName, resolveManager } from './manager';

const people = [{ code: 'CP-1', name: 'James Smith' }, { code: 'CP-2', name: 'James Smith' }, { code: 'CP-3', name: 'Amara Okafor' }];

test('a code names one person even when two share a name', () => {
  expect(resolveManager('CP-2', 'CP-3', people)?.code).toBe('CP-2');
  expect(resolveManager('CP-1', 'CP-3', people)?.code).toBe('CP-1');
});
test('an older record holding a name still resolves', () => {
  expect(resolveManager('Amara Okafor', 'CP-1', people)?.code).toBe('CP-3');
});
test('nobody manages themselves, and an empty value is no manager', () => {
  expect(resolveManager('CP-3', 'CP-3', people)).toBeUndefined();
  expect(resolveManager('  ', 'CP-3', people)).toBeUndefined();
});
test('a manager who is not an employee is shown as written', () => {
  expect(managerName('Eddie Harford', 'CP-1', people)).toBe('Eddie Harford');
  expect(managerName('CP-3', 'CP-1', people)).toBe('Amara Okafor');
});
