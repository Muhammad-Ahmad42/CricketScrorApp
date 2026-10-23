import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { BREAKPOINTS, Screen, useInsets, useTheme, widthClassFor } from '@/ui';
import { useLiveMatchStore, useSettingsStore } from '@/stores';
import { scoreRuns } from '@/domain/scoring/commands';
import { LiveScorecardPane } from '@/features/scorecard/screens/LiveScorecardPane';
import { ReasonDialog } from '../components/common/ReasonDialog';
import { SavingLine } from '../components/SavingLine';
import { ScoringMiddle } from '../components/ScoringMiddle';
import type { ScoreShortcut } from '../components/ScoreHeader';
import { redoLast, sendIntent, swapStrikeWithToast, undoLast } from '../hooks/actions';
import { useScoringKeepAwake } from '../hooks/useScoringKeepAwake';
import { isLeanScoring } from '../selectors/layout';
import { controlModeOf } from '../selectors/scoreboard';
import type { MoreAction } from '../sheets/MoreSheet';
import {
  CommitAnnouncer,
  CreaseContainer,
  HeaderContainer,
  OverContainer,
  PadContainer,
  RetirementContainer,
  ScorecardSummaryContainer,
  SummaryContainer,
  TitleBarContainer,
} from './containers';
import { MatchGate } from './MatchGate';
import { PendingContainer } from './PendingContainer';
import { SheetsContainer, type RetireTarget } from './SheetsContainer';
import type { MatchRoute, SheetKind } from './sheetKinds';

export const RESULT_TO_SCORECARD_MS = 800;
const COMPACT_WIDTH = 360;
const PANE_WIDTH = 420;
export const PANEL_MAX_RATIO = 0.62;
const PAD_SHORTCUTS: readonly ScoreShortcut[] = ['dot', 'one', 'two', 'three', 'four', 'six', 'extras', 'wicket', 'undo'];
const UNDO_ONLY: readonly ScoreShortcut[] = ['undo'];
const NO_SHORTCUTS: readonly ScoreShortcut[] = [];
const SHORTCUT_RUNS: { readonly [K in ScoreShortcut]?: number } = { dot: 0, one: 1, two: 2, three: 3, four: 4, six: 6 };

export function matchHref(matchId: string, route: MatchRoute) {
  return { pathname: `/match/[matchId]/${route}` as const, params: { matchId } };
}

export interface ScoringColumnProps {
  readonly tablet?: boolean;
  readonly wide?: boolean;
}

