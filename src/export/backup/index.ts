export { COPY_SUFFIX, markAsCopies, standaloneMatchIds, withoutAggregates, type AggregateSelection } from './aggregates';
export { canonicalJson } from './canonicalJson';
export {
  BACKUP_COLLECTION_KEYS,
  backupCounts,
  countLabel,
  emptyBackupData,
  type BackupCollectionKey,
  type BackupCounts,
} from './collections';
export {
  backupFileName,
  buildBackupEnvelope,
  sealBackupEnvelope,
  serializeBackupEnvelope,
  type BackupEnvelopeMeta,
  type PreparedBackup,
} from './envelope';
export { visitBackupIds, type IdRole, type IdSite, type IdVisit, type BackupMatchPlayer } from './ids';
export { parseBackupText, parseBackupValue, type ParseOptions, type ParsedBackup, type RawBackup } from './parse';
export { collectIdReferences, remapBackupIds, type BackupEntity, type IdReference } from './remap';
export { BACKUP_UPGRADES, upgradeEnvelope, type BackupUpgrade, type RawEnvelope } from './upgrade';
export { EMPTY_LOCAL_DATA, type BackupValidationContext, type LocalData, type LocalFootprint } from './validation/context';
export type { LocalLookupPlan } from './validation/conflicts';
export {
  checkMatchLog,
  engineLogChecker,
  matchLogJobs,
  type MatchLogCheck,
  type MatchLogChecker,
  type MatchLogJob,
  type MatchLogOutcome,
} from './validation/eventLogs';
export {
  importPreviewOf,
  planLocalLookup,
  validateBackup,
  validateBackupAsync,
  type BackupValidation,
  type ValidationHooks,
} from './validation/validate';
