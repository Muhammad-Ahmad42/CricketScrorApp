import type { FormatId } from '@/domain/types';
import { ListRow } from '@/ui';
import type { PresetRowVM } from '../selectors/presets';

export interface PresetListProps {
  readonly presets: readonly PresetRowVM[];
  readonly onOpen: (formatId: FormatId) => void;
}

export function PresetList({ presets, onOpen }: PresetListProps) {
  return (
    <>
      {presets.map((preset) => (
        <ListRow
          key={preset.id}
          title={preset.title}
          subtitle={preset.summary}
          trailing={preset.isDefault ? { kind: 'badge', badge: { label: 'Default', tone: 'outline' } } : { kind: 'chevron' }}
          onPress={() => onOpen(preset.id)}
          testID={`presets-row-${preset.slug}`}
        />
      ))}
    </>
  );
}
