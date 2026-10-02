export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((entry: unknown) => deepFreeze(entry));
  }
  return value;
}

export function engineReady(probe: () => unknown): boolean {
  try {
    probe();
    return true;
  } catch (error) {
    return !(error instanceof Error && error.message === 'not implemented');
  }
}
