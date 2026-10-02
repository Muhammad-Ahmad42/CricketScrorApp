export interface SingleFlight {
  run<T>(task: () => Promise<T>, ignored: T): Promise<T>;
}

export function createSingleFlight(): SingleFlight {
  let running = false;
  return {
    async run(task, ignored) {
      if (running) {
        return ignored;
      }
      running = true;
      try {
        return await task();
      } finally {
        running = false;
      }
    },
  };
}