export function ScoringColumn({ tablet = false, wide = false }: ScoringColumnProps) {
  const window = useWindowDimensions();
  const insets = useInsets();
  const compact = !tablet && window.width < COMPACT_WIDTH;
  const lean = isLeanScoring({
    windowHeight: window.height,
    insetTop: insets.top,
    insetBottom: insets.bottom,
    widthClass: widthClassFor(window.width),
    fontScale: window.fontScale,
  });
  const matchId = useLiveMatchStore((s) => s.matchId);
  const mode = useLiveMatchStore((s) => controlModeOf(s.live));
  const leanPad = lean && mode === 'pad';
  const saving = useLiveMatchStore((s) => s.status === 'saving');
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [retireTarget, setRetireTarget] = useState<RetireTarget | null>(null);
  const [reasonFor, setReasonFor] = useState<'undo' | 'redo' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const go = (route: MatchRoute) => {
    if (matchId !== null) {
      router.push(matchHref(matchId, route));
    }
  };
  const close = () => setSheet(null);
  const undo = () => {
    void undoLast().then((outcome) => {
      if (outcome === 'needs_reason') {
        setReasonFor('undo');
      }
    });
  };
  const redo = () => {
    void redoLast().then((outcome) => {
      if (outcome === 'needs_reason') {
        setReasonFor('redo');
      }
    });
  };
  const onMoreAction = (action: MoreAction) => {
    switch (action) {
      case 'scorecard':
      case 'balls':
      case 'analytics':
      case 'manage':
        setSheet(null);
        go(action);
        return;
      case 'redo':
        setSheet(null);
        redo();
        return;
      case 'swap':
        setSheet(null);
        void swapStrikeWithToast();
        return;
      case 'retire':
        setRetireTarget(null);
        setSheet('retire');
        return;
      case 'change_bowler':
      case 'penalty':
      case 'suspend':
      case 'revise':
      case 'end_innings':
        setSheet(action);
        return;
      default: {
        const unreachable: never = action;
        return unreachable;
      }
    }
  };
  const shortcuts = mode === 'pad' ? PAD_SHORTCUTS : mode === 'pending' || mode === 'repair' ? UNDO_ONLY : NO_SHORTCUTS;
  const onShortcut = (shortcut: ScoreShortcut) => {
    if (shortcut === 'undo') {
      undo();
      return;
    }
    if (shortcut === 'extras' || shortcut === 'wicket') {
      setSheet(shortcut);
      return;
    }
    const runs = SHORTCUT_RUNS[shortcut];
    if (runs !== undefined) {
      void sendIntent(scoreRuns(runs));
    }
  };
  const onConfirmed = () => {
    timer.current = setTimeout(() => {
      if (matchId !== null) {
        router.replace(matchHref(matchId, 'scorecard'));
      }
    }, RESULT_TO_SCORECARD_MS);
  };

  const band = (
    <View testID="score-band">
      <TitleBarContainer onMore={() => setSheet('match_menu')} onUndo={leanPad ? undo : undefined} />
      <SavingLine saving={saving} />
      <HeaderContainer
        heroSize={tablet ? 'tablet' : undefined}
        compact={compact}
        lean={lean}
        onScorecard={() => go('scorecard')}
        shortcuts={shortcuts}
        onShortcut={onShortcut}
      />
    </View>
  );
  const dock =
    mode === 'pad' ? (
      <View testID="score-dock">
        <PadContainer
          compact={compact}
          tablet={tablet}
          actions={!leanPad}
          onExtras={() => setSheet('extras')}
          onWicket={() => setSheet('wicket')}
          onMore={() => setSheet('more')}
          onUndo={undo}
          onRedo={redo}
        />
      </View>
    ) : mode === 'none' ? null : (
      <View testID="score-dock-panel" style={{ maxHeight: Math.round(window.height * PANEL_MAX_RATIO) }}>
        <PendingContainer
          onOpen={setSheet}
          onUndo={undo}
          onReview={(seq) => {
            if (matchId !== null) {
              router.push({ pathname: '/match/[matchId]/edit/[seq]', params: { matchId, seq: `${seq}` } });
            }
          }}
          onScorecard={() => go('scorecard')}
          onAnalytics={() => go('analytics')}
          onConfirmed={onConfirmed}
        />
      </View>
    );

  return (
    <Screen testID="score-column" scroll={false} fullWidth={tablet} header={band} footer={dock} footerPadding="flush">
      <CommitAnnouncer />
      <ScoringMiddle>
        <RetirementContainer
          onRetire={(playerId) => {
            setRetireTarget({ playerId, kind: 'retired_not_out' });
            setSheet('retire');
          }}
        />
        <CreaseContainer
          compact={compact}
          lean={lean}
          onBatter={() => {
            setRetireTarget(null);
            setSheet('retire');
          }}
          onBowler={() => setSheet('change_bowler')}
        />
        <OverContainer compact={compact} lean={lean} />
        <SummaryContainer />
        {wide ? <ScorecardSummaryContainer /> : null}
      </ScoringMiddle>
      <SheetsContainer sheet={sheet} retireTarget={retireTarget} onOpen={setSheet} onClose={close} onMoreAction={onMoreAction} playInMenu={leanPad} />
      <ReasonDialog
        visible={reasonFor !== null}
        title={reasonFor === 'redo' ? 'Redo the result?' : 'Reopen this match?'}
        message="Tournament standings will be recalculated."
        confirmLabel={reasonFor === 'redo' ? 'Redo' : 'Reopen match'}
        onConfirm={(reason) => {
          const kind = reasonFor;
          if (kind === null) {
            return;
          }
          setReasonFor(null);
          void (kind === 'redo' ? redoLast(reason) : undoLast(reason));
        }}
        onCancel={() => setReasonFor(null)}
      />
    </Screen>
  );
}

export function ScoringScreen() {
  const theme = useTheme();
  const window = useWindowDimensions();
  const ready = useLiveMatchStore((s) => s.live !== null);
  const keepAwake = useSettingsStore((s) => s.settings.scoring.keepAwake);
  const tablet = window.width >= BREAKPOINTS.expanded && window.width > window.height;
  const wide = !tablet && window.width >= BREAKPOINTS.medium;
  useScoringKeepAwake(keepAwake && ready);
  return (
    <MatchGate title="Live scoring">
      <View style={[styles.root, { backgroundColor: theme.color.background }]} testID="screen-score">
        {tablet ? (
          <View style={styles.twoPane} testID="score-two-pane">
            <View style={styles.leftPane}>
              <LiveScorecardPane compact={window.width < 1024} />
            </View>
            <View style={[styles.divider, { width: theme.borderWidth.hairline, backgroundColor: theme.color.border }]} />
            <View style={[styles.rightPane, { width: PANE_WIDTH }]}>
              <ScoringColumn tablet />
            </View>
          </View>
        ) : (
          <ScoringColumn wide={wide} />
        )}
      </View>
    </MatchGate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  twoPane: { flex: 1, flexDirection: 'row' },
  leftPane: { flex: 1.25, minWidth: 360 },
  rightPane: { flexShrink: 0 },
  divider: { alignSelf: 'stretch' },
});
