import { StyleSheet, View } from 'react-native';
import type { MatchPlayer } from '@/domain/types';
import { Button, IconButton, Sheet, Text, space, useTheme } from '@/ui';

export interface SquadSheetProps {
  readonly visible: boolean;
  readonly teamName: string;
  readonly players: readonly MatchPlayer[];
  readonly canRemove: boolean;
  readonly onRemove: (player: MatchPlayer) => void;
  readonly onAdd: () => void;
  readonly onClose: () => void;
}

function tagsOf(player: MatchPlayer): string {
  return [player.isCaptain ? 'C' : null, player.isWicketKeeper ? 'WK' : null, player.isSubstitute ? 'sub' : null]
    .filter((tag): tag is string => tag !== null)
    .join(' · ');
}

export function SquadSheet({ visible, teamName, players, canRemove, onRemove, onAdd, onClose }: SquadSheetProps) {
  const theme = useTheme();
  return (
    <Sheet
      visible={visible}
      title={teamName}
      subtitle={`${players.filter((player) => !player.isSubstitute).length} players · ${players.filter((player) => player.isSubstitute).length} substitutes`}
      onClose={onClose}
      testID="sheet-squad"
      footer={<Button label="Add player or substitute" icon="plus" variant="secondary" size="lg" fullWidth onPress={onAdd} testID="squad-add" />}
    >
      <View>
        {players.map((player) => (
          <View
            key={player.playerId}
            style={[styles.row, { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border }]}
            testID={`squad-row-${player.playerId}`}
          >
            <Text variant="tableNumeric" tone="muted" style={styles.order}>
              {player.battingOrder === null ? '' : `${player.battingOrder}`}
            </Text>
            <Text variant="body" style={styles.flex} numberOfLines={1}>
              {player.name}
            </Text>
            <Text variant="footnote" tone="secondary">
              {tagsOf(player)}
            </Text>
            {canRemove ? (
              <IconButton
                icon="trash-2"
                tone="danger"
                accessibilityLabel={`Remove ${player.name} from the squad`}
                onPress={() => onRemove(player)}
                testID={`squad-remove-${player.playerId}`}
              />
            ) : null}
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  order: { width: 24 },
  flex: { flex: 1 },
});
