import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { TournamentId } from '@/domain/types';
import { useTournamentListStore } from '@/stores';
import { Screen } from '@/ui';
import { ExportSection } from '../components/ExportSection';
import { ImportPreviewAction, ImportPreviewView } from '../components/ImportPreviewView';
import { ImportReportAction, ImportReportView } from '../components/ImportReportView';
import { ImportStart } from '../components/ImportStart';
import { StackHeader, StackIntro } from '../components/StackHeader';
import { COPY } from '../copy';
import { useBackupExport } from '../hooks/useBackupExport';
import { useBackupImport } from '../hooks/useBackupImport';
import { exportedFileText, tournamentTargets } from '../selectors/exportTargets';
import { replaceConfirmation, selectImportPreview } from '../selectors/importPreview';
import { importReportText } from '../selectors/importReport';
import { ReplaceImportDialog } from '../sheets/ReplaceImportDialog';
import { TournamentExportSheet, type TournamentListState } from '../sheets/TournamentExportSheet';

export function BackupScreen() {
  const router = useRouter();
  const exporter = useBackupExport();
  const importer = useBackupImport();
  const tournaments = useTournamentListStore((state) => state.items);
  const loadTournaments = useTournamentListStore((state) => state.load);
  const [tournamentSheetOpen, setTournamentSheetOpen] = useState(false);
  const [listState, setListState] = useState<TournamentListState>('loading');
  const exportBusy = exporter.phase !== 'idle';
  const importBusy = importer.phase !== 'idle';
  const previewVM = importer.preview ? selectImportPreview(importer.preview, importer.fileName) : null;
  const footer = importer.report ? (
    <ImportReportAction onDone={importer.finish} />
  ) : previewVM?.importable ? (
    <ImportPreviewAction vm={previewVM} busy={importer.phase === 'importing'} onImport={importer.requestImport} />
  ) : undefined;

  const refreshTournaments = async () => {
    setListState('loading');
    const ok = await loadTournaments();
    setListState(ok ? 'ready' : 'failed');
  };

  const openTournamentSheet = () => {
    setTournamentSheetOpen(true);
    void refreshTournaments();
  };

  const exportTournament = (tournamentId: TournamentId) => {
    setTournamentSheetOpen(false);
    void exporter.exportScope({ kind: 'tournament', tournamentId });
  };

  return (
    <Screen testID="screen-backup" ambient header={<StackHeader title="Backup & import" onBack={() => router.back()} />} footer={footer}>
      <StackIntro text={COPY.backupIntro} testID="backup-text-intro" />
      <ExportSection
        phase={exporter.phase}
        savedText={exporter.fileUri ? exportedFileText(exporter.fileUri) : null}
        problem={exporter.problem}
        disabled={importBusy}
        onExportAll={() => void exporter.exportScope({ kind: 'full' })}
        onExportTournament={openTournamentSheet}
        onShareAgain={() => void exporter.shareAgain()}
      />
      <ImportStart
        phase={importer.phase}
        hasFile={importer.preview !== null}
        problem={importer.problem}
        disabled={exportBusy}
        onChoose={() => void importer.choose()}
      />
      {importer.report ? (
        <ImportReportView text={importReportText(importer.report)} />
      ) : previewVM ? (
        <ImportPreviewView
          vm={previewVM}
          policy={importer.policy}
          busy={importer.phase === 'importing'}
          onPolicyChange={importer.setPolicy}
        />
      ) : null}
      <TournamentExportSheet
        visible={tournamentSheetOpen}
        state={listState}
        tournaments={tournamentTargets(tournaments)}
        onSelect={exportTournament}
        onRetry={() => void refreshTournaments()}
        onClose={() => setTournamentSheetOpen(false)}
      />
      <ReplaceImportDialog
        visible={importer.confirmingReplace}
        message={importer.preview ? replaceConfirmation(importer.preview) : ''}
        onConfirm={importer.confirmReplace}
        onCancel={importer.cancelReplace}
      />
    </Screen>
  );
}
