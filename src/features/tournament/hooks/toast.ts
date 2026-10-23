import { useToastStore, type Toast } from '@/stores';

export interface ShownError {
  readonly message: string;
  readonly headline?: string;
  readonly supporting?: string | null;
}

export function showToast(kind: Toast['kind'], message: string, action: Toast['action'] = null): void {
  useToastStore.getState().show({ kind, message, action });
}

export function errorHeadline(error: ShownError | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  return error.headline ?? error.message;
}

export function showError(error: ShownError | null, fallback: string): void {
  showToast('error', error?.message ?? fallback);
}
