import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { IconButton, ScoringPad, type HeroSize } from '@/ui';
import { scoreRuns } from '@/domain/scoring/commands';
import { useLiveMatchStore, useSettingsStore } from '@/stores';
import { ActionRow } from '../components/ActionRow';
import { CreasePanel } from '../components/CreasePanel';
import { CurrentOver } from '../components/CurrentOver';
import { RetirementBanner } from '../components/RetirementBanner';
import { ScoreHeader, type ScoreShortcut } from '../components/ScoreHeader';
import { TopBar } from '../components/common/TopBar';
import { sendIntent, swapStrikeWithToast } from '../hooks/actions';
import { useCommitAnnouncer } from '../hooks/useCommitAnnouncer';
import { playerName } from '../selectors/names';
import { memoizeLast, memoizeLast2 } from '../selectors/memo';
import { selectBowler, selectCrease, selectHeader, selectLastBall, selectMatchTitle, selectOverStrip } from '../selectors/scoreboard';

const headerOf = memoizeLast(selectHeader);
const lastBallOf = memoizeLast(selectLastBall);
const creaseOf = memoizeLast(selectCrease);
const bowlerOf = memoizeLast(selectBowler);
const titleOf = memoizeLast(selectMatchTitle);
const overOf = memoizeLast2(selectOverStrip);
import { leaveMatch } from './MatchGate';

export function CommitAnnouncer() {
  useCommitAnnouncer();
  return null;
}

export function TitleBarContainer({ onMore }: { readonly onMore: () => void }) {
  const vm = useLiveMatchStore(useShallow((s) => titleOf(s.live)));
  return (
    <TopBar
      title={vm.title}
      badge={vm.paused ? 'Paused' : null}
      onBack={leaveMatch}
      backLabel="Leave scoring"
      trailing={<IconButton icon="ellipsis" accessibilityLabel="More actions" onPress={onMore} testID="score-top-more" />}
      testID="score-top-bar"
    />
  );
}

export interface HeaderContainerProps {
  readonly heroSize?: HeroSize;
  readonly compact: boolean;
  readonly onScorecard: () => void;
  readonly shortcuts?: readonly ScoreShortcut[];
  readonly onShortcut?: (shortcut: ScoreShortcut) => void;
}

export function HeaderContainer({ heroSize, compact, onScorecard, shortcuts, onShortcut }: HeaderContainerProps) {
  const vm = useLiveMatchStore(useShallow((s) => headerOf(s.live)));
  const last = useLiveMatchStore(useShallow((s) => lastBallOf(s.live)));
  return (
    <ScoreHeader
      vm={vm}
      heroSize={heroSize}
      compact={compact}
      flashSix={last.six}
      wicketTrigger={last.kind === 'wicket' ? last.seq : null}
      onPressScore={onScorecard}
      shortcuts={shortcuts}
      onShortcut={onShortcut}
    />
  );
}

export function CreaseContainer({ compact, onBatter, onBowler }: { readonly compact: boolean; readonly onBatter: () => void; readonly onBowler: () => void }) {
  const crease = useLiveMatchStore((s) => creaseOf(s.live));
  const bowler = useLiveMatchStore((s) => bowlerOf(s.live));
  return <CreasePanel crease={crease} bowler={bowler} compact={compact} onPressBatter={onBatter} onPressBowler={onBowler} />;
}

export function OverContainer({ compact }: { readonly compact: boolean }) {
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  const vm = useLiveMatchStore((s) => overOf(s.live, dotStyle));
  return <CurrentOver vm={vm} showLabel={!compact} />;
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
      message={`${playerName(setup, first.playerId)} has reached ${first.atRuns}. Retire now? (match rule)`}
      onRetire={() => onRetire(first.playerId)}
      onDismiss={() => setDismissedAt(lastSeq)}
    />
  );
}

export interface PadContainerProps {
  readonly compact: boolean;
  readonly tablet: boolean;
  readonly onExtras: () => void;
  readonly onWicket: () => void;
  readonly onMore: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

export function PadContainer({ compact, tablet, onExtras, onWicket, onMore, onUndo, onRedo }: PadContainerProps) {
  const canUndo = useLiveMatchStore((s) => (s.live?.events.length ?? 0) > 1);
  const canRedo = useLiveMatchStore((s) => s.redoStack.length > 0);
  const canSwap = useLiveMatchStore((s) => creaseOf(s.live).canSwap);
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  return (
    <>
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
