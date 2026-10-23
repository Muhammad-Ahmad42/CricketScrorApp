import { useRef, useState } from 'react';
import type { ImpactSummary, ProposedChange } from '@/domain/types';
import type { ChangePreview } from '@/services/contracts';
import { useTournamentStore } from '@/stores';
import { tournamentIndex, type TournamentIndex } from '../selectors/names';
import { changeNeedsReason } from '../selectors/policy';
import { showError, showToast } from './toast';

export const CONFLICT_NOTICE = 'Tournament changed. Review again.';

export type ChangeBuilder = (index: TournamentIndex) => ProposedChange | null;

export type ChangeSource = ProposedChange | ChangeBuilder;

export interface ChangeFlowOptions {
  readonly successMessage?: string;
  readonly reason?: string;
  readonly reasonRequired?: boolean;
  readonly onApplied?: () => void;
}

interface FlowState {
  readonly change: ProposedChange | null;
  readonly preview: ChangePreview | null;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly initialReason: string;
  readonly reasonRequired: boolean;
}

const IDLE: FlowState = { change: null, preview: null, busy: false, notice: null, initialReason: '', reasonRequired: false };

export interface ChangeFlowSheetProps {
  readonly impact: ImpactSummary | null;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly initialReason: string;
  readonly reasonRequired: boolean;
  readonly onCancel: () => void;
  readonly onContinue: (reason: string | null) => void;
}

export interface ChangeFlow {
  readonly start: (source: ChangeSource, options?: ChangeFlowOptions) => Promise<boolean>;
  readonly previewing: boolean;
  readonly open: boolean;
  readonly sheet: ChangeFlowSheetProps;
}

interface Resolved {
  readonly change: ProposedChange;
  readonly reasonRequired: boolean;
}

function currentIndex(): TournamentIndex | null {
  const { snapshot, evaluation } = useTournamentStore.getState();
  return snapshot ? tournamentIndex(snapshot, evaluation) : null;
}

function resolve(source: ChangeSource, options: ChangeFlowOptions): Resolved | null {
  const index = currentIndex();
  let change: ProposedChange | null;
  if (typeof source === 'function') {
    change = index ? source(index) : null;
  } else {
    change = source;
  }
  if (change === null) {
    return null;
  }
  const byPolicy = index !== null && changeNeedsReason(index, change);
  return { change, reasonRequired: (options.reasonRequired ?? false) || byPolicy };
}

export function useChangeFlow(): ChangeFlow {
  const [state, setState] = useState<FlowState>(IDLE);
  const [previewing, setPreviewing] = useState(false);
  const source = useRef<ChangeSource | null>(null);
  const options = useRef<ChangeFlowOptions>({});

  const start = async (next: ChangeSource, opts: ChangeFlowOptions = {}): Promise<boolean> => {
    const resolved = resolve(next, opts);
    if (resolved === null) {
      return false;
    }
    source.current = next;
    options.current = opts;
    setPreviewing(true);
    const store = useTournamentStore.getState();
    const preview = await store.previewChange(resolved.change);
    setPreviewing(false);
    if (preview === null) {
      showError(useTournamentStore.getState().error, "Couldn't preview this change. Nothing was changed.");
      return false;
    }
    setState({
      change: resolved.change,
      preview,
      busy: false,
      notice: null,
      initialReason: opts.reason ?? '',
      reasonRequired: resolved.reasonRequired,
    });
    return true;
  };

  const cancel = () => {
    source.current = null;
    setState(IDLE);
  };

  const confirm = async (reason: string | null) => {
    const { change, preview } = state;
    if (change === null || preview === null) {
      return;
    }
    setState((current) => ({ ...current, busy: true }));
    const store = useTournamentStore.getState();
    const applied = await store.applyChange(change, reason, preview);
    if (applied) {
      const { successMessage, onApplied } = options.current;
      source.current = null;
      setState(IDLE);
      showToast('success', successMessage ?? 'Changes applied');
      onApplied?.();
      return;
    }
    const error = useTournamentStore.getState().error;
    if (error?.code === 'CONFLICT' && source.current !== null) {
      await useTournamentStore.getState().refresh();
      const rebuilt = resolve(source.current, options.current);
      const fresh = rebuilt ? await useTournamentStore.getState().previewChange(rebuilt.change) : null;
      if (rebuilt && fresh) {
        setState((current) => ({
          ...current,
          change: rebuilt.change,
          preview: fresh,
          busy: false,
          notice: CONFLICT_NOTICE,
          initialReason: reason ?? current.initialReason,
          reasonRequired: rebuilt.reasonRequired,
        }));
        return;
      }
    }
    setState((current) => ({ ...current, busy: false }));
    showError(useTournamentStore.getState().error, "Couldn't apply this change. Nothing was changed.");
  };

  return {
    start,
    previewing,
    open: state.preview !== null,
    sheet: {
      impact: state.preview?.impact ?? null,
      busy: state.busy,
      notice: state.notice,
      initialReason: state.initialReason,
      reasonRequired: state.reasonRequired,
      onCancel: cancel,
      onContinue: (reason) => {
        void confirm(reason);
      },
    },
  };
}
