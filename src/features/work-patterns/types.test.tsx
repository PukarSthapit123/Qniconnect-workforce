import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '@/mocks/store';
import { tid } from '@/testids';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { fault, resetTo, signInAs, snapshot } from '@/test/api-helpers';
import { WorkPatternsPage } from './WorkPatternsPage';
import { slugOf } from './NewTypeModal';

withFakeServer();
beforeEach(async () => { resetTo('social'); await signInAs('admin'); });
const types = () => Object.values(store.coll<{ id: string; code: string; name: string; fieldGroups: string[] }>('workPatterns'));
const openNew = async () => {
  renderPage(<WorkPatternsPage />);
  await userEvent.click(await screen.findByTestId(tid.types.add));
  await screen.findByTestId(tid.types.newSave);
};
const createWaking = async () => {
  await openNew();
  fireEvent.change(screen.getByTestId(tid.types.newField('name')), { target: { value: 'Waking Night Support' } });
  await userEvent.click(screen.getByTestId(tid.types.newSave));
  await waitFor(() => expect(screen.getByTestId(tid.types.list)).toHaveTextContent('Waking Night Support'));
};
/* the type dropdown: open it, then choose */
const chooseType = async (code: string) => {
  await userEvent.click(await screen.findByTestId(tid.types.list));
  await userEvent.click(await screen.findByTestId(tid.types.chip(code)));
};

test('AD Work patterns is no longer the densest page in the admin, and it says where the fields went, with full test id coverage', async () => {
  renderPage(<WorkPatternsPage />);
  const detail = await screen.findByTestId(tid.types.detail);
  expect(detail.querySelectorAll('[role="switch"]').length).toBeLessThanOrEqual(6);
  expect(detail).toHaveTextContent('set in Timesheet setup');
  /* each is a link to that module's setup page while the admin can reach it */
  expect(await screen.findByTestId(tid.types.setupLink('mts'))).toHaveAttribute('href', '/setup/mts');
  expectTestIdCoverage(document.body);
});
test('ET A New work pattern control exists, and the new-type form has full test id coverage', async () => {
  await openNew();
  expectTestIdCoverage(document.body);
});
test('ET It can start blank, from a live type, or from an archetype', async () => {
  await openNew();
  const base = screen.getByTestId(tid.types.newField('base'));
  expect(base.querySelectorAll('optgroup')).toHaveLength(2);
  expect(base.querySelector('option[value="blank"]')).not.toBeNull();
});
test('ET It asks for entry mode and pay basis', async () => {
  await openNew();
  expect(screen.getByTestId(tid.types.newField('mode'))).toBeInTheDocument();
  expect(screen.getByTestId(tid.types.newField('uom'))).toBeInTheDocument();
});
test('ET A name is required', async () => {
  await openNew();
  const before = snapshot('workPatterns');
  await userEvent.click(screen.getByTestId(tid.types.newSave));
  expect(await screen.findByTestId(tid.types.newWarn)).toHaveTextContent('A name is required.');
  expect(snapshot('workPatterns')).toEqual(before);
});
test('ET A type is created, it appears in the type list, and it can be removed', async () => {
  await createWaking();
  expect(screen.getByTestId(tid.toast.info)).toHaveTextContent('Waking Night Support created');
  expect(types().map(t => t.code)).toContain('waking_night_support');
  await userEvent.click(screen.getByTestId(tid.types.remove));
  await userEvent.click(await screen.findByTestId(tid.modal.confirm));
  expect(await screen.findByText(/Waking Night Support removed/)).toBeInTheDocument();
  expect(types().map(t => t.code)).not.toContain('waking_night_support');
});
/* The type was unheld when it was read, then someone was given it: Remove
   is offered, asks, and the server's refusal shows its words and what to do
   next; nothing is removed. */
