import { OverStrip, type BallChipSize } from '@/ui';
import type { OverStripVM } from '../selectors/scoreboard';

export interface CurrentOverProps {
  readonly vm: OverStripVM;
  readonly showLabel?: boolean;
  readonly size?: BallChipSize;
}

export function CurrentOver({ vm, showLabel = true, size = 'lg' }: CurrentOverProps) {
  return (
    <OverStrip
      balls={vm.balls}
      remaining={vm.remaining}
      runs={vm.runs}
      summary={vm.summary}
      label={showLabel ? 'THIS OVER' : null}
      overKey={vm.overKey}
      size={size}
    />
  );
}
