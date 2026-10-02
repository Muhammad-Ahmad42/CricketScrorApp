import type { ScoringIntent } from '@/domain/scoring/commands';
import type { ServiceError } from '@/services/contracts';
import { useLiveMatchStore, useToastStore } from '@/stores';
import { lastActionText } from '../selectors/announce';
import type { SubmitResult } from '../sheets/WicketSheet';

export const SAVE_FAILED = "Couldn't save this delivery. Your previous match data is still safe.";
export const CONFLICT_MESSAGE = 'This match was updated elsewhere. Showing the latest score.';

export interface SendOptions {
  readonly quietValidation?: boolean;
}

function toastFor(error: ServiceError | null, retry: () => void, quietValidation: boolean): void {
  const toasts = useToastStore.getState();
  if (error?.code === 'CONFLICT') {
    toasts.show({ kind: 'warning', message: CONFLICT_MESSAGE, action: null });
    return;
  }
  if (error?.code === 'VALIDATION' || error?.code === 'FORBIDDEN_STATE') {
    if (!quietValidation) {
      toasts.show({ kind: 'error', message: error.message, action: null });
    }
    return;
  }
  toasts.show({ kind: 'error', message: SAVE_FAILED, action: { label: 'Try again', run: retry } });
}

export async function sendIntent(intent: ScoringIntent, options: SendOptions = {}): Promise<SubmitResult> {
  const ok = await useLiveMatchStore.getState().dispatch(intent);
  if (ok) {
    return { ok: true };
  }
  const store = useLiveMatchStore.getState();
  const error = store.error;
  toastFor(error, () => void sendIntent(intent, options), options.quietValidation === true);
  store.clearError();
  return { ok: false, message: error?.message ?? SAVE_FAILED, code: error?.domainCode ?? null };
}

export type UndoOutcome = 'done' | 'needs_reason' | 'failed';

export function undoneMessage(what: string | null): string {
  return what === null ? 'Last action undone' : `Undone: ${what}`;
}

export async function undoLast(reason?: string): Promise<UndoOutcome> {
  const what = lastActionText(useLiveMatchStore.getState().live);
  const ok = await useLiveMatchStore.getState().undo(reason);
  const store = useLiveMatchStore.getState();
  if (ok) {
    useToastStore.getState().show({
      kind: 'info',
      message: undoneMessage(what),
      action: { label: 'Redo', run: () => void redoLast() },
    });
    return 'done';
  }
  const error = store.error;
  store.clearError();
  if (error?.code === 'CONFIRMATION_REQUIRED') {
    return 'needs_reason';
  }
  useToastStore.getState().show({ kind: 'error', message: error?.message ?? "Couldn't undo. Your match data is still safe.", action: null });
  return 'failed';
}

export async function redoLast(reason?: string): Promise<UndoOutcome> {
  const ok = await useLiveMatchStore.getState().redo(reason);
  if (ok) {
    return 'done';
  }
  const store = useLiveMatchStore.getState();
  const error = store.error;
  store.clearError();
  if (error?.code === 'CONFIRMATION_REQUIRED') {
    return 'needs_reason';
  }
  useToastStore.getState().show({ kind: 'error', message: error?.message ?? "Couldn't redo.", action: null });
  return 'failed';
}

export async function swapStrikeWithToast(): Promise<void> {
  const result = await sendIntent({ type: 'swap_strike' });
  if (result.ok) {
    useToastStore.getState().show({ kind: 'info', message: 'Strike swapped', action: { label: 'Undo', run: () => void undoLast() } });
  }
}
