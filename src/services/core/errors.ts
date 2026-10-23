import {
  LogConflictError,
  MigrationError,
  NotFoundError,
  SchemaTooNewError,
  SquadPlayerInUseError,
  sqliteErrorKind,
} from '@/db';
import type { ServiceError } from '../contracts';
import { ServiceFailure, serviceError } from './result';

export const MESSAGES = {
  record: "Couldn't save this delivery. Your previous match data is still safe.",
  matchChange: "Couldn't save this change to the match. Your previous match data is still safe.",
  createMatch: "Couldn't create the match. Nothing was saved.",
  loadMatch: "Couldn't open this match. Your match data is still safe.",
  matchList: "Couldn't load your matches. Your data is still safe.",
  conflict: 'This match changed on another screen. Check it and try again.',
  tournamentConflict: 'The tournament changed since this preview. Review the changes again.',
  tournament: "Couldn't save this tournament change. Your tournament data is still safe.",
  tournamentLoad: "Couldn't open this tournament. Your data is still safe.",
  team: "Couldn't save this change. Your teams are still safe.",
  settings: "Couldn't save your settings. Your previous settings are still in place.",
  bootstrap: "Couldn't open your scorebook data. Nothing has been changed.",
  integrity: "Couldn't finish the data check. Nothing has been changed.",
  exportPdf: "Couldn't create the PDF. Your data is safe.",
  exportBackup: "Couldn't save the backup. Your data is safe.",
  share: "Couldn't open the share sheet. The file is saved in the app's files.",
  importRead: "Couldn't read this file. Choose a Scorebook backup and try again.",
  importApply: "Couldn't import this backup. Nothing has been changed.",
  needsRepair: 'This match needs repair. Edit or undo the damaged ball before scoring again.',
} as const;

function technicalDetail(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (cause: ${error.cause.name}: ${error.cause.message})` : '';
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

function isStaleWriter(error: unknown): boolean {
  if (error instanceof LogConflictError) {
    return true;
  }
  const message = error instanceof Error ? error.message : '';
  return sqliteErrorKind(error) === 'unique' && /match_events/i.test(message);
}

export function toServiceError(error: unknown, message: string): ServiceError {
  if (error instanceof ServiceFailure) {
    return error.error;
  }
  const detail = technicalDetail(error);
  if (isStaleWriter(error)) {
    return serviceError('CONFLICT', MESSAGES.conflict, { detail });
  }
  if (error instanceof SchemaTooNewError) {
    return serviceError('STORAGE', error.message, { detail });
  }
  if (error instanceof MigrationError) {
    return serviceError('STORAGE', "Couldn't upgrade your data. Nothing was changed. Try again.", { detail });
  }
  if (error instanceof SquadPlayerInUseError) {
    return serviceError('FORBIDDEN_STATE', 'This player has already played. They stay in the squad.', { detail });
  }
  if (error instanceof NotFoundError) {
    return serviceError('NOT_FOUND', 'This item no longer exists. It may have been deleted.', { detail });
  }
  return serviceError('STORAGE', message, { detail });
}
