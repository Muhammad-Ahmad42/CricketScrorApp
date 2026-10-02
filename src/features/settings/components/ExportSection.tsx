import { StyleSheet, View } from 'react-native';
import { Banner, Button, ListRow, SectionHeader, Text, space, useTheme } from '@/ui';
import type { ExportPhase } from '../hooks/useBackupExport';
import { BusyLine } from './BusyLine';

export interface ExportSectionProps {
  readonly phase: ExportPhase;
  readonly savedText: string | null;
  readonly problem: string | null;
  readonly disabled: boolean;
  readonly onExportAll: () => void;
  readonly onExportTournament: () => void;
  readonly onShareAgain: () => void;
}

export function ExportSection({ phase, savedText, problem, disabled, onExportAll, onExportTournament, onShareAgain }: ExportSectionProps) {
  const theme = useTheme();
  const busy = phase !== 'idle';
  return (
    <>
      <SectionHeader title="Export" />
      <ListRow
        title="Export all data"
        subtitle="Teams, matches, tournaments and settings in one file"
        trailing={{ kind: 'chevron' }}
        onPress={onExportAll}
        disabled={disabled || busy}
        accessibilityHint="Saves a backup file and opens the share sheet"
        testID="backup-btn-export-full"
      />
      <ListRow
        title="Export a tournament"
        subtitle="One tournament with its teams, fixtures and matches"
        trailing={{ kind: 'chevron' }}
        onPress={onExportTournament}
        disabled={disabled || busy}
        testID="backup-btn-export-tournament"
      />
      {phase === 'exporting' ? <BusyLine text="Preparing the backup file…" testID="backup-text-exporting" /> : null}
      {phase === 'sharing' ? <BusyLine text="Opening the share sheet…" testID="backup-text-sharing" /> : null}
      {savedText && !busy ? (
        <View style={[styles.saved, { backgroundColor: theme.color.surface }]}>
          <Text variant="subhead" tone="secondary" style={styles.savedText} testID="backup-text-exported">
            {savedText}
          </Text>
          <Button label="Share again" icon="share" variant="tertiary" size="sm" onPress={onShareAgain} disabled={disabled} testID="backup-btn-share" />
        </View>
      ) : null}
      {problem ? <Banner tone="danger" message={problem} testID="backup-banner-export-error" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  saved: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.xs },
  savedText: { flex: 1 },
});
