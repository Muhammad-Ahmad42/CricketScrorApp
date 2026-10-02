import { create } from 'zustand';
import type { ToastStore } from './contracts';

const MAX_TOASTS = 3;

let counter = 0;

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  show(toast) {
    counter += 1;
    const id = `toast-${counter}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_TOASTS) }));
    return id;
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

export function showErrorToast(message: string, retry: (() => void) | null = null): string {
  return useToastStore.getState().show({ kind: 'error', message, action: retry === null ? null : { label: 'Try Again', run: retry } });
}
