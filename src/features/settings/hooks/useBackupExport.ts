import { useState } from 'react';
import type { BackupScope } from '@/domain/types';
import { useBackupStore, useExportStore } from '@/stores';
import { COPY } from '../copy';
import { problemOf, type ProblemVM } from '../selectors/problem';

export type ExportPhase = 'idle' | 'exporting' | 'sharing';

export interface BackupExport {
  readonly phase: ExportPhase;
  readonly fileUri: string | null;
  readonly problem: ProblemVM | null;
  exportScope(scope: BackupScope): Promise<boolean>;
  shareAgain(): Promise<boolean>;
}

export function useBackupExport(): BackupExport {
  const exportBackup = useBackupStore((state) => state.exportBackup);
  const share = useExportStore((state) => state.share);
  const [phase, setPhase] = useState<ExportPhase>('idle');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [problem, setProblem] = useState<ProblemVM | null>(null);

  const shareFile = async (uri: string): Promise<boolean> => {
    setPhase('sharing');
    const shared = await share(uri, 'application/json');
    setPhase('idle');
    if (!shared) {
      setProblem(problemOf(useExportStore.getState().error, COPY.shareFailed));
    }
    return shared;
  };

  const exportScope = async (scope: BackupScope): Promise<boolean> => {
    if (phase !== 'idle') {
      return false;
    }
    setProblem(null);
    setPhase('exporting');
    const uri = await exportBackup(scope);
    if (!uri) {
      setPhase('idle');
      setProblem(problemOf(useBackupStore.getState().error, COPY.exportFailed));
      return false;
    }
    setFileUri(uri);
    return shareFile(uri);
  };

  const shareAgain = async (): Promise<boolean> => {
    if (!fileUri || phase !== 'idle') {
      return false;
    }
    setProblem(null);
    return shareFile(fileUri);
  };

  return { phase, fileUri, problem, exportScope, shareAgain };
}
