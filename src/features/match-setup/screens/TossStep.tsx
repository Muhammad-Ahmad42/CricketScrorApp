import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId, TossDecision } from '@/domain/types';
import { Button, SectionHeader, SegmentedControl, Text, space } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, type MatchSetupDraft } from '@/stores';
import { OptionButton } from '@/features/scoring/components/common/OptionButton';
import { battingFirstOf, battingOrderPatch } from '../selectors/wizard';
import { WizardScreen } from './WizardScreen';

function setBattingOrder(patch: Pick<Partial<MatchSetupDraft>, 'toss' | 'battingFirstTeamId'>) {
  const store = useMatchSetupStore.getState();
  store.update(battingOrderPatch(store.draft, patch));
}

export function TossStep() {
  const draft = useMatchSetupStore((s) => s.draft);
  const teams = useTeamLibraryStore((s) => s.teams);
  const [notRecorded, setNotRecorded] = useState(draft.toss === null && (draft.battingFirstTeamId ?? null) !== null);
  const sides = [draft.teamAId, draft.teamBId].filter((id): id is TeamId => id !== null).map((id) => ({ id, name: teams.find((team) => team.id === id)?.name ?? 'Team' }));
  const decision: TossDecision = draft.toss?.decision ?? 'bat';
  const batting = battingFirstOf(draft);
  const battingName = sides.find((side) => side.id === batting)?.name ?? null;

  const pickWinner = (winnerTeamId: TeamId) => {
    setNotRecorded(false);
    setBattingOrder({ toss: { winnerTeamId, decision }, battingFirstTeamId: null });
  };
  const pickDecision = (next: TossDecision) => {
    if (draft.toss !== null) {
      setBattingOrder({ toss: { winnerTeamId: draft.toss.winnerTeamId, decision: next } });
    }
  };
  const switchToNotRecorded = () => {
    setNotRecorded(true);
    setBattingOrder({ toss: null, battingFirstTeamId: null });
  };
  const switchToRecorded = () => {
    setNotRecorded(false);
    setBattingOrder({ battingFirstTeamId: null });
  };

  return (
    <WizardScreen step="toss" nextDisabled={batting === null}>
      {notRecorded ? (
        <>
          <SectionHeader title="Who bats first?" />
          <View style={styles.list}>
            {sides.map((side) => (
              <OptionButton
                key={side.id}
                label={side.name}
                selected={draft.battingFirstTeamId === side.id}
                onPress={() => setBattingOrder({ toss: null, battingFirstTeamId: side.id })}
                testID={`setup-bats-first-${side.id}`}
              />
            ))}
          </View>
          <View style={styles.link}>
            <Button label="Record the toss" variant="tertiary" size="sm" onPress={switchToRecorded} testID="setup-toss-record" />
          </View>
        </>
      ) : (
        <>
          <SectionHeader title="Who won the toss?" />
          <View style={styles.list}>
            {sides.map((side) => (
              <OptionButton key={side.id} label={side.name} selected={draft.toss?.winnerTeamId === side.id} onPress={() => pickWinner(side.id)} testID={`setup-toss-winner-${side.id}`} />
            ))}
          </View>
          <SectionHeader title="Elected to" />
          <View style={styles.list}>
            <SegmentedControl
              options={[
                { value: 'bat', label: 'Bat', testID: 'setup-toss-bat' },
                { value: 'bowl', label: 'Bowl', testID: 'setup-toss-bowl' },
              ]}
              value={decision}
              onChange={pickDecision}
              disabled={draft.toss === null}
              accessibilityLabel="Toss decision"
            />
          </View>
          <View style={styles.link}>
            <Button label="Toss not recorded" variant="tertiary" size="sm" onPress={switchToNotRecorded} testID="setup-toss-none" />
          </View>
        </>
      )}
      {battingName !== null ? (
        <Text variant="callout" style={styles.sentence} testID="setup-toss-summary">{`${battingName} will bat first.`}</Text>
      ) : null}
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.md, gap: space.xs },
  link: { alignItems: 'flex-start', paddingHorizontal: space.xs, paddingTop: space.xs },
  sentence: { paddingHorizontal: space.md, paddingTop: space.md },
});
