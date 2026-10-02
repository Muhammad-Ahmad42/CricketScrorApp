import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet, Stepper, Text, space } from '@/ui';

export interface SideSizesSheetProps {
  readonly visible: boolean;
  readonly teamA: { readonly name: string; readonly size: number };
  readonly teamB: { readonly name: string; readonly size: number };
  readonly playersPerSide: number;
  readonly busy: boolean;
  readonly onSubmit: (sizes: { readonly teamAPlayers: number | null; readonly teamBPlayers: number | null }) => void;
  readonly onClose: () => void;
}

export function SideSizesSheet({ visible, teamA, teamB, playersPerSide, busy, onSubmit, onClose }: SideSizesSheetProps) {
  const [a, setA] = useState(teamA.size);
  const [b, setB] = useState(teamB.size);
  return (
    <Sheet
      visible={visible}
      title="Side sizes"
      onClose={onClose}
      testID="sheet-side-sizes"
      footer={
        <Button
          label="Save side sizes"
          size="lg"
          fullWidth
          loading={busy}
          onPress={() => onSubmit({ teamAPlayers: a === playersPerSide ? null : a, teamBPlayers: b === playersPerSide ? null : b })}
          testID="side-sizes-save"
        />
      }
    >
      <View style={styles.body}>
        <Text variant="footnote" tone="secondary">
          {`Use this when a side plays short or long by agreement. The match rule is ${playersPerSide} a side.`}
        </Text>
        <Stepper label={`${teamA.name} plays with`} value={a} min={2} max={15} onChange={setA} testID="side-sizes-a" />
        <Stepper label={`${teamB.name} plays with`} value={b} min={2} max={15} onChange={setB} testID="side-sizes-b" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});
