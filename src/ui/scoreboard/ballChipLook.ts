import type { ColorToken } from '../theme';
import type { TextWeight } from '../typography';

export type BallChipKind = 'dot' | 'runs' | 'four' | 'six' | 'wicket' | 'wide' | 'no_ball' | 'bye' | 'leg_bye';
export type BallChipShape = 'circle' | 'capsule' | 'rectangle' | 'square';
export type BallChipSize = 'lg' | 'md' | 'sm';

export interface BallChipLook {
  readonly shape: BallChipShape;
  readonly fill: ColorToken | null;
  readonly border: ColorToken | null;
  readonly borderWidth: 0 | 1 | 2;
  readonly dashed: boolean;
  readonly text: ColorToken;
  readonly weight: TextWeight;
}

export const BALL_CHIP_KINDS: readonly BallChipKind[] = ['dot', 'runs', 'four', 'six', 'wicket', 'wide', 'no_ball', 'bye', 'leg_bye'];

export function ballChipLook(kind: BallChipKind): BallChipLook {
  switch (kind) {
    case 'dot':
      return { shape: 'circle', fill: null, border: 'border', borderWidth: 1, dashed: false, text: 'textMuted', weight: 'medium' };
    case 'runs':
      return { shape: 'circle', fill: null, border: 'borderStrong', borderWidth: 1, dashed: false, text: 'textPrimary', weight: 'semibold' };
    case 'four':
      return { shape: 'circle', fill: null, border: 'accent', borderWidth: 2, dashed: false, text: 'accent', weight: 'bold' };
    case 'six':
      return { shape: 'circle', fill: 'accent', border: null, borderWidth: 0, dashed: false, text: 'onAccent', weight: 'bold' };
    case 'wicket':
      return { shape: 'square', fill: 'danger', border: null, borderWidth: 0, dashed: false, text: 'onDanger', weight: 'bold' };
    case 'wide':
    case 'no_ball':
      return { shape: 'rectangle', fill: null, border: 'borderStrong', borderWidth: 1, dashed: true, text: 'textSecondary', weight: 'semibold' };
    case 'bye':
    case 'leg_bye':
      return { shape: 'capsule', fill: null, border: 'borderStrong', borderWidth: 1, dashed: false, text: 'textSecondary', weight: 'semibold' };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export const CHIP_DIMENSIONS: { readonly [K in BallChipSize]: { readonly size: number; readonly font: number; readonly lineHeight: number; readonly paddingX: number } } = {
  lg: { size: 32, font: 17, lineHeight: 20, paddingX: 8 },
  md: { size: 24, font: 14, lineHeight: 17, paddingX: 6 },
  sm: { size: 20, font: 12, lineHeight: 14, paddingX: 4 },
};

export function chipRadius(shape: BallChipShape, size: number): number {
  switch (shape) {
    case 'circle':
    case 'capsule':
      return size / 2;
    case 'rectangle':
    case 'square':
      return 2;
    default: {
      const unreachable: never = shape;
      return unreachable;
    }
  }
}

export interface ShortRunSplit {
  readonly main: string;
  readonly suffix: string | null;
}

const SHORT_RUN = /^(.*\d)s$/;

export function splitShortRun(text: string): ShortRunSplit {
  const match = SHORT_RUN.exec(text);
  return match ? { main: match[1], suffix: 's' } : { main: text, suffix: null };
}

export function chipAccessibilityLabel(text: string, label: string | undefined, isFreeHit: boolean): string {
  const base = label ?? text;
  return isFreeHit ? `${base}, free hit` : base;
}

export type ChipEntrance = 'fade' | 'boundary' | 'wicket';

export function chipEntrance(kind: BallChipKind): { readonly entrance: ChipEntrance; readonly ringScale: number; readonly ringMs: number } {
  if (kind === 'four') {
    return { entrance: 'boundary', ringScale: 1.25, ringMs: 240 };
  }
  if (kind === 'six') {
    return { entrance: 'boundary', ringScale: 1.4, ringMs: 320 };
  }
  if (kind === 'wicket') {
    return { entrance: 'wicket', ringScale: 1, ringMs: 0 };
  }
  return { entrance: 'fade', ringScale: 1, ringMs: 0 };
}
