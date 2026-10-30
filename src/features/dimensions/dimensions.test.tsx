import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '@/mocks/store';
import { tid } from '@/testids';
import { DIMENSION_KINDS } from '@/contract/dimensions';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { fault, resetTo, signInAs, snapshot } from '@/test/api-helpers';
import { DimensionsPage } from './DimensionsPage';

withFakeServer();
beforeEach(async () => { resetTo('social'); await signInAs('admin'); });
const f = (key: string) => screen.getByTestId(tid.dims.field(key));
const set = (key: string, value: string) => fireEvent.change(f(key), { target: { value } });
const openKind = async (kind: string) => {
  renderPage(<DimensionsPage />, `/setup/aloc?d=${kind}`);
  await screen.findByTestId(tid.dims.table);
};
const openAdd = async (kind = 'locations') => { await openKind(kind); await userEvent.click(screen.getByTestId(tid.dims.add)); await screen.findByTestId(tid.dims.save); };
const openEdit = async (code: string, kind = 'locations') => { await openKind(kind); await userEvent.click(screen.getByTestId(tid.dims.edit(code))); await screen.findByTestId(tid.dims.save); };
const locations = () => Object.values(store.coll<{ code: string; name: string }>('locations'));
const dialog = () => screen.getByRole('dialog');

