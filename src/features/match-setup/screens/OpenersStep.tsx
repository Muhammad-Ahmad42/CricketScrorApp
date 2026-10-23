import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Player, PlayerId } from '@/domain/types';
import { IconButton, Inset, RadioList, SectionHeader, Text, space, useTheme } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, useToastStore } from '@/stores';
import { PickerRow } from '@/features/scoring/components/common/PickerRow';
import { formatSummary } from '@/features/scoring/selectors/scoreboard';
import { formatDateLabel } from '@/features/scoring/selectors/dates';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { useSetupPlayers } from '../context/SetupPlayersContext';
import { battingFirstOf, namedPlayers, sideOf, squadOf } from '../selectors/wizard';
import { WizardScreen } from './WizardScreen';

type Slot = 'strikerId' | 'nonStrikerId' | 'bowlerId';

const SLOT_LABEL: { readonly [K in Slot]: string } = { strikerId: 'Striker', nonStrikerId: 'Non-striker', bowlerId: 'Opening bowler' };

export const CREATE_FAILED = "Couldn't create the match. Nothing was saved.";

const ROLE_TAG: { readonly [K in Player['role']]: string | null } = {
  wicket_keeper: 'WK',
  bowler: 'Bowler',
  all_rounder: 'All-rounder',
  batter: 'Batter',
  unknown: null,
};

const SLOT_PLACEHOLDER: { readonly [K in Slot]: string } = { strikerId: 'Choose striker…', nonStrikerId: 'Choose non-striker…', bowlerId: 'Choose bowler…' };

export function openersMissing(openers: { readonly strikerId: PlayerId | null; readonly nonStrikerId: PlayerId | null; readonly bowlerId: PlayerId | null }): string | null {
  if (openers.strikerId === null || openers.nonStrikerId === null) {
    return 'Choose both opening batters';
  }
  if (openers.bowlerId === null) {
    return 'Choose an opening bowler';
  }
  return null;
}

