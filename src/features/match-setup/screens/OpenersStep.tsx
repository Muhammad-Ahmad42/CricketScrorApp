import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { PlayerId } from '@/domain/types';
import { SectionHeader, Text, space } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, useToastStore } from '@/stores';
import { OptionButton } from '@/features/scoring/components/common/OptionButton';
import { PickerRow } from '@/features/scoring/components/common/PickerRow';
import { formatLabel } from '@/features/scoring/selectors/scoreboard';
import { formatDateLabel } from '@/features/scoring/selectors/dates';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { useSetupPlayers } from '../context/SetupPlayersContext';
import { battingFirstOf, namedPlayers, sideOf, squadOf } from '../selectors/wizard';
import { WizardScreen } from './WizardScreen';

type Slot = 'strikerId' | 'nonStrikerId' | 'bowlerId';

const SLOT_LABEL: { readonly [K in Slot]: string } = { strikerId: 'Striker (faces first ball)', nonStrikerId: 'Non-striker', bowlerId: 'Opening bowler' };

export const CREATE_FAILED = "Couldn't create the match. Nothing was saved.";

export function OpenersStep() {
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
    return [...battingSquad, ...fieldingSquad].find((player) => player.id === id)?.name ?? 'Choose';
  };
  const ready = openers.strikerId !== null && openers.nonStrikerId !== null && openers.bowlerId !== null && openers.strikerId !== openers.nonStrikerId;

  const start = async () => {
    const store = useMatchSetupStore.getState();
    if (store.draft.title.trim() === '') {
      store.update({ title: `${nameOf(draft.teamAId)} v ${nameOf(draft.teamBId)}` });
    }
    const matchId = await useMatchSetupStore.getState().submit();
    if (matchId === null) {
      const message = useMatchSetupStore.getState().error?.message;
      useToastStore.getState().show({
        kind: 'error',
        message: message === undefined ? CREATE_FAILED : `${CREATE_FAILED} ${message}`,
        action: { label: 'Try again', run: () => void start() },
      });
      return;
    }
    router.replace({ pathname: '/match/[matchId]/score', params: { matchId } });
  };

  const venue = draft.venueId === null ? null : venues.find((entry) => entry.id === draft.venueId)?.name ?? null;
  const summary = [formatLabel(draft.formatId, draft.rules.oversPerInnings), `${draft.rules.oversPerInnings} overs`, `${draft.rules.playersPerSide} a side`].join(' · ');
  const when = [venue, formatDateLabel(draft.scheduledDate), draft.scheduledTime].filter((part): part is string => part !== null).join(' · ');

  const slot = (key: Slot) => (
    <View key={key}>
      <PickerRow label={SLOT_LABEL[key]} value={labelFor(key)} placeholder={openers[key] === null} onPress={() => setOpen(open === key ? null : key)} testID={`setup-opener-${key}`} />
      {open === key ? (
        <View style={styles.list}>
          {optionsFor(key).map((player) => (
            <OptionButton key={player.id} label={player.name} compact selected={openers[key] === player.id} onPress={() => choose(key, player.id)} testID={`setup-opener-${key}-${player.id}`} />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <WizardScreen step="openers" nextLabel="Start match" nextDisabled={!ready} busy={status === 'saving'} onNext={() => void flight(start)}>
      <SectionHeader title={`${nameOf(batting)} batting`} />
      <View style={styles.block}>
        {slot('strikerId')}
        {slot('nonStrikerId')}
      </View>
      <SectionHeader title={`${nameOf(fielding)} bowling`} />
      <View style={styles.block}>{slot('bowlerId')}</View>
      <View style={styles.summary}>
        <Text variant="footnote" tone="secondary">
          {summary}
        </Text>
        {when ? (
          <Text variant="footnote" tone="secondary">
            {when}
          </Text>
        ) : null}
      </View>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space.md },
  list: { gap: space.xs, paddingVertical: space.xs },
  summary: { paddingHorizontal: space.md, paddingTop: space.lg, gap: space.xxs },
});
