import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { IconButton, ScoringPad, type HeroSize } from '@/ui';
import { scoreRuns } from '@/domain/scoring/commands';
import { useLiveMatchStore, useSettingsStore } from '@/stores';
import { ActionRow } from '../components/ActionRow';
import { CreasePanel } from '../components/CreasePanel';
import { CurrentOver } from '../components/CurrentOver';
import { InningsSummary } from '../components/InningsSummary';
import { RetirementBanner } from '../components/RetirementBanner';
import { ScoreHeader, type ScoreShortcut } from '../components/ScoreHeader';
import { TopBar } from '../components/common/TopBar';
import { sendIntent, swapStrikeWithToast } from '../hooks/actions';
import { useCommitAnnouncer } from '../hooks/useCommitAnnouncer';
import { playerName } from '../selectors/names';
import { memoizeLast, memoizeLast2 } from '../selectors/memo';
import { selectBowler, selectCrease, selectHeader, selectInningsSummary, selectLastBall, selectMatchTitle, selectOverStrip } from '../selectors/scoreboard';
import { InningsCard } from '@/features/scorecard/components/InningsCard';
import { selectInningsCards } from '@/features/scorecard/selectors/innings';

const headerOf = memoizeLast(selectHeader);
const lastBallOf = memoizeLast(selectLastBall);
const creaseOf = memoizeLast(selectCrease);
const bowlerOf = memoizeLast(selectBowler);
const titleOf = memoizeLast(selectMatchTitle);
const overOf = memoizeLast2(selectOverStrip);
const summaryOf = memoizeLast(selectInningsSummary);
import { leaveMatch } from './MatchGate';

export const LIVE_SUMMARY_OVERS = 3;

export function CommitAnnouncer() {
  useCommitAnnouncer();
  return null;
}

export interface TitleBarContainerProps {
  readonly onMore: () => void;
  readonly onUndo?: () => void;
}

export function TitleBarContainer({ onMore, onUndo }: TitleBarContainerProps) {
  const vm = useLiveMatchStore(useShallow((s) => titleOf(s.live)));
  const canUndo = useLiveMatchStore((s) => (s.live?.events.length ?? 0) > 1);
  return (
    <TopBar
      title={vm.title}
      badge={vm.paused ? 'Paused' : null}
      onBack={leaveMatch}
      backLabel="Leave scoring"
      trailing={
        <>
          {onUndo ? (
            <IconButton
              icon="undo-2"
              accessibilityLabel="Undo last action"
              accessibilityHint={canUndo ? undefined : 'Nothing to undo'}
              disabled={!canUndo}
              onPress={onUndo}
              testID="score-top-undo"
            />
          ) : null}
          <IconButton
            icon="ellipsis"
            accessibilityLabel={onUndo ? 'More actions' : 'Match menu'}
            accessibilityHint={onUndo ? 'Swap strike, change bowler, scorecard and more' : 'Scorecard, ball by ball, analytics, match settings'}
            onPress={onMore}
            testID="score-top-more"
          />
        </>
      }
      testID="score-top-bar"
    />
  );
}

export interface HeaderContainerProps {
  readonly heroSize?: HeroSize;
  readonly compact: boolean;
  readonly lean?: boolean;
  readonly onScorecard: () => void;
  readonly shortcuts?: readonly ScoreShortcut[];
  readonly onShortcut?: (shortcut: ScoreShortcut) => void;
}

export function HeaderContainer({ heroSize, compact, lean = false, onScorecard, shortcuts, onShortcut }: HeaderContainerProps) {
  const vm = useLiveMatchStore(useShallow((s) => headerOf(s.live)));
  const last = useLiveMatchStore(useShallow((s) => lastBallOf(s.live)));
  return (
    <ScoreHeader
      vm={vm}
      heroSize={heroSize}
      compact={compact}
      lean={lean}
      flashSix={last.six}
      wicketTrigger={last.kind === 'wicket' ? last.seq : null}
      onPressScore={onScorecard}
      shortcuts={shortcuts}
      onShortcut={onShortcut}
    />
  );
}

export interface CreaseContainerProps {
  readonly compact: boolean;
  readonly lean?: boolean;
  readonly onBatter: () => void;
  readonly onBowler: () => void;
}

export function CreaseContainer({ compact, lean = false, onBatter, onBowler }: CreaseContainerProps) {
  const crease = useLiveMatchStore((s) => creaseOf(s.live));
  const bowler = useLiveMatchStore((s) => bowlerOf(s.live));
  return <CreasePanel crease={crease} bowler={bowler} compact={compact} lean={lean} onPressBatter={onBatter} onPressBowler={onBowler} />;
}

export function OverContainer({ compact = false, lean = false }: { readonly compact?: boolean; readonly lean?: boolean }) {
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  const vm = useLiveMatchStore((s) => overOf(s.live, dotStyle));
  return <CurrentOver vm={vm} showLabel={!lean} size={compact || lean ? 'md' : 'lg'} />;
}

export function SummaryContainer() {
  const vm = useLiveMatchStore((s) => summaryOf(s.live));
  return vm === null ? null : <InningsSummary vm={vm} />;
}

export function ScorecardSummaryContainer() {
  const live = useLiveMatchStore((s) => s.live);
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  if (live === null) {
    return null;
  }
  const cards = selectInningsCards(live.setup, live.state, dotStyle);
  const latest = cards[cards.length - 1];
  return latest === undefined ? null : <InningsCard vm={latest} maxOvers={LIVE_SUMMARY_OVERS} testID="score-summary-innings" />;
}

export function RetirementContainer({ onRetire }: { readonly onRetire: (playerId: string) => void }) {
  const due = useLiveMatchStore((s) => s.live?.state.retirementsDue ?? null);
  const setup = useLiveMatchStore((s) => s.live?.setup ?? null);
  const lastSeq = useLiveMatchStore((s) => s.live?.state.lastSeq ?? 0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const first = due?.[0];
  if (first === undefined || setup === null || dismissedAt === lastSeq) {
    return null;
  }
  return (
    <RetirementBanner
      message={`${playerName(setup, first.playerId)} reached ${first.atRuns} · retire now?`}
      onRetire={() => onRetire(first.playerId)}
      onDismiss={() => setDismissedAt(lastSeq)}
    />
  );
}

export interface PadContainerProps {
  readonly compact: boolean;
  readonly tablet: boolean;
  readonly actions?: boolean;
  readonly onExtras: () => void;
  readonly onWicket: () => void;
  readonly onMore: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

export function PadContainer({ compact, tablet, actions = true, onExtras, onWicket, onMore, onUndo, onRedo }: PadContainerProps) {
  const canUndo = useLiveMatchStore((s) => (s.live?.events.length ?? 0) > 1);
  const canRedo = useLiveMatchStore((s) => s.redoStack.length > 0);
  const canSwap = useLiveMatchStore((s) => creaseOf(s.live).canSwap);
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  return (
    <>
      {actions ? (
        <ActionRow
          canUndo={canUndo}
          canRedo={canRedo}
          canSwap={canSwap}
          showRedo={!compact}
          onUndo={onUndo}
          onRedo={onRedo}
          onSwap={() => void swapStrikeWithToast()}
          onMore={onMore}
        />
      ) : null}
      <ScoringPad
        onRuns={(runs) => void sendIntent(scoreRuns(runs))}
        onExtras={onExtras}
        onWicket={onWicket}
        dotStyle={dotStyle}
        tabletPane={tablet}
        well={false}
        bottomInset={false}
      />
    </>
  );
}
