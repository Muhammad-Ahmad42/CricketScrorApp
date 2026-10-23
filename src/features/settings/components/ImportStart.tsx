import { Banner, ListRow, SectionHeader } from '@/ui';
import { COPY } from '../copy';
import type { ImportPhase } from '../hooks/useBackupImport';
import type { ProblemVM } from '../selectors/problem';
import { actionTrailing } from './ActionIcon';
import { BusyLine } from './BusyLine';

export interface ImportStartProps {
  readonly phase: ImportPhase;
  readonly hasFile: boolean;
  readonly problem: ProblemVM | null;
  readonly disabled: boolean;
  readonly followedByPreview?: boolean;
  readonly onChoose: () => void;
}

export function ImportStart({ phase, hasFile, problem, disabled, followedByPreview = false, onChoose }: ImportStartProps) {
  return (
    <>
      <SectionHeader title="Import" />
      <ListRow
        title={hasFile ? 'Choose another file…' : 'Choose a backup file…'}
        trailing={actionTrailing('file-text', disabled || phase !== 'idle', 'backup-icon-import')}
        onPress={onChoose}
        accessibilityHint="Opens the file picker. Nothing changes until you review the file and tap Import"
        disabled={disabled || phase !== 'idle'}
        separator={followedByPreview || phase === 'checking' || phase === 'importing'}
        testID="backup-btn-import"
      />
      {phase === 'checking' ? <BusyLine text={COPY.checkingFile} testID="import-text-checking" /> : null}
      {phase === 'importing' ? <BusyLine text={COPY.importing} testID="import-text-importing" /> : null}
      {problem ? <Banner tone="danger" message={problem.headline} supporting={problem.supporting} testID="import-banner-error" /> : null}
    </>
  );
}
