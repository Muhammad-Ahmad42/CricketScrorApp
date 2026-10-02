import { Banner, ListRow, SectionHeader } from '@/ui';
import type { ImportPhase } from '../hooks/useBackupImport';
import { BusyLine } from './BusyLine';

export interface ImportStartProps {
  readonly phase: ImportPhase;
  readonly hasFile: boolean;
  readonly problem: string | null;
  readonly disabled: boolean;
  readonly onChoose: () => void;
}

export function ImportStart({ phase, hasFile, problem, disabled, onChoose }: ImportStartProps) {
  return (
    <>
      <SectionHeader title="Import" />
      <ListRow
        title={hasFile ? 'Choose another file…' : 'Choose a backup file…'}
        subtitle="Nothing changes until you review the file and tap Import"
        trailing={{ kind: 'chevron' }}
        onPress={onChoose}
        disabled={disabled || phase !== 'idle'}
        testID="backup-btn-import"
      />
      {phase === 'checking' ? <BusyLine text="Checking the file…" testID="import-text-checking" /> : null}
      {phase === 'importing' ? <BusyLine text="Importing…" testID="import-text-importing" /> : null}
      {problem ? <Banner tone="danger" message={problem} testID="import-banner-error" /> : null}
    </>
  );
}
