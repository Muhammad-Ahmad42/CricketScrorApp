import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { Team } from '@/domain/types';
import { WithScreenList, isBlank, plural } from '@/features/shared';
import { Button, IconButton, ListRow, Separator, Sheet, Text, TextField, space } from '@/ui';
import { useTeamLibraryStore, useTournamentWizardStore } from '@/stores';
import { showError } from '../../hooks/toast';
import { useLibraryLoaded } from '../../hooks/useLibrary';
import { PickerSheet } from '../../sheets/PickerSheet';
import { teamsError } from '../../wizard/validation';
import { WizardFrame } from './WizardFrame';

type WizardTeam = { readonly teamId: string; readonly seed: number | null };

function NewTeamSheet({ visible, onClose, onCreated }: { readonly visible: boolean; readonly onClose: () => void; readonly onCreated: (team: Team) => void }) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [busy, setBusy] = useState(false);
  const shortValid = /^[A-Za-z0-9]{2,5}$/.test(shortName.trim());
  const create = async () => {
    setBusy(true);
    const team = await useTeamLibraryStore.getState().createTeam({ name: name.trim(), shortName: shortName.trim().toUpperCase(), players: [] });
    setBusy(false);
    if (team) {
      setName('');
      setShortName('');
      onCreated(team);
    } else {
      showError(useTeamLibraryStore.getState().error, "Couldn't create this team.");
    }
  };
  return (
    <Sheet
      visible={visible}
      title="New team"
      onClose={onClose}
      testID="sheet-new-team"
      footer={<Button label="Create team" disabled={isBlank(name) || !shortValid} loading={busy} onPress={() => void create()} fullWidth testID="twiz-btn-create-team" />}
    >
      <View style={styles.sheetBody}>
        <TextField label="Team name" value={name} onChangeText={setName} autoCapitalize="words" testID="twiz-input-team-name" />
        <TextField
          label="Short name"
          value={shortName}
          onChangeText={setShortName}
          autoCapitalize="characters"
          maxLength={5}
          helper="2 to 5 letters, shown on scoreboards."
          error={shortName.length > 0 && !shortValid ? 'Use 2 to 5 letters or digits.' : null}
          testID="twiz-input-team-short"
        />
        <Text variant="footnote" tone="secondary">
          Add players later from the team library or when a match starts.
        </Text>
      </View>
    </Sheet>
  );
}

function parseSeed(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= 1 ? value : null;
}

export function TeamsStepScreen() {
  useLibraryLoaded();
  const library = useTeamLibraryStore((state) => state.teams);
  const teams = useTournamentWizardStore((state) => state.draft.teams);
  const [seedsOn, setSeedsOn] = useState(teams.some((team) => team.seed !== null));
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const byId = new Map(library.map((team) => [team.id, team]));
  const selected = new Set(teams.map((team) => team.teamId));
  const available = library.filter((team) => team.archivedAt === null && !selected.has(team.id));
  const error = teamsError(teams);

  const setTeams = (next: readonly WizardTeam[]) => useTournamentWizardStore.getState().update({ teams: next });
  const current = () => useTournamentWizardStore.getState().draft.teams;
  const add = (teamIds: readonly string[]) => {
    const existing = current();
    const known = new Set(existing.map((team) => team.teamId));
    setTeams([...existing, ...teamIds.filter((teamId) => !known.has(teamId)).map((teamId) => ({ teamId, seed: null }))]);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.headerLine}>
        <Text variant="headline" style={styles.flex} testID="twiz-text-team-count">
          {plural(teams.length, 'team')}
        </Text>
        <Button label="Add team" icon="plus" variant="secondary" size="sm" onPress={() => setPicking(true)} testID="twiz-btn-add-team" />
      </View>
      <ListRow
        title="Seeds"
        subtitle="Seeds are used for seeded pools and ranking knockouts. 1 is the strongest."
        trailing={{ kind: 'switch', value: seedsOn, onValueChange: setSeedsOn }}
        testID="twiz-toggle-seeds"
      />
    </View>
  );

  return (
    <WizardFrame step="teams" scroll={false} nextDisabled={error !== null} nextHint={error}>
      <WithScreenList>
        {(list) => (
          <FlatList
            data={teams}
            keyExtractor={(team) => team.teamId}
            ListHeaderComponent={header}
            ListEmptyComponent={
              <Text variant="callout" tone="secondary" style={styles.empty}>
                No teams yet. Add teams from your library or create new ones.
              </Text>
            }
            initialNumToRender={16}
            windowSize={9}
            keyboardShouldPersistTaps="handled"
            onScroll={list.onScroll}
            scrollEventThrottle={list.scrollEventThrottle}
            scrollIndicatorInsets={list.scrollIndicatorInsets}
            contentContainerStyle={list.contentInset}
            renderItem={({ item, index }) => {
              const team = byId.get(item.teamId);
              const name = team?.name ?? 'Team';
              return (
                <View>
                  <View style={styles.row} testID={`twiz-row-team-${index + 1}`}>
                    <Text variant="subhead" weight="semibold" style={styles.short}>
                      {team?.shortName ?? ''}
                    </Text>
                    <Text variant="body" style={styles.flex} numberOfLines={1}>
                      {name}
                    </Text>
                    {seedsOn ? (
                      <View style={styles.seed}>
                        <TextField
                          label="Seed"
                          value={item.seed === null ? '' : String(item.seed)}
                          onChangeText={(text) => setTeams(current().map((entry) => (entry.teamId === item.teamId ? { ...entry, seed: parseSeed(text) } : entry)))}
                          numeric
                          accessibilityLabel={`Seed for ${name}`}
                          testID={`twiz-input-seed-${index + 1}`}
                        />
                      </View>
                    ) : null}
                    <IconButton
                      icon="x"
                      accessibilityLabel={`Remove ${name}`}
                      onPress={() => setTeams(current().filter((entry) => entry.teamId !== item.teamId))}
                      testID={`twiz-btn-remove-team-${index + 1}`}
                    />
                  </View>
                  <Separator inset={space.md} />
                </View>
              );
            }}
          />
        )}
      </WithScreenList>
      <PickerSheet
        visible={picking}
        title="Add team"
        options={available.map((team) => ({ key: team.id, title: team.name, subtitle: team.shortName }))}
        searchable
        emptyText="Every team in your library is already added."
        onClose={() => setPicking(false)}
        onPick={(teamId) => {
          add([teamId]);
          setPicking(false);
        }}
        footer={
          <View style={styles.pickerFooter}>
            <View style={styles.flex}>
              <Button
                label="New team"
                icon="plus"
                variant="secondary"
                onPress={() => {
                  setPicking(false);
                  setCreating(true);
                }}
                fullWidth
                testID="twiz-btn-new-team"
              />
            </View>
            <View style={styles.flex}>
              <Button
                label={`Add all (${available.length})`}
                variant="secondary"
                disabled={available.length === 0}
                onPress={() => {
                  add(available.map((team) => team.id));
                  setPicking(false);
                }}
                fullWidth
                testID="twiz-btn-add-all"
              />
            </View>
          </View>
        }
      />
      <NewTeamSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(team) => {
          add([team.id]);
          setCreating(false);
        }}
      />
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.sm },
  headerLine: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, gap: space.sm, minHeight: 48 },
  flex: { flex: 1 },
  empty: { paddingHorizontal: space.md, paddingTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, paddingRight: space.xxs, minHeight: 56 },
  short: { width: 48 },
  seed: { width: 88 },
  sheetBody: { gap: space.md },
  pickerFooter: { flexDirection: 'row', gap: space.xs },
});
