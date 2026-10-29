/* An employee's line manager is stored as the manager's employee code, which
   names one person and survives a rename. Records written before that still
   carry a name, so a value that is no one's code is read as a name. A
   manager who is not an employee (an outside line manager) is kept as
   written. */
export function resolveManager<T extends { code: string; name: string }>(manager: string, selfCode: string, people: readonly T[]): T | undefined {
  const m = manager.trim();
  if (!m) return undefined;
  return people.find(p => p.code === m && p.code !== selfCode) ?? people.find(p => p.name === m && p.code !== selfCode);
}
/* what to show for the stored value: the manager's name, or the text as written */
export const managerName = (manager: string, selfCode: string, people: readonly { code: string; name: string }[]): string =>
  resolveManager(manager, selfCode, people)?.name ?? manager.trim();
