export interface SerialQueue {
  run<T>(task: () => Promise<T>, cancelled: T): Promise<T>;
  reset(): void;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  let generation = 0;
  return {
    run(task, cancelled) {
      const ticket = generation;
      const next = tail.then(() => (ticket === generation ? task() : cancelled));
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    reset() {
      generation += 1;
    },
  };
}
