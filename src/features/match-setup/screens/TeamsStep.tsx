import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { Team } from '@/domain/types';
import { Inset, ListRow, SectionHeader, Stepper } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, useToastStore, type MatchSetupDraft } from '@/stores';
import { TeamSheet, type TeamValues } from '@/features/teams/sheets/TeamSheet';
import { playerCountText } from '@/features/teams/selectors';
import { TextAction } from '@/features/scoring/components/common/TextAction';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { useSetupPlayers } from '../context/SetupPlayersContext';
import { canLeaveTeams, type Side } from '../selectors/wizard';
import { TeamPickerSheet } from '../sheets/TeamPickerSheet';
import { WizardScreen } from './WizardScreen';
import { errorHeadline } from '@/features/scoring/selectors/scannable';

function teamPatch(side: Side, teamId: string): Partial<MatchSetupDraft> {
  return side === 'A' ? { teamAId: teamId, squadA: [], substitutesA: [] } : { teamBId: teamId, squadB: [], substitutesB: [] };
}

export function TeamsStep() {
  const draft = useMatchSetupStore((s) => s.draft);
  const teams = useTeamLibraryStore((s) => s.teams);
  const playerCounts = useTeamLibraryStore((s) => s.playerCounts);
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
      useToastStore.getState().show({ kind: 'error', message: errorHeadline(useTeamLibraryStore.getState().error, "Couldn't create the team."), action: null });
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
          subtitle={locked ? 'Set by the tournament' : count === null ? undefined : playerCountText(count)}
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
    <WizardScreen
      step="teams"
      nextDisabled={!canLeaveTeams(draft)}
      nextReason={draft.teamAId === null || draft.teamBId === null ? 'Choose both teams' : draft.teamAId === draft.teamBId ? 'Choose two different teams' : null}
    >
      {row('A')}
      {row('B')}
      {locked ? null : <TextAction label="Manage teams" onPress={() => router.push('/teams')} testID="setup-manage-teams" />}
      <SectionHeader title="Advanced" />
      <ListRow
        title="Different side sizes"
        trailing={{
          kind: 'switch',
          value: uneven,
          onValueChange: (on) => update(on ? { teamAPlayers: draft.rules.playersPerSide, teamBPlayers: draft.rules.playersPerSide } : { teamAPlayers: null, teamBPlayers: null }),
        }}
        testID="setup-uneven"
      />
      {uneven ? (
        <Inset top="sm" gap="sm">
          <Stepper label={`${nameOf(draft.teamAId)} plays with`} value={draft.teamAPlayers ?? draft.rules.playersPerSide} min={2} max={15} onChange={(teamAPlayers) => update({ teamAPlayers })} testID="setup-size-a" />
          <Stepper label={`${nameOf(draft.teamBId)} plays with`} value={draft.teamBPlayers ?? draft.rules.playersPerSide} min={2} max={15} onChange={(teamBPlayers) => update({ teamBPlayers })} testID="setup-size-b" />
        </Inset>
      ) : null}
      {picking !== null ? (
        <TeamPickerSheet
          visible
          title={`Team ${picking}`}
          teams={teams}
          playerCounts={playerCounts}
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
