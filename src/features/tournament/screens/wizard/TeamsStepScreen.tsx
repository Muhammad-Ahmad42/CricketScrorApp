import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { Team } from '@/domain/types';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { isBlank, plural } from '@/features/shared';
import { SHORT_NAME_HELPER, SHORT_NAME_MAX, shortNameError, suggestShortName } from '@/features/teams/selectors';
import { Button, EmptyState, IconButton, Inset, KeyboardScopeProvider, ListRow, MIN_TOUCH, Monogram, Separator, Sheet, Text, TextField, space, useFormChain, useGutter, useScreenList } from '@/ui';
import { useTeamLibraryStore, useTournamentWizardStore } from '@/stores';
import { showError, showToast } from '../../hooks/toast';
import { useLibraryLoaded } from '../../hooks/useLibrary';
import { useListKeyboard } from '../../hooks/useListKeyboard';
import { PickerSheet } from '../../sheets/PickerSheet';
import { teamsError } from '../../wizard/validation';
import { WizardFrame } from './WizardFrame';

type WizardTeam = { readonly teamId: string; readonly seed: number | null };

type NewTeamField = 'name' | 'short';

const NEW_TEAM_FIELDS: readonly NewTeamField[] = ['name', 'short'];

export const SEED_CELL_WIDTH = 72;

function NewTeamSheet({ visible, onClose, onCreated }: { readonly visible: boolean; readonly onClose: () => void; readonly onCreated: (team: Team) => void }) {
  const [form, setForm] = useState(0);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [touchedShort, setTouchedShort] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = touchedShort ? shortName : suggestShortName(name);
  const shortError = isBlank(name) ? null : shortNameError(shown);
  const ready = !isBlank(name) && shortError === null;
  const create = async () => {
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    const team = await useTeamLibraryStore.getState().createTeam({ name: name.trim(), shortName: shown.trim().toUpperCase(), players: [] });
    setBusy(false);
    if (team) {
      setName('');
      setShortName('');
      setTouchedShort(false);
      setForm((count) => count + 1);
      onCreated(team);
      showToast('success', `${team.name} added`);
    } else {
      showError(useTeamLibraryStore.getState().error, "Couldn't create this team.");
    }
  };
  const chain = useFormChain(NEW_TEAM_FIELDS, { onSubmit: () => void create() });
  const dirty = !isBlank(name) || (touchedShort && !isBlank(shortName));
  const guard = useDiscardGuard(dirty, onClose);
  useEffect(() => {
    if (form > 0) {
      chain.focus('name');
    }
  }, [form]);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="New team"
        onClose={guard.requestClose}
        testID="sheet-new-team"
        footer={
          <View style={styles.pickerFooter}>
            <View style={styles.flex}>
              <Button label="Done" variant="secondary" onPress={guard.requestClose} fullWidth testID="twiz-btn-new-team-done" />
            </View>
            <View style={styles.flex}>
              <Button label="Create team" disabled={!ready} loading={busy} onPress={() => void create()} fullWidth testID="twiz-btn-create-team" />
            </View>
          </View>
        }
      >
        <View key={form} style={styles.sheetBody}>
          <TextField label="Team name" value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false} {...chain.field('name')} testID="twiz-input-team-name" />
          <TextField
            label="Short name"
            value={shown}
            onChangeText={(text) => {
              setTouchedShort(true);
              setShortName(text.toUpperCase());
            }}
            autoCapitalize="characters"
            maxLength={SHORT_NAME_MAX}
            helper={SHORT_NAME_HELPER}
            error={shortError}
            {...chain.field('short')}
            testID="twiz-input-team-short"
          />
        </View>
      </Sheet>
      {guard.dialog}
    </>
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
  const teams = useTournamentWizardStore((state) => state.draft.teams);
  const error = teamsError(teams);
  return (
    <WizardFrame step="teams" scroll={false} nextDisabled={error !== null} nextHint={error}>
      <TeamsBody />
    </WizardFrame>
  );
}

