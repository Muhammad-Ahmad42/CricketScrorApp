import { useToastStore, type Toast } from '@/stores';

export function showToast(kind: Toast['kind'], message: string, action: Toast['action'] = null): void {
  useToastStore.getState().show({ kind, message, action });
}

export function showError(error: { readonly message: string } | null, fallback: string): void {
  showToast('error', error?.message ?? fallback);
}