export function OpenersStep() {
  const theme = useTheme();
  const draft = useMatchSetupStore((s) => s.draft);
  const status = useMatchSetupStore((s) => s.status);
  const teams = useTeamLibraryStore((s) => s.teams);
  const venues = useTeamLibraryStore((s) => s.venues);
  const setup = useSetupPlayers();
  const [open, setOpen] = useState<Slot | null>(null);
  const flight = useSingleFlight();
  const batting = battingFirstOf(draft);
  const fielding = batting === null ? null : batting === draft.teamAId ? draft.teamBId : draft.teamAId;
  const battingSquad = batting === null ? [] : namedPlayers(squadOf(draft, sideOf(draft, batting)), setup.playersOf(batting));
  const fieldingSquad = fielding === null ? [] : namedPlayers(squadOf(draft, sideOf(draft, fielding)), setup.playersOf(fielding));
  const nameOf = (teamId: string | null) => teams.find((team) => team.id === teamId)?.name ?? 'Team';
  const shortOf = (teamId: string | null) => teams.find((team) => team.id === teamId)?.shortName ?? nameOf(teamId);
  const openers = draft.openers;

  useEffect(() => {
    setup.ensure(draft.teamAId);
    setup.ensure(draft.teamBId);
  }, [draft.teamAId, draft.teamBId, setup]);

  useEffect(() => {
    if (openers.strikerId === null && openers.nonStrikerId === null && battingSquad.length >= 2) {
      useMatchSetupStore.getState().update({ openers: { ...openers, strikerId: battingSquad[0].id, nonStrikerId: battingSquad[1].id } });
    }
  }, [battingSquad, openers]);

  const choose = (slot: Slot, playerId: PlayerId) => {
    setOpen(null);
    useMatchSetupStore.getState().update({ openers: { ...openers, [slot]: playerId } });
  };
  const optionsFor = (slot: Slot) => {
    if (slot === 'bowlerId') {
      return fieldingSquad;
    }
    const other = slot === 'strikerId' ? openers.nonStrikerId : openers.strikerId;
    return battingSquad.filter((player) => player.id !== other);
  };
  const labelFor = (slot: Slot) => {
    const id = openers[slot];
    return [...battingSquad, ...fieldingSquad].find((player) => player.id === id)?.name ?? SLOT_PLACEHOLDER[slot];
  };
  const swap = () => {
    setOpen(null);
    useMatchSetupStore.getState().update({ openers: { ...openers, strikerId: openers.nonStrikerId, nonStrikerId: openers.strikerId } });
  };
  const ready = openers.strikerId !== null && openers.nonStrikerId !== null && openers.bowlerId !== null && openers.strikerId !== openers.nonStrikerId;

  const start = async () => {
    const store = useMatchSetupStore.getState();
    if (store.draft.title.trim() === '') {
      store.update({ title: `${nameOf(draft.teamAId)} v ${nameOf(draft.teamBId)}` });
    }
    const matchId = await useMatchSetupStore.getState().submit();
    if (matchId === null) {
      useToastStore.getState().show({
        kind: 'error',
        message: CREATE_FAILED,
        action: { label: 'Try again', run: () => void start() },
      });
      return;
    }
    router.replace({ pathname: '/match/[matchId]/score', params: { matchId } });
  };

  const venue = draft.venueId === null ? null : venues.find((entry) => entry.id === draft.venueId)?.name ?? null;
  const sides = draft.teamAPlayers !== null || draft.teamBPlayers !== null ? `${draft.teamAPlayers ?? draft.rules.playersPerSide} v ${draft.teamBPlayers ?? draft.rules.playersPerSide} players` : `${draft.rules.playersPerSide} a side`;
  const summary = [`${shortOf(batting)} bat`, `${shortOf(fielding)} bowl`, formatSummary(draft.formatId, draft.rules.oversPerInnings), sides].join(' · ');
  const missing = openersMissing(openers);
  const when = [venue, formatDateLabel(draft.scheduledDate), draft.scheduledTime].filter((part): part is string => part !== null).join(' · ');

  const slot = (key: Slot) => (
    <View key={key}>
      <PickerRow
        label={SLOT_LABEL[key]}
        value={labelFor(key)}
        placeholder={openers[key] === null}
        required
        expanded={open === key}
        onPress={() => setOpen(open === key ? null : key)}
        testID={`setup-opener-${key}`}
      />
      {open === key ? (
        <RadioList
          accessibilityLabel={SLOT_LABEL[key]}
          value={openers[key]}
          onChange={(playerId) => choose(key, playerId)}
          choices={optionsFor(key).map((player) => ({
            value: player.id,
            label: player.name,
            meta: ROLE_TAG[player.role] ?? undefined,
            testID: `setup-opener-${key}-${player.id}`,
          }))}
          testID={`setup-opener-${key}-list`}
        />
      ) : null}
    </View>
  );

  return (
    <WizardScreen step="openers" nextLabel="Start" nextDisabled={!ready} nextReason={ready ? null : missing} busy={status === 'saving'} onNext={() => void flight(start)}>
      <SectionHeader title={`${nameOf(batting)} batting`} />
      {slot('strikerId')}
      <Inset direction="row">
        <View style={styles.swap}>
          <IconButton
            icon="arrow-left-right"
            label="Swap ends"
            accessibilityLabel="Swap striker and non-striker"
            disabled={openers.strikerId === null || openers.nonStrikerId === null}
            onPress={swap}
            testID="setup-opener-swap"
          />
        </View>
      </Inset>
      {slot('nonStrikerId')}
      <SectionHeader title={`${nameOf(fielding)} bowling`} />
      {slot('bowlerId')}
      <Inset top="lg">
        <View
          style={[styles.summary, { backgroundColor: theme.color.surface, borderColor: theme.color.border, borderWidth: theme.borderWidth.hairline, borderRadius: theme.radius.md }]}
          accessible
          accessibilityLabel={`Match summary: ${[summary, when].filter((part) => part !== '').join('. ')}`}
          testID="setup-openers-summary"
        >
          <Text variant="label" tone="secondary">
            Ready to start
          </Text>
          <Text variant="bodyStrong">{summary}</Text>
          {when ? (
            <Text variant="subhead" tone="secondary">
              {when}
            </Text>
          ) : null}
        </View>
      </Inset>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  summary: { padding: space.md, gap: space.xxs },
  swap: { flex: 1, alignItems: 'flex-end' },
});