function TeamsBody() {
  useLibraryLoaded();
  const gutter = useGutter();
  const list = useScreenList();
  const listRef = useRef<FlatList<WizardTeam>>(null);
  const keyboard = useListKeyboard(listRef);
  const library = useTeamLibraryStore((state) => state.teams);
  const teams = useTournamentWizardStore((state) => state.draft.teams);
  const [seedsOn, setSeedsOn] = useState(teams.some((team) => team.seed !== null));
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const byId = new Map(library.map((team) => [team.id, team]));
  const selected = new Set(teams.map((team) => team.teamId));
  const available = library.filter((team) => team.archivedAt === null && !selected.has(team.id));
  const seedChain = useFormChain(teams.map((team) => team.teamId));

  const setTeams = (next: readonly WizardTeam[]) => useTournamentWizardStore.getState().update({ teams: next });
  const current = () => useTournamentWizardStore.getState().draft.teams;
  const add = (teamIds: readonly string[]) => {
    const existing = current();
    const known = new Set(existing.map((team) => team.teamId));
    setTeams([...existing, ...teamIds.filter((teamId) => !known.has(teamId)).map((teamId) => ({ teamId, seed: null }))]);
  };

  const header = (
    <View>
      <Inset top="sm">
        <View style={styles.headerLine}>
          <Text variant="headline" style={styles.flex} testID="twiz-text-team-count">
            {plural(teams.length, 'team')}
          </Text>
          <Button label="Add team" icon="plus" variant="secondary" size="sm" onPress={() => setPicking(true)} testID="twiz-btn-add-team" />
        </View>
      </Inset>
      <ListRow title="Seeds" subtitle="1 is the strongest" trailing={{ kind: 'switch', value: seedsOn, onValueChange: setSeedsOn }} testID="twiz-toggle-seeds" />
      {seedsOn && teams.length > 0 ? (
        <Inset top="sm">
          <View style={styles.columns} accessible={false} importantForAccessibility="no-hide-descendants">
            <Text variant="label" tone="secondary" style={styles.flex}>
              Team
            </Text>
            <Text variant="label" tone="secondary" style={styles.seedHeader}>
              Seed
            </Text>
            <View style={styles.removeSpace} />
          </View>
        </Inset>
      ) : null}
    </View>
  );

  return (
    <View style={styles.fill}>
      <KeyboardScopeProvider value={keyboard.scope}>
        <FlatList
          ref={listRef}
          data={teams}
          keyExtractor={(team) => team.teamId}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState title="No teams yet" testID="twiz-text-no-teams" />}
          initialNumToRender={16}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          onScroll={keyboard.onScroll}
          scrollEventThrottle={list.scrollEventThrottle}
          scrollIndicatorInsets={list.scrollIndicatorInsets}
          contentContainerStyle={list.contentInset}
          testID="twiz-list-teams"
          renderItem={({ item, index }) => {
            const team = byId.get(item.teamId);
            const name = team?.name ?? 'Team';
            return (
              <View>
                <View style={[styles.row, { paddingLeft: gutter, paddingRight: Math.max(space.xxs, gutter - space.sm) }]} testID={`twiz-row-team-${index + 1}`}>
                  <Monogram text={team?.shortName ?? '?'} />
                  <Text variant="body" style={styles.flex}>
                    {name}
                  </Text>
                  {seedsOn ? (
                    <View style={styles.seedCell}>
                      <TextField
                        label={`Seed for ${name}`}
                        hideLabel
                        value={item.seed === null ? '' : String(item.seed)}
                        onChangeText={(text) => setTeams(current().map((entry) => (entry.teamId === item.teamId ? { ...entry, seed: parseSeed(text) } : entry)))}
                        numeric
                        maxLength={3}
                        placeholder="–"
                        {...seedChain.field(item.teamId)}
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
                <Separator inset={gutter} />
              </View>
            );
          }}
        />
      </KeyboardScopeProvider>
      <PickerSheet
        visible={picking}
        title="Add teams"
        subtitle={`${teams.length} added`}
        options={available.map((team) => ({ key: team.id, title: team.name, subtitle: team.shortName }))}
        searchable
        actionLabel="Add"
        emptyText="All your teams are added"
        onClose={() => setPicking(false)}
        onPick={(teamId) => add([teamId])}
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
        onCreated={(team) => add([team.id])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingVertical: space.xs },
  columns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  seedHeader: { width: SEED_CELL_WIDTH },
  seedCell: { width: SEED_CELL_WIDTH },
  removeSpace: { width: MIN_TOUCH - space.sm },
  sheetBody: { gap: space.md },
  pickerFooter: { flexDirection: 'row', gap: space.xs },
});
