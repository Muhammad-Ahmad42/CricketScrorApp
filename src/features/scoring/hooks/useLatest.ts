import { useRef } from 'react';

export function useLatest<T>(value: T | null): T | null {
  const last = useRef<T | null>(null);
  if (value !== null) {
    last.current = value;
  }
  return value ?? last.current;
}
