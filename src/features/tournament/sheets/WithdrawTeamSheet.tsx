import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChoiceList } from '@/features/shared';
import { Button, ListRow, Sheet, Text, space } from '@/ui';

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
  return (
    <Sheet
      visible={visible}
      title={`Withdraw ${teamName}`}
      onClose={onClose}
      testID="sheet-withdraw-team"
      footer={<Button label="Review changes" variant="destructive" onPress={() => onSubmit({ remainingFixtures: remaining, expungeResults: expunge })} fullWidth testID="withdraw-btn-review" />}
    >
      <View style={styles.body}>
        <Text variant="label" tone="secondary" accessibilityRole="header">
          Remaining fixtures
        </Text>
        <ChoiceList
          choices={[
            { value: 'walkover', label: 'Walkovers to opponents', description: 'Each opponent is awarded the match.', testID: 'withdraw-chip-walkover' },
            { value: 'cancel', label: 'Cancel them', description: 'The matches are not played and do not count.', testID: 'withdraw-chip-cancel' },
          ]}
          value={remaining}
          onChange={setRemaining}
          accessibilityLabel="Remaining fixtures"
        />
        <ListRow
          title="Also remove played results"
          subtitle={`Every result involving ${teamName} is expunged from the tables.`}
          trailing={{ kind: 'switch', value: expunge, onValueChange: setExpunge }}
          testID="withdraw-toggle-expunge"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});
