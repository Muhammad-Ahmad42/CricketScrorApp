import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Team } from '@/domain/types';
import { Button, ListRow, Sheet, Text, TextField, space } from '@/ui';
import { playerCountText } from '@/features/teams/selectors';

export interface TeamPickerSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly teams: readonly Team[];
  readonly playerCounts?: Readonly<Record<string, number>>;
  readonly excludeId: string | null;
  readonly onPick: (team: Team) => void;
  readonly onNewTeam: () => void;
  readonly onClose: () => void;
}

export function TeamPickerSheet({ visible, title, teams, playerCounts, excludeId, onPick, onNewTeam, onClose }: TeamPickerSheetProps) {
  const [search, setSearch] = useState('');
  const text = search.trim().toLowerCase();
  const shown = teams
    .filter((team) => team.id !== excludeId && team.archivedAt === null)
    .filter((team) => text === '' || team.name.toLowerCase().includes(text) || team.shortName.toLowerCase().includes(text))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      testID="sheet-team-picker"
      footer={<Button label="New team" icon="plus" variant="secondary" size="lg" fullWidth onPress={onNewTeam} testID="team-picker-new" />}
    >
      <View style={styles.body}>
        <TextField label="Search teams" hideLabel value={search} onChangeText={setSearch} leadingIcon="search" placeholder="Search teams" returnKeyType="search" testID="team-picker-search" />
        {shown.length === 0 ? (
          <Text variant="body" tone="secondary">
            {teams.length === 0 ? 'No teams yet' : 'No teams match'}
          </Text>
        ) : null}
        {shown.map((team) => (
          <ListRow
            key={team.id}
            title={team.name}
            subtitle={playerCountText(playerCounts?.[team.id])}
            leading={{ monogram: team.shortName }}
            separator={false}
            onPress={() => onPick(team)}
            testID={`team-picker-${team.id}`}
          />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.xs },
});
