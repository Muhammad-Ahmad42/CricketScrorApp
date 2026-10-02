import type { MatchId } from '@/domain/types';
import { useBackupStore, useExportStore, useToastStore } from '@/stores';

export const PDF_FAILED = "Couldn't create the PDF. Your match is safe.";
export const BACKUP_FAILED = "Couldn't create the backup file. Your match is safe.";
export const SHARE_FAILED = "Couldn't open the share sheet.";

function failed(message: string, retry: () => void): void {
  useToastStore.getState().show({ kind: 'error', message, action: { label: 'Try again', run: retry } });
}

export async function shareScorecardPdf(matchId: MatchId): Promise<boolean> {
  const exporter = useExportStore.getState();
  const uri = await exporter.scorecardPdf(matchId);
  if (uri === null) {
    useExportStore.getState().clearError();
    failed(PDF_FAILED, () => void shareScorecardPdf(matchId));
    return false;
  }
  const shared = await useExportStore.getState().share(uri, 'application/pdf');
  if (!shared) {
    useExportStore.getState().clearError();
    failed(SHARE_FAILED, () => void useExportStore.getState().share(uri, 'application/pdf'));
  }
  return shared;
}

export async function shareMatchBackup(matchId: MatchId): Promise<boolean> {
  const uri = await useBackupStore.getState().exportBackup({ kind: 'match', matchId });
  if (uri === null) {
    failed(BACKUP_FAILED, () => void shareMatchBackup(matchId));
    return false;
  }
  const shared = await useExportStore.getState().share(uri, 'application/json');
  if (!shared) {
    useExportStore.getState().clearError();
    failed(SHARE_FAILED, () => void useExportStore.getState().share(uri, 'application/json'));
  }
  return shared;
}
