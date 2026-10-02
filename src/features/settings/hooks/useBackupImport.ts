import { useEffect, useRef, useState } from 'react';
import type { ImportConflictPolicy, ImportPreview } from '@/domain/types';
import type { ImportReport } from '@/services/contracts';
import { useBackupStore } from '@/stores';
import { COPY } from '../copy';
import { pickBackupFile } from '../platform/backupFile';
import { DEFAULT_IMPORT_POLICY, policyForImport } from '../selectors/importPreview';

export type ImportPhase = 'idle' | 'picking' | 'checking' | 'importing';

export interface BackupImport {
  readonly phase: ImportPhase;
  readonly fileName: string | null;
  readonly preview: ImportPreview | null;
  readonly report: ImportReport | null;
  readonly policy: ImportConflictPolicy;
  readonly confirmingReplace: boolean;
  readonly problem: string | null;
  choose(): Promise<void>;
  setPolicy(policy: ImportConflictPolicy): void;
  requestImport(): void;
  confirmReplace(): void;
  cancelReplace(): void;
  finish(): void;
}

export function useBackupImport(): BackupImport {
  const preview = useBackupStore((state) => state.preview);
  const report = useBackupStore((state) => state.report);
  const importFileUri = useBackupStore((state) => state.importFileUri);
  const previewImport = useBackupStore((state) => state.previewImport);
  const applyImport = useBackupStore((state) => state.applyImport);
  const reset = useBackupStore((state) => state.reset);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ImportConflictPolicy>(DEFAULT_IMPORT_POLICY);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = useRef(false);
  const replaceArmed = useRef(false);

  useEffect(() => () => reset(), [reset]);

  const disarmReplace = (): void => {
    replaceArmed.current = false;
    setConfirmingReplace(false);
  };

  const choose = async (): Promise<void> => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    disarmReplace();
    setProblem(null);
    setPhase('picking');
    try {
      let picked: Awaited<ReturnType<typeof pickBackupFile>>;
      try {
        picked = await pickBackupFile();
      } catch {
        setProblem(COPY.pickerFailed);
        return;
      }
      if (!picked) {
        return;
      }
      reset();
      setFileName(picked.name);
      setPolicy(DEFAULT_IMPORT_POLICY);
      setPhase('checking');
      await previewImport(picked.uri);
      const after = useBackupStore.getState();
      if (!after.preview) {
        setProblem(after.error?.message ?? COPY.readFailed);
      }
    } finally {
      busy.current = false;
      setPhase('idle');
    }
  };

  const run = async (chosen: ImportConflictPolicy): Promise<void> => {
    if (busy.current || !importFileUri) {
      return;
    }
    busy.current = true;
    setProblem(null);
    setPhase('importing');
    let ok = false;
    try {
      ok = await applyImport(importFileUri, chosen);
    } finally {
      busy.current = false;
      setPhase('idle');
    }
    if (!ok) {
      setProblem(useBackupStore.getState().error?.message ?? COPY.importFailed);
    }
  };

  const requestImport = (): void => {
    if (busy.current || phase !== 'idle' || !preview || !preview.ok || !importFileUri) {
      return;
    }
    const chosen = policyForImport(preview, policy);
    if (chosen === 'replace_existing') {
      replaceArmed.current = true;
      setConfirmingReplace(true);
      return;
    }
    void run(chosen);
  };

  const confirmReplace = (): void => {
    if (!replaceArmed.current) {
      return;
    }
    disarmReplace();
    void run('replace_existing');
  };

  const finish = (): void => {
    reset();
    setFileName(null);
    setPolicy(DEFAULT_IMPORT_POLICY);
    setProblem(null);
  };

  return {
    phase,
    fileName,
    preview,
    report,
    policy,
    confirmingReplace,
    problem,
    choose,
    setPolicy,
    requestImport,
    confirmReplace,
    cancelReplace: disarmReplace,
    finish,
  };
}
