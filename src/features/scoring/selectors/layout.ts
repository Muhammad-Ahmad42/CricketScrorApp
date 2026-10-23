import type { WidthClass } from '@/ui';

export const LEAN_HEIGHT = { compactSmall: 640, phone: 680 } as const;
export const LEAN_TEXT_GROWTH = 200;
const MAX_FONT_SCALE = 2;

export interface ScoringSpace {
  readonly windowHeight: number;
  readonly insetTop: number;
  readonly insetBottom: number;
  readonly widthClass: WidthClass;
  readonly fontScale: number;
}

export function isLeanScoring({ windowHeight, insetTop, insetBottom, widthClass, fontScale }: ScoringSpace): boolean {
  const available = windowHeight - insetTop - insetBottom;
  const scale = Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
  const base = widthClass === 'compact-s' ? LEAN_HEIGHT.compactSmall : LEAN_HEIGHT.phone;
  return available < base + LEAN_TEXT_GROWTH * (scale - 1);
}
