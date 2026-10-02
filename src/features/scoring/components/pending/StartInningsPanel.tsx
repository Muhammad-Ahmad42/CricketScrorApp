import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, SegmentedControl, Text, space } from '@/ui';
import { OptionButton } from '../common/OptionButton';
import { PickerRow } from '../common/PickerRow';
import type { PlayerOption, StartInningsVM } from '../../selectors/options';
import { PanelFrame } from './PanelFrame';

export interface StartInningsPanelProps {
  readonly vm: StartInningsVM;
  readonly confirmFirst: boolean;
  readonly busy?: boolean;
  readonly onStart: (intent: ScoringIntent) => void;
  readonly onUndo: () => void;
}

type Slot = 'striker' | 'nonStriker' | 'bowler';

const SLOT_LABEL: { readonly [K in Slot]: string } = { striker: 'Striker', nonStriker: 'Non-striker', bowler: 'Opening bowler' };

export function StartInningsPanel({ vm, confirmFirst, busy = false, onStart, onUndo }: StartInningsPanelProps) {
  const [confirmed, setConfirmed] = useState(!confirmFirst);
  const [teamId, setTeamId] = useState<TeamId>(vm.suggestedBattingTeamId ?? vm.teams[0].id);
  const [picked, setPicked] = useState<{ readonly [K in Slot]: string | null }>({ striker: null, nonStriker: null, bowler: null });
  const [open, setOpen] = useState<Slot | null>(null);

  if (!confirmed) {
    return (
      <PanelFrame heading="End of innings?" subheading={vm.previous} onUndo={onUndo} testID="prompt-innings-confirm">
        <Button label="Continue" size="lg" fullWidth onPress={() => setConfirmed(true)} testID="prompt-innings-continue" />
      </PanelFrame>
    );
  }

  const batters = vm.battersFor(teamId);
  const bowlers = vm.bowlersFor(teamId);
  const optionsFor = (slot: Slot): readonly PlayerOption[] => {
    if (slot === 'bowler') {
      return bowlers;
    }
    const other = slot === 'striker' ? picked.nonStriker : picked.striker;
    return batters.filter((option) => option.id !== other);
  };
  const labelFor = (slot: Slot) => {
    const list = slot === 'bowler' ? bowlers : batters;
    return list.find((option) => option.id === picked[slot])?.label ?? 'Choose';
  };
  const ready = picked.striker !== null && picked.nonStriker !== null && picked.bowler !== null;
  const start = () => {
    if (picked.striker === null || picked.nonStriker === null || picked.bowler === null) {
      return;
    }
    onStart({ type: 'start_innings', strikerId: picked.striker, nonStrikerId: picked.nonStriker, bowlerId: picked.bowler, battingTeamId: teamId });
  };
  const battingName = vm.teams.find((team) => team.id === teamId)?.name ?? '';

  return (
    <PanelFrame heading={vm.heading} subheading={vm.previous} onUndo={onUndo} testID="prompt-start-innings">
      {vm.suggestedBattingTeamId === null ? (
        <SegmentedControl
          options={vm.teams.map((team) => ({ value: team.id, label: team.name, testID: `prompt-start-team-${team.id}` }))}
          value={teamId}
          onChange={(next) => {
            setTeamId(next);
            setPicked({ striker: null, nonStriker: null, bowler: null });
          }}
          accessibilityLabel="Batting team"
        />
      ) : null}
      <Text variant="label" tone="secondary">
        {`${battingName} openers`}
      </Text>
      {(['striker', 'nonStriker', 'bowler'] as const).map((slot) => (
        <View key={slot}>
          {slot === 'bowler' ? (
            <Text variant="label" tone="secondary" style={styles.bowlingLabel}>
              Bowling
            </Text>
          ) : null}
          <PickerRow
            label={SLOT_LABEL[slot]}
            value={labelFor(slot)}
            placeholder={picked[slot] === null}
            onPress={() => setOpen(open === slot ? null : slot)}
            testID={`prompt-start-${slot}`}
          />
          {open === slot ? (
            <View style={styles.list}>
              {optionsFor(slot).map((option) => (
                <OptionButton
                  key={option.id}
                  label={option.label}
                  tag={option.tag}
                  selected={picked[slot] === option.id}
                  onPress={() => {
                    setPicked({ ...picked, [slot]: option.id });
                    setOpen(null);
                  }}
                  testID={`prompt-start-${slot}-${option.id}`}
                />
              ))}
            </View>
          ) : null}
        </View>
      ))}
      <Button label={vm.heading} size="lg" fullWidth disabled={!ready} loading={busy} onPress={start} testID="prompt-start-submit" />
    </PanelFrame>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs, paddingVertical: space.xs },
  bowlingLabel: { paddingTop: space.sm },
});
