import { StyleSheet } from 'react-native';
import { Banner, Button, ListRow, SectionHeader, Text } from '@/ui';
import { COPY } from '../copy';
import type { ExportPhase } from '../hooks/useBackupExport';
import type { ProblemVM } from '../selectors/problem';
import { actionTrailing } from './ActionIcon';
import { Block } from './Block';
import { BusyLine } from './BusyLine';

export interface ExportSectionProps {
  readonly phase: ExportPhase;
  readonly savedText: string | null;
  readonly problem: ProblemVM | null;
  readonly disabled: boolean;
  readonly onExportAll: () => void;
  readonly onExportTournament: () => void;
  readonly onShareAgain: () => void;
}

export function ExportSection({ phase, savedText, problem, disabled, onExportAll, onExportTournament, onShareAgain }: ExportSectionProps) {
  const busy = phase !== 'idle';
  return (
    <>
      <SectionHeader title="Export" />
      <ListRow
        title="Export all data"
        trailing={actionTrailing('share', disabled || busy, 'backup-icon-export-full')}
        onPress={onExportAll}
        disabled={disabled || busy}
        accessibilityHint="Saves teams, matches, tournaments and settings to a file and opens the share sheet"
        testID="backup-btn-export-full"
      />
      <ListRow
        title="Export a tournament"
        trailing={actionTrailing('share', disabled || busy, 'backup-icon-export-tournament')}
        onPress={onExportTournament}
        accessibilityHint="Choose a tournament, then save it to a file and open the share sheet"
        disabled={disabled || busy}
        separator={busy || savedText !== null}
        testID="backup-btn-export-tournament"
      />
      {phase === 'exporting' ? <BusyLine text={COPY.exporting} testID="backup-text-exporting" /> : null}
      {phase === 'sharing' ? <BusyLine text={COPY.sharing} testID="backup-text-sharing" /> : null}
      {savedText && !busy ? (
        <Block direction="row" align="center" gap="sm" padding="xs" compact>
          <Text variant="subhead" tone="secondary" style={styles.savedText} testID="backup-text-exported">
            {savedText}
          </Text>
          <Button label="Share again" icon="share" variant="tertiary" size="sm" onPress={onShareAgain} disabled={disabled} testID="backup-btn-share" />
        </Block>
      ) : null}
      {problem ? <Banner tone="danger" message={problem.headline} supporting={problem.supporting} testID="backup-banner-export-error" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  savedText: { flex: 1, minWidth: 0 },
});
