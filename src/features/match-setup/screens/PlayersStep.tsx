import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Player } from '@/domain/types';
import { Banner, Button, SectionHeader, Skeleton, Tabs, Text, space } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, useToastStore } from '@/stores';
import { PlayerSheet, type PlayerValues } from '@/features/teams/sheets/PlayerSheet';
import { SquadRow } from '../components/SquadRow';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { useSetupPlayers } from '../context/SetupPlayersContext';
import { canLeavePlayers, moved, sideSize, squadOf, squadPatch, substitutesOf, toggled, type Side } from '../selectors/wizard';
import { WizardScreen } from './WizardScreen';

export function PlayersStep() {
  const draft = useMatchSetupStore((s) => s.draft);
  const teams = useTeamLibraryStore((s) => s.teams);
  const players = useSetupPlayers();
  const [side, setSide] = useState<Side>('A');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const flight = useSingleFlight();

  useEffect(() => {
    if (teams.length === 0) {
      void useTeamLibraryStore.getState().load();
    }
  }, [teams.length]);
  useEffect(() => {
    players.ensure(draft.teamAId);
    players.ensure(draft.teamBId);
  }, [draft.teamAId, draft.teamBId, players]);

  const teamId = side === 'A' ? draft.teamAId : draft.teamBId;
  const team = teams.find((entry) => entry.id === teamId) ?? null;
  const roster = players.playersOf(teamId);
  const squad = squadOf(draft, side);
  const substitutes = substitutesOf(draft, side);
  const size = sideSize(draft, side);
  const setSquad = (nextSquad: readonly string[], nextSubs: readonly string[]) => useMatchSetupStore.getState().update(squadPatch(side, nextSquad, nextSubs));
  const tagsOf = (player: Player) => [team?.captainId === player.id ? 'C' : null, player.role === 'wicket_keeper' ? 'WK' : null].filter((tag): tag is string => tag !== null).join(' ');
  const ordered = roster === null ? [] : [...squad.map((id) => roster.find((player) => player.id === id)).filter((player): player is Player => player !== undefined), ...roster.filter((player) => !squad.includes(player.id))];
  const tabLabel = (tabSide: Side) => {
    const id = tabSide === 'A' ? draft.teamAId : draft.teamBId;
    const name = teams.find((entry) => entry.id === id)?.shortName ?? `Team ${tabSide}`;
    const count = squadOf(draft, tabSide).length;
    const target = sideSize(draft, tabSide);
    return `${name} ${count}/${target}${count < target ? ' (short)' : ''}`;
  };
  const add = async (values: PlayerValues) => {
    if (teamId === null) {
      return;
    }
    setBusy(true);
    const created = await players.addPlayer(teamId, { name: values.name, jerseyNumber: values.jerseyNumber, role: values.role });
    setBusy(false);
    if (created === null) {
      useToastStore.getState().show({ kind: 'error', message: "Couldn't add the player.", action: null });
      return;
    }
    setAdding(false);
    setSquad([...squad, created.id], substitutes);
  };

  return (
    <WizardScreen
      step="players"
      nextDisabled={!canLeavePlayers(draft)}
      toolbar={
        <Tabs
          tabs={(['A', 'B'] as const).map((key) => ({ key, label: tabLabel(key), testID: `setup-players-tab-${key}` }))}
          selectedKey={side}
          onSelect={setSide}
          accessibilityLabel="Teams"
        />
      }
    >
      {squad.length < size && roster !== null ? (
        <Banner tone="warning" message={`${team?.name ?? 'This team'} have ${squad.length} of ${size} players. The innings ends when only one batter is left.`} testID="setup-players-short" />
      ) : null}
      <SectionHeader
        title="Playing side"
        action={roster !== null && roster.length > 0 ? { label: 'Select all', onPress: () => setSquad([...squad, ...ordered.filter((player) => !squad.includes(player.id)).map((player) => player.id)], []), testID: 'setup-players-all' } : undefined}
      />
      {roster === null ? <Skeleton rows={4} testID="setup-players-loading" /> : null}
      {roster !== null && roster.length === 0 ? (
        <Text variant="body" tone="secondary" style={styles.note}>
          This team has no players yet. Add them here; they are saved to the team for next time.
        </Text>
      ) : null}
      {ordered.map((player) => {
        const selected = squad.includes(player.id);
        const order = selected ? squad.indexOf(player.id) + 1 : null;
        return (
          <SquadRow
            key={player.id}
            name={player.name}
            order={order}
            tags={tagsOf(player)}
            selected={selected}
            substitute={substitutes.includes(player.id)}
            onToggle={() => setSquad(toggled(squad, player.id), substitutes.filter((id) => id !== player.id))}
            onToggleSubstitute={() => setSquad(squad, toggled(substitutes, player.id))}
            onMoveUp={() => setSquad(moved(squad, player.id, -1), substitutes)}
            onMoveDown={() => setSquad(moved(squad, player.id, 1), substitutes)}
            testID={`setup-player-${player.id}`}
          />
        );
      })}
      <View style={styles.actions}>
        <Button label="Add player" icon="plus" variant="tertiary" onPress={() => setAdding(true)} disabled={teamId === null} testID="setup-players-add" />
      </View>
      <Text variant="footnote" tone="secondary" style={styles.note}>
        Tick players in batting order. Mark others as sub to let them field as substitutes.
      </Text>
      {adding ? (
        <PlayerSheet
          visible
          title={`Add player to ${team?.name ?? 'team'}`}
          initial={{ name: '', jerseyNumber: null, role: 'unknown' }}
          busy={busy}
          onSubmit={(values) => void flight(() => add(values))}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: 'flex-start', paddingHorizontal: space.xs, paddingTop: space.xs },
  note: { paddingHorizontal: space.md, paddingTop: space.xs },
});
