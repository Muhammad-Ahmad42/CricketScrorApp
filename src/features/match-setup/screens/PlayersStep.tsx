import { useEffect, useRef, useState } from 'react';
import type { Player, TeamId } from '@/domain/types';
import { blockingSquadIssue, checkDraftSquadSizes } from '@/domain/scoring/squadSize';
import { Banner, Button, Inset, SectionHeader, Skeleton, Tabs, Text } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, useToastStore } from '@/stores';
import { PlayerSheet, type PlayerValues } from '@/features/teams/sheets/PlayerSheet';
import { SquadRow } from '../components/SquadRow';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { scannable } from '@/features/scoring/selectors/scannable';
import { useSetupPlayers } from '../context/SetupPlayersContext';
import { moved, sideSize, squadOf, squadPatch, substitutesOf, toggled, type Side } from '../selectors/wizard';
import { WizardScreen } from './WizardScreen';

export function PlayersStep() {
  const draft = useMatchSetupStore((s) => s.draft);
  const teams = useTeamLibraryStore((s) => s.teams);
  const players = useSetupPlayers();
  const [side, setSide] = useState<Side>('A');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const flight = useSingleFlight();
  const prefilled = useRef(new Set<string>());

  useEffect(() => {
    if (teams.length === 0) {
      void useTeamLibraryStore.getState().load();
    }
  }, [teams.length]);
  useEffect(() => {
    players.ensure(draft.teamAId);
    players.ensure(draft.teamBId);
  }, [draft.teamAId, draft.teamBId, players]);

  const rosterA = players.playersOf(draft.teamAId);
  const rosterB = players.playersOf(draft.teamBId);
  useEffect(() => {
    const prefill = (prefillSide: Side, teamId: TeamId | null, roster: readonly Player[] | null) => {
      if (teamId === null || roster === null || prefilled.current.has(teamId)) {
        return;
      }
      prefilled.current.add(teamId);
      const current = useMatchSetupStore.getState().draft;
      if (squadOf(current, prefillSide).length === 0 && roster.length > 0 && roster.length === sideSize(current, prefillSide)) {
        useMatchSetupStore.getState().update(squadPatch(prefillSide, roster.map((player) => player.id), []));
      }
    };
    prefill('A', draft.teamAId, rosterA);
    prefill('B', draft.teamBId, rosterB);
  }, [draft.teamAId, draft.teamBId, rosterA, rosterB]);

  const teamId = side === 'A' ? draft.teamAId : draft.teamBId;
  const team = teams.find((entry) => entry.id === teamId) ?? null;
  const roster = players.playersOf(teamId);
  const squad = squadOf(draft, side);
  const substitutes = substitutesOf(draft, side);
  const size = sideSize(draft, side);
  const nameOf = (id: TeamId) => teams.find((entry) => entry.id === id)?.name ?? (id === draft.teamAId ? 'Team A' : 'Team B');
  const issues = checkDraftSquadSizes(draft, nameOf);
  const blocking = blockingSquadIssue(issues);
  const sideIssue = teamId === null ? null : issues.find((issue) => issue.teamId === teamId) ?? null;
  const setSquad = (nextSquad: readonly string[], nextSubs: readonly string[]) => useMatchSetupStore.getState().update(squadPatch(side, nextSquad, nextSubs));
  const tagsOf = (player: Player) => [team?.captainId === player.id ? 'C' : null, player.role === 'wicket_keeper' ? 'WK' : null].filter((tag): tag is string => tag !== null).join(' ');
  const ordered = roster === null ? [] : [...squad.map((id) => roster.find((player) => player.id === id)).filter((player): player is Player => player !== undefined), ...roster.filter((player) => !squad.includes(player.id))];
  const tabLabel = (tabSide: Side) => {
    const id = tabSide === 'A' ? draft.teamAId : draft.teamBId;
    const name = teams.find((entry) => entry.id === id)?.shortName ?? `Team ${tabSide}`;
    return `${name} ${squadOf(draft, tabSide).length} of ${sideSize(draft, tabSide)}`;
  };
  const tabSpoken = (tabSide: Side) => {
    const id = tabSide === 'A' ? draft.teamAId : draft.teamBId;
    const name = teams.find((entry) => entry.id === id)?.name ?? `Team ${tabSide}`;
    return `${name}, ${squadOf(draft, tabSide).length} of ${sideSize(draft, tabSide)} players selected`;
  };
  const save = async (values: PlayerValues): Promise<boolean> => {
    if (teamId === null) {
      return false;
    }
    setBusy(true);
    const created = await players.addPlayer(teamId, { name: values.name, jerseyNumber: values.jerseyNumber, role: values.role });
    setBusy(false);
    if (created === null) {
      useToastStore.getState().show({ kind: 'error', message: "Couldn't add the player.", action: null });
      return false;
    }
    const current = useMatchSetupStore.getState().draft;
    useMatchSetupStore.getState().update(squadPatch(side, [...squadOf(current, side), created.id], substitutesOf(current, side)));
    setAdded((count) => count + 1);
    return true;
  };
  const closeSheet = () => {
    setAdding(false);
    setAdded(0);
  };
  const playing = squad.length;
  const issueText = sideIssue === null ? { headline: '', detail: null } : scannable(sideIssue);

  return (
    <WizardScreen
      step="players"
      nextDisabled={blocking !== null}
      nextReason={blocking === null ? null : scannable(blocking).headline}
      toolbar={
        <Tabs
          tabs={(['A', 'B'] as const).map((key) => ({ key, label: tabLabel(key), accessibilityLabel: tabSpoken(key), testID: `setup-players-tab-${key}` }))}
          selectedKey={side}
          onSelect={setSide}
          accessibilityLabel="Teams"
        />
      }
    >
      {sideIssue !== null && sideIssue.code === 'SQUAD_TOO_LARGE' ? <Banner tone="danger" message={issueText.headline} detail={issueText.detail} testID="setup-players-too-many" /> : null}
      {sideIssue !== null && sideIssue.code === 'SQUAD_TOO_SMALL' && roster !== null ? <Banner tone="warning" message={issueText.headline} detail={issueText.detail} testID="setup-players-short" /> : null}
      <SectionHeader
        title="Playing side"
        action={roster !== null && roster.length > 0 ? { label: 'Select all', onPress: () => setSquad([...squad, ...ordered.filter((player) => !squad.includes(player.id)).map((player) => player.id)], []), testID: 'setup-players-all' } : undefined}
      />
      {roster !== null && roster.length > 0 ? (
        <Inset bottom="xs">
          <Text variant="footnote" tone="secondary">
            Tick players in batting order.
          </Text>
        </Inset>
      ) : null}
      {roster === null ? <Skeleton rows={4} testID="setup-players-loading" /> : null}
      {roster !== null && roster.length === 0 ? (
        <Inset>
          <Text variant="body" tone="secondary" testID="setup-players-none">
            No players yet
          </Text>
        </Inset>
      ) : null}
      {ordered.map((player) => {
        const selected = squad.includes(player.id);
        const position = squad.indexOf(player.id);
        return (
          <SquadRow
            key={player.id}
            name={player.name}
            order={selected ? position + 1 : null}
            tags={tagsOf(player)}
            selected={selected}
            substitute={substitutes.includes(player.id)}
            isFirst={position === 0}
            isLast={position === squad.length - 1}
            onToggle={() => setSquad(toggled(squad, player.id), substitutes.filter((id) => id !== player.id))}
            onToggleSubstitute={() => setSquad(squad, toggled(substitutes, player.id))}
            onMoveUp={() => setSquad(moved(squad, player.id, -1), substitutes)}
            onMoveDown={() => setSquad(moved(squad, player.id, 1), substitutes)}
            testID={`setup-player-${player.id}`}
          />
        );
      })}
      <Inset top="md" direction="row">
        <Button label="Add player" icon="plus" variant="secondary" onPress={() => setAdding(true)} disabled={teamId === null} testID="setup-players-add" />
      </Inset>
      {adding ? (
        <PlayerSheet
          visible
          title="Add player"
          initial={{ name: '', jerseyNumber: null, role: 'unknown' }}
          busy={busy}
          progress={[team?.name ?? null, added > 0 ? `${added} added` : null, `${playing} of ${size} selected`].filter((part): part is string => part !== null).join(' · ')}
          onSubmit={(values) =>
            void flight(async () => {
              if (await save(values)) {
                closeSheet();
              }
            })
          }
          onSubmitAnother={(values) => save(values)}
          onClose={closeSheet}
        />
      ) : null}
    </WizardScreen>
  );
}
