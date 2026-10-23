import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { StageId, TournamentId } from '@/domain/types';
import { EmptyState, Inset, SegmentedControl, space } from '@/ui';
import { BracketView } from '../components/BracketView';
import { routes } from '../routes';
import { bracketVM, knockoutStages } from '../selectors/bracket';
import type { TournamentIndex } from '../selectors/names';
import { TournamentContainer } from './TournamentContainer';

export interface BracketScreenProps {
  readonly tournamentId: TournamentId;
}

function bracketStage(index: TournamentIndex, selected: StageId | null): StageId | null {
  const stages = knockoutStages(index);
  return selected ?? stages.find((candidate) => candidate === index.evaluation?.currentStageId) ?? stages[0] ?? null;
}

function BracketStagePicker({ index, stageId, onChange }: { readonly index: TournamentIndex; readonly stageId: StageId | null; readonly onChange: (stageId: StageId) => void }) {
  const stages = knockoutStages(index);
  if (stageId === null || stages.length <= 1) {
    return null;
  }
  return (
    <Inset bottom="xs">
      <SegmentedControl
        options={stages.map((candidate) => ({ value: candidate, label: index.stageName(candidate), testID: `bracket-chip-stage-${candidate}` }))}
        value={stageId}
        onChange={onChange}
        accessibilityLabel="Knockout stage"
      />
    </Inset>
  );
}

function BracketBody({ tournamentId, index, stageId }: { readonly tournamentId: TournamentId; readonly index: TournamentIndex; readonly stageId: StageId | null }) {
  const router = useRouter();
  if (stageId === null) {
    return <EmptyState icon="trophy" title="No knockout stage" testID="bracket-empty" />;
  }
  const vm = bracketVM(index, stageId);
  return (
    <View style={styles.root}>
      {vm.rounds.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No bracket yet"
          action={{ label: 'Open stage', onPress: () => router.push(routes.stage(tournamentId, stageId)), testID: 'bracket-btn-open-stage' }}
          testID="bracket-not-generated"
        />
      ) : (
        <BracketView bracket={vm} onOpenFixture={(fixtureId) => router.push(routes.fixture(tournamentId, fixtureId))} />
      )}
    </View>
  );
}

export function BracketScreen({ tournamentId }: BracketScreenProps) {
  const [selected, setSelected] = useState<StageId | null>(null);
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-bracket"
      title="Bracket"
      controls={(index) => <BracketStagePicker index={index} stageId={bracketStage(index, selected)} onChange={setSelected} />}
    >
      {(index) => <BracketBody tournamentId={tournamentId} index={index} stageId={bracketStage(index, selected)} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm, paddingTop: space.sm },
});
