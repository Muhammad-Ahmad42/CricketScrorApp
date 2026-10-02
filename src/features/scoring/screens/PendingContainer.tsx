import { useRef, useState } from 'react';
import type { LiveMatch } from '@/services/contracts';
import { batterIn, selectBowler, type ScoringIntent } from '@/domain/scoring/commands';
import { useLiveMatchStore, useSettingsStore } from '@/stores';
import { ConfirmResultPanel, MatchOverPanel, RepairPanel, ResolveTiePanel, ResumePlayPanel } from '../components/pending/MatchPanels';
import { NextBatterPanel, NextBowlerPanel } from '../components/pending/PlayerPanels';
import { StartInningsPanel } from '../components/pending/StartInningsPanel';
import { sendIntent } from '../hooks/actions';
import { selectNextBatter, selectNextBowler, selectStartInnings, selectSuspension } from '../selectors/options';
import type { SheetKind } from './sheetKinds';

export interface PendingContainerProps {
  readonly onOpen: (sheet: SheetKind) => void;
  readonly onUndo: () => void;
  readonly onReview: (seq: number) => void;
  readonly onScorecard: () => void;
  readonly onAnalytics: () => void;
  readonly onConfirmed: () => void;
}

export function PendingContainer({ onOpen, onUndo, onReview, onScorecard, onAnalytics, onConfirmed }: PendingContainerProps) {
  const live = useLiveMatchStore((s) => s.live);
  const confirmInningsEnd = useSettingsStore((s) => s.settings.scoring.confirmInningsEnd);
  const autoPromptBowler = useSettingsStore((s) => s.settings.scoring.autoPromptBowler);
  const [expandedFor, setExpandedFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const sentFor = useRef<LiveMatch | null>(null);
  if (live === null) {
    return null;
  }
  const { setup, state } = live;
  const run = async (intent: ScoringIntent): Promise<boolean> => {
    if (sentFor.current === live) {
      return false;
    }
    sentFor.current = live;
    setBusy(true);
    const result = await sendIntent(intent);
    setBusy(false);
    if (!result.ok) {
      sentFor.current = null;
    }
    return result.ok;
  };

  if (state.needsRepair) {
    const issue = state.issues.find((entry) => entry.severity === 'error') ?? state.issues[0];
    const isDelivery = issue !== undefined && live.events.some((event) => event.seq === issue.seq && event.kind === 'delivery');
    return (
      <RepairPanel
        message={issue?.message ?? 'An event in the log is invalid.'}
        canReview={isDelivery}
        onReview={() => {
          if (issue !== undefined) {
            onReview(issue.seq);
          }
        }}
        onUndo={onUndo}
      />
    );
  }

  const pending = state.pendingAction;
  if (pending === null) {
    if (state.lifecycle === 'completed' || state.lifecycle === 'abandoned') {
      return <MatchOverPanel resultText={state.resultText ?? 'Match complete'} onScorecard={onScorecard} onAnalytics={onAnalytics} />;
    }
    return null;
  }

  switch (pending.type) {
    case 'start_next_innings':
      return (
        <StartInningsPanel
          key={`start-${pending.inningsIndex}-${pending.superOverRound ?? 0}`}
          vm={selectStartInnings(setup, state, pending)}
          confirmFirst={confirmInningsEnd && state.innings.length > 0}
          busy={busy}
          onStart={(intent) => void run(intent)}
          onUndo={onUndo}
        />
      );
    case 'select_next_batter':
      return (
        <NextBatterPanel
          vm={selectNextBatter(setup, state, pending)}
          onPick={(playerId) => void run(batterIn(playerId, pending.position))}
          onEndInnings={() => onOpen('end_innings')}
          onAddPlayer={() => onOpen('add_batter')}
          onUndo={onUndo}
        />
      );
    case 'select_next_bowler': {
      const vm = selectNextBowler(setup, state, pending);
      if (vm === null) {
        return null;
      }
      return (
        <NextBowlerPanel
          vm={vm}
          collapsed={!autoPromptBowler && expandedFor !== state.lastSeq}
          onExpand={() => setExpandedFor(state.lastSeq)}
          onPick={(playerId) => void run(selectBowler(playerId))}
          onAddPlayer={() => onOpen('add_bowler')}
          onUndo={onUndo}
        />
      );
    }
    case 'resume_play': {
      const vm = selectSuspension(setup, state);
      return (
        <ResumePlayPanel
          vm={vm ?? { heading: 'Play suspended', since: null }}
          onResume={() => void run({ type: 'resume_play' })}
          onReviseOvers={() => onOpen('revise')}
          onEndMatch={() => onOpen('end_match')}
          onPenalty={() => onOpen('penalty')}
          onUndo={onUndo}
        />
      );
    }
    case 'confirm_result':
      return (
        <ConfirmResultPanel
          text={pending.text}
          inTournament={live.match.tournamentId !== null}
          busy={busy}
          onConfirm={() => {
            void run({ type: 'end_match', outcome: { type: 'natural' } }).then((ok) => {
              if (ok) {
                onConfirmed();
              }
            });
          }}
          onUndo={onUndo}
        />
      );
    case 'resolve_tie': {
      const regular = state.innings.filter((innings) => innings.kind === 'regular');
      const level = regular.length === 2 && regular[0].runs === regular[1].runs ? ` · ${regular[0].runs} each` : '';
      return (
        <ResolveTiePanel
          heading={`Match tied${level}`}
          options={pending.options}
          nextRound={pending.nextSuperOverRound}
          onSuperOver={() => void run({ type: 'start_super_over' })}
          onAcceptTie={() => {
            void run({ type: 'end_match', outcome: { type: 'natural' } }).then((ok) => {
              if (ok) {
                onConfirmed();
              }
            });
          }}
          onDecideOther={() => onOpen('decide_tie')}
          onUndo={onUndo}
        />
      );
    }
    default: {
      const unreachable: never = pending;
      return unreachable;
    }
  }
}
