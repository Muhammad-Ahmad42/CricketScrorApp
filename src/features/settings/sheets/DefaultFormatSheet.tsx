import type { FormatId } from '@/domain/types';
import { RadioList, Sheet } from '@/ui';
import type { PresetRowVM } from '../selectors/presets';

export interface DefaultFormatSheetProps {
  readonly visible: boolean;
  readonly presets: readonly PresetRowVM[];
  readonly onSelect: (formatId: FormatId) => void;
  readonly onClose: () => void;
}

export function DefaultFormatSheet({ visible, presets, onSelect, onClose }: DefaultFormatSheetProps) {
  const selected = presets.find((preset) => preset.isDefault)?.id ?? null;
  return (
    <Sheet visible={visible} title="Default format" onClose={onClose} testID="sheet-default-format">
      <RadioList
        accessibilityLabel="Default format"
        value={selected}
        onChange={onSelect}
        choices={presets.map((preset) => ({
          value: preset.id,
          label: preset.title,
          description: preset.summary,
          testID: `format-chip-${preset.slug}`,
        }))}
      />
    </Sheet>
  );
}
