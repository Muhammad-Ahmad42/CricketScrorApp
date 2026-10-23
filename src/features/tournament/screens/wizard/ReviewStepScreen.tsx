import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { describeTieBreakerChain } from '@/domain/tournament/tiebreakers';
import type { Fixture } from '@/domain/types';
import { plural } from '@/features/shared';
import { Inset, SectionHeader, Separator, Text } from '@/ui';
import { useTeamLibraryStore, useTournamentStore, useTournamentWizardStore, type TournamentWizardStep } from '@/stores';
import { showError } from '../../hooks/toast';
import { useLibraryLoaded } from '../../hooks/useLibrary';
import { routes } from '../../routes';
import { formatDateRange } from '../../selectors/dates';
import { CHAMPION_MARK, stageLine, stageNameMap } from '../../selectors/stages';
import { WizardFrame } from './WizardFrame';

export function fixturesLine(fixtures: readonly Pick<Fixture, 'scheduledDate'>[]): string {
  const dated = fixtures.filter((fixture) => fixture.scheduledDate !== null).length;
  const count = plural(fixtures.length, 'match', 'matches');
  if (dated === 0) {
    return `${count} · dates to be set`;
  }
  return dated === fixtures.length ? `${count} · all dated` : `${count} · ${dated} dated`;
}

function ReviewSection({ title, step, lines, testID }: { readonly title: string; readonly step: TournamentWizardStep; readonly lines: readonly string[]; readonly testID: string }) {
  const router = useRouter();
  return (
    <View>
      <SectionHeader
        title={title}
        action={{
          label: 'Edit',
          onPress: () => {
            useTournamentWizardStore.getState().goTo(step);
            router.push(routes.wizardStep(step));
          },
          testID: `${testID}-edit`,
        }}
      />
      <Inset bottom="sm" gap="xxs" testID={testID}>
        {lines.map((line, index) => (
          <Text key={`${index}:${line}`} variant="callout">
            {line}
          </Text>
        ))}
      </Inset>
      <Separator />
    </View>
  );
}

export function ReviewStepScreen() {
  useLibraryLoaded();
  const router = useRouter();
  const library = useTeamLibraryStore((state) => state.teams);
  const draft = useTournamentWizardStore((state) => state.draft);
  const fixtures = useTournamentStore((state) =>
    state.snapshot && state.snapshot.tournament.id === draft.tournamentId ? state.snapshot.fixtures : null,
  );
  const names = new Map(library.map((team) => [team.id, team.name]));
  const teamNames = draft.teams.map((team) => names.get(team.teamId) ?? 'Team');
  const stages = [...draft.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const stageNames = stageNameMap(stages);
  const rules = draft.rules;
  const meta = [formatDateRange(draft.info.startDate, draft.info.endDate), draft.info.organizer].filter((part): part is string => Boolean(part));
  const assignmentLines =
    draft.poolAssignment?.pools.map((pool) => `${pool.name}: ${pool.members.map((side) => (side.kind === 'team' ? names.get(side.teamId) ?? 'Team' : 'Slot')).join(', ')}`) ?? [];
  const planCount = draft.fixturePlan?.fixtures.length ?? null;

  const confirm = async () => {
    useTournamentWizardStore.getState().goTo('review');
    const tournamentId = await useTournamentWizardStore.getState().commit();
    if (tournamentId === null) {
      showError(useTournamentWizardStore.getState().error, "Couldn't confirm the tournament.");
      return;
    }
    useTournamentWizardStore.getState().reset();
    router.replace(routes.dashboard(tournamentId));
  };

  const confirmStep = async () => {
    await confirm();
    return false;
  };

  return (
    <WizardFrame step="review" nextLabel="Confirm tournament" nextTestID="twiz-btn-confirm-tournament" onNext={confirmStep}>
      <Inset top="md" bottom="md" gap="xxs">
        <Text variant="title2" testID="twiz-text-review-name">
          {draft.info.season ? `${draft.info.name} ${draft.info.season}` : draft.info.name}
        </Text>
        {meta.length > 0 ? (
          <Text variant="callout" tone="secondary">
            {meta.join(' · ')}
          </Text>
        ) : null}
      </Inset>
      <Separator />
      <ReviewSection
        title={`Teams · ${draft.teams.length}`}
        step="teams"
        testID="twiz-review-teams"
        lines={[teamNames.length > 4 ? `${teamNames.slice(0, 4).join(', ')}, +${teamNames.length - 4}` : teamNames.join(', ')]}
      />
      <ReviewSection
        title="Format"
        step="structure"
        testID="twiz-review-format"
        lines={stages.map((stage) => `${stageLine(stage, draft.pools, stageNames)}${stage.config.decidesChampion && stages.length > 1 ? ` · ${CHAMPION_MARK}` : ''}`)}
      />
      <ReviewSection
        title="Rules"
        step="rules"
        testID="twiz-review-rules"
        lines={
          rules
            ? [
                `Win ${rules.pointsSystem.win} · Tie ${rules.pointsSystem.tie} · NR ${rules.pointsSystem.noResult} · Loss ${rules.pointsSystem.loss} · ${rules.nrr.mode === 'icc' ? 'ICC NRR' : 'NRR on actual overs'}`,
                describeTieBreakerChain(rules.tieBreakers),
                `${plural(rules.defaultMatchRules.oversPerInnings, 'over')} · ${rules.defaultMatchRules.playersPerSide} players per side`,
              ]
            : ['Default rules']
        }
      />
      {assignmentLines.length > 0 ? <ReviewSection title="Pools" step="pools" testID="twiz-review-pools" lines={assignmentLines} /> : null}
      <ReviewSection
        title="Fixtures"
        step="fixtures"
        testID="twiz-review-fixtures"
        lines={[
          fixtures !== null && fixtures.length > 0
            ? fixturesLine(fixtures)
            : planCount !== null
              ? `${plural(planCount, 'match', 'matches')} in the first stage`
              : 'No fixtures yet',
        ]}
      />
    </WizardFrame>
  );
}
