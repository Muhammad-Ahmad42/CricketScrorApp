export interface Mutex {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export function createMutex(): Mutex {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(work: () => Promise<T>): Promise<T> {
      const result = tail.then(() => work());
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
