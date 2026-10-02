import type { MatchId } from '@/domain/types';
import type { BootstrapReport, DatabasePragmas, IntegrityReport, ServiceError } from '@/services/contracts';
import { countOf, formatCount, formatDayTime } from './text';

export interface AppInfo {
  readonly version: string;
  readonly platform: string;
}

export interface EngineVersions {
  readonly scoringProjection: number;
  readonly backupFormat: number;
}

export interface SourcedError {
  readonly source: string;
  readonly error: ServiceError;
}

export interface DiagnosticsInput {
  readonly app: AppInfo;
  readonly engine: EngineVersions;
  readonly report: BootstrapReport | null;
  readonly check: IntegrityReport | null;
  readonly errors: readonly SourcedError[];
}

export interface InfoLineVM {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}

export interface RepairVM {
  readonly matchId: MatchId;
  readonly title: string;
  readonly detail: string;
  readonly testID: string;
}

export interface CheckResultVM {
  readonly healthy: boolean;
  readonly message: string;
  readonly checkedAt: string;
}

export interface DiagnosticsVM {
  readonly info: readonly InfoLineVM[];
  readonly repairs: readonly RepairVM[];
  readonly check: CheckResultVM | null;
}

const NOT_AVAILABLE = 'Not available';
const REPAIR_HINT = 'Open its ball log to correct the event that cannot be replayed.';
const MATCHES = { one: 'match', many: 'matches' } as const;
const LINKS = { one: 'broken link', many: 'broken links' } as const;

export function pragmaText(pragmas: DatabasePragmas | null | undefined): string | null {
  if (!pragmas) {
    return null;
  }
  return `foreign_keys=${pragmas.foreignKeys} journal_mode=${pragmas.journalMode.toLowerCase()} synchronous=${pragmas.synchronous}`;
}

export function infoLines(input: Pick<DiagnosticsInput, 'app' | 'engine' | 'report'>): readonly InfoLineVM[] {
  const { app, engine, report } = input;
  return [
    { key: 'app', label: 'App version', value: app.version, testID: 'diag-text-app-version' },
    {
      key: 'schema',
      label: 'Database version',
      value: report ? String(report.schemaVersion) : NOT_AVAILABLE,
      testID: 'diag-text-schema-version',
    },
    { key: 'engine', label: 'Scoring engine version', value: String(engine.scoringProjection), testID: 'diag-text-engine-version' },
    { key: 'backup', label: 'Backup format', value: String(engine.backupFormat), testID: 'diag-text-backup-format' },
    {
      key: 'rebuilt',
      label: 'Results recalculated at start',
      value: report ? formatCount(report.projectionsRebuilt) : NOT_AVAILABLE,
      testID: 'diag-text-rebuilt',
    },
    {
      key: 'pragmas',
      label: 'Database safety settings',
      value: pragmaText(report?.pragmas) ?? NOT_AVAILABLE,
      testID: 'diag-text-pragmas',
    },
  ];
}

export function repairEntries(report: BootstrapReport | null, check: IntegrityReport | null): readonly RepairVM[] {
  const messages = new Map<MatchId, string[]>();
  for (const issue of report?.integrityIssues ?? []) {
    messages.set(issue.matchId, [...(messages.get(issue.matchId) ?? []), issue.message]);
  }
  const ids: readonly MatchId[] = check ? check.matchesNeedingRepair : [...messages.keys()];
  const unique = [...new Set(ids)];
  return unique.map((matchId, index) => {
    const known = messages.get(matchId) ?? [];
    return {
      matchId,
      title: known[0] ?? 'This match needs repair',
      detail: known.length > 1 ? `${known.slice(1).join(' ')} ${REPAIR_HINT}` : REPAIR_HINT,
      testID: `diag-row-repair-${index + 1}`,
    };
  });
}

export function checkResult(check: IntegrityReport): CheckResultVM {
  const repairs = check.matchesNeedingRepair.length;
  const repairText = repairs > 0 ? ` ${countOf(repairs, MATCHES)} ${repairs === 1 ? 'needs' : 'need'} repair; open ${repairs === 1 ? 'it' : 'each one'} below.` : '';
  if (check.foreignKeyViolations > 0) {
    return {
      healthy: false,
      message: `Found ${countOf(check.foreignKeyViolations, LINKS)} between matches, teams and tournaments. Nothing was changed.${repairText} Share the technical details if you need help.`,
      checkedAt: `Last check: ${formatDayTime(check.checkedAt)}`,
    };
  }
  return {
    healthy: repairs === 0,
    message: `All links between matches, teams and tournaments are intact.${repairText}`,
    checkedAt: `Last check: ${formatDayTime(check.checkedAt)}`,
  };
}

export function selectDiagnostics(input: DiagnosticsInput): DiagnosticsVM {
  return {
    info: infoLines(input),
    repairs: repairEntries(input.report, input.check),
    check: input.check ? checkResult(input.check) : null,
  };
}

function errorLine({ source, error }: SourcedError): string {
  const code = error.domainCode ? `${error.code}/${error.domainCode}` : error.code;
  const detail = error.detail ? ` | ${error.detail}` : '';
  return `- ${source}: ${code}: ${error.message}${detail}`;
}

export function technicalDetails(input: DiagnosticsInput): string {
  const { app, engine, report, check, errors } = input;
  const lines = [
    'Scorebook diagnostics',
    `app_version=${app.version}`,
    `platform=${app.platform}`,
    `schema_version=${report ? report.schemaVersion : 'unknown'}`,
    `scoring_projection_version=${engine.scoringProjection}`,
    `backup_format_version=${engine.backupFormat}`,
    `projections_rebuilt_at_start=${report ? report.projectionsRebuilt : 'unknown'}`,
    `pragmas=${pragmaText(report?.pragmas) ?? 'unknown'}`,
    `resumable_matches=${report ? report.resumable.length : 'unknown'}`,
    `integrity_issues_at_start=${report ? report.integrityIssues.length : 'unknown'}`,
    ...(report?.integrityIssues ?? []).map((issue) => `- ${issue.matchId}: ${issue.message}`),
  ];
  if (check) {
    lines.push(
      `integrity_check_at=${check.checkedAt}`,
      `foreign_key_violations=${check.foreignKeyViolations}`,
      `matches_needing_repair=${check.matchesNeedingRepair.length > 0 ? check.matchesNeedingRepair.join(',') : 'none'}`,
    );
  } else {
    lines.push('integrity_check=not run');
  }
  lines.push(`errors=${errors.length}`, ...errors.map(errorLine));
  return lines.join('\n');
}
