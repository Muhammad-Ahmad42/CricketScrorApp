import type { BackupIssue, BackupIssueCode } from '@/domain/types';

export interface IssueSink {
  add(issue: BackupIssue): void;
}

export interface IssueLog extends IssueSink {
  readonly issues: () => readonly BackupIssue[];
  readonly hasErrors: () => boolean;
}

export const ISSUES_SHOWN_PER_KIND = 50;

export function createIssueLog(limitPerKind: number = ISSUES_SHOWN_PER_KIND): IssueLog {
  const kept: BackupIssue[] = [];
  const hidden = new Map<string, { readonly severity: BackupIssue['severity']; readonly code: BackupIssueCode; count: number }>();
  const shown = new Map<string, number>();
  let errors = 0;
  return {
    add(issue) {
      if (issue.severity === 'error') {
        errors += 1;
      }
      const kind = `${issue.severity}:${issue.code}`;
      const count = shown.get(kind) ?? 0;
      if (count < limitPerKind) {
        shown.set(kind, count + 1);
        kept.push(issue);
        return;
      }
      const extra = hidden.get(kind);
      if (extra === undefined) {
        hidden.set(kind, { severity: issue.severity, code: issue.code, count: 1 });
      } else {
        extra.count += 1;
      }
    },
    issues() {
      const summaries: BackupIssue[] = [...hidden.values()].map((extra) => ({
        severity: extra.severity,
        code: extra.code,
        message: `${extra.count} more ${extra.count === 1 ? 'problem' : 'problems'} like the ones above ${extra.count === 1 ? 'was' : 'were'} found.`,
        path: null,
      }));
      return [...kept, ...summaries];
    },
    hasErrors() {
      return errors > 0;
    },
  };
}

export function errorIssue(code: BackupIssueCode, message: string, path: string | null = null): BackupIssue {
  return { severity: 'error', code, message, path };
}

export function warningIssue(code: BackupIssueCode, message: string, path: string | null = null): BackupIssue {
  return { severity: 'warning', code, message, path };
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
