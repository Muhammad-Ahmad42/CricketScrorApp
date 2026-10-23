import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, OptionTile, Text, space } from '@/ui';
import { PickerRow } from '../common/PickerRow';
import type { ChaseVM, PlayerOption, StartInningsVM } from '../../selectors/options';
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

const SLOT_PLACEHOLDER: { readonly [K in Slot]: string } = { striker: 'Choose striker…', nonStriker: 'Choose non-striker…', bowler: 'Choose bowler…' };

function ChaseLine({ chase, testID }: { readonly chase: ChaseVM; readonly testID: string }) {
  return (
    <View style={styles.chase} testID={testID}>
      <Text variant="headline">{chase.headline}</Text>
      {chase.detail ? (
        <Text variant="callout" tone="secondary" accessibilityLabel={chase.spokenDetail}>
          {chase.detail}
        </Text>
      ) : null}
    </View>
  );
}

export function StartInningsPanel({ vm, confirmFirst, busy = false, onStart, onUndo }: StartInningsPanelProps) {
  const [confirmed, setConfirmed] = useState(!confirmFirst);
  const [teamId, setTeamId] = useState<TeamId>(vm.suggestedBattingTeamId ?? vm.teams[0].id);
  const [picked, setPicked] = useState<{ readonly [K in Slot]: string | null }>({ striker: null, nonStriker: null, bowler: null });
  const [open, setOpen] = useState<Slot | null>(null);

  if (!confirmed) {
    return (
      <PanelFrame heading="End of innings?" subheading={vm.previous} onUndo={onUndo} testID="prompt-innings-confirm">
        {vm.chase !== null ? <ChaseLine chase={vm.chase} testID="prompt-innings-chase" /> : null}
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
    return list.find((option) => option.id === picked[slot])?.label ?? SLOT_PLACEHOLDER[slot];
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
      {vm.chase !== null ? <ChaseLine chase={vm.chase} testID="prompt-start-chase" /> : null}
      {vm.suggestedBattingTeamId === null ? (
        <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Batting team">
          {vm.teams.map((team) => (
            <OptionTile
              key={team.id}
              kind="radio"
              compact
              title={team.name}
              selected={teamId === team.id}
              onPress={() => {
                if (team.id !== teamId) {
                  setTeamId(team.id);
                  setPicked({ striker: null, nonStriker: null, bowler: null });
                }
              }}
              testID={`prompt-start-team-${team.id}`}
            />
          ))}
        </View>
      ) : null}
      <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.section}>
        {`${battingName} openers`}
      </Text>
      {(['striker', 'nonStriker', 'bowler'] as const).map((slot) => (
        <View key={slot}>
          {slot === 'bowler' ? (
            <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.section}>
              Bowling
            </Text>
          ) : null}
          <PickerRow
            label={SLOT_LABEL[slot]}
            value={labelFor(slot)}
            placeholder={picked[slot] === null}
            required
            inset={false}
            expanded={open === slot}
            onPress={() => setOpen(open === slot ? null : slot)}
            testID={`prompt-start-${slot}`}
          />
          {open === slot ? (
            <View style={[styles.list, styles.options]} accessibilityRole="radiogroup" accessibilityLabel={SLOT_LABEL[slot]}>
              {optionsFor(slot).map((option) => (
                <OptionTile
                  key={option.id}
                  kind="radio"
                  compact
                  title={option.label}
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
  list: { gap: space.xs },
  chase: { gap: space.xxs },
  options: { paddingVertical: space.xs },
  section: { paddingTop: space.md },
});