test('ET A type taken into use after it was read: Remove is refused, says who holds it and what to do, and nothing changes', async () => {
  await createWaking();
  const remove = screen.getByTestId(tid.types.remove);
  expect(remove).toBeEnabled();
  const someone = Object.values(store.coll<{ workPattern: string }>('employees'))[0];
  if (!someone) throw new Error('no seeded employee');
  someone.workPattern = 'waking_night_support';
  const before = snapshot('workPatterns', 'employees');
  await userEvent.click(remove);
  await userEvent.click(await screen.findByTestId(tid.modal.confirm));
  expect(await screen.findByTestId(tid.types.warn)).toHaveTextContent('waking_night_support is used by 1 employee. Move those first. Removing it would leave them pointing at nothing.');
  expect(snapshot('workPatterns', 'employees')).toEqual(before);
});
test('Remove asks for confirmation', async () => {
  await createWaking();
  await userEvent.click(screen.getByTestId(tid.types.remove));
  const ask = await screen.findByRole('dialog', { name: /Remove Waking Night Support/ });
  expect(types().map(t => t.code)).toContain('waking_night_support');
  await userEvent.click(within(ask).getByTestId(tid.modal.cancel));
  expect(screen.queryByRole('dialog', { name: /Remove Waking Night Support/ })).toBeNull();
  expect(types().map(t => t.code)).toContain('waking_night_support');
  await userEvent.click(screen.getByTestId(tid.types.remove));
  await userEvent.click(await screen.findByTestId(tid.modal.confirm));
  await waitFor(() => expect(types().map(t => t.code)).not.toContain('waking_night_support'));
});
/* ui-review row 64, Task 23 review: a type employees hold is not offered for
   removal; Remove this type is off, and says why. */
test('ET A type employees hold cannot be removed: Remove is off, says why, and asks nothing', async () => {
  renderPage(<WorkPatternsPage />);
  await chooseType('shift');
  const before = snapshot('workPatterns', 'employees');
  const remove = await screen.findByTestId(tid.types.remove);
  expect(remove).toBeDisabled();
  expect(screen.getByTestId(tid.types.heldBy)).toHaveTextContent(/^Held by \d+ employees? · code shift$/);
  expect(screen.getByTestId(tid.types.removeWhy)).toHaveTextContent(/^It cannot be removed while employees hold it\. Move them to another type first\.$/);
  expect(remove).toHaveAccessibleDescription(screen.getByTestId(tid.types.removeWhy).textContent ?? '');
  await userEvent.click(remove);
  expect(screen.queryByRole('dialog', { name: /Remove/ })).toBeNull();
  expect(snapshot('workPatterns', 'employees')).toEqual(before);
});
test('a field group switched on is saved and reported', async () => {
  renderPage(<WorkPatternsPage />);
  await chooseType('shift');
  await userEvent.click(await screen.findByTestId(tid.types.cap('vehicle')));
  await userEvent.click(screen.getByTestId(tid.types.save));
  expect(await screen.findByTestId(tid.toast.info)).toHaveTextContent('1 field(s) changed');
  expect(types().find(t => t.code === 'shift')?.fieldGroups).toContain('vehicle');
});
test('DM Positions no longer live on the Work patterns page', async () => {
  renderPage(<WorkPatternsPage />);
  expect(await screen.findByTestId(tid.types.jobs)).toHaveTextContent('held once under Dimensions');
  expect(screen.getByTestId(tid.types.jobsLink)).toHaveAttribute('href', '/setup/aloc?d=positions');
});
test('a failed save shows the refusal and leaves the type as it was', async () => {
  const before = snapshot('workPatterns');
  renderPage(<WorkPatternsPage />);
  await userEvent.click(await screen.findByTestId(tid.types.cap('vehicle')));
  const first = types().sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!first) throw new Error('no types');
  await fault('PATCH', `/api/v1/work-patterns/${first.id}`);
  await userEvent.click(screen.getByTestId(tid.types.save));
  expect(await screen.findByTestId(tid.toast.error)).toHaveTextContent('Nothing has been changed');
  expect(snapshot('workPatterns')).toEqual(before);
});
test('a type code is suggested from its name', () => {
  expect(slugOf('Waking Night Support')).toBe('waking_night_support');
  expect(slugOf('  24/7 Cover ')).toBe('cover_24_7');
});
