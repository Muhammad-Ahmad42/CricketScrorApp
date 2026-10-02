import type { FormatId } from '@/domain/types';
import { Sheet } from '@/ui';
import { ChoiceRow } from '../components/ChoiceRow';
import type { PresetRowVM } from '../selectors/presets';

export interface DefaultFormatSheetProps {
  readonly visible: boolean;
  readonly presets: readonly PresetRowVM[];
  readonly onSelect: (formatId: FormatId) => void;
  readonly onClose: () => void;
}

export function DefaultFormatSheet({ visible, presets, onSelect, onClose }: DefaultFormatSheetProps) {
  return (
    <Sheet visible={visible} title="Default format" subtitle="New matches start with these rules. You can still change any rule." onClose={onClose} testID="sheet-default-format">
      {presets.map((preset) => (
        <ChoiceRow
          key={preset.id}
          title={preset.title}
          detail={preset.summary}
          selected={preset.isDefault}
          onSelect={() => onSelect(preset.id)}
          testID={`format-chip-${preset.slug}`}
        />
      ))}
    </Sheet>
  );
}
