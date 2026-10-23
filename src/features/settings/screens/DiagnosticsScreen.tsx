import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { MatchId } from '@/domain/types';
import { NavHeader } from '@/features/shared';
import type { IntegrityReport, ServiceError } from '@/services/contracts';
import { useAppStore, useBackupStore, useExportStore } from '@/stores';
import { Banner, Disclosure, ListRow, Screen, SectionHeader, space } from '@/ui';
import { actionTrailing } from '../components/ActionIcon';
import { Block } from '../components/Block';
import { InfoLine, InfoRow } from '../components/InfoRow';
import { IntegrityCheckPanel } from '../components/IntegrityCheckPanel';
import { RepairList } from '../components/RepairList';
import { ENGINE_VERSIONS } from '../constants';
import { COPY } from '../copy';
import { readAppInfo } from '../platform/appInfo';
import { shareText } from '../platform/shareText';
import { selectDiagnostics, technicalDetails, type DiagnosticsInput, type SourcedError } from '../selectors/diagnostics';
import { problemOf, problemText, type ProblemVM } from '../selectors/problem';

function sourcedErrors(entries: readonly (readonly [string, ServiceError | null])[]): readonly SourcedError[] {
  return entries.flatMap(([source, error]) => (error ? [{ source, error }] : []));
}

export function DiagnosticsScreen() {
  const router = useRouter();
  const report = useAppStore((state) => state.report);
  const appError = useAppStore((state) => state.error);
  const checkIntegrity = useAppStore((state) => state.checkIntegrity);
  const backupError = useBackupStore((state) => state.error);
  const exportError = useExportStore((state) => state.error);
  const [app] = useState(readAppInfo);
  const [check, setCheck] = useState<IntegrityReport | null>(null);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<ProblemVM | null>(null);

  const input: DiagnosticsInput = {
    app,
    engine: ENGINE_VERSIONS,
    report,
    check,
    errors: sourcedErrors([
      ['startup', appError],
      ['backup', backupError],
      ['export', exportError],
    ]),
  };
  const vm = selectDiagnostics(input);

  const runCheck = async () => {
    if (running) {
      return;
    }
    setRunning(true);
    setProblem(null);
    const result = await checkIntegrity();
    setRunning(false);
    if (result) {
      setCheck(result);
      return;
    }
    setProblem(problemOf(useAppStore.getState().error, COPY.checkFailed));
  };

  const openMatch = (matchId: MatchId) => router.push({ pathname: '/match/[matchId]/balls', params: { matchId } });

  const shareDetails = async () => {
    setProblem(null);
    const shared = await shareText('Scorebook technical details', technicalDetails(input));
    if (!shared) {
      setProblem(problemText(COPY.detailsShareFailed));
    }
  };

  return (
    <Screen testID="screen-diagnostics" header={<NavHeader title="Diagnostics" onBack={() => router.back()} />}>
      <SectionHeader title="This app" />
      {vm.info.map((line) => (
        <InfoRow key={line.key} label={line.label} value={line.value} valueTestID={line.testID} />
      ))}
      <Block padding="xs" align="stretch">
        <Disclosure label="Technical" accessibilityHint="Shows database and engine versions" testID="diag-btn-technical">
          <View style={styles.lines}>
            {vm.technical.map((line) => (
              <InfoLine key={line.key} label={line.label} value={line.value} valueTestID={line.testID} />
            ))}
          </View>
        </Disclosure>
      </Block>
      <RepairList repairs={vm.repairs} onOpen={openMatch} />
      <IntegrityCheckPanel result={vm.check} running={running} onRun={() => void runCheck()} />
      {problem ? <Banner tone="danger" message={problem.headline} supporting={problem.supporting} testID="diag-banner-error" /> : null}
      <SectionHeader title="Support" />
      <ListRow
        title="Share technical details"
        trailing={actionTrailing('share', false, 'diag-icon-share-details')}
        onPress={() => void shareDetails()}
        separator={false}
        accessibilityHint="Shares versions, check results and error codes"
        testID="diag-btn-share-details"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lines: { gap: space.xs, paddingBottom: space.xxs },
});
