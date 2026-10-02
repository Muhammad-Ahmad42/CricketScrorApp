import { View } from 'react-native';
import { ListRow, SectionHeader, Sheet } from '@/ui';

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
  | 'manage';

export interface MoreSheetProps {
  readonly visible: boolean;
  readonly playActive: boolean;
  readonly canRedo: boolean;
  readonly onAction: (action: MoreAction) => void;
  readonly onClose: () => void;
}

interface Row {
  readonly action: MoreAction;
  readonly title: string;
}

const MATCH_ROWS: readonly Row[] = [
  { action: 'scorecard', title: 'Scorecard' },
  { action: 'balls', title: 'Ball by ball' },
  { action: 'analytics', title: 'Analytics' },
];

const PLAY_ROWS: readonly Row[] = [
  { action: 'change_bowler', title: 'Change bowler (injury)' },
  { action: 'retire', title: 'Retire or dismiss batter' },
  { action: 'penalty', title: 'Penalty runs' },
  { action: 'suspend', title: 'Suspend play' },
  { action: 'revise', title: 'Revise overs' },
  { action: 'end_innings', title: 'End innings' },
];

export function MoreSheet({ visible, playActive, canRedo, onAction, onClose }: MoreSheetProps) {
  const row = (entry: Row) => (
    <ListRow
      key={entry.action}
      title={entry.title}
      trailing={{ kind: 'chevron' }}
      compact
      onPress={() => onAction(entry.action)}
      testID={`more-row-${entry.action}`}
    />
  );
  return (
    <Sheet visible={visible} title="More" onClose={onClose} testID="sheet-more">
      <View>
        <SectionHeader title="Match" />
        {MATCH_ROWS.map(row)}
        {playActive ? (
          <>
            <SectionHeader title="Play" />
            {PLAY_ROWS.map(row)}
          </>
        ) : null}
        {canRedo ? row({ action: 'redo', title: 'Redo' }) : null}
        {row({ action: 'manage', title: 'Match settings' })}
      </View>
    </Sheet>
  );
}
