import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { Button, ListRow, RadioList, Sheet, Text, space } from '@/ui';

export interface WithdrawSubmit {
  readonly remainingFixtures: 'walkover' | 'cancel';
  readonly expungeResults: boolean;
}

export interface WithdrawTeamSheetProps {
  readonly visible: boolean;
  readonly teamName: string;
  readonly onClose: () => void;
  readonly onSubmit: (value: WithdrawSubmit) => void;
}

export function WithdrawTeamSheet({ visible, teamName, onClose, onSubmit }: WithdrawTeamSheetProps) {
  const [remaining, setRemaining] = useState<'walkover' | 'cancel'>('walkover');
  const [expunge, setExpunge] = useState(false);
  const guard = useDiscardGuard(remaining !== 'walkover' || expunge, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Withdraw team"
        subtitle={teamName}
        onClose={guard.requestClose}
        testID="sheet-withdraw-team"
        footer={<Button label="Review changes" variant="destructive" onPress={() => onSubmit({ remainingFixtures: remaining, expungeResults: expunge })} fullWidth testID="withdraw-btn-review" />}
      >
        <View style={styles.body}>
          <Text variant="label" tone="secondary" accessibilityRole="header">
            Remaining fixtures
          </Text>
          <RadioList
            choices={[
              { value: 'walkover', label: 'Walkovers to opponents', testID: 'withdraw-chip-walkover' },
              { value: 'cancel', label: 'Cancel them', description: "They won't count", testID: 'withdraw-chip-cancel' },
            ]}
            value={remaining}
            onChange={setRemaining}
            accessibilityLabel="Remaining fixtures"
          />
          <ListRow
            title="Remove results from tables"
            trailing={{ kind: 'switch', value: expunge, onValueChange: setExpunge }}
            testID="withdraw-toggle-expunge"
          />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});
