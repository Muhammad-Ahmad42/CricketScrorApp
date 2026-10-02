import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Team } from '@/domain/types';
import { Button, ListRow, Sheet, Text, TextField, space } from '@/ui';

export interface TeamPickerSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly teams: readonly Team[];
  readonly excludeId: string | null;
  readonly onPick: (team: Team) => void;
  readonly onNewTeam: () => void;
  readonly onClose: () => void;
}

export function TeamPickerSheet({ visible, title, teams, excludeId, onPick, onNewTeam, onClose }: TeamPickerSheetProps) {
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
        <TextField label="Search" value={search} onChangeText={setSearch} leadingIcon="search" placeholder="Search teams" testID="team-picker-search" />
        {shown.length === 0 ? (
          <Text variant="body" tone="secondary">
            {teams.length === 0 ? 'No teams yet. Create the first one.' : 'No teams match.'}
          </Text>
        ) : null}
        {shown.map((team) => (
          <ListRow key={team.id} title={team.name} leading={{ monogram: team.shortName }} onPress={() => onPick(team)} testID={`team-picker-${team.id}`} />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.xs },
});
