import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { TournamentId } from '@/domain/types';
import { fitsInline } from '@/features/shared';
import { Banner, Button, Dialog, IconButton, Inset, ListRow, PressableRow, SectionHeader, Separator, Text, TwoPane, space } from '@/ui';
import { useTournamentWizardStore } from '@/stores';
import { FixtureRow } from '../components/FixtureRow';
import { ProgressRule } from '../components/ProgressRule';
import { Scoreline } from '../components/Scoreline';
import { StandingsTable } from '../components/StandingsTable';
import { PROVISIONAL_START_TITLE, useStartFixtureMatch } from '../hooks/useStartFixtureMatch';
import { showError } from '../hooks/toast';
import { useTournamentView } from '../hooks/useTournamentView';
import { useVenues, venueLookup } from '../hooks/useLibrary';
import { routes } from '../routes';
import { dashboardVM, type DashboardResultVM, type DashboardVM } from '../selectors/dashboard';
import type { TournamentIndex } from '../selectors/names';
import { TournamentContainer } from './TournamentContainer';

export interface DashboardScreenProps {
  readonly tournamentId: TournamentId;
}

interface IndexEntry {
  readonly key: string;
  readonly title: string;
  readonly testID: string;
  readonly href: Href;
  readonly visible: (vm: DashboardVM) => boolean;
}

function sectionIndex(tournamentId: TournamentId): readonly IndexEntry[] {
  return [
    { key: 'fixtures', title: 'Fixtures', testID: 'dash-btn-fixtures', href: routes.fixtures(tournamentId), visible: () => true },
    { key: 'standings', title: 'Standings', testID: 'dash-btn-standings', href: routes.standings(tournamentId), visible: () => true },
    { key: 'qualification', title: 'Qualification', testID: 'dash-btn-qualification', href: routes.qualification(tournamentId), visible: () => true },
    { key: 'bracket', title: 'Bracket', testID: 'dash-btn-bracket', href: routes.bracket(tournamentId), visible: (vm) => vm.hasBracket },
    { key: 'stats', title: 'Statistics', testID: 'dash-btn-stats', href: routes.stats(tournamentId), visible: () => true },
    { key: 'pools', title: 'Pools', testID: 'dash-btn-pools', href: routes.pools(tournamentId), visible: (vm) => vm.hasPools },
    { key: 'stages', title: 'Stages', testID: 'dash-btn-stages', href: routes.stages(tournamentId), visible: () => true },
    { key: 'teams', title: 'Teams', testID: 'dash-btn-teams', href: routes.teams(tournamentId), visible: () => true },
    { key: 'what-if', title: 'What if…', testID: 'dash-btn-what-if', href: routes.whatIf(tournamentId), visible: (vm) => !vm.setup && !vm.allPlayed },
    { key: 'audit', title: 'Audit log', testID: 'dash-btn-audit', href: routes.audit(tournamentId), visible: () => true },
    { key: 'manage', title: 'Tournament settings', testID: 'dash-btn-manage', href: routes.manage(tournamentId), visible: () => true },
  ];
}

function RecentResultRow({ result, onPress, testID }: { readonly result: DashboardResultVM; readonly onPress: () => void; readonly testID: string }) {
  const spoken = result.scoreline ? `${result.text}. ${result.scoreline.spoken}` : result.text;
  return (
    <PressableRow testID={testID} accessibilityLabel={spoken} onPress={onPress} chevron align="start">
      <Text variant="tableNumeric" tone="secondary" style={styles.resultLabel}>
        {result.label}
      </Text>
      <View style={styles.flex}>
        <Text variant="callout">{result.result}</Text>
        {result.scoreline ? <Scoreline scoreline={result.scoreline} /> : null}
      </View>
    </PressableRow>
  );
}

interface DashboardBodyProps {
  readonly tournamentId: TournamentId;
  readonly index: TournamentIndex;
  readonly vm: DashboardVM;
}

