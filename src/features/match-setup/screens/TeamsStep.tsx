import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Team } from '@/domain/types';
import { Button, ListRow, SectionHeader, Stepper, Text, space } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, useToastStore, type MatchSetupDraft } from '@/stores';
import { TeamSheet, type TeamValues } from '@/features/teams/sheets/TeamSheet';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { useSetupPlayers } from '../context/SetupPlayersContext';
import { canLeaveTeams, type Side } from '../selectors/wizard';
import { TeamPickerSheet } from '../sheets/TeamPickerSheet';
import { WizardScreen } from './WizardScreen';

function teamPatch(side: Side, teamId: string): Partial<MatchSetupDraft> {
  return side === 'A' ? { teamAId: teamId, squadA: [], substitutesA: [] } : { teamBId: teamId, squadB: [], substitutesB: [] };
}

export function TeamsStep() {
  const draft = useMatchSetupStore((s) => s.draft);
  const teams = useTeamLibraryStore((s) => s.teams);
  const players = useSetupPlayers();
  const [picking, setPicking] = useState<Side | null>(null);
  const [creating, setCreating] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const flight = useSingleFlight();
  const locked = draft.fixtureId !== null;
  const uneven = draft.teamAPlayers !== null || draft.teamBPlayers !== null;

  useEffect(() => {
    void useTeamLibraryStore.getState().load();
  }, []);
  useEffect(() => {
    players.ensure(draft.teamAId);
    players.ensure(draft.teamBId);
  }, [draft.teamAId, draft.teamBId, players]);

  const update = (patch: Partial<MatchSetupDraft>) => useMatchSetupStore.getState().update(patch);
  const pick = (side: Side, team: Team) => {
    setPicking(null);
    update(teamPatch(side, team.id));
    players.ensure(team.id);
  };
  const create = async (side: Side, values: TeamValues) => {
    setBusy(true);
    const team = await useTeamLibraryStore.getState().createTeam({ name: values.name, shortName: values.shortName, players: [] });
    setBusy(false);
    if (team === null) {
      useToastStore.getState().show({ kind: 'error', message: useTeamLibraryStore.getState().error?.message ?? "Couldn't create the team.", action: null });
      useTeamLibraryStore.getState().clearError();
      return;
    }
    setCreating(null);
    pick(side, team);
  };
  const row = (side: Side) => {
    const teamId = side === 'A' ? draft.teamAId : draft.teamBId;
    const team = teams.find((entry) => entry.id === teamId) ?? null;
    const count = players.playersOf(teamId)?.length ?? null;
    return (
      <View key={side}>
        <SectionHeader title={`Team ${side}`} />
        <ListRow
          title={team?.name ?? (teamId === null ? 'Choose team' : 'Team')}
          subtitle={locked ? 'Set by the tournament' : count === null ? undefined : `${count} players`}
          leading={team === null ? { icon: 'plus' } : { monogram: team.shortName }}
          trailing={locked ? undefined : { kind: 'chevron' }}
          onPress={locked ? undefined : () => setPicking(side)}
          testID={`setup-team-${side}`}
        />
      </View>
    );
  };
  const nameOf = (teamId: string | null) => teams.find((team) => team.id === teamId)?.name ?? 'This team';

  return (
    <WizardScreen step="teams" nextDisabled={!canLeaveTeams(draft)}>
      {row('A')}
      {row('B')}
      {locked ? null : (
        <View style={styles.link}>
          <Button label="Manage teams" variant="tertiary" size="sm" onPress={() => router.push('/teams')} testID="setup-manage-teams" />
        </View>
      )}
      <SectionHeader title="Advanced" />
      <ListRow
        title="Different side sizes"
        subtitle="When a side plays short or long by agreement"
        trailing={{
          kind: 'switch',
          value: uneven,
          onValueChange: (on) => update(on ? { teamAPlayers: draft.rules.playersPerSide, teamBPlayers: draft.rules.playersPerSide } : { teamAPlayers: null, teamBPlayers: null }),
        }}
        testID="setup-uneven"
      />
      {uneven ? (
        <View style={styles.block}>
          <Stepper label={`${nameOf(draft.teamAId)} plays with`} value={draft.teamAPlayers ?? draft.rules.playersPerSide} min={2} max={15} onChange={(teamAPlayers) => update({ teamAPlayers })} testID="setup-size-a" />
          <Stepper label={`${nameOf(draft.teamBId)} plays with`} value={draft.teamBPlayers ?? draft.rules.playersPerSide} min={2} max={15} onChange={(teamBPlayers) => update({ teamBPlayers })} testID="setup-size-b" />
          <Text variant="footnote" tone="secondary">
            A side is all out when only one batter is left, unless last man stands is on.
          </Text>
        </View>
      ) : null}
      {picking !== null ? (
        <TeamPickerSheet
          visible
          title={`Team ${picking}`}
          teams={teams}
          excludeId={picking === 'A' ? draft.teamBId : draft.teamAId}
          onPick={(team) => pick(picking, team)}
          onNewTeam={() => {
            setCreating(picking);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {creating !== null ? (
        <TeamSheet
          visible
          title="New team"
          initial={{ name: '', shortName: '', captainId: null }}
          busy={busy}
          submitLabel="Create team"
          onSubmit={(values) => void flight(() => create(creating, values))}
          onClose={() => setCreating(null)}
        />
      ) : null}
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  link: { alignItems: 'flex-start', paddingHorizontal: space.xs, paddingTop: space.xs },
  block: { paddingHorizontal: space.md, gap: space.sm, paddingTop: space.sm },
});
