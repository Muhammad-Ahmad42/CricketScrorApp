import { ListRow, SectionHeader } from '@/ui';
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
        trailing={{ kind: 'switch', value: props.hapticsEnabled, onValueChange: props.onHapticsChange, disabled }}
        disabled={disabled}
        accessibilityHint="Light for runs, stronger for boundaries and wickets"
        testID="settings-toggle-haptics"
      />
      {props.soundAvailable ? (
        <ListRow
          title="Sound effects"
          trailing={{ kind: 'switch', value: props.soundEnabled, onValueChange: props.onSoundChange, disabled }}
          disabled={disabled}
          testID="settings-toggle-sound"
        />
      ) : null}
      <SegmentSetting
        title="Reduce motion"
        choices={MOTION_CHOICES}
        value={props.reducedMotion}
        onChange={props.onReducedMotionChange}
        disabled={disabled}
        separator={false}
        testID="settings-group-motion"
      />
    </>
  );
}
