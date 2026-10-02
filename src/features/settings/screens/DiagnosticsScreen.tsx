import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { MatchId } from '@/domain/types';
import type { IntegrityReport, ServiceError } from '@/services/contracts';
import { useAppStore, useBackupStore, useExportStore } from '@/stores';
import { Banner, Button, Screen, SectionHeader, Text, space, useTheme } from '@/ui';
import { InfoRow } from '../components/InfoRow';
import { IntegrityCheckPanel } from '../components/IntegrityCheckPanel';
import { RepairList } from '../components/RepairList';
import { StackHeader, StackIntro } from '../components/StackHeader';
import { ENGINE_VERSIONS } from '../constants';
import { COPY } from '../copy';
import { readAppInfo } from '../platform/appInfo';
import { shareText } from '../platform/shareText';
import { selectDiagnostics, technicalDetails, type DiagnosticsInput, type SourcedError } from '../selectors/diagnostics';

function sourcedErrors(entries: readonly (readonly [string, ServiceError | null])[]): readonly SourcedError[] {
  return entries.flatMap(([source, error]) => (error ? [{ source, error }] : []));
}

export function DiagnosticsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const report = useAppStore((state) => state.report);
  const appError = useAppStore((state) => state.error);
  const checkIntegrity = useAppStore((state) => state.checkIntegrity);
  const backupError = useBackupStore((state) => state.error);
  const exportError = useExportStore((state) => state.error);
  const [app] = useState(readAppInfo);
  const [check, setCheck] = useState<IntegrityReport | null>(null);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
    setProblem(useAppStore.getState().error?.message ?? COPY.checkFailed);
  };

  const openMatch = (matchId: MatchId) => router.push({ pathname: '/match/[matchId]/balls', params: { matchId } });

  const shareDetails = async () => {
    setProblem(null);
    const shared = await shareText('Scorebook technical details', technicalDetails(input));
    if (!shared) {
      setProblem(COPY.detailsShareFailed);
    }
  };

  return (
    <Screen testID="screen-diagnostics" ambient header={<StackHeader title="Diagnostics" onBack={() => router.back()} />}>
      <StackIntro text={COPY.diagnosticsIntro} testID="diag-text-intro" />
      <SectionHeader title="This app" />
      {vm.info.map((line, index) => (
        <InfoRow key={line.key} label={line.label} value={line.value} valueTestID={line.testID} separator={index < vm.info.length - 1} />
      ))}
      <RepairList repairs={vm.repairs} onOpen={openMatch} />
      <IntegrityCheckPanel result={vm.check} running={running} onRun={() => void runCheck()} />
      {problem ? <Banner tone="danger" message={problem} testID="diag-banner-error" /> : null}
      <SectionHeader title="Support" />
      <View style={[styles.support, { backgroundColor: theme.color.surface }]}>
        <Text variant="footnote" tone="secondary">
          Technical details include versions, check results and error codes. They are only shared when you choose to send them.
        </Text>
        <Button
          label="Share technical details"
          icon="share"
          variant="tertiary"
          onPress={() => void shareDetails()}
          accessibilityHint="Opens the share sheet with technical details for support"
          testID="diag-btn-share-details"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  support: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xs, alignItems: 'flex-start' },
});