function DashboardBody({ tournamentId, index, vm }: DashboardBodyProps) {
  const router = useRouter();
  const start = useStartFixtureMatch(tournamentId, index);
  const next = vm.next;

  const continueSetup = async () => {
    const wizard = useTournamentWizardStore.getState();
    if (await wizard.resume(tournamentId)) {
      router.push(routes.wizardStep(useTournamentWizardStore.getState().step));
    } else {
      showError(useTournamentWizardStore.getState().error, "Couldn't open the setup.");
    }
  };

  const progressBlock = vm.setup ? null : (
    <View style={styles.block} accessible accessibilityLabel={[vm.progressLabel, vm.progressDetail].filter(Boolean).join('. ')}>
      <Inset gap="xs">
        <View style={styles.progressLine}>
          <Text variant="label" tone="secondary" style={styles.flex} testID="dash-text-stage">
            {vm.stageName ?? 'Tournament'}
          </Text>
          <Text variant="headline" testID="dash-text-progress">
            {`${vm.progressText} played`}
          </Text>
        </View>
        <ProgressRule ratio={vm.progressRatio} width="100%" />
        {vm.progressDetail ? (
          <Text variant="footnote" tone="secondary" testID="dash-text-progress-detail">
            {vm.progressDetail}
          </Text>
        ) : null}
      </Inset>
    </View>
  );

  const liveBlock =
    vm.live.length === 0 ? null : (
      <View>
        <Separator />
        <SectionHeader title="Live now" />
        {vm.live.map((row) => (
          <FixtureRow
            key={row.key}
            row={row}
            testIDPrefix="dash-live"
            onPress={() => {
              if (row.matchId) {
                router.push(routes.matchScore(row.matchId));
              }
            }}
          />
        ))}
      </View>
    );

  const nextBlock =
    next === null ? null : (
      <View>
        <Separator />
        <SectionHeader title="Next match" />
        <View testID="dash-row-next-match">
          <FixtureRow
            row={next}
            testIDPrefix="dash-next"
            showStatus={false}
            onPress={() => router.push(routes.fixture(tournamentId, next.fixtureId))}
            trailing={
              next.resolved && !vm.archived ? (
                <Button
                  label="Start"
                  variant="secondary"
                  size="sm"
                  loading={start.busy}
                  onPress={() => start.request(next)}
                  accessibilityLabel={`Start ${next.teamsText}`}
                  testID="dash-btn-start-next"
                />
              ) : undefined
            }
          />
        </View>
      </View>
    );

  const standingsBlock =
    vm.standings === null ? null : (
      <View>
        <Separator />
        <SectionHeader
          title={`Standings · ${vm.standings.table.title}`}
          action={{ label: 'See all', onPress: () => router.push(routes.standings(tournamentId)), testID: 'dash-btn-standings-full' }}
        />
        <StandingsTable table={vm.standings.table} compact testIDPrefix="dash-standings" maxRows={8} />
        {vm.standings.explanation && fitsInline(vm.standings.explanation) ? (
          <Inset top="xs">
            <Text variant="footnote" tone="secondary" testID="dash-text-qualification">
              {vm.standings.explanation}
            </Text>
          </Inset>
        ) : null}
      </View>
    );

  const recentBlock =
    vm.recent.length === 0 ? null : (
      <View>
        <Separator />
        <SectionHeader
          title="Recent results"
          action={{ label: 'See all', onPress: () => router.push(routes.fixtures(tournamentId)), testID: 'dash-btn-results-all' }}
        />
        {vm.recent.map((result, position) => (
          <RecentResultRow
            key={result.key}
            result={result}
            onPress={() => router.push(routes.fixture(tournamentId, result.fixtureId))}
            testID={`dash-row-result-${position + 1}`}
          />
        ))}
      </View>
    );

  return (
    <View>
      {vm.unresolvedTies.map((text, position) => (
        <Banner
          key={text}
          tone="warning"
          message={text}
          action={{ label: 'Resolve tie', onPress: () => router.push(routes.qualification(tournamentId)), testID: `dash-btn-resolve-tie-${position + 1}` }}
          testID={`dash-text-tie-${position + 1}`}
        />
      ))}
      {vm.stale ? <Banner tone="info" message="Updating results…" testID="dash-text-stale" /> : null}
      {vm.archived ? <Banner tone="info" message="Archived · read only" testID="dash-text-archived" /> : null}
      {vm.setup ? (
        <View style={styles.block}>
          <Inset gap="sm">
            <Text variant="headline">Setup in progress</Text>
            <View style={styles.start}>
              <Button label="Continue setup" onPress={() => void continueSetup()} testID="dash-btn-continue-setup" />
            </View>
          </Inset>
        </View>
      ) : null}
      {vm.champion ? (
        <View style={styles.block} accessible accessibilityLabel={`Champion: ${vm.champion.names}. ${vm.champion.basis}`}>
          <Inset gap="xs">
            <Text variant="label" tone="secondary">
              Champion
            </Text>
            <Text variant="title1" testID="dash-text-champion">
              {vm.champion.names}
            </Text>
            <Text variant="callout" tone="secondary">
              {vm.champion.basis}
            </Text>
          </Inset>
        </View>
      ) : null}
      <TwoPane
        ratio={0.45}
        primary={
          <View>
            {progressBlock}
            {liveBlock}
            {nextBlock}
          </View>
        }
        secondary={
          <View>
            {standingsBlock}
            {recentBlock}
          </View>
        }
        testID="dash-panes"
      />
      <Separator />
      <SectionHeader title="Tournament" />
      {sectionIndex(tournamentId)
        .filter((entry) => entry.visible(vm))
        .map((entry) => (
          <ListRow key={entry.key} title={entry.title} trailing={{ kind: 'chevron' }} onPress={() => router.push(entry.href)} compact testID={entry.testID} />
        ))}
      <Dialog
        visible={start.prompt !== null}
        title={PROVISIONAL_START_TITLE}
        message={start.prompt?.message}
        cancel={{ label: 'Cancel', onPress: start.dismiss }}
        confirm={{ label: 'Start anyway', onPress: start.confirm, loading: start.busy }}
        onRequestClose={start.dismiss}
        testID="dialog-start-provisional"
      />
    </View>
  );
}

export function DashboardScreen({ tournamentId }: DashboardScreenProps) {
  const router = useRouter();
  const venues = useVenues();
  const { index } = useTournamentView();
  const vm = index ? dashboardVM(index, venueLookup(venues)) : null;
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-tournament"
      title={(current) => current.snapshot.tournament.name}
      subtitle={() => vm?.metaLine ?? null}
      titleTestID="dash-text-name"
      backTo={routes.tournaments()}
      trailing={() => (
        <IconButton icon="settings" accessibilityLabel="Tournament settings" onPress={() => router.push(routes.manage(tournamentId))} testID="dash-btn-settings" />
      )}
    >
      {(current) => <DashboardBody tournamentId={tournamentId} index={current} vm={vm ?? dashboardVM(current)} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: space.md },
  progressLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  start: { alignSelf: 'flex-start' },
  resultLabel: { minWidth: space['3xl'] },
});
