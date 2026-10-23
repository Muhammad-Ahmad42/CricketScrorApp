import { StyleSheet, View } from 'react-native';
import { Chip, ChoiceRow, IconButton } from '@/ui';

export const SQUAD_CONTROLS_WIDTH = 96;

export interface SquadRowProps {
  readonly name: string;
  readonly order: number | null;
  readonly tags: string;
  readonly selected: boolean;
  readonly substitute: boolean;
  readonly isFirst?: boolean;
  readonly isLast?: boolean;
  readonly onToggle: () => void;
  readonly onToggleSubstitute?: () => void;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
  readonly testID: string;
}

export function SquadRow({
  name,
  order,
  tags,
  selected,
  substitute,
  isFirst = false,
  isLast = false,
  onToggle,
  onToggleSubstitute,
  onMoveUp,
  onMoveDown,
  testID,
}: SquadRowProps) {
  const label = `${name}${tags ? `, ${tags}` : ''}${selected ? `, batting at ${order ?? ''}` : substitute ? ', substitute fielder' : ', not selected'}`;
  const controls = (
    <View style={styles.controls}>
      {selected && onMoveUp && onMoveDown ? (
        <>
          <IconButton icon="chevron-up" accessibilityLabel={`Move ${name} up the batting order`} disabled={isFirst} onPress={onMoveUp} testID={`${testID}-up`} />
          <IconButton icon="chevron-down" accessibilityLabel={`Move ${name} down the batting order`} disabled={isLast} onPress={onMoveDown} testID={`${testID}-down`} />
        </>
      ) : null}
      {!selected && onToggleSubstitute ? (
        <Chip
          kind="checkbox"
          label="Sub"
          selected={substitute}
          onPress={onToggleSubstitute}
          accessibilityLabel={`${name} as substitute`}
          accessibilityHint="Substitutes field only"
          testID={`${testID}-sub`}
        />
      ) : null}
    </View>
  );
  return (
    <ChoiceRow
      kind="checkbox"
      label={name}
      selected={selected}
      onPress={onToggle}
      lead={selected && order !== null ? `${order}` : ''}
      meta={tags === '' ? undefined : tags}
      trailing={controls}
      separator
      accessibilityLabel={label}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  controls: { minWidth: SQUAD_CONTROLS_WIDTH, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
});
