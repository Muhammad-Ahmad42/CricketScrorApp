import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { OffBallDismissalType, PlayerId, RetirementKind } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, RadioList, Sheet, Text, space } from '@/ui';
import { OFF_BALL_LABEL, RETIREMENT_LABEL } from '../selectors/labels';
import type { PlayerOption } from '../selectors/options';

type Kind = RetirementKind | `off_${OffBallDismissalType}`;

const LATER = '__later__';

const KINDS: readonly { readonly value: Kind; readonly label: string }[] = [
  { value: 'retired_hurt', label: RETIREMENT_LABEL.retired_hurt },
  { value: 'retired_not_out', label: RETIREMENT_LABEL.retired_not_out },
  { value: 'retired_out', label: RETIREMENT_LABEL.retired_out },
  { value: 'off_run_out', label: OFF_BALL_LABEL.run_out },
  { value: 'off_obstructing_field', label: OFF_BALL_LABEL.obstructing_field },
  { value: 'off_timed_out', label: OFF_BALL_LABEL.timed_out },
];

export interface RetireSheetProps {
  readonly visible: boolean;
  readonly striker: PlayerOption | null;
  readonly nonStriker: PlayerOption | null;
  readonly nextBatters: readonly PlayerOption[];
  readonly initialPlayerId?: PlayerId | null;
  readonly initialKind?: RetirementKind;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

export function retireIntent(kind: Kind, playerId: PlayerId, nextBatterId: PlayerId | null): ScoringIntent {
  switch (kind) {
    case 'retired_hurt':
    case 'retired_not_out':
    case 'retired_out':
      return { type: 'retire', playerId, retirement: kind, nextBatterId };
    case 'off_run_out':
      return { type: 'off_ball_dismissal', playerId, dismissal: 'run_out', nextBatterId };
    case 'off_obstructing_field':
      return { type: 'off_ball_dismissal', playerId, dismissal: 'obstructing_field', nextBatterId };
    case 'off_timed_out':
      return { type: 'off_ball_dismissal', playerId, dismissal: 'timed_out', nextBatterId };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function RetireSheet({ visible, striker, nonStriker, nextBatters, initialPlayerId, initialKind = 'retired_hurt', onSubmit, onClose }: RetireSheetProps) {
  const batters = [striker, nonStriker].filter((option): option is PlayerOption => option !== null);
  const atCrease = batters.find((option) => option.id === initialPlayerId)?.id ?? null;
  const [playerId, setPlayerId] = useState<PlayerId | null>(atCrease ?? striker?.id ?? null);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [nextId, setNextId] = useState<PlayerId | null>(nextBatters[0]?.id ?? null);
  const record = () => {
    if (playerId === null) {
      return;
    }
    onSubmit(retireIntent(kind, playerId, nextId));
  };
  return (
    <Sheet
      visible={visible}
      title="Retire or dismiss batter"
      onClose={onClose}
      testID="sheet-retire"
      footer={<Button label="Record" size="lg" fullWidth disabled={playerId === null} onPress={record} testID="retire-submit" />}
    >
      <View style={styles.body}>
        <Text variant="subhead" tone="secondary">
          Batter
        </Text>
        <RadioList
          accessibilityLabel="Batter"
          value={playerId}
          onChange={setPlayerId}
          choices={batters.map((option) => ({ value: option.id, label: option.label, testID: `retire-batter-${option.id}` }))}
        />
        <Text variant="subhead" tone="secondary">
          What happened
        </Text>
        <RadioList
          accessibilityLabel="What happened"
          value={kind}
          onChange={setKind}
          choices={KINDS.map((entry) => ({ value: entry.value, label: entry.label, testID: `retire-kind-${entry.value}` }))}
        />
        <Text variant="subhead" tone="secondary">
          Next batter
        </Text>
        <RadioList
          accessibilityLabel="Next batter"
          value={nextId ?? LATER}
          onChange={(value) => setNextId(value === LATER ? null : value)}
          choices={[
            ...nextBatters.map((option) => ({ value: option.id, label: option.label, description: option.detail ?? undefined, testID: `retire-next-${option.id}` })),
            { value: LATER, label: 'Choose later', testID: 'retire-next-later' },
          ]}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});