test('DM Dimensions is an index of cards, not one long stacked page; every dimension card renders as a card, with full test id coverage', async () => {
  const { container } = renderPage(<DimensionsPage />, '/setup/aloc');
  await screen.findByTestId(tid.dims.card('locations'));
  expect(container.querySelectorAll('button[data-testid^="dims-card-"]')).toHaveLength(5);
  expect(screen.getByTestId(tid.dims.card('locations')).className).toMatch(/rounded-card/);
  expect(screen.queryByTestId(tid.dims.table)).toBeNull();
  expectTestIdCoverage(document.body);
});
test('DM All five dimensions are here, including positions and projects, and each card says how many entries it holds', async () => {
  renderPage(<DimensionsPage />, '/setup/aloc');
  for (const k of DIMENSION_KINDS) expect(await screen.findByTestId(tid.dims.card(k))).toHaveTextContent(/\d+ entr(y|ies)/);
});
/* user ruling 2026-10-27: Master data, three kinds of thing: the dimensions, positions, and projects with their tasks */
test('DF Master data groups the dimensions, positions and projects apart, and card descriptions are behind hover', async () => {
  renderPage(<DimensionsPage />, '/setup/aloc');
  await screen.findByTestId(tid.dims.card('locations'));
  expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Master data');
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.firstChild?.textContent)).toEqual(['Dimensions', 'Positions', 'Projects']);
  const cardsIn = (heading: string) => [...(screen.getByRole('heading', { level: 2, name: new RegExp(`^${heading}`) }).closest('section')?.querySelectorAll('[data-testid^="dims-card-"]') ?? [])]
    .map(c => c.getAttribute('data-testid'));
  expect(cardsIn('Dimensions')).toEqual([tid.dims.card('locations'), tid.dims.card('departments'), tid.dims.card('cost-centres')]);
  expect(cardsIn('Projects')).toEqual([tid.dims.card('projects')]);
  expect(screen.getByTestId(tid.dims.cardDescription('locations'))).toHaveClass('sr-only');
});
test('a project lists its tasks, read from its job, under its row', async () => {
  renderPage(<DimensionsPage />, '/setup/aloc?d=projects');
  await screen.findByTestId(tid.dims.table);
  const toggle = await screen.findByTestId(tid.dims.tasks('PRJ-204'));
  expect(toggle).toHaveTextContent(/^\d+ tasks$/);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(toggle);
  const list = screen.getByTestId(tid.dims.taskList('PRJ-204'));
  expect(list.querySelectorAll('li').length).toBe(Number(toggle.textContent?.split(' ')[0]));
  expectTestIdCoverage(document.body);
  await userEvent.click(toggle);
  expect(screen.queryByTestId(tid.dims.taskList('PRJ-204'))).toBeNull();
});
test('DM Opening a dimension gives it its own page, with a way back, and full test id coverage', async () => {
  renderPage(<DimensionsPage />, '/setup/aloc');
  await userEvent.click(await screen.findByTestId(tid.dims.card('locations')));
  expect(await screen.findByTestId(tid.dims.table)).toBeInTheDocument();
  expectTestIdCoverage(document.body);
  await userEvent.click(screen.getByTestId(tid.dims.back));
  expect(await screen.findByTestId(tid.dims.card('projects'))).toBeInTheDocument();
});
test('DM It shows how many things use each entry, and says removal is blocked while in use; rows offer Edit', async () => {
  await openKind('locations');
  expect(within(screen.getByTestId(tid.dims.table)).getByRole('columnheader', { name: 'In use' })).toBeInTheDocument();
  expect(screen.getByTestId(tid.page('aloc'))).toHaveTextContent('cannot be removed');
  expect(screen.getByTestId(tid.dims.edit('WH'))).toHaveTextContent('Edit');
});
test('DM The form is built from the spec, using the system field pattern, with full test id coverage', async () => {
  await openAdd();
  expect(dialog().querySelectorAll('label').length).toBeGreaterThanOrEqual(6);
  expectTestIdCoverage(document.body);
});
test('DM A required field is enforced, and a duplicate code is refused, because timesheets reference it', async () => {
  await openAdd();
  const before = snapshot('locations', 'audit');
  await userEvent.click(screen.getByTestId(tid.dims.save));
  expect(await screen.findByTestId(tid.dims.warn)).toHaveTextContent('Code is required.');
  set('code', 'WH'); set('name', 'Duplicate');
  await userEvent.click(screen.getByTestId(tid.dims.save));
  expect(await screen.findByTestId(tid.dims.warn)).toHaveTextContent('WH already exists');
  expect(snapshot('locations', 'audit')).toEqual(before);
});
test('DM A valid entry is created, says where it becomes available, and the new entry can be edited', async () => {
  await openAdd();
  set('code', 'TQ'); set('name', 'Test Quay');
  await userEvent.click(screen.getByTestId(tid.dims.save));
  expect(await screen.findByTestId(tid.toast.info)).toHaveTextContent('Test Quay created · available everywhere this site is offered');
  expect(await screen.findByTestId(tid.dims.row('TQ'))).toBeInTheDocument();
  expect(locations().map(l => l.code)).toContain('TQ');
  await userEvent.click(screen.getByTestId(tid.dims.edit('TQ')));
  expect(await screen.findByTestId(tid.dims.save)).toHaveTextContent('Save changes');
});
test('DM The code is locked once it exists, and says why', async () => {
  await openEdit('WH');
  expect(f('code')).toBeDisabled();
  expect(dialog()).toHaveTextContent('Codes cannot change');
});
test('DM An edit reports how many fields changed', async () => {
  await openEdit('BC');
  set('name', 'Beacon Court South');
  await userEvent.click(screen.getByTestId(tid.dims.save));
  expect(await screen.findByTestId(tid.toast.info)).toHaveTextContent('Beacon Court South updated · 1 field(s) changed');
  expect(locations().find(l => l.code === 'BC')?.name).toBe('Beacon Court South');
});
/* ui-review row 66, Task 23 review: an entry in use is not offered for removal
   only to be refused after a confirmation; Remove is off and says why. */
test('DM An entry in use cannot be removed: Remove is off, says why, and asks nothing', async () => {
  await openEdit('WH');
  const before = snapshot('locations');
  const remove = screen.getByTestId(tid.dims.remove);
  expect(remove).toBeDisabled();
  expect(screen.getByTestId(tid.dims.removeWhy)).toHaveTextContent(/^In use by \d+ records, so it cannot be removed\. Move those records off it first\.$/);
  expect(remove).toHaveAccessibleDescription(screen.getByTestId(tid.dims.removeWhy).textContent ?? '');
  await userEvent.click(remove);
  expect(screen.queryByRole('dialog', { name: /Remove/ })).toBeNull();
  expect(snapshot('locations')).toEqual(before);
});
/* The list said the entry was unused, but something took it into use after
   it was read: Remove is offered, asks, and the server's refusal shows its
   words and what to do next; nothing is removed. */
