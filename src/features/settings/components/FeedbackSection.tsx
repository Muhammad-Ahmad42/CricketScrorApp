import { ListRow, SectionHeader } from '@/ui';
import { COPY } from '../copy';
import { MOTION_CHOICES, type ReducedMotionSetting } from '../selectors/settings';
import { SegmentSetting } from './SegmentSetting';

export interface FeedbackSectionProps {
  readonly hapticsEnabled: boolean;
  readonly soundEnabled: boolean;
  readonly soundAvailable: boolean;
  readonly reducedMotion: ReducedMotionSetting;
  readonly onHapticsChange: (value: boolean) => void;
  readonly onSoundChange: (value: boolean) => void;
  readonly onReducedMotionChange: (value: ReducedMotionSetting) => void;
  readonly disabled?: boolean;
}

export function FeedbackSection(props: FeedbackSectionProps) {
  const disabled = props.disabled ?? false;
  return (
    <>
      <SectionHeader title="Feedback" />
      <ListRow
        title="Vibration"
        subtitle="Light for runs, stronger for boundaries and wickets"
        trailing={{ kind: 'switch', value: props.hapticsEnabled, onValueChange: props.onHapticsChange, disabled }}
        disabled={disabled}
        testID="settings-toggle-haptics"
      />
      <ListRow
        title="Sound effects"
        subtitle={props.soundAvailable ? 'Short local sounds for runs, wickets and results' : COPY.soundUnavailable}
        trailing={{
          kind: 'switch',
          value: props.soundAvailable && props.soundEnabled,
          onValueChange: props.onSoundChange,
          disabled: disabled || !props.soundAvailable,
        }}
        disabled={disabled || !props.soundAvailable}
        testID="settings-toggle-sound"
      />
      <SegmentSetting
        title="Reduce motion"
        helper="System follows your phone's accessibility setting."
        choices={MOTION_CHOICES}
        value={props.reducedMotion}
        onChange={props.onReducedMotionChange}
        disabled={disabled}
        testID="settings-group-motion"
      />
    </>
  );
}
