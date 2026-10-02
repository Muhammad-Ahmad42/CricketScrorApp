import { View } from 'react-native';
import type { IconName } from '@/ui';
import { ListRow, Sheet } from '@/ui';

export interface Choice {
  readonly key: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

export interface ChoiceSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly choices: readonly Choice[];
  readonly onClose: () => void;
  readonly testID: string;
}

export function ChoiceSheet({ visible, title, choices, onClose, testID }: ChoiceSheetProps) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose} testID={testID}>
      <View>
        {choices.map((choice) => (
          <ListRow
            key={choice.key}
            title={choice.title}
            subtitle={choice.subtitle}
            leading={choice.icon ? { icon: choice.icon } : undefined}
            trailing={{ kind: 'chevron' }}
            disabled={choice.disabled}
            onPress={choice.onPress}
            testID={`${testID}-${choice.key}`}
          />
        ))}
      </View>
    </Sheet>
  );
}
