import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TournamentId } from '@/domain/types';
import { ImpactSheet } from '@/features/shared';
import { Button, ListRow, Text, space } from '@/ui';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { newId, nowIso } from '../ids';
import { STAGE_STATUS_LABEL } from '../labels';
import { routes } from '../routes';
import type { TournamentIndex } from '../selectors/names';
import { editPolicy } from '../selectors/policy';
import { CHAMPION_MARK, stageNameMap, stageSummary } from '../selectors/stages';
import { addKnockoutStage } from '../wizard/structure';
import { TournamentContainer } from './TournamentContainer';

export interface StagesScreenProps {
  readonly tournamentId: TournamentId;
}

function StagesBody({ tournamentId, index }: { readonly tournamentId: TournamentId; readonly index: TournamentIndex }) {
  const router = useRouter();
  const flow = useChangeFlow();
  const snapshot = index.snapshot;
  const names = stageNameMap(index.stages);
  const canAdd = editPolicy(index).stages !== 'forbidden';

  const addStage = () => {
    const activeTeams = snapshot.teams.filter((view) => view.membership.status === 'active').length;
    const next = addKnockoutStage(
      { stages: snapshot.stages, pools: snapshot.pools, slots: snapshot.slots },
      { tournamentId, now: nowIso(), ids: newId, teamCount: activeTeams },
    );
    const added = next.stages.find((stage) => !snapshot.stages.some((existing) => existing.id === stage.id));
    if (!added) {
      return;
    }
    void flow.start({ kind: 'stage_upsert', stage: added, pools: [], slots: next.slots.filter((slot) => slot.stageId === added.id) }, { successMessage: 'Stage added' });
  };

  return (
    <View>
      {index.stages.map((stage, position) => (
        <ListRow
          key={stage.id}
          title={`${position + 1}  ${stage.name}`}
          subtitle={[stageSummary(stage, snapshot.pools, names), STAGE_STATUS_LABEL[stage.status], stage.config.decidesChampion ? CHAMPION_MARK : null]
            .filter(Boolean)
            .join(' · ')}
          trailing={{ kind: 'chevron' }}
          onPress={() => router.push(routes.stage(tournamentId, stage.id))}
          testID={`stages-row-${position + 1}`}
        />
      ))}
      <View style={styles.footer}>
        {canAdd ? <Button label="Add stage" icon="plus" variant="secondary" onPress={addStage} loading={flow.previewing} testID="stages-btn-add" /> : null}
        <Text variant="footnote" tone="secondary">
          Every stage change shows what will change before it is saved.
        </Text>
      </View>
      <ImpactSheet {...flow.sheet} names={index.impactNames} />
    </View>
  );
}

export function StagesScreen({ tournamentId }: StagesScreenProps) {
  return (
    <TournamentContainer tournamentId={tournamentId} testID="screen-stages" title="Stages">
      {(index) => <StagesBody tournamentId={tournamentId} index={index} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  footer: { padding: space.md, gap: space.sm, alignItems: 'flex-start' },
});
