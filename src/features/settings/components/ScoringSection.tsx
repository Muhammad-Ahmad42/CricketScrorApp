import type { PadHand } from '@/domain/types';
import { ListRow, SectionHeader } from '@/ui';
import { DOT_CHOICES, PAD_CHOICES, type DotStyle } from '../selectors/settings';
import { SegmentSetting } from './SegmentSetting';

export interface ScoringSectionProps {
  readonly defaultFormatLabel: string;
  readonly dotStyle: DotStyle;
  readonly padHand: PadHand;
  readonly autoPromptBowler: boolean;
  readonly confirmInningsEnd: boolean;
  readonly keepAwake: boolean;
  readonly onOpenDefaultFormat: () => void;
  readonly onDotStyleChange: (value: DotStyle) => void;
  readonly onPadHandChange: (value: PadHand) => void;
  readonly onAutoPromptBowlerChange: (value: boolean) => void;
  readonly onConfirmInningsEndChange: (value: boolean) => void;
  readonly onKeepAwakeChange: (value: boolean) => void;
  readonly disabled?: boolean;
}

export function ScoringSection(props: ScoringSectionProps) {
  const disabled = props.disabled ?? false;
  return (
    <>
      <SectionHeader title="Scoring" />
      <ListRow
        title="Default format"
        trailing={{ kind: 'value', text: props.defaultFormatLabel, chevron: true }}
        onPress={props.onOpenDefaultFormat}
        disabled={disabled}
        accessibilityHint="Choose the format new matches start with"
        testID="settings-row-default-format"
      />
      <SegmentSetting
        title="Show dot balls as"
        choices={DOT_CHOICES}
        value={props.dotStyle}
        onChange={props.onDotStyleChange}
        disabled={disabled}
        testID="settings-group-dot"
      />
      <SegmentSetting
        title="Scoring pad layout"
        choices={PAD_CHOICES}
        value={props.padHand}
        onChange={props.onPadHandChange}
        disabled={disabled}
        testID="settings-group-pad"
      />
      <ListRow
        title="Ask for next bowler"
        trailing={{ kind: 'switch', value: props.autoPromptBowler, onValueChange: props.onAutoPromptBowlerChange, disabled }}
        disabled={disabled}
        accessibilityHint="Asks who bowls next when an over ends"
        testID="settings-toggle-bowler-prompt"
      />
      <ListRow
        title="Confirm innings end"
        trailing={{ kind: 'switch', value: props.confirmInningsEnd, onValueChange: props.onConfirmInningsEndChange, disabled }}
        disabled={disabled}
        accessibilityHint="Asks before a declaration or when no batters are left"
        testID="settings-toggle-confirm-innings"
      />
      <ListRow
        title="Keep screen awake"
        trailing={{ kind: 'switch', value: props.keepAwake, onValueChange: props.onKeepAwakeChange, disabled }}
        disabled={disabled}
        accessibilityHint="Stops the screen turning off while you score"
        separator={false}
        testID="settings-toggle-keep-awake"
      />
    </>
  );
}
