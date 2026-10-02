export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  const entriesA = Object.entries(a).filter(([, value]) => value !== undefined);
  const entriesB = new Map(Object.entries(b).filter(([, value]) => value !== undefined));
  return entriesA.length === entriesB.size && entriesA.every(([key, value]) => entriesB.has(key) && deepEqual(value, entriesB.get(key)));
}
