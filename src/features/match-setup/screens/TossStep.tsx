import { useState } from 'react';
import type { TeamId, TossDecision } from '@/domain/types';
import { Inset, RadioList, SectionHeader, SegmentedControl, Text } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, type MatchSetupDraft } from '@/stores';
import { TextAction } from '@/features/scoring/components/common/TextAction';
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
    <WizardScreen step="toss" nextDisabled={batting === null} nextReason={batting !== null ? null : notRecorded ? 'Choose who bats first' : 'Record the toss'}>
      {notRecorded ? (
        <>
          <SectionHeader title="Who bats first?" />
          <RadioList
            accessibilityLabel="Who bats first"
            value={draft.battingFirstTeamId ?? null}
            onChange={(teamId) => setBattingOrder({ toss: null, battingFirstTeamId: teamId })}
            choices={sides.map((side) => ({ value: side.id, label: side.name, testID: `setup-bats-first-${side.id}` }))}
          />
          <TextAction label="Record the toss" onPress={switchToRecorded} testID="setup-toss-record" />
        </>
      ) : (
        <>
          <SectionHeader title="Who won the toss?" />
          <RadioList
            accessibilityLabel="Who won the toss"
            value={draft.toss?.winnerTeamId ?? null}
            onChange={pickWinner}
            choices={sides.map((side) => ({ value: side.id, label: side.name, testID: `setup-toss-winner-${side.id}` }))}
          />
          <SectionHeader title="Elected to" />
          <Inset>
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
          </Inset>
          <TextAction label="Toss not recorded" onPress={switchToNotRecorded} testID="setup-toss-none" />
        </>
      )}
      {battingName !== null ? (
        <Inset top="md">
          <Text variant="callout" testID="setup-toss-summary">{`${battingName} will bat first.`}</Text>
        </Inset>
      ) : null}
    </WizardScreen>
  );
}
