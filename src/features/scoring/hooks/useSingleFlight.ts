import { useRef } from 'react';

export type SingleFlight = (task: () => Promise<unknown>) => Promise<void>;

export function useSingleFlight(): SingleFlight {
  const busy = useRef(false);
  return async (task) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    try {
      await task();
    } finally {
      busy.current = false;
    }
  };
}