test('DM An entry that came into use after it was read: Remove is refused, says what uses it and what to do, and nothing changes', async () => {
  await openAdd();
  set('code', 'TQ'); set('name', 'Test Quay');
  await userEvent.click(screen.getByTestId(tid.dims.save));
  await userEvent.click(await screen.findByTestId(tid.dims.edit('TQ')));
  const remove = await screen.findByTestId(tid.dims.remove);
  expect(remove).toBeEnabled();
  const someone = Object.values(store.coll<{ location: string }>('employees'))[0];
  if (!someone) throw new Error('no seeded employee');
  someone.location = 'TQ';
  const before = snapshot('locations');
  await userEvent.click(remove);
  await userEvent.click(await screen.findByTestId(tid.modal.confirm));
  expect(await screen.findByTestId(tid.dims.warn)).toHaveTextContent('TQ is used by 1 employee. Move those first. Removing it would leave them pointing at nothing.');
  expect(snapshot('locations')).toEqual(before);
  expect(locations().map(l => l.code)).toContain('TQ');
});
test('DM An unused entry can be removed, and it is gone from the list', async () => {
  await openAdd();
  set('code', 'TQ'); set('name', 'Test Quay');
  await userEvent.click(screen.getByTestId(tid.dims.save));
  await userEvent.click(await screen.findByTestId(tid.dims.edit('TQ')));
  await userEvent.click(await screen.findByTestId(tid.dims.remove));
  await userEvent.click(await screen.findByTestId(tid.modal.confirm));
  expect(await screen.findByText(/Test Quay removed/)).toBeInTheDocument();
  expect(screen.queryByTestId(tid.dims.row('TQ'))).toBeNull();
  expect(locations().map(l => l.code)).not.toContain('TQ');
});
test('DM Remove asks for confirmation', async () => {
  await openAdd();
  set('code', 'TQ'); set('name', 'Test Quay');
  await userEvent.click(screen.getByTestId(tid.dims.save));
  await userEvent.click(await screen.findByTestId(tid.dims.edit('TQ')));
  await userEvent.click(await screen.findByTestId(tid.dims.remove));
  /* nothing is sent until the question is answered */
  const ask = await screen.findByRole('dialog', { name: /Remove Test Quay/ });
  expect(ask).toHaveTextContent('cannot be undone');
  expect(locations().map(l => l.code)).toContain('TQ');
  /* keeping it closes only the question; the form stays */
  await userEvent.click(within(ask).getByTestId(tid.modal.cancel));
  expect(screen.queryByRole('dialog', { name: /Remove Test Quay/ })).toBeNull();
  expect(screen.getByTestId(tid.dims.save)).toBeInTheDocument();
  expect(locations().map(l => l.code)).toContain('TQ');
  await userEvent.click(screen.getByTestId(tid.dims.remove));
  await userEvent.click(await screen.findByTestId(tid.modal.confirm));
  await waitFor(() => expect(locations().map(l => l.code)).not.toContain('TQ'));
});
test('DM One form serves every dimension', async () => {
  for (const kind of DIMENSION_KINDS) {
    const view = renderPage(<DimensionsPage />, `/setup/aloc?d=${kind}`);
    await userEvent.click(await screen.findByTestId(tid.dims.add));
    expect(await screen.findByTestId(tid.dims.field('code')), kind).toBeInTheDocument();
    expect(screen.getByTestId(tid.dims.field('name')), kind).toBeInTheDocument();
    view.unmount();
  }
});
test('DM Boolean fields render as toggles, not text', async () => {
  await openAdd('positions');
  expect(f('night')).toHaveAttribute('role', 'switch');
});
test('a failed save shows the refusal and leaves the store unchanged', async () => {
  const before = snapshot('locations');
  await openAdd();
  set('code', 'TQ'); set('name', 'Test Quay');
  await fault('POST', '/api/v1/locations');
  await userEvent.click(screen.getByTestId(tid.dims.save));
  expect(await screen.findByTestId(tid.toast.error)).toHaveTextContent('Nothing has been changed');
  expect(snapshot('locations')).toEqual(before);
});
