import type { MatchId } from '@/domain/types';
import type { ShareMimeType } from '@/services/contracts';
import { useBackupStore, useExportStore, useToastStore } from '@/stores';

export const PDF_FAILED = "Couldn't create the PDF. Your match is safe.";
export const BACKUP_FAILED = "Couldn't create the backup file. Your match is safe.";
export const SHARE_FAILED = "Couldn't open the share sheet.";

function failed(message: string, retry: () => void): void {
  useToastStore.getState().show({ kind: 'error', message, action: { label: 'Try again', run: retry } });
}

async function shareFile(uri: string, mimeType: ShareMimeType, retry: () => void): Promise<boolean> {
  const shared = await useExportStore.getState().share(uri, mimeType);
  if (!shared) {
    failed(SHARE_FAILED, retry);
  }
  return shared;
}

export async function shareScorecardPdf(matchId: MatchId): Promise<boolean> {
  const retry = () => void shareScorecardPdf(matchId);
  const uri = await useExportStore.getState().scorecardPdf(matchId);
  if (uri === null) {
    failed(PDF_FAILED, retry);
    return false;
  }
  return shareFile(uri, 'application/pdf', retry);
}

export async function shareMatchBackup(matchId: MatchId): Promise<boolean> {
  const retry = () => void shareMatchBackup(matchId);
  const uri = await useBackupStore.getState().exportBackup({ kind: 'match', matchId });
  if (uri === null) {
    failed(BACKUP_FAILED, retry);
    return false;
  }
  return shareFile(uri, 'application/json', retry);
}
