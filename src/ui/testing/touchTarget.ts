import { StyleSheet, type Insets, type ViewStyle } from 'react-native';

export interface TouchTargetSize {
  readonly width: number;
  readonly height: number;
}

interface HostLike {
  readonly props: Record<string, unknown>;
}

function numeric(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function slop(value: unknown): Required<Insets> {
  if (typeof value === 'number') {
    return { top: value, bottom: value, left: value, right: value };
  }
  const insets = (value ?? {}) as Insets;
  return {
    top: insets.top ?? 0,
    bottom: insets.bottom ?? 0,
    left: insets.left ?? 0,
    right: insets.right ?? 0,
  };
}

export function touchTargetSize(element: HostLike): TouchTargetSize {
  const style = (StyleSheet.flatten(element.props.style as ViewStyle) ?? {}) as ViewStyle;
  const hit = slop(element.props.hitSlop);
  const height = Math.max(numeric(style.height), numeric(style.minHeight));
  const width = Math.max(numeric(style.width), numeric(style.minWidth));
  return {
    width: width + hit.left + hit.right,
    height: height + hit.top + hit.bottom,
  };
}
