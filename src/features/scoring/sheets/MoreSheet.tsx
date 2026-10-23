import { StyleSheet, View } from 'react-native';
import { ActionRow, Sheet, Text, space, type IconName } from '@/ui';

export type MoreAction =
  | 'scorecard'
  | 'balls'
  | 'analytics'
  | 'change_bowler'
  | 'retire'
  | 'penalty'
  | 'suspend'
  | 'revise'
  | 'end_innings'
  | 'redo'
  | 'swap'
  | 'manage';

export type MoreScope = 'match' | 'play' | 'all';

export interface MoreSheetProps {
  readonly visible: boolean;
  readonly scope?: MoreScope;
  readonly playActive: boolean;
  readonly withPlay?: boolean;
  readonly canRedo: boolean;
  readonly canSwap?: boolean;
  readonly onAction: (action: MoreAction) => void;
  readonly onClose: () => void;
}

interface Row {
  readonly action: MoreAction;
  readonly title: string;
  readonly icon: IconName;
  readonly navigate?: boolean;
  readonly warning?: boolean;
}

const MATCH_ROWS: readonly Row[] = [
  { action: 'scorecard', title: 'Scorecard', icon: 'file-text', navigate: true },
  { action: 'balls', title: 'Ball by ball', icon: 'history', navigate: true },
  { action: 'analytics', title: 'Analytics', icon: 'circle-dot', navigate: true },
  { action: 'manage', title: 'Match settings', icon: 'settings', navigate: true },
];

const PLAY_ROWS: readonly Row[] = [
  { action: 'change_bowler', title: 'Change bowler', icon: 'arrow-left-right' },
  { action: 'retire', title: 'Retire or dismiss batter', icon: 'pencil-line' },
  { action: 'penalty', title: 'Penalty runs', icon: 'plus' },
];

const STOP_ROWS: readonly Row[] = [
  { action: 'suspend', title: 'Suspend play', icon: 'pause' },
  { action: 'revise', title: 'Revise overs', icon: 'cloud-rain' },
  { action: 'end_innings', title: 'End innings', icon: 'triangle-alert', warning: true },
];

function Group({ title, rows, onAction }: { readonly title: string; readonly rows: readonly Row[]; readonly onAction: (action: MoreAction) => void }) {
  return (
    <View accessibilityRole="menu" accessibilityLabel={title}>
      <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {rows.map((row, index) => (
        <ActionRow
          key={row.action}
          choice={{ key: row.action, title: row.title, icon: row.icon, kind: row.navigate ? 'navigate' : 'action', warning: row.warning, onPress: () => onAction(row.action) }}
          separator={index < rows.length - 1}
          testID={`more-row-${row.action}`}
        />
      ))}
    </View>
  );
}

export function MoreSheet({ visible, scope = 'play', playActive, withPlay = false, canRedo, canSwap = false, onAction, onClose }: MoreSheetProps) {
  const redo: readonly Row[] = canRedo ? [{ action: 'redo', title: 'Redo', icon: 'redo-2' }] : [];
  const swap: readonly Row[] = canSwap ? [{ action: 'swap', title: 'Swap strike', icon: 'arrow-left-right' }] : [];
  const play = playActive && (scope !== 'match' || withPlay);
  const playRows = <Group title="This ball and batter" rows={[...swap, ...PLAY_ROWS, ...redo]} onAction={onAction} />;
  if (scope === 'all') {
    return (
      <Sheet visible={visible} title="More" onClose={onClose} testID="sheet-match-menu">
        <View style={styles.body}>
          {play ? playRows : null}
          <Group title="Match" rows={play ? MATCH_ROWS : [...swap, ...redo, ...MATCH_ROWS]} onAction={onAction} />
          {play ? <Group title="Stop or shorten play" rows={STOP_ROWS} onAction={onAction} /> : null}
        </View>
      </Sheet>
    );
  }
  return (
    <Sheet visible={visible} title={scope === 'match' ? 'Match' : 'More'} onClose={onClose} testID={scope === 'match' ? 'sheet-match-menu' : 'sheet-more'}>
      <View style={styles.body}>
        {scope === 'match' || !play ? <Group title="Match" rows={scope === 'play' ? [...redo, ...MATCH_ROWS] : MATCH_ROWS} onAction={onAction} /> : null}
        {play ? playRows : null}
        {play ? <Group title="Stop or shorten play" rows={STOP_ROWS} onAction={onAction} /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.lg },
  heading: { paddingBottom: space.xxs },
});
