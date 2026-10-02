import type { ViewStyle } from 'react-native';

export type GlassCorners = 'all' | 'top' | 'bottom';

export type GlassRim = 'all' | 'top' | 'bottom' | 'none';

export function cornerStyle(corners: GlassCorners, radius: number): ViewStyle {
  if (radius <= 0) {
    return {};
  }
  switch (corners) {
    case 'top':
      return { borderTopLeftRadius: radius, borderTopRightRadius: radius };
    case 'bottom':
      return { borderBottomLeftRadius: radius, borderBottomRightRadius: radius };
    default:
      return { borderRadius: radius };
  }
}

export interface EdgeLook {
  readonly width: number;
  readonly color: string;
  readonly top?: string;
}

export function edgeStyle(rim: GlassRim, look: EdgeLook): ViewStyle {
  switch (rim) {
    case 'all':
      return { borderWidth: look.width, borderColor: look.color, borderTopColor: look.top ?? look.color };
    case 'top':
      return { borderTopWidth: look.width, borderTopColor: look.top ?? look.color };
    case 'bottom':
      return { borderBottomWidth: look.width, borderBottomColor: look.color };
    default:
      return {};
  }
}
